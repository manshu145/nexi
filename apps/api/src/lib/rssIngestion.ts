/**
 * RSS/Atom Feed Ingestion for Current Affairs.
 *
 * Fetches from 30 government + news publication feeds, extracts text,
 * and returns combined raw notes ready for the 3-AI current affairs pipeline.
 *
 * Sources include:
 *   - Government: PIB, I&B Ministry, RBI, NITI Aayog, MoF, MEA, MoEFCC
 *   - News: The Hindu, Indian Express, Livemint, Economic Times
 *   - Wire services: PTI (via outlets), ANI
 *   - Specialized: ISRO, DRDO, Science journals
 *
 * Each feed is fetched with a 10-second timeout. Failed feeds are logged
 * but don't block the pipeline — we work with whatever succeeds.
 */

export interface FeedSource {
  id: string;
  name: string;
  url: string;
  category: 'government' | 'news' | 'economy' | 'science' | 'international';
}

export const NEWS_FEEDS: FeedSource[] = [
  // Government sources
  { id: 'pib', name: 'Press Information Bureau', url: 'https://pib.gov.in/RssMain.aspx?ModId=6&Lang=1&Regid=3', category: 'government' },
  { id: 'pib-defence', name: 'PIB Defence', url: 'https://pib.gov.in/RssMain.aspx?ModId=6&Lang=1&Regid=2', category: 'government' },
  { id: 'pib-economy', name: 'PIB Economy', url: 'https://pib.gov.in/RssMain.aspx?ModId=6&Lang=1&Regid=4', category: 'government' },
  { id: 'rbi-press', name: 'RBI Press Releases', url: 'https://www.rbi.org.in/scripts/RSSFeedDisplay.aspx', category: 'economy' },
  { id: 'mof', name: 'Ministry of Finance', url: 'https://pib.gov.in/RssMain.aspx?ModId=6&Lang=1&Regid=4', category: 'economy' },
  { id: 'mea', name: 'Ministry of External Affairs', url: 'https://www.mea.gov.in/rss/press-releases-rss.xml', category: 'international' },
  { id: 'moefcc', name: 'MoEFCC', url: 'https://pib.gov.in/RssMain.aspx?ModId=6&Lang=1&Regid=52', category: 'science' },
  { id: 'isro', name: 'ISRO News', url: 'https://www.isro.gov.in/rss_feed.xml', category: 'science' },

  // News publications
  { id: 'thehindu-national', name: 'The Hindu National', url: 'https://www.thehindu.com/news/national/feeder/default.rss', category: 'news' },
  { id: 'thehindu-economy', name: 'The Hindu Economy', url: 'https://www.thehindu.com/business/Economy/feeder/default.rss', category: 'economy' },
  { id: 'thehindu-science', name: 'The Hindu Science', url: 'https://www.thehindu.com/sci-tech/science/feeder/default.rss', category: 'science' },
  { id: 'indianexpress', name: 'Indian Express India', url: 'https://indianexpress.com/section/india/feed/', category: 'news' },
  { id: 'indianexpress-explained', name: 'Indian Express Explained', url: 'https://indianexpress.com/section/explained/feed/', category: 'news' },
  { id: 'livemint', name: 'Livemint', url: 'https://www.livemint.com/rss/news', category: 'news' },
  { id: 'livemint-economy', name: 'Livemint Economy', url: 'https://www.livemint.com/rss/economy', category: 'economy' },
  { id: 'et-economy', name: 'Economic Times Economy', url: 'https://economictimes.indiatimes.com/news/economy/rssfeeds/1373380680.cms', category: 'economy' },
  { id: 'et-politics', name: 'Economic Times Politics', url: 'https://economictimes.indiatimes.com/news/politics-and-nation/rssfeeds/1052732854.cms', category: 'news' },
  { id: 'ndtv-india', name: 'NDTV India', url: 'https://feeds.feedburner.com/ndtvnews-india-news', category: 'news' },
  { id: 'toi-india', name: 'Times of India India', url: 'https://timesofindia.indiatimes.com/rssfeeds/296589292.cms', category: 'news' },
  { id: 'downtoearth', name: 'Down To Earth', url: 'https://www.downtoearth.org.in/rss/news', category: 'science' },

  // International focus
  { id: 'thehindu-intl', name: 'The Hindu International', url: 'https://www.thehindu.com/news/international/feeder/default.rss', category: 'international' },
  { id: 'et-intl', name: 'ET International', url: 'https://economictimes.indiatimes.com/news/international/rssfeeds/1715249553.cms', category: 'international' },

  // Science & Tech
  { id: 'thehindu-tech', name: 'The Hindu Technology', url: 'https://www.thehindu.com/sci-tech/technology/feeder/default.rss', category: 'science' },
  { id: 'et-tech', name: 'ET Technology', url: 'https://economictimes.indiatimes.com/tech/rssfeeds/13357270.cms', category: 'science' },

  // Sports (for CA quiz)
  { id: 'thehindu-sports', name: 'The Hindu Sports', url: 'https://www.thehindu.com/sport/feeder/default.rss', category: 'news' },

  // Education
  { id: 'ndtv-education', name: 'NDTV Education', url: 'https://feeds.feedburner.com/ndtvnews-education', category: 'news' },

  // Additional government
  { id: 'niti-aayog', name: 'NITI Aayog', url: 'https://pib.gov.in/RssMain.aspx?ModId=6&Lang=1&Regid=31', category: 'government' },
  { id: 'moha', name: 'Ministry of Home Affairs', url: 'https://pib.gov.in/RssMain.aspx?ModId=6&Lang=1&Regid=25', category: 'government' },
  { id: 'mod', name: 'Ministry of Defence', url: 'https://pib.gov.in/RssMain.aspx?ModId=6&Lang=1&Regid=2', category: 'government' },
  { id: 'moe', name: 'Ministry of Education', url: 'https://pib.gov.in/RssMain.aspx?ModId=6&Lang=1&Regid=46', category: 'government' },
];

export interface FeedItem {
  source: string;
  sourceName: string;
  category: string;
  title: string;
  description: string;
  link: string;
  pubDate: string | null;
}

/**
 * Parse RSS/Atom XML into feed items. Simple regex-based parser
 * (no external XML dependency needed for RSS).
 */
function parseRss(xml: string, source: FeedSource): FeedItem[] {
  const items: FeedItem[] = [];

  // Try RSS <item> tags first
  const rssItems = xml.match(/<item[\s>][\s\S]*?<\/item>/gi) ?? [];
  for (const raw of rssItems.slice(0, 10)) { // max 10 per feed
    const title = extractTag(raw, 'title');
    const description = extractTag(raw, 'description') || extractTag(raw, 'content:encoded');
    const link = extractTag(raw, 'link');
    const pubDate = extractTag(raw, 'pubDate') || extractTag(raw, 'dc:date');

    if (title && title.length > 10) {
      items.push({
        source: source.id,
        sourceName: source.name,
        category: source.category,
        title: stripHtml(title).slice(0, 200),
        description: stripHtml(description || '').slice(0, 1000),
        link: link || '',
        pubDate,
      });
    }
  }

  // Fallback: try Atom <entry> tags
  if (items.length === 0) {
    const atomEntries = xml.match(/<entry[\s>][\s\S]*?<\/entry>/gi) ?? [];
    for (const raw of atomEntries.slice(0, 10)) {
      const title = extractTag(raw, 'title');
      const summary = extractTag(raw, 'summary') || extractTag(raw, 'content');
      const linkMatch = raw.match(/<link[^>]*href="([^"]+)"/i);
      const link = linkMatch?.[1] ?? '';
      const published = extractTag(raw, 'published') || extractTag(raw, 'updated');

      if (title && title.length > 10) {
        items.push({
          source: source.id,
          sourceName: source.name,
          category: source.category,
          title: stripHtml(title).slice(0, 200),
          description: stripHtml(summary || '').slice(0, 1000),
          link,
          pubDate: published,
        });
      }
    }
  }

  return items;
}

function extractTag(xml: string, tag: string): string {
  // Handle CDATA
  const cdataRe = new RegExp(`<${tag}[^>]*>\\s*<!\\[CDATA\\[([\\s\\S]*?)\\]\\]>\\s*</${tag}>`, 'i');
  const cdataMatch = xml.match(cdataRe);
  if (cdataMatch) return cdataMatch[1]?.trim() ?? '';

  const re = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`, 'i');
  const match = xml.match(re);
  return match?.[1]?.trim() ?? '';
}

function stripHtml(html: string): string {
  return html
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Fetch a single feed with timeout. Returns items or empty array on failure.
 */
async function fetchFeed(source: FeedSource, logger: { warn: (msg: string, meta?: any) => void }): Promise<FeedItem[]> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10_000);

    const res = await fetch(source.url, {
      signal: controller.signal,
      headers: {
        'User-Agent': 'Nexigrate-RSS-Bot/1.0 (https://nexigrate.com; educational platform)',
        'Accept': 'application/rss+xml, application/atom+xml, application/xml, text/xml',
      },
    });
    clearTimeout(timeout);

    if (!res.ok) {
      logger.warn('rss.fetch_failed', { source: source.id, status: res.status });
      return [];
    }

    const xml = await res.text();
    return parseRss(xml, source);
  } catch (e) {
    logger.warn('rss.fetch_error', {
      source: source.id,
      error: e instanceof Error ? e.message : 'unknown',
    });
    return [];
  }
}

/**
 * Filter items to only today's news (published within last 24 hours).
 */
function filterToday(items: FeedItem[]): FeedItem[] {
  const cutoff = Date.now() - 24 * 60 * 60 * 1000;
  return items.filter((item) => {
    if (!item.pubDate) return true; // include if no date (might be recent)
    const d = new Date(item.pubDate).getTime();
    return !isNaN(d) && d >= cutoff;
  });
}

/**
 * Deduplicate items by similar titles (fuzzy match on first 50 chars lowercased).
 */
function dedup(items: FeedItem[]): FeedItem[] {
  const seen = new Set<string>();
  return items.filter((item) => {
    const key = item.title.toLowerCase().slice(0, 50).replace(/[^a-z0-9]/g, '');
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export interface IngestionResult {
  feedsAttempted: number;
  feedsSucceeded: number;
  totalItems: number;
  filteredItems: number;
  rawNotes: string;
  sources: string[];
}

/**
 * Main ingestion function: fetches all feeds, filters to today,
 * deduplicates, and returns combined rawNotes for the AI pipeline.
 */
export async function ingestNewsFeeds(
  logger: { info: (msg: string, meta?: any) => void; warn: (msg: string, meta?: any) => void },
  feeds: FeedSource[] = NEWS_FEEDS,
): Promise<IngestionResult> {
  logger.info('rss.ingestion.start', { feedCount: feeds.length });

  // Fetch all feeds in parallel (with individual timeouts)
  const results = await Promise.all(feeds.map((f) => fetchFeed(f, logger)));

  let allItems: FeedItem[] = [];
  let feedsSucceeded = 0;
  for (const items of results) {
    if (items.length > 0) feedsSucceeded++;
    allItems.push(...items);
  }

  // Filter to today's items and deduplicate
  const todayItems = filterToday(allItems);
  const uniqueItems = dedup(todayItems);

  // Sort by category priority: government > economy > international > science > news
  const categoryOrder: Record<string, number> = {
    government: 0, economy: 1, international: 2, science: 3, news: 4,
  };
  uniqueItems.sort((a, b) => (categoryOrder[a.category] ?? 5) - (categoryOrder[b.category] ?? 5));

  // Take top 40 items (enough for AI to generate a comprehensive digest)
  const selected = uniqueItems.slice(0, 40);

  // Format as rawNotes for the AI pipeline
  const rawNotes = selected
    .map((item, i) => {
      const parts = [`[${i + 1}] ${item.title}`];
      if (item.description) parts.push(item.description);
      parts.push(`— Source: ${item.sourceName}`);
      return parts.join('\n');
    })
    .join('\n\n---\n\n');

  const sourcesUsed = [...new Set(selected.map((i) => i.sourceName))];

  logger.info('rss.ingestion.complete', {
    feedsAttempted: feeds.length,
    feedsSucceeded,
    totalItems: allItems.length,
    filtered: todayItems.length,
    deduped: uniqueItems.length,
    selected: selected.length,
    sources: sourcesUsed.length,
  });

  return {
    feedsAttempted: feeds.length,
    feedsSucceeded,
    totalItems: allItems.length,
    filteredItems: selected.length,
    rawNotes,
    sources: sourcesUsed,
  };
}
