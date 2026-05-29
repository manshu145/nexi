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
      items.push({ title: cleanHtml(title), link: link ?? '', description: cleanHtml(description ?? ''), pubDate: pubDate ?? '', source: sourceName });
    }
  }
  return items;
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
async function summarizeItems(items: RawNewsItem[], env: Env, logger: Logger): Promise<CurrentAffairsStoreItem[]> {
  if (!env.GEMINI_API_KEY) {
    logger.warn('rss.no_gemini_key', { message: 'GEMINI_API_KEY not set, skipping summarization' });
    return [];
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

LAYER 2 — COMPREHENSIVE SUMMARY:
- Write a summary of MINIMUM 400 words covering:
  1. What happened (2-3 paragraphs with full context)
  2. Background & context (1-2 paragraphs explaining the history/context)
  3. Key facts and figures mentioned in the article
  4. Why it matters for India / exam relevance (which exams might ask about this)
  5. Related topics a student should study alongside this

LAYER 3 — BULLET POINTS (MANDATORY MINIMUM 3):
- Generate at least 3 concise bullet points highlighting key facts for quick revision
- Each bullet should be a standalone fact that could appear in an exam question
- Keep each bullet under 100 characters

For each item output:
- Keep the headline concise (max 80 chars)
- Write in simple, clear language suitable for students

News items:
${batch.map((item, i) => `${i + 1}. [${item.source}] ${item.title} — ${item.description.slice(0, 150)}`).join('\n')}

Respond ONLY with valid JSON:
{"items":[{"id":"ca-1","headline":"...","summary":"...","bullets":["fact 1","fact 2","fact 3"],"category":"national","sources":["Source Name"],"factChecked":true}]}`;

      const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${env.GEMINI_API_KEY}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: { temperature: 0.3, maxOutputTokens: 8000 },
        }),
      });

      if (!res.ok) {
        const errText = await res.text().catch(() => '');
        logger.warn('rss.gemini_error', { status: res.status, body: errText.slice(0, 200) });
        continue;
      }

      const data = await res.json() as { candidates?: { content?: { parts?: { text?: string }[] } }[] };
      const rawText = data.candidates?.[0]?.content?.parts?.[0]?.text ?? '';
      // Extract JSON from response (may have markdown fences)
      const jsonMatch = rawText.match(/\{[\s\S]*\}/);
      if (!jsonMatch) { logger.warn('rss.gemini_no_json', { raw: rawText.slice(0, 200) }); continue; }
      const parsed = JSON.parse(jsonMatch[0]) as { items: { id: string; headline: string; summary: string; bullets?: string[]; category: CurrentAffairsCategory; sources: string[]; factChecked: boolean }[] };

      for (const item of (parsed.items ?? [])) {
        // Validate: ensure bullets array has at least 3 items
        const bullets = item.bullets ?? [];
        if (bullets.length < 3) {
          // Generate fallback bullets from headline/summary
          while (bullets.length < 3) {
            if (bullets.length === 0) bullets.push(item.headline);
            else if (bullets.length === 1) bullets.push(`Category: ${item.category}`);
            else bullets.push(`Source: ${item.sources.join(', ')}`);
          }
        }

        allSummarized.push({
          id: `${today}-${item.id}-${Math.random().toString(36).slice(2, 6)}`,
          headline: item.headline,
          body: item.summary + '\n\n**Key Points:**\n' + bullets.map(b => `• ${b}`).join('\n'),
          category: item.category,
          sources: item.sources,
          relevantExams: [],
          tags: [],
          date: today,
          summary: item.summary,
          factChecked: item.factChecked,
          publishedAt: new Date().toISOString(),
        });
      }
    } catch (err) {
      logger.error('rss.summarize_error', { error: err instanceof Error ? err.message : String(err) });
    }
  }

  logger.info('rss.summarized', { total: allSummarized.length });
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
  const summarized = await summarizeItems(recentItems, env, logger);
  
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

  // 5. Translate to Hindi (best-effort, background)
  if (aiEngine && itemsToSave.length > 0) {
    try {
      const toTranslate = itemsToSave.slice(0, 15).map(it => ({ headline: it.headline, summary: it.summary }));
      const translated = await aiEngine.translateToHindi(toTranslate);
      if (translated.length > 0) {
        const today = new Date().toISOString().split('T')[0]!;
        const updatedItems = itemsToSave.map((item, i) => {
          if (i >= translated.length) return item;
          return { ...item, headlineHi: translated[i]!.headline, summaryHi: translated[i]!.summary };
        });
        await store.saveItems(today, updatedItems);
        logger.info('rss.hindi_translated', { count: translated.length });
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
