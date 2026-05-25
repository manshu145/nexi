import type { Env } from '../env.js';
import type { Logger } from '../logger.js';
import type { CurrentAffairsStoreItem, CurrentAffairsStore } from './currentAffairsStore.js';
import type { CurrentAffairsCategory } from '@nexigrate/shared';

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
 */
async function fetchRssFeeds(logger: Logger): Promise<RawNewsItem[]> {
  const allItems: RawNewsItem[] = [];
  const results = await Promise.allSettled(
    NEWS_SOURCES.map(async (source) => {
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
      const prompt = `You are a current affairs summarizer for Indian competitive exam students (UPSC, SSC, Banking).

Given these news headlines, create a JSON array of summarized items. For each item:
- Assign a category from: national, international, economy, science-tech, environment, sports, awards, agreements, reports, other
- Write a 2-3 line factual summary suitable for exam preparation
- Keep the headline concise (max 80 chars)
- Deduplicate: if multiple items cover the same story, merge into one

News items:
${batch.map((item, i) => `${i + 1}. [${item.source}] ${item.title} — ${item.description.slice(0, 150)}`).join('\n')}

Respond ONLY with valid JSON:
{"items":[{"id":"ca-1","headline":"...","summary":"...","category":"national","sources":["Source Name"],"factChecked":true}]}`;

      const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${env.GEMINI_API_KEY}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: { temperature: 0.3, maxOutputTokens: 2000, responseMimeType: 'application/json' },
        }),
      });

      if (!res.ok) { logger.warn('rss.gemini_error', { status: res.status }); continue; }

      const data = await res.json() as { candidates?: { content?: { parts?: { text?: string }[] } }[] };
      const text = data.candidates?.[0]?.content?.parts?.[0]?.text ?? '';
      const parsed = JSON.parse(text) as { items: { id: string; headline: string; summary: string; category: CurrentAffairsCategory; sources: string[]; factChecked: boolean }[] };

      for (const item of (parsed.items ?? [])) {
        allSummarized.push({
          id: `${today}-${item.id}-${Math.random().toString(36).slice(2, 6)}`,
          headline: item.headline,
          body: item.summary,
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
): Promise<{ fetched: number; saved: number }> {
  logger.info('rss.ingestion_start', { sources: NEWS_SOURCES.length });

  // 1. Fetch all feeds
  const rawItems = await fetchRssFeeds(logger);
  logger.info('rss.fetched', { total: rawItems.length });

  if (rawItems.length === 0) return { fetched: 0, saved: 0 };

  // 2. Filter to recent items (last 24 hours)
  const oneDayAgo = Date.now() - 24 * 60 * 60 * 1000;
  const recentItems = rawItems.filter(item => {
    if (!item.pubDate) return true; // Include if no date
    const d = new Date(item.pubDate).getTime();
    return !isNaN(d) ? d > oneDayAgo : true;
  }).slice(0, 50); // Max 50 items to summarize

  // 3. AI summarize (or fallback to raw items if no Gemini key)
  let itemsToSave: CurrentAffairsStoreItem[];
  if (env.GEMINI_API_KEY) {
    itemsToSave = await summarizeItems(recentItems, env, logger);
  } else {
    // Fallback: save raw items without AI summarization
    logger.info('rss.no_gemini_key_fallback', { message: 'Saving raw items without AI summarization' });
    const today = new Date().toISOString().split('T')[0]!;
    itemsToSave = recentItems.slice(0, 30).map((item, i) => ({
      id: `${today}-raw-${i}-${Math.random().toString(36).slice(2, 6)}`,
      headline: item.title.slice(0, 100),
      body: item.description.slice(0, 300) || item.title,
      category: 'national' as CurrentAffairsCategory,
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

  logger.info('rss.ingestion_complete', { fetched: rawItems.length, saved: itemsToSave.length });
  return { fetched: rawItems.length, saved: itemsToSave.length };
}
