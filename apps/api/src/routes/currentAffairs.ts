import { Hono } from 'hono';
import { HTTPException } from 'hono/http-exception';
import { requireAuth } from '../auth.js';
import type { Logger } from '../logger.js';
import type { UserStore } from '../lib/userStore.js';
import type { AIEngine } from '../lib/aiEngine.js';
import type { CurrentAffairsStore } from '../lib/currentAffairsStore.js';
import type { Env } from '../env.js';
import { ingestCurrentAffairs } from '../lib/rssIngestion.js';
import { INDIAN_STATES } from '@nexigrate/shared';

/**
 * Deduplicate current affairs items by normalized headline.
 */
function deduplicateItems(items: any[]): any[] {
  if (items.length === 0) return [];
  const seen = new Map<string, any>();
  for (const item of items) {
    const normalizedKey = normalizeHeadline(item.headline || '');
    if (!normalizedKey) continue;
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

export interface CurrentAffairsRoutesDeps {
  users: UserStore;
  aiEngine: AIEngine;
  currentAffairs: CurrentAffairsStore;
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
      let items: any[] = [];
      let winner: any = null;
      try { items = await deps.currentAffairs.getTodayItems(today); } catch (e) { deps.logger.error('ca.getTodayItems_error', { error: String(e) }); }
      try { winner = await deps.currentAffairs.getYesterdayWinner(); } catch (e) { deps.logger.error('ca.getWinner_error', { error: String(e) }); }

      items = deduplicateItems(items);

      // State edition filter. The state selector on the client sends:
      //   • no param / 'all'  → show everything (back-compat default)
      //   • 'national'        → only items WITHOUT a state tag
      //   • <state-slug>      → only items tagged to that state
      // National items (no `state` field) are the historical default, so
      // an old client that never sends `state` keeps seeing the full feed.
      const stateParam = c.req.query('state');
      if (stateParam && stateParam !== 'all') {
        if (stateParam === 'national') {
          items = items.filter((it: any) => !it.state);
        } else {
          items = items.filter((it: any) => it.state === stateParam);
        }
      }

      // 30-min refresh check: trigger background re-ingestion if stale
      try {
        const lastIngested = await deps.currentAffairs.getLastIngestedAt();
        const thirtyMinMs = 30 * 60 * 1000;
        if (!lastIngested || (Date.now() - Date.parse(lastIngested)) > thirtyMinMs) {
          deps.logger.info('ca.stale_triggering_reingest', { lastIngested });
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

      return c.json({ date: today, items, yesterdayWinner: winner, isFromYesterday: items.some((it: any) => it._isFromYesterday), userLikes, userBookmarks, likeCounts });
    } catch (e) {
      if (e instanceof HTTPException) throw e;
      deps.logger.error('ca.route_error', { error: e instanceof Error ? e.message : String(e), stack: e instanceof Error ? e.stack : '' });
      return c.json({ date: new Date().toISOString().split('T')[0], items: [], yesterdayWinner: null });
    }
  });

  // GET /v1/current-affairs/quiz — daily 20 MCQs
  app.get('/quiz', async (c) => {
    try {
      requireAuth(c);
      const today = new Date().toISOString().split('T')[0]!;
      const language = (c.req.query('lang') as 'en' | 'hi') || 'en';
      const quizKey = language === 'hi' ? `${today}-hi` : today;

      // Check if quiz already generated for today + language
      let questions = await deps.currentAffairs.getDailyQuiz(quizKey);
      if (!questions) {
        // Generate quiz from today's items
        const items = await deps.currentAffairs.getTodayItems(today);
        if (items.length === 0) {
          throw new HTTPException(404, { message: 'No current affairs available for today. Try again later.' });
        }
        // Generate 20 MCQs from today's current affairs in user's language
        const headlines = items.map(item => `[${item.category}] ${item.headline}: ${item.summary}`).join('\n');
        questions = await deps.aiEngine.generateCurrentAffairsQuiz(headlines, 20, language);
        await deps.currentAffairs.saveDailyQuiz(quizKey, questions);
        deps.logger.info('ca.quiz_generated', { date: today, language, count: questions.length });
      }

      return c.json({ date: today, questions });
    } catch (e) {
      if (e instanceof HTTPException) throw e;
      deps.logger.error('ca.quiz_error', { error: e instanceof Error ? e.message : String(e), stack: e instanceof Error ? e.stack : '' });
      throw new HTTPException(503, { message: 'Quiz generation failed. AI service may be busy. Try again in a minute.' });
    }
  });

  // POST /v1/current-affairs/quiz/submit — submit answers, update leaderboard
  app.post('/quiz/submit', async (c) => {
    const principal = requireAuth(c);
    const body = await c.req.json().catch(() => null) as { answers: number[]; timeTaken: number; lang?: string } | null;
    if (!body?.answers || body.timeTaken == null) throw new HTTPException(400, { message: 'answers and timeTaken required' });

    const today = new Date().toISOString().split('T')[0]!;
    // PR-44: Also check yesterday in case user started quiz before midnight
    const yesterday = new Date(Date.now() - 86400000).toISOString().split('T')[0]!;
    // PR-41: respect language suffix — quiz might be stored as
    // '2026-05-31-hi' for Hindi users. Try language-specific key first,
    // fall back to the base date key.
    const lang = body.lang || 'en';
    const quizKey = lang === 'hi' ? `${today}-hi` : today;
    let questions = await deps.currentAffairs.getDailyQuiz(quizKey);
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
