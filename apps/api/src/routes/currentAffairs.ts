import { Hono } from 'hono';
import { HTTPException } from 'hono/http-exception';
import { createHash } from 'node:crypto';
import { requireAuth } from '../auth.js';
import type { Logger } from '../logger.js';
import type { UserStore } from '../lib/userStore.js';
import type { AIEngine } from '../lib/aiEngine.js';
import type { CurrentAffairsStore } from '../lib/currentAffairsStore.js';
import type { AdsStore, ReelAd } from '../lib/adsStore.js';
import type { Env } from '../env.js';
import { ingestCurrentAffairs } from '../lib/rssIngestion.js';
import { INDIAN_STATES } from '@nexigrate/shared';

/**
 * Deduplicate current affairs items by normalized headline.
 *
 * Dedup is SCOPED PER STATE (state slug + headline), never across editions.
 * Founder report: "state ke news mix up ho rahe hain / unke feed me nahi ja
 * rahe". Root cause: a national item and a state (CG/MP) item covering the
 * same event normalize to the same headline key; the old global dedup merged
 * them into ONE survivor with a single `state` value — so the state edition
 * either lost its item or inherited a national one. Scoping the key by state
 * keeps each edition's items independent: a national duplicate can never
 * evict a state item, and two different states never collide.
 */
function deduplicateItems(items: any[]): any[] {
  if (items.length === 0) return [];
  const seen = new Map<string, any>();
  for (const item of items) {
    const headlineKey = normalizeHeadline(item.headline || '');
    if (!headlineKey) continue;
    const normalizedKey = `${item.state || 'national'}::${headlineKey}`;
    const existing = seen.get(normalizedKey);
    if (!existing) {
      seen.set(normalizedKey, item);
    } else {
      const existingSummary = existing.summary || existing.body || '';
      const newSummary = item.summary || item.body || '';
      if (newSummary.length > existingSummary.length) {
        const mergedSources = [...new Set([...(existing.sources || []), ...(item.sources || [])])];
        seen.set(normalizedKey, { ...item, sources: mergedSources, factChecked: existing.factChecked || item.factChecked });
      } else {
        existing.sources = [...new Set([...(existing.sources || []), ...(item.sources || [])])];
        if (item.factChecked) existing.factChecked = true;
      }
    }
  }
  return Array.from(seen.values());
}

function normalizeHeadline(headline: string): string {
  const stopWords = new Set(['the', 'a', 'an', 'is', 'are', 'was', 'were', 'in', 'on', 'at', 'to', 'for', 'of', 'and', 'or', 'but', 'not', 'with', 'from', 'by', 'as', 'it', 'its', 'that', 'this', 'has', 'have', 'had', 'be', 'been', 'will', 'can', 'may']);
  const words = headline.toLowerCase().replace(/[^a-z0-9\s]/g, '').split(/\s+/).filter(w => w.length > 2 && !stopWords.has(w));
  return words.slice(0, 8).join(' ');
}

/**
 * Content fingerprint for the daily quiz cache key.
 *
 * Founder report: "naya content aa gaya hai lekin quiz purane ke hisab se aa
 * raha hai". Root cause: the quiz was cached by DATE only, so the first quiz
 * generated in a day (often from a sparse early-morning bucket, or even
 * yesterday's fallback) was frozen for the rest of the day while the feed
 * kept refreshing every 30 min. By keying the cache on a hash of the current
 * item set, a fresh quiz is generated whenever the content actually changes,
 * and the cached one is reused only while the content set is identical.
 */
function quizFingerprint(items: any[]): string {
  const ids = items
    .map((it) => String(it.id || it.headline || ''))
    .filter(Boolean)
    .sort();
  return createHash('sha1').update(ids.join('|')).digest('hex').slice(0, 12);
}

export interface CurrentAffairsRoutesDeps {
  users: UserStore;
  aiEngine: AIEngine;
  currentAffairs: CurrentAffairsStore;
  /** Reel ads store — optional so older wiring/tests still construct routes. */
  ads?: AdsStore;
  env: Env;
  logger: Logger;
}

export function makeCurrentAffairsRoutes(deps: CurrentAffairsRoutesDeps): Hono {
  const app = new Hono();

  // GET /v1/current-affairs — today's items
  app.get('/', async (c) => {
    try {
      const principal = requireAuth(c);
      const today = new Date().toISOString().split('T')[0]!;
      const language = (c.req.query('lang') as 'en' | 'hi') || 'en';
      const stateParam = c.req.query('state');

      // Parallelize independent Firestore calls: items + winner + live states
      // (previously sequential = ~600ms, now parallel = ~200ms)
      const needLiveStates = !stateParam || stateParam === 'all';
      const [itemsResult, winnerResult, liveStatesResult, lastIngestedResult] = await Promise.all([
        deps.currentAffairs.getTodayItems(today).catch((e) => { deps.logger.error('ca.getTodayItems_error', { error: String(e) }); return [] as any[]; }),
        deps.currentAffairs.getYesterdayWinner().catch((e) => { deps.logger.error('ca.getWinner_error', { error: String(e) }); return null; }),
        needLiveStates ? deps.currentAffairs.getLiveStates().catch((e) => { deps.logger.warn('ca.live_states_filter_error', { error: String(e) }); return [] as string[]; }) : Promise.resolve([] as string[]),
        deps.currentAffairs.getLastIngestedAt().catch(() => null),
      ]);

      let items: any[] = deduplicateItems(itemsResult);
      const winner = winnerResult;

      // State edition filter
      if (stateParam === 'national') {
        items = items.filter((it: any) => !it.state);
      } else if (stateParam && stateParam !== 'all') {
        items = items.filter((it: any) => it.state === stateParam);
      } else {
        // 'all' or no param → national + live-state news only.
        const live = new Set<string>(liveStatesResult);
        items = items.filter((it: any) => !it.state || live.has(it.state));
      }

      // 15-min refresh check: trigger background re-ingestion if stale.
      // Matches the scheduler's 15-min ingest cadence so an active reader
      // always pulls near-real-time content; the cross-run source dedup in
      // ingestCurrentAffairs keeps this cheap (only genuinely new articles
      // are summarized).
      try {
        const staleMs = 15 * 60 * 1000;
        if (!lastIngestedResult || (Date.now() - Date.parse(lastIngestedResult)) > staleMs) {
          deps.logger.info('ca.stale_triggering_reingest', { lastIngested: lastIngestedResult });
          // Fire-and-forget background re-ingestion
          import('../lib/rssIngestion.js').then(({ ingestCurrentAffairs }) => {
            ingestCurrentAffairs(deps.currentAffairs, deps.env, deps.logger, deps.aiEngine)
              .then(() => deps.currentAffairs.setLastIngestedAt(new Date().toISOString()))
              .catch(err => deps.logger.error('ca.background_reingest_failed', { error: String(err) }));
          }).catch(() => {});
        }
      } catch (e) { deps.logger.warn('ca.refresh_check_error', { error: String(e) }); }

      // PR-39: Hindi enforcement.
      // Founder report (30 May 22:00 IST):
      //   "kai bar eng me news aa rha hai hindi user ke me bhi"
      //
      // Pre-PR-39: Hindi users got the English fields whenever the
      // pre-translated `headlineHi` / `summaryHi` happened to be missing
      // (e.g. an item ingested before Gemini translation succeeded). The
      // behaviour was "best-effort fallback" -- but the founder doesn't
      // want partial-Hindi mixing. For Hindi users we now FILTER OUT
      // items that lack Hindi translation entirely, so the feed is
      // 100% Devanagari or it shows the empty state. Better to wait
      // for the next ingestion than to ship English text to a Hindi
      // student.
      if (language === 'hi') {
        const before = items.length;
        // Strict filter: drop items without BOTH headline and summary
        // translated. Items missing only one field could be partial
        // Gemini failures and aren't safe to render as "Hindi".
        items = items.filter((it: any) =>
          typeof it.headlineHi === 'string' && it.headlineHi.length > 0 &&
          (typeof it.summaryHi === 'string' ? it.summaryHi.length > 0 : false)
        );
        if (before > items.length) {
          deps.logger.info('ca.hindi_filter_dropped_untranslated', {
            before, after: items.length, dropped: before - items.length,
          });
        }
        // Now swap the rendered fields to the Hindi versions so the
        // client sees a clean { headline, summary, body } structure
        // without having to know about the *Hi shadow fields.
        items = items.map((it: any) => ({
          ...it,
          headline: it.headlineHi,
          summary: it.summaryHi,
          body: it.summaryHi || it.body,
          // Use the Hindi bullets when we have them, else the English ones.
          bullets: (Array.isArray(it.bulletsHi) && it.bulletsHi.length > 0) ? it.bulletsHi : it.bullets,
          // Keep the originals around in case the detail page wants them.
          _headlineEn: it.headline,
          _summaryEn: it.summary,
        }));
      }

      // Fetch user's social data (likes, bookmarks, counts)
      let userLikes: string[] = [];
      let userBookmarks: string[] = [];
      let likeCounts: Record<string, number> = {};
      try {
        const itemIds = items.map((it: any) => it.id);
        [userLikes, userBookmarks, likeCounts] = await Promise.all([
          deps.currentAffairs.getUserLikes(principal.userId),
          deps.currentAffairs.getUserBookmarks(principal.userId),
          deps.currentAffairs.getLikeCounts(itemIds),
        ]);
      } catch (e) { deps.logger.warn('ca.social_fetch_error', { error: String(e) }); }

      // Reel ads: active creatives + placement frequency, served to the feed
      // so it can inject an ad card after every N news reels. Disabled
      // unless the admin turned ads on AND there's at least one active ad.
      let ads: { enabled: boolean; everyNReels: number; items: ReelAd[] } = { enabled: false, everyNReels: 5, items: [] };
      if (deps.ads) {
        try {
          const [cfg, activeAds] = await Promise.all([deps.ads.getConfig(), deps.ads.listActiveAds()]);
          ads = { enabled: cfg.enabled && activeAds.length > 0, everyNReels: cfg.everyNReels, items: activeAds };
        } catch (e) { deps.logger.warn('ca.ads_fetch_error', { error: String(e) }); }
      }

      return c.json({ date: today, items, yesterdayWinner: winner, isFromYesterday: items.some((it: any) => it._isFromYesterday), userLikes, userBookmarks, likeCounts, ads });
    } catch (e) {
      if (e instanceof HTTPException) throw e;
      deps.logger.error('ca.route_error', { error: e instanceof Error ? e.message : String(e), stack: e instanceof Error ? e.stack : '' });
      return c.json({ date: new Date().toISOString().split('T')[0], items: [], yesterdayWinner: null });
    }
  });

  // GET /v1/current-affairs/quiz — daily quiz (up to 30 MCQs), always built
  // from the LATEST ingested content via a content-fingerprint cache key.
  app.get('/quiz', async (c) => {
    try {
      requireAuth(c);
      const today = new Date().toISOString().split('T')[0]!;
      const language = (c.req.query('lang') as 'en' | 'hi') || 'en';

      // Build the quiz from ALL of today's deduplicated items so it reflects
      // every headline currently available — not a stale morning snapshot.
      const items = deduplicateItems(await deps.currentAffairs.getTodayItems(today));
      if (items.length === 0) {
        throw new HTTPException(404, { message: 'No current affairs available for today. Try again later.' });
      }

      // Fingerprint the current content set. When new content is ingested the
      // fingerprint changes -> a fresh quiz is generated. While the content is
      // unchanged the cached quiz is reused (no duplicate AI cost).
      const fp = quizFingerprint(items);
      const quizKey = `${today}${language === 'hi' ? '-hi' : ''}-${fp}`;

      let questions = await deps.currentAffairs.getDailyQuiz(quizKey);
      if (!questions) {
        // Target 25-30 questions; scale down gracefully on sparse days so the
        // AI isn't forced to pad from too few headlines.
        const count = items.length >= 10 ? 30 : Math.min(30, Math.max(10, items.length * 3));
        const headlines = items.map(item => `[${item.category}] ${item.headline}: ${item.summary}`).join('\n');
        questions = await deps.aiEngine.generateCurrentAffairsQuiz(headlines, count, language);
        await deps.currentAffairs.saveDailyQuiz(quizKey, questions);
        deps.logger.info('ca.quiz_generated', { date: today, language, fp, requested: count, count: questions.length });
      }

      return c.json({ date: today, questions, quizId: quizKey });
    } catch (e) {
      if (e instanceof HTTPException) throw e;
      deps.logger.error('ca.quiz_error', { error: e instanceof Error ? e.message : String(e), stack: e instanceof Error ? e.stack : '' });
      throw new HTTPException(503, { message: 'Quiz generation failed. AI service may be busy. Try again in a minute.' });
    }
  });

  // POST /v1/current-affairs/quiz/submit — submit answers, update leaderboard
  app.post('/quiz/submit', async (c) => {
    const principal = requireAuth(c);
    const body = await c.req.json().catch(() => null) as { answers: number[]; timeTaken: number; lang?: string; quizId?: string } | null;
    if (!body?.answers || body.timeTaken == null) throw new HTTPException(400, { message: 'answers and timeTaken required' });

    const today = new Date().toISOString().split('T')[0]!;
    // PR-44: Also check yesterday in case user started quiz before midnight
    const yesterday = new Date(Date.now() - 86400000).toISOString().split('T')[0]!;
    const lang = body.lang || 'en';

    // Prefer the EXACT quiz version the user saw (quizId returned by GET /quiz).
    // This keeps scoring correct even if newer content regenerated the quiz
    // while the user was still answering.
    let questions = body.quizId ? await deps.currentAffairs.getDailyQuiz(body.quizId) : null;
    // Backward-compat fallbacks for older clients / pre-fingerprint quizzes.
    if (!questions) {
      const quizKey = lang === 'hi' ? `${today}-hi` : today;
      questions = await deps.currentAffairs.getDailyQuiz(quizKey);
    }
    if (!questions) {
      // Fallback: try the other language variant
      questions = await deps.currentAffairs.getDailyQuiz(lang === 'hi' ? today : `${today}-hi`);
    }
    if (!questions) {
      // PR-44: try yesterday's quiz (midnight rollover edge case)
      const yesterdayKey = lang === 'hi' ? `${yesterday}-hi` : yesterday;
      questions = await deps.currentAffairs.getDailyQuiz(yesterdayKey);
    }
    if (!questions) throw new HTTPException(404, { message: 'No quiz available. The daily quiz may not have been generated yet — try again after news ingestion runs.' });

    // Score the answers
    let correct = 0;
    const answerKeys = ['A', 'B', 'C', 'D'];
    for (let i = 0; i < questions.length; i++) {
      const q = questions[i];
      const userAnswer = answerKeys[body.answers[i] ?? -1];
      if (q && userAnswer === q.correctOption) correct++;
    }

    const score = Math.round((correct / questions.length) * 100);
    const result = await deps.currentAffairs.submitQuizResult({
      userId: principal.userId,
      date: today,
      score,
      total: questions.length,
      timeTaken: body.timeTaken,
      completedAt: new Date().toISOString(),
    });

    deps.logger.info('ca.quiz_submitted', { userId: principal.userId, score, rank: result.rank });
    return c.json({ score, correct, total: questions.length, timeTaken: body.timeTaken, rank: result.rank });
  });

  // GET /v1/current-affairs/leaderboard — today's leaderboard
  app.get('/leaderboard', async (c) => {
    requireAuth(c);
    const today = new Date().toISOString().split('T')[0]!;
    const leaderboard = await deps.currentAffairs.getLeaderboard(today);
    const winner = await deps.currentAffairs.getYesterdayWinner();
    return c.json({ date: today, leaderboard, yesterdayWinner: winner });
  });

  // GET /v1/current-affairs/bookmarks — user's bookmarked items
  app.get('/bookmarks', async (c) => {
    const principal = requireAuth(c);
    const bookmarks = await deps.currentAffairs.getUserBookmarks(principal.userId);
    return c.json({ bookmarks });
  });

  // GET /v1/current-affairs/states — live state editions for the selector.
  // Returns ONLY the states the admin has marked live (currentAffairsConfig/
  // states). The client always prepends a "National" option itself, so an
  // empty list here simply means "national only" — the pre-existing
  // behaviour. Defined BEFORE the '/:id' route so 'states' isn't captured
  // as an article id.
  app.get('/states', async (c) => {
    requireAuth(c);
    let liveSlugs: string[] = [];
    try { liveSlugs = await deps.currentAffairs.getLiveStates(); }
    catch (e) { deps.logger.warn('ca.live_states_error', { error: String(e) }); }
    const live = new Set(liveSlugs);
    // Preserve INDIAN_STATES order; map to public shape.
    const states = INDIAN_STATES
      .filter((s) => live.has(s.slug))
      .map((s) => ({ slug: s.slug, name: s.name, nameHi: s.nameHi, isUT: s.isUT }));
    return c.json({ states });
  });

  // GET /v1/current-affairs/:id — single item detail
  app.get('/:id', async (c) => {
    try {
      requireAuth(c);
      const id = c.req.param('id');
      const today = new Date().toISOString().split('T')[0]!;
      const item = await deps.currentAffairs.getItemById(today, id);
      if (!item) throw new HTTPException(404, { message: 'Article not found' });

      const language = (c.req.query('lang') as 'en' | 'hi') || 'en';

      // If Hindi, swap fields
      if (language === 'hi') {
        if (item.headlineHi) (item as any).headline = item.headlineHi;
        if (item.summaryHi) { (item as any).summary = item.summaryHi; (item as any).body = item.summaryHi; }
        if (Array.isArray(item.bulletsHi) && item.bulletsHi.length > 0) (item as any).bullets = item.bulletsHi;
      }

      return c.json({ item });
    } catch (e) {
      if (e instanceof HTTPException) throw e;
      deps.logger.error('ca.detail_error', { error: String(e) });
      throw new HTTPException(500, { message: 'Failed to load article' });
    }
  });

  // POST /v1/current-affairs/:id/like — toggle like
  app.post('/:id/like', async (c) => {
    const principal = requireAuth(c);
    const id = c.req.param('id');
    const result = await deps.currentAffairs.toggleLike(id, principal.userId);
    return c.json(result);
  });

  // POST /v1/current-affairs/:id/bookmark — toggle bookmark
  app.post('/:id/bookmark', async (c) => {
    const principal = requireAuth(c);
    const id = c.req.param('id');
    const result = await deps.currentAffairs.toggleBookmark(id, principal.userId);
    return c.json(result);
  });

  // POST /v1/current-affairs/ingest — cron trigger (protected by CRON_SECRET or admin)
  app.post('/ingest', async (c) => {
    // Allow either auth'd admin or cron secret header
    const cronSecret = c.req.header('x-cron-secret');
    if (cronSecret !== deps.env.CRON_SECRET) {
      const principal = requireAuth(c);
      // Check if admin
      const user = await deps.users.get(principal.userId);
      if (user?.role !== 'admin') throw new HTTPException(403, { message: 'admin only' });
    }

    const result = await ingestCurrentAffairs(deps.currentAffairs, deps.env, deps.logger, deps.aiEngine);
    return c.json({ success: true, ...result });
  });

  return app;
}
