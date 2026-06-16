import type { Env } from '../env.js';
import type { Logger } from '../logger.js';
import type { CurrentAffairsStoreItem, CurrentAffairsStore } from './currentAffairsStore.js';
import type { CurrentAffairsCategory } from '@nexigrate/shared';
import type { AIEngine } from './aiEngine.js';

/**
 * RSS News Sources for Current Affairs ingestion.
 * These are fetched every 4 hours via cron trigger.
 */
export const NEWS_SOURCES = [
  { name: 'PTI', domain: 'ptinews.com', rss: 'https://www.ptinews.com/feed/' },
  { name: 'The Hindu', domain: 'thehindu.com', rss: 'https://www.thehindu.com/feeder/default.rss' },
  { name: 'Indian Express', domain: 'indianexpress.com', rss: 'https://indianexpress.com/feed/' },
  { name: 'Hindustan Times', domain: 'hindustantimes.com', rss: 'https://www.hindustantimes.com/feeds/rss/india-news/rssfeed.xml' },
  { name: 'Times of India', domain: 'timesofindia.indiatimes.com', rss: 'https://timesofindia.indiatimes.com/rssfeedstopstories.cms' },
  { name: 'NDTV', domain: 'ndtv.com', rss: 'https://feeds.feedburner.com/ndtvnews-top-stories' },
  { name: 'Economic Times', domain: 'economictimes.indiatimes.com', rss: 'https://economictimes.indiatimes.com/rssfeedstopstories.cms' },
  { name: 'Business Standard', domain: 'business-standard.com', rss: 'https://www.business-standard.com/rss/home_page_top_stories.rss' },
  { name: 'Mint', domain: 'livemint.com', rss: 'https://www.livemint.com/rss/news' },
  { name: 'The Print', domain: 'theprint.in', rss: 'https://theprint.in/feed/' },
  { name: 'Deccan Herald', domain: 'deccanherald.com', rss: 'https://www.deccanherald.com/rss/india' },
  { name: 'The Wire', domain: 'thewire.in', rss: 'https://thewire.in/feed' },
  { name: 'Dainik Bhaskar', domain: 'bhaskar.com', rss: 'https://www.bhaskar.com/rss-feed/1061' },
  { name: 'Amar Ujala', domain: 'amarujala.com', rss: 'https://www.amarujala.com/rss/breaking-news.xml' },
  { name: 'BBC Hindi', domain: 'bbc.com/hindi', rss: 'https://feeds.bbci.co.uk/hindi/rss.xml' },
  { name: 'Mongabay India', domain: 'mongabayindia.com', rss: 'https://india.mongabay.com/feed/' },
];

export interface RawNewsItem {
  title: string;
  link: string;
  description: string;
  pubDate: string;
  source: string;
  /** Real article image extracted from the RSS item (media:content /
   *  enclosure / og-image in description), if any. */
  imageUrl?: string;
  /** Indian state/UT slug inherited from the source feed when the feed
   *  is tagged to a state. Absent = national (the default). */
  state?: string;
}

/**
 * Fetch and parse RSS feeds. Returns raw items from all sources.
 * Handles failures gracefully — a single feed error doesn't break the whole ingestion.
 * Tries to load feeds from Firestore first, falls back to hardcoded NEWS_SOURCES.
 */
async function fetchRssFeeds(logger: Logger, firestoreDb?: import('firebase-admin/firestore').Firestore): Promise<RawNewsItem[]> {
  // Try loading feeds from Firestore first. We now carry the Firestore
  // doc `id` alongside name+rss so each feed's fetch result can be
  // written BACK to its doc (lastFetched / itemsFetched / status). That
  // makes the admin "News Feed Management" table show, per row, exactly
  // what each source brought in on the last run — the founder asked to
  // see "kya kya fetch hoke app me kya kya content gaya... row kya aaya".
  let feedSources: Array<{ id?: string; name: string; rss: string; state?: string }> =
    NEWS_SOURCES.map(s => ({ name: s.name, rss: s.rss }));
  if (firestoreDb) {
    try {
      const snap = await firestoreDb.collection('newsFeeds').where('isActive', '==', true).get();
      if (!snap.empty) {
        const firestoreFeeds = snap.docs.map(d => {
          const data = d.data();
          return { id: d.id, name: data.name as string, rss: data.url as string, state: (data.state as string | undefined) || undefined };
        }).filter(f => f.name && f.rss);
        if (firestoreFeeds.length > 0) {
          // Merge: Firestore feeds + hardcoded (deduplicate by RSS URL)
          const seenUrls = new Set(firestoreFeeds.map(f => f.rss));
          const merged = [...firestoreFeeds, ...feedSources.filter(s => !seenUrls.has(s.rss))];
          feedSources = merged;
          logger.info('rss.feeds_from_firestore', { count: firestoreFeeds.length, total: merged.length });
        }
      }
    } catch (err) {
      logger.warn('rss.firestore_feeds_fallback', { error: err instanceof Error ? err.message : String(err) });
      // Fallback to hardcoded feeds
    }
  }

  // Best-effort per-feed status writeback. Only Firestore-sourced feeds
  // (those with a doc id) get updated; the hardcoded NEWS_SOURCES don't
  // appear in the admin table so there's nothing to write for them.
  // Failures here are swallowed — a status-write hiccup must never break
  // the actual ingestion.
  const writeFeedStatus = (id: string | undefined, patch: Record<string, unknown>) => {
    if (!firestoreDb || !id) return;
    firestoreDb.collection('newsFeeds').doc(id).set(patch, { merge: true }).catch(() => {});
  };

  const allItems: RawNewsItem[] = [];
  const results = await Promise.allSettled(
    feedSources.map(async (source) => {
      const fetchedAt = new Date().toISOString();
      try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 15000);
        const res = await fetch(source.rss, { signal: controller.signal, headers: { 'User-Agent': 'NexigrateBot/1.0' } });
        clearTimeout(timeout);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const text = await res.text();
        // Simple XML parsing for RSS items
        const parsed = parseRssXml(text, source.name).slice(0, 10); // Max 10 items per source
        // Inherit the feed's state tag (if any) onto every item it
        // produced. National feeds leave `state` undefined.
        const items = source.state ? parsed.map(it => ({ ...it, state: source.state })) : parsed;
        // Record what this feed brought in: timestamp, item count, a few
        // sample headlines (so the admin sees the actual content, not just
        // a number), and a clear ok/empty status.
        writeFeedStatus(source.id, {
          lastFetched: fetchedAt,
          itemsFetched: items.length,
          lastStatus: items.length > 0 ? 'ok' : 'empty',
          lastError: null,
          lastSampleTitles: items.slice(0, 3).map(it => it.title),
        });
        return items;
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        logger.warn('rss.fetch_failed', { source: source.name, error: msg });
        writeFeedStatus(source.id, {
          lastFetched: fetchedAt,
          itemsFetched: 0,
          lastStatus: 'error',
          lastError: msg.slice(0, 200),
          lastSampleTitles: [],
        });
        return [];
      }
    })
  );
  for (const result of results) {
    if (result.status === 'fulfilled') allItems.push(...result.value);
  }
  return allItems;
}

/** Simple RSS XML parser — extracts title, link, description, pubDate */
function parseRssXml(xml: string, sourceName: string): RawNewsItem[] {
  const items: RawNewsItem[] = [];
  const itemRegex = /<item[^>]*>([\s\S]*?)<\/item>/gi;
  let match: RegExpExecArray | null;
  while ((match = itemRegex.exec(xml)) !== null) {
    const content = match[1]!;
    const title = extractTag(content, 'title');
    const link = extractTag(content, 'link');
    const description = extractTag(content, 'description');
    const pubDate = extractTag(content, 'pubDate');
    if (title && title.length > 10) {
      items.push({ title: cleanHtml(title), link: link ?? '', description: cleanHtml(description ?? ''), pubDate: pubDate ?? '', source: sourceName, imageUrl: extractImageUrl(content, description ?? '') });
    }
  }
  return items;
}

/**
 * Extract a real article image from an RSS <item>. RSS feeds expose images
 * in several ways; we try them in order of reliability:
 *   1. <media:content url="..."> / <media:thumbnail url="...">  (Media RSS)
 *   2. <enclosure url="..." type="image/...">
 *   3. first <img src="..."> inside content:encoded / description HTML
 * Returns undefined if none found (the UI falls back to a category image).
 */
function extractImageUrl(itemXml: string, descriptionRaw: string): string | undefined {
  const patterns = [
    /<media:content[^>]*\burl=["']([^"']+)["']/i,
    /<media:thumbnail[^>]*\burl=["']([^"']+)["']/i,
    /<enclosure[^>]*\burl=["']([^"']+)["'][^>]*type=["']image\//i,
    /<enclosure[^>]*type=["']image\/[^"']*["'][^>]*\burl=["']([^"']+)["']/i,
  ];
  for (const re of patterns) {
    const m = re.exec(itemXml);
    if (m?.[1] && /^https?:\/\//i.test(m[1])) return m[1].replace(/&amp;/g, '&');
  }
  // Fallback: first <img> inside the (HTML) description / content:encoded.
  const imgMatch = /<img[^>]*\bsrc=["']([^"']+)["']/i.exec(itemXml) || /<img[^>]*\bsrc=["']([^"']+)["']/i.exec(descriptionRaw);
  if (imgMatch?.[1] && /^https?:\/\//i.test(imgMatch[1])) return imgMatch[1].replace(/&amp;/g, '&');
  return undefined;
}

function extractTag(xml: string, tag: string): string | null {
  // Handle CDATA
  const cdataRegex = new RegExp(`<${tag}[^>]*>\\s*<!\\[CDATA\\[([\\s\\S]*?)\\]\\]>\\s*</${tag}>`, 'i');
  const cdataMatch = cdataRegex.exec(xml);
  if (cdataMatch) return cdataMatch[1]!.trim();
  // Handle regular tags
  const regex = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`, 'i');
  const m = regex.exec(xml);
  return m ? m[1]!.trim() : null;
}

function cleanHtml(text: string): string {
  return text.replace(/<[^>]+>/g, '').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#039;/g, "'").replace(/\s+/g, ' ').trim();
}

/**
 * Categorize and summarize news items using AI (Gemini Flash).
 * Uses a 3-layer processing approach:
 * Layer 1: Categorize & deduplicate
 * Layer 2: Summarize with comprehensive detail
 * Layer 3: Generate exam-relevant bullet points (minimum 3)
 */
async function summarizeItems(
  items: RawNewsItem[],
  env: Env,
  logger: Logger,
  resolver?: import('./aiModelResolver.js').AIModelResolver | null,
): Promise<CurrentAffairsStoreItem[]> {
  if (!env.GEMINI_API_KEY) {
    logger.warn('rss.no_gemini_key', { message: 'GEMINI_API_KEY not set, skipping summarization' });
    return [];
  }

  // Resolve a (key, model) pair once per ingestion run. The resolver
  // path picks the topmost non-blacklisted Gemini flash model; the
  // fallback path uses env-key + the registry's preferred entry. We
  // do the resolve ONCE rather than per-batch so a single run uses
  // a single model end-to-end (clearer attribution in admin logs)
  // and a mid-run blacklist event only changes the model on the next
  // ingestion run, not in the middle of one.
  let geminiKey = env.GEMINI_API_KEY;
  let geminiModel = 'gemini-2.5-flash'; // PR-29 preferred default
  if (resolver) {
    const r = await resolver.resolve('gemini', { tier: 'flash' });
    if (r) { geminiKey = r.apiKey; geminiModel = r.model; }
  } else {
    // No resolver: pick from registry chain so we still pick a
    // current model even if env-only deployment.
    const { pickPreferredModel } = await import('./aiProviderRegistry.js');
    const m = pickPreferredModel('gemini', 'flash');
    if (m) geminiModel = m;
  }

  // Groq fallback (key + model) for summarization when Gemini is down or
  // quota-exhausted (429). Founder report: "current affairs Hindi me thik
  // se kaam nahi kar raha / latest content show nahi ho raha." Root cause:
  // summarizeItems was Gemini-ONLY with no cross-provider fallback, so a
  // Gemini 429 produced zero AI summaries and the feed fell back to thin
  // raw headlines (and Hindi users saw even less after the strict-Hindi
  // filter). Resolving via the registry chain keeps the model un-hardcoded.
  let groqKey = env.GROQ_API_KEY;
  let groqModel = 'llama-3.3-70b-versatile';
  if (resolver) {
    const gr = await resolver.resolve('groq', { tier: 'flash' });
    if (gr) { groqKey = gr.apiKey; groqModel = gr.model; }
  } else {
    const { pickPreferredModel } = await import('./aiProviderRegistry.js');
    const gm = pickPreferredModel('groq', 'flash');
    if (gm) groqModel = gm;
  }

  // Build summarisation batches that NEVER mix states. Each raw item
  // carries the `state` it inherited from its source feed; by grouping
  // items per state before slicing into 10s, every batch is homogeneous
  // (exactly one state, or all-national). That makes the per-item state
  // attribution below — "the whole batch is one state ⇒ tag that state"
  // — reliable, instead of depending on the AI echoing a srcIndex (the
  // prompt is state-unaware, so it usually doesn't).
  //
  // This is THE core fix for "CG/MP feed news never showed": a few
  // regional items used to land in a mixed national+state boundary batch
  // (batchStates.size > 1) and silently lost their state tag, so they
  // got saved as national and never appeared under the state edition.
  //
  // State groups are batched FIRST and capped per-group so the handful of
  // regional items always get summarised within the batch budget instead
  // of being crowded out by the ~16 national sources.
  const PER_STATE_ITEM_CAP = 20; // up to 2 batches per state edition
  const NATIONAL_ITEM_CAP = 40;  // up to 4 batches of national news
  const MAX_BATCHES = 8;

  const stateGroups = new Map<string, RawNewsItem[]>();
  const nationalItems: RawNewsItem[] = [];
  for (const it of items) {
    if (it.state) {
      const g = stateGroups.get(it.state);
      if (g) g.push(it);
      else stateGroups.set(it.state, [it]);
    } else {
      nationalItems.push(it);
    }
  }

  const batches: RawNewsItem[][] = [];
  // State editions first so they're never starved by the national volume.
  for (const groupItems of stateGroups.values()) {
    const capped = groupItems.slice(0, PER_STATE_ITEM_CAP);
    for (let i = 0; i < capped.length; i += 10) batches.push(capped.slice(i, i + 10));
  }
  // National fills the remaining budget.
  const cappedNational = nationalItems.slice(0, NATIONAL_ITEM_CAP);
  for (let i = 0; i < cappedNational.length; i += 10) batches.push(cappedNational.slice(i, i + 10));

  const today = new Date().toISOString().split('T')[0]!;
  const allSummarized: CurrentAffairsStoreItem[] = [];

  for (const batch of batches.slice(0, MAX_BATCHES)) { // state batches first, then national
    try {
      const prompt = `You are a current-affairs editor for Indian competitive-exam students (UPSC, SSC, Banking, State PCS, NEET, JEE). Your job is to turn raw news into GENUINELY USEFUL, exam-relevant notes — never filler.

Process the items below in layers:

LAYER 0 — RELEVANCE FILTER (be strict, this matters most):
- KEEP items with real exam value: policy, government schemes & bills, economy & RBI, international relations & agreements, science / tech / space / defence, environment, reports & indices & rankings, key appointments, awards, important Supreme Court / constitutional matters, and significant sports achievements.
- DROP pure noise: celebrity / film gossip, crime briefs, routine local accidents, paywalled teasers, opinion / op-eds, ad or sponsored content, daily market ticks, horoscopes. If an item has NO exam relevance, simply OMIT it from the output.
- Merge duplicate stories about the same event into ONE item.

LAYER 1 — CATEGORIZE:
- Assign a category from: national, international, economy, science-tech, environment, sports, awards, agreements, reports, other.

LAYER 2 — CONCISE SUMMARY (140-200 WORDS, IN PARAGRAPHS):
- A tight, factual summary in 2-3 SHORT paragraphs separated by a blank line.
- Cover what happened (names, dates, places, numbers), the essential background, and one line on why it matters for exams.
- Plain prose only. NO bullet points, NO markdown headings inside the summary.
- Every sentence must add a NEW fact. Do NOT repeat or pad. A crisp 150-word summary beats a long repetitive one.

LAYER 3 — KEY POINTS (EXACTLY 4-5 BULLETS):
- Each bullet is a SHARP, self-contained, exam-ready fact.
- Every bullet MUST carry a concrete detail: a name, number, date, place, rank, amount, scheme or agency. A bullet with no specific fact is useless — rewrite it.
- FORBIDDEN (will be rejected): meta-filler like "Category: ...", "Source: ...", "the news said", "according to the article", or simply repeating the headline.
- Keep each bullet under 120 characters and revision-friendly.

HEADLINE:
- A PUNCHY, SPECIFIC headline (max 100 chars) leading with the single most important fact, name or number. Make a student want to read on. NO vague/generic labels, NO clickbait.

Also:
- Write in simple, clear language suitable for students.
- "srcIndex": the NUMBER (from the list) of the primary news item this is based on (for image attribution).

News items:
${batch.map((item, i) => `${i + 1}. [${item.source}] ${item.title} — ${item.description.slice(0, 150)}`).join('\n')}

Respond ONLY with valid JSON (omit any item that fails the LAYER 0 relevance filter):
{"items":[{"id":"ca-1","headline":"...","summary":"...","bullets":["fact 1","fact 2","fact 3","fact 4"],"category":"national","sources":["Source Name"],"factChecked":true,"srcIndex":1}]}`;

      const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${geminiModel}:generateContent?key=${geminiKey}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: { temperature: 0.3, maxOutputTokens: 8000 },
        }),
      });

      let rawText = '';
      if (res.ok) {
        const data = await res.json() as { candidates?: { content?: { parts?: { text?: string }[] } }[] };
        rawText = data.candidates?.[0]?.content?.parts?.[0]?.text ?? '';
        if (resolver && rawText) await resolver.reportModelSuccess('gemini', geminiModel);
      } else {
        const errText = await res.text().catch(() => '');
        logger.warn('rss.gemini_error', { status: res.status, model: geminiModel, body: errText.slice(0, 200) });
        // Report so the resolver can blacklist a deprecated model.
        if (resolver) await resolver.reportModelFailure('gemini', geminiModel, `HTTP ${res.status}: ${errText.slice(0, 200)}`);
      }

      // Cross-provider fallback: if Gemini gave us nothing (429 quota,
      // outage, empty), summarize this batch with Groq instead so the
      // current-affairs feed (and its Hindi translation downstream) still
      // gets real AI summaries rather than thin raw headlines.
      if (!rawText && groqKey) {
        try {
          const gres = await fetch('https://api.groq.com/openai/v1/chat/completions', {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${groqKey}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({
              model: groqModel,
              messages: [{ role: 'user', content: prompt }],
              temperature: 0.3,
              max_tokens: 8000,
              response_format: { type: 'json_object' },
            }),
          });
          if (gres.ok) {
            const gdata = await gres.json() as { choices?: { message?: { content?: string } }[] };
            rawText = gdata.choices?.[0]?.message?.content ?? '';
            if (rawText) logger.info('rss.summarize_groq_fallback', { model: groqModel, chars: rawText.length });
          } else {
            const gErr = await gres.text().catch(() => '');
            logger.warn('rss.groq_error', { status: gres.status, model: groqModel, body: gErr.slice(0, 200) });
          }
        } catch (gErr) {
          logger.warn('rss.groq_exception', { error: gErr instanceof Error ? gErr.message : String(gErr) });
        }
      }

      if (!rawText) { continue; }
      // Extract JSON from response (may have markdown fences)
      const jsonMatch = rawText.match(/\{[\s\S]*\}/);
      if (!jsonMatch) { logger.warn('rss.summarize_no_json', { raw: rawText.slice(0, 200) }); continue; }
      const parsed = JSON.parse(jsonMatch[0]) as { items: { id: string; headline: string; summary: string; bullets?: string[]; category: CurrentAffairsCategory; sources: string[]; factChecked: boolean; srcIndex?: number }[] };

      for (const item of (parsed.items ?? [])) {
        // Keep the summary as the model wrote it — a tight 140-200 word
        // prose block (see LAYER 2). We deliberately do NOT pad short
        // summaries any more: the old 500-word floor produced repetitive,
        // filler-laden "study notes" boilerplate that read as padding to
        // students. A crisp summary is better than a long repetitive one.
        let summary = (item.summary ?? '').trim();

        // Bullets: aim for 4-5 sharp facts. If the AI under-delivered, pad
        // from the summary's most fact-bearing sentences (those carrying a
        // number or a proper noun) — NOT meta-filler like "Category:" /
        // "Source:", which read as padding to students. Trim if over 5.
        let bullets = (item.bullets ?? []).filter(b => typeof b === 'string' && b.trim().length > 0 && !/^(category|source)\s*:/i.test(b.trim()));
        if (bullets.length < 4) {
          const sentences = (summary || '')
            .replace(/\n+/g, ' ')
            .split(/(?<=[.!?])\s+/)
            .map(s => s.trim())
            .filter(s => s.length >= 30 && s.length <= 160 && /\d|[A-Z][a-z]+\s[A-Z]/.test(s));
          for (const s of sentences) {
            if (bullets.length >= 4) break;
            if (!bullets.some(b => b.slice(0, 40) === s.slice(0, 40))) bullets.push(s);
          }
          // Absolute floor: never fewer than 3 — fall back to the headline
          // (a real fact) rather than a filler label.
          while (bullets.length < 3) bullets.push(item.headline);
        } else if (bullets.length > 5) {
          bullets = bullets.slice(0, 5);
        }

        // Attribute a real image: prefer the AI-reported primary source
        // item's image, else the first item in the batch that has one.
        const srcIdx = typeof item.srcIndex === 'number' ? item.srcIndex - 1 : -1;
        const imageUrl =
          batch[srcIdx]?.imageUrl ||
          batch.find(b => b.imageUrl)?.imageUrl ||
          undefined;

        // Attribute a state tag. Batches are now homogeneous (built
        // per-state above), so the reliable signal is "the whole batch
        // belongs to one state ⇒ tag every summarised item with it".
        // We still prefer the AI-reported primary source item's state
        // when present (it agrees with the batch state anyway), and a
        // pure-national batch has no states ⇒ undefined (= national).
        const batchStates = new Set(batch.map(b => b.state).filter((s): s is string => !!s));
        const stateTag = (srcIdx >= 0 && batch[srcIdx]?.state)
          ? batch[srcIdx]!.state
          : (batchStates.size === 1 ? [...batchStates][0] : undefined);

        allSummarized.push({
          id: `${today}-${item.id}-${Math.random().toString(36).slice(2, 6)}`,
          headline: item.headline,
          // body is now the clean prose summary only. Bullets live in their
          // own field so the UI renders Key Points + Full Details as distinct
          // sections instead of duplicating one giant blob (and no stray
          // "**Key Points:**" markdown leaking into the rendered text).
          body: summary,
          bullets,
          category: item.category,
          sources: item.sources,
          relevantExams: [],
          tags: [],
          ...(imageUrl ? { imageUrl } : {}),
          ...(stateTag ? { state: stateTag } : {}),
          date: today,
          summary,
          factChecked: item.factChecked,
          publishedAt: new Date().toISOString(),
        });
      }
    } catch (err) {
      logger.error('rss.summarize_error', { error: err instanceof Error ? err.message : String(err) });
    }
  }

  // Report success so resolver caches the known-good model for 1h.
  if (resolver && allSummarized.length > 0) {
    await resolver.reportModelSuccess('gemini', geminiModel);
  }
  logger.info('rss.summarized', { total: allSummarized.length, model: geminiModel });
  return allSummarized;
}

/**
 * Main ingestion function — called by cron every 4 hours.
 * 1. Fetches all RSS feeds
 * 2. Filters to today's items only
 * 3. AI summarizes + categorizes + deduplicates
 * 4. Saves to store
 */
export async function ingestCurrentAffairs(
  store: CurrentAffairsStore,
  env: Env,
  logger: Logger,
  aiEngine?: AIEngine,
  resolver?: import('./aiModelResolver.js').AIModelResolver | null,
): Promise<{ fetched: number; saved: number }> {
  logger.info('rss.ingestion_start', { sources: NEWS_SOURCES.length });

  // 1. Fetch all feeds (try Firestore feeds first, fallback to hardcoded)
  const db = (store as any).db as import('firebase-admin/firestore').Firestore | undefined;
  const rawItems = await fetchRssFeeds(logger, db);
  logger.info('rss.fetched', { total: rawItems.length });

  if (rawItems.length === 0) return { fetched: 0, saved: 0 };

  // 2. Filter to recent items (last 24 hours)
  const oneDayAgo = Date.now() - 24 * 60 * 60 * 1000;
  const recentItems = rawItems.filter(item => {
    if (!item.pubDate) return true; // Include if no date
    const d = new Date(item.pubDate).getTime();
    return !isNaN(d) ? d > oneDayAgo : true;
  }).slice(0, 300); // generous safety cap; summarizeItems does the
                    // state-aware per-group capping + batching below.

  // Order STATE-tagged items first (clustered by state), national last.
  //
  // Why state-first (this is half of the "CG/MP feed news never showed"
  // fix): there are ~16 national RSS sources but only a handful of
  // regional ones, so the few CG/MP items used to be (a) cut by the old
  // blind `.slice(0, 50)` and (b) starved of the summarisation budget.
  // Sorting them to the front guarantees they survive both this cap and
  // the raw-fallback `.slice(0, 30)` further down, so a state edition is
  // never silently empty just because national news outnumbered it.
  recentItems.sort((a, b) => {
    const sa = a.state ?? '';
    const sb = b.state ?? '';
    if (sa && !sb) return -1; // state items before national
    if (!sa && sb) return 1;
    return sa.localeCompare(sb); // cluster same states together
  });

  // 3. AI summarize (or fallback to raw items if AI fails)
  let itemsToSave: CurrentAffairsStoreItem[];
  const summarized = await summarizeItems(recentItems, env, logger, resolver);
  
  if (summarized.length > 0) {
    itemsToSave = summarized;
  } else {
    // Fallback: save raw items without AI summarization — deduplicate by title
    logger.info('rss.fallback_raw', { message: 'AI summarization returned 0 items, saving raw with deduplication' });
    const today = new Date().toISOString().split('T')[0]!;

    // Deduplicate raw items by normalized title
    const seen = new Set<string>();
    const dedupedItems: typeof recentItems = [];
    for (const item of recentItems) {
      const key = item.title.toLowerCase().replace(/[^a-z0-9\s]/g, '').split(/\s+/).filter(w => w.length > 2).slice(0, 6).join(' ');
      if (!key || seen.has(key)) continue;
      seen.add(key);
      dedupedItems.push(item);
    }

    // Categorize based on keywords
    function categorizeItem(item: RawNewsItem): CurrentAffairsCategory {
      const text = (item.title + ' ' + item.description).toLowerCase();
      if (/cricket|football|hockey|olympic|medal|sport|ipl|match|cup\b/i.test(text)) return 'sports';
      if (/economy|gdp|rbi|inflation|stock|market|budget|tax|fiscal|monetary|rupee|dollar/i.test(text)) return 'economy';
      if (/technology|tech|ai\b|artificial|robot|software|digital|cyber|space|isro|nasa|satellite/i.test(text)) return 'science-tech';
      if (/climate|environment|forest|pollution|wildlife|biodiversity|carbon|green/i.test(text)) return 'environment';
      if (/usa|china|russia|pakistan|europe|united nations|un\b|global|world|international|foreign/i.test(text)) return 'international';
      if (/award|prize|padma|bharat ratna|nobel|honour/i.test(text)) return 'awards';
      return 'national';
    }

    itemsToSave = dedupedItems.slice(0, 30).map((item, i) => ({
      id: `${today}-raw-${i}-${Math.random().toString(36).slice(2, 6)}`,
      headline: item.title.slice(0, 100),
      body: item.description.slice(0, 300) || item.title,
      category: categorizeItem(item),
      sources: [item.source],
      relevantExams: [],
      tags: [],
      ...(item.imageUrl ? { imageUrl: item.imageUrl } : {}),
      ...(item.state ? { state: item.state } : {}),
      date: today,
      summary: item.description.slice(0, 200) || item.title,
      factChecked: false,
      publishedAt: item.pubDate || new Date().toISOString(),
    }));
  }

  // 4. Save
  if (itemsToSave.length > 0) {
    const today = new Date().toISOString().split('T')[0]!;
    await store.saveItems(today, itemsToSave);
  }

  // 5. Translate to Hindi.
  // PR-39: founder report — "kai bar eng me news aa rha hai hindi user
  // ke me bhi". The previous code translated only the first 15 items and
  // the rest stayed English-only. With the new strict Hindi filter on
  // /v1/current-affairs (PR-39 backend), an untranslated item is HIDDEN
  // from Hindi users — which used to mean Hindi users saw a half-empty
  // feed. Now we translate ALL items (capped at 30 to match itemsToSave
  // limit) so the Hindi feed has the same coverage as the English feed.
  //
  // Best-effort: a translation failure logs but doesn't block the
  // ingestion — the English feed is unaffected, and the Hindi feed will
  // pick up missing items the next time the ingestion fires.
  if (aiEngine && itemsToSave.length > 0) {
    try {
      // Translate the FULL body (which contains the "**Key Points:**" bullets),
      // not just the short summary. Previously only `summary` was translated,
      // so the Hindi `body` (= summaryHi) had NO bullets → Hindi users saw the
      // summary but the 3 quick-revision pointers were missing (founder report:
      // "english me 3 pointers de raha hai lekin hindi me nahi"). Translating
      // `body` means summaryHi now carries the Hindi bullets, and the reel's
      // extractKeyPoints() finds them just like the English feed.
      // Translate the prose summary + the key-point bullets (as a separate
      // array). Bullets are translated independently and stored in `bulletsHi`
      // so the Hindi feed shows the same crisp Key Points the English feed
      // does — without baking a "**Key Points:**" markdown heading into the
      // body (which used to leak as literal text and duplicate the summary).
      const toTranslate = itemsToSave.map(it => ({ headline: it.headline, summary: it.summary, bullets: it.bullets ?? [] }));
      const translated = await aiEngine.translateToHindi(toTranslate);
      if (translated.length > 0) {
        const today = new Date().toISOString().split('T')[0]!;
        const updatedItems = itemsToSave.map((item, i) => {
          if (i >= translated.length) return item;
          return {
            ...item,
            headlineHi: translated[i]!.headline,
            summaryHi: translated[i]!.summary,
            bulletsHi: translated[i]!.bullets ?? [],
          };
        });
        await store.saveItems(today, updatedItems);
        logger.info('rss.hindi_translated', {
          count: translated.length,
          totalItems: itemsToSave.length,
          coverage: `${translated.length}/${itemsToSave.length}`,
        });
      }
    } catch (err) { logger.warn('rss.hindi_translate_failed', { error: err instanceof Error ? err.message : String(err) }); }
  }

  logger.info('rss.ingestion_complete', { fetched: rawItems.length, saved: itemsToSave.length });

  // 6. Cleanup: delete currentAffairs buckets older than 48 hours
  try {
    const istOffset = 5.5 * 60 * 60 * 1000;
    const istNow = new Date(Date.now() + istOffset);
    const cutoff = new Date(istNow.getTime() - 48 * 60 * 60 * 1000);
    const cutoffKey = cutoff.toISOString().split('T')[0]!;

    // Use Firestore from store if available (duck-type check for db property)
    const db = (store as any).db as import('firebase-admin/firestore').Firestore | undefined;
    if (db) {
      const allDates = await db.collection('currentAffairs').listDocuments();
      for (const dateDoc of allDates) {
        if (dateDoc.id < cutoffKey && dateDoc.id.match(/^\d{4}-\d{2}-\d{2}$/)) {
          const items = await dateDoc.collection('items').listDocuments();
          if (items.length > 0) {
            const batch = db.batch();
            items.forEach(item => batch.delete(item));
            batch.delete(dateDoc);
            await batch.commit();
          } else {
            await dateDoc.delete();
          }
          logger.info('rss.cleanup_deleted', { date: dateDoc.id });
        }
      }
    }
  } catch (err) {
    logger.warn('rss.cleanup_error', { error: err instanceof Error ? err.message : String(err) });
  }

  return { fetched: rawItems.length, saved: itemsToSave.length };
}
