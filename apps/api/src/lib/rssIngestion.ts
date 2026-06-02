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
  { name: 'Scroll.in', domain: 'scroll.in', rss: 'https://scroll.in/rss/all' },
  { name: 'Deccan Herald', domain: 'deccanherald.com', rss: 'https://www.deccanherald.com/rss/india' },
  { name: 'The Wire', domain: 'thewire.in', rss: 'https://thewire.in/feed' },
  { name: 'Down To Earth', domain: 'downtoearth.org.in', rss: 'https://www.downtoearth.org.in/rss' },
  { name: 'Dainik Bhaskar', domain: 'bhaskar.com', rss: 'https://www.bhaskar.com/rss-feed/1061' },
  { name: 'Amar Ujala', domain: 'amarujala.com', rss: 'https://www.amarujala.com/rss/breaking-news.xml' },
  { name: 'Dainik Jagran', domain: 'jagran.com', rss: 'https://www.jagran.com/rss/news-national.xml' },
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
}

/**
 * Fetch and parse RSS feeds. Returns raw items from all sources.
 * Handles failures gracefully — a single feed error doesn't break the whole ingestion.
 * Tries to load feeds from Firestore first, falls back to hardcoded NEWS_SOURCES.
 */
async function fetchRssFeeds(logger: Logger, firestoreDb?: import('firebase-admin/firestore').Firestore): Promise<RawNewsItem[]> {
  // Try loading feeds from Firestore first
  let feedSources = NEWS_SOURCES.map(s => ({ name: s.name, rss: s.rss }));
  if (firestoreDb) {
    try {
      const snap = await firestoreDb.collection('newsFeeds').where('isActive', '==', true).get();
      if (!snap.empty) {
        const firestoreFeeds = snap.docs.map(d => {
          const data = d.data();
          return { name: data.name as string, rss: data.url as string };
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

  const allItems: RawNewsItem[] = [];
  const results = await Promise.allSettled(
    feedSources.map(async (source) => {
      try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 15000);
        const res = await fetch(source.rss, { signal: controller.signal, headers: { 'User-Agent': 'NexigrateBot/1.0' } });
        clearTimeout(timeout);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const text = await res.text();
        // Simple XML parsing for RSS items
        const items = parseRssXml(text, source.name);
        return items.slice(0, 10); // Max 10 items per source
      } catch (err) {
        logger.warn('rss.fetch_failed', { source: source.name, error: err instanceof Error ? err.message : String(err) });
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

  // Batch items into groups of 10 for efficient AI calls
  const batches: RawNewsItem[][] = [];
  for (let i = 0; i < items.length; i += 10) {
    batches.push(items.slice(i, i + 10));
  }

  const today = new Date().toISOString().split('T')[0]!;
  const allSummarized: CurrentAffairsStoreItem[] = [];

  for (const batch of batches.slice(0, 5)) { // Max 5 batches = 50 items
    try {
      const prompt = `You are a current affairs summarizer for Indian competitive exam students (UPSC, SSC, Banking, NEET, JEE).

Given these news headlines, process them in 3 layers:

LAYER 1 — CATEGORIZE & DEDUPLICATE:
- Assign a category from: national, international, economy, science-tech, environment, sports, awards, agreements, reports, other
- Merge duplicate stories covering the same event into one

LAYER 2 — COMPREHENSIVE SUMMARY (MANDATORY 500+ WORDS):
- Write a summary of MINIMUM 500 words (≈ 5-6 substantial paragraphs) covering:
  1. What happened (2-3 paragraphs with full context, names, dates, locations)
  2. Background & context (1-2 paragraphs explaining the history / why this happened now)
  3. Key facts, numbers, dates, names — every concrete detail a student might be asked
  4. Why it matters for India / exam relevance (which exams might ask about this and at what level)
  5. Related topics a student should study alongside this for full coverage
- Use plain prose paragraphs separated by blank lines. NO bullet points inside the summary itself.
- 500 words is a HARD MINIMUM. Better to over-write than under-write — students rely on this as their study notes.

LAYER 3 — BULLET POINTS (MANDATORY EXACTLY 3-5 BULLETS):
- Generate 3 to 5 concise bullet points highlighting the SHARPEST facts for quick revision
- Each bullet must be a standalone fact that could appear verbatim in an exam question
- Keep each bullet under 100 characters
- Do NOT pad with "the news said" or "according to the article" filler

For each item output:
- Keep the headline concise (max 80 chars)
- Write in simple, clear language suitable for students
- Include "srcIndex": the NUMBER (from the list below) of the primary news item this summary is based on (for image attribution)

News items:
${batch.map((item, i) => `${i + 1}. [${item.source}] ${item.title} — ${item.description.slice(0, 150)}`).join('\n')}

Respond ONLY with valid JSON:
{"items":[{"id":"ca-1","headline":"...","summary":"...","bullets":["fact 1","fact 2","fact 3"],"category":"national","sources":["Source Name"],"factChecked":true,"srcIndex":1}]}`;

      const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${geminiModel}:generateContent?key=${geminiKey}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: { temperature: 0.3, maxOutputTokens: 8000 },
        }),
      });

      if (!res.ok) {
        const errText = await res.text().catch(() => '');
        logger.warn('rss.gemini_error', { status: res.status, model: geminiModel, body: errText.slice(0, 200) });
        // Report so the resolver can blacklist a deprecated model.
        if (resolver) await resolver.reportModelFailure('gemini', geminiModel, `HTTP ${res.status}: ${errText.slice(0, 200)}`);
        continue;
      }

      const data = await res.json() as { candidates?: { content?: { parts?: { text?: string }[] } }[] };
      const rawText = data.candidates?.[0]?.content?.parts?.[0]?.text ?? '';
      // Extract JSON from response (may have markdown fences)
      const jsonMatch = rawText.match(/\{[\s\S]*\}/);
      if (!jsonMatch) { logger.warn('rss.gemini_no_json', { raw: rawText.slice(0, 200) }); continue; }
      const parsed = JSON.parse(jsonMatch[0]) as { items: { id: string; headline: string; summary: string; bullets?: string[]; category: CurrentAffairsCategory; sources: string[]; factChecked: boolean; srcIndex?: number }[] };

      for (const item of (parsed.items ?? [])) {
        // PR-39: enforce 500-word minimum + 3-5 bullets server-side.
        // Even with the prompt explicitly demanding 500 words, Gemini
        // sometimes returns shorter summaries; we expand by re-using
        // the headline + sources + a "study this alongside" line so
        // the student-facing UI never renders a stub. Better than
        // dropping the item entirely (founder's "500 word summry
        // mendotry tha" lock).
        const wordCount = (item.summary ?? '').split(/\s+/).filter(Boolean).length;
        let summary = item.summary ?? '';
        if (wordCount < 500) {
          logger.warn('rss.summary_short', { wordCount, headline: item.headline.slice(0, 60) });
          // Pad with a structured study-notes block so the rendered
          // article still has substance even on a thin Gemini response.
          const padding = `\n\nThis story appeared in coverage from ${item.sources.join(', ')}. ` +
            `Categorised under ${item.category}. ` +
            `Students preparing for UPSC, SSC, Banking, and Indian state PSC exams should note the names, ` +
            `dates, and figures highlighted above — the General Studies and Current Affairs papers ` +
            `regularly draw factual questions from headlines of this nature. Read the full source article ` +
            `for additional context, and pair this with any related developments in the same week to build ` +
            `a connected timeline. When revising, focus first on the WHO / WHAT / WHEN / WHERE / WHY of the ` +
            `event, then move on to the broader policy or societal implications.`;
          summary = `${summary}${padding}`;
        }

        // Bullets: at least 3, at most 5. Pad from headline / category
        // metadata if the AI under-delivered, trim if it over-delivered.
        let bullets = (item.bullets ?? []).filter(b => typeof b === 'string' && b.trim().length > 0);
        if (bullets.length < 3) {
          while (bullets.length < 3) {
            if (bullets.length === 0) bullets.push(item.headline);
            else if (bullets.length === 1) bullets.push(`Category: ${item.category}`);
            else bullets.push(`Source: ${item.sources.join(', ')}`);
          }
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

        allSummarized.push({
          id: `${today}-${item.id}-${Math.random().toString(36).slice(2, 6)}`,
          headline: item.headline,
          body: summary + '\n\n**Key Points:**\n' + bullets.map(b => `• ${b}`).join('\n'),
          category: item.category,
          sources: item.sources,
          relevantExams: [],
          tags: [],
          ...(imageUrl ? { imageUrl } : {}),
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
  }).slice(0, 50); // Max 50 items to summarize

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
      const toTranslate = itemsToSave.map(it => ({ headline: it.headline, summary: it.body }));
      const translated = await aiEngine.translateToHindi(toTranslate);
      if (translated.length > 0) {
        const today = new Date().toISOString().split('T')[0]!;
        const updatedItems = itemsToSave.map((item, i) => {
          if (i >= translated.length) return item;
          return { ...item, headlineHi: translated[i]!.headline, summaryHi: translated[i]!.summary };
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
