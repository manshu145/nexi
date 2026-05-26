import { Hono } from 'hono';
import { HTTPException } from 'hono/http-exception';
import { requireAuth } from '../auth.js';
import type { Logger } from '../logger.js';
import type { UserStore } from '../lib/userStore.js';
import type { AIEngine } from '../lib/aiEngine.js';
import type { CurrentAffairsStore } from '../lib/currentAffairsStore.js';
import type { Env } from '../env.js';
import { ingestCurrentAffairs } from '../lib/rssIngestion.js';

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
      requireAuth(c);
      const today = new Date().toISOString().split('T')[0]!;
      const language = (c.req.query('lang') as 'en' | 'hi') || 'en';
      let items: any[] = [];
      let winner: any = null;
      try { items = await deps.currentAffairs.getTodayItems(today); } catch (e) { deps.logger.error('ca.getTodayItems_error', { error: String(e) }); }
      try { winner = await deps.currentAffairs.getYesterdayWinner(); } catch (e) { deps.logger.error('ca.getWinner_error', { error: String(e) }); }

      items = deduplicateItems(items);

      // 4-hour refresh check: trigger background re-ingestion if stale
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

      // For Hindi users, swap to pre-translated fields (translated at ingestion time)
      if (language === 'hi' && items.length > 0) {
        items = items.map((it: any) => ({
          ...it,
          headline: it.headlineHi || it.headline,
          summary: it.summaryHi || it.summary || it.body,
          body: it.summaryHi || it.body,
        }));
      }

      return c.json({ date: today, items, yesterdayWinner: winner, isFromYesterday: items.some((it: any) => it._isFromYesterday) });
    } catch (e) {
      if (e instanceof HTTPException) throw e;
      deps.logger.error('ca.route_error', { error: e instanceof Error ? e.message : String(e), stack: e instanceof Error ? e.stack : '' });
      return c.json({ date: new Date().toISOString().split('T')[0], items: [], yesterdayWinner: null });
    }
  });

  // GET /v1/current-affairs/:id — single item detail with AI-enriched summary
  app.get('/:id', async (c) => {
    try {
      requireAuth(c);
      const id = c.req.param('id');
      const today = new Date().toISOString().split('T')[0]!;
      const language = (c.req.query('lang') as 'en' | 'hi') || 'en';
      const items = await deps.currentAffairs.getTodayItems(today);
      const item = items.find((it: any) => it.id === id);
      if (!item) throw new HTTPException(404, { message: 'News item not found' });

      // Generate AI-enriched detailed summary combining all available info
      let detailedSummary = item.body || item.summary || '';
      let keyPoints: string[] = [];
      let examRelevance: string[] = [];

      try {
        const enrichPrompt = `You are an exam preparation assistant for Indian competitive exams (UPSC, SSC, Banking, RBI Grade B).

Given this news item, provide:
1. A detailed 4-6 sentence summary explaining the significance
2. 4-5 key bullet points for exam preparation
3. Which exams this is most relevant for (from: UPSC Prelims, UPSC Mains, SSC CGL, SSC CHSL, Banking PO, RBI Grade B, State PSC)

News: "${item.headline}"
Context: "${item.body || item.summary}"
Category: ${item.category}
Source: ${(item.sources || []).join(', ')}

Respond in JSON:
{"summary":"...","keyPoints":["point1","point2",...],"examRelevance":["UPSC Prelims","SSC CGL",...]}`;

        const aiResponse = await deps.aiEngine.quickGenerate(enrichPrompt);
        if (aiResponse) {
          const jsonMatch = aiResponse.match(/\{[\s\S]*\}/);
          if (jsonMatch) {
            const parsed = JSON.parse(jsonMatch[0]) as { summary?: string; keyPoints?: string[]; examRelevance?: string[] };
            if (parsed.summary) detailedSummary = parsed.summary;
            if (parsed.keyPoints) keyPoints = parsed.keyPoints;
            if (parsed.examRelevance) examRelevance = parsed.examRelevance;
          }
        }
      } catch { /* AI enrichment failed, use raw data */ }

      // Hindi support
      const responseItem = language === 'hi' ? {
        ...item,
        headline: (item as any).headlineHi || item.headline,
        summary: (item as any).summaryHi || item.summary || item.body,
      } : item;

      return c.json({
        item: responseItem,
        detailedSummary,
        keyPoints,
        examRelevance,
      });
    } catch (e) {
      if (e instanceof HTTPException) throw e;
      deps.logger.error('ca.detail_error', { error: e instanceof Error ? e.message : String(e) });
      throw new HTTPException(500, { message: 'Failed to load news detail' });
    }
  });

  // POST /v1/current-affairs/:id/like — toggle like
  app.post('/:id/like', async (c) => {
    const principal = requireAuth(c);
    const id = c.req.param('id');
    const result = await deps.currentAffairs.toggleLike(principal.userId, id);
    return c.json(result);
  });

  // POST /v1/current-affairs/:id/bookmark — toggle bookmark
  app.post('/:id/bookmark', async (c) => {
    const principal = requireAuth(c);
    const id = c.req.param('id');
    const result = await deps.currentAffairs.toggleBookmark(principal.userId, id);
    return c.json(result);
  });

  // GET /v1/current-affairs/bookmarks — user's bookmarked items
  app.get('/bookmarks/list', async (c) => {
    const principal = requireAuth(c);
    const bookmarks = await deps.currentAffairs.getUserBookmarks(principal.userId);
    return c.json({ bookmarks });
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
    const body = await c.req.json().catch(() => null) as { answers: number[]; timeTaken: number } | null;
    if (!body?.answers || !body.timeTaken) throw new HTTPException(400, { message: 'answers and timeTaken required' });

    const today = new Date().toISOString().split('T')[0]!;
    const questions = await deps.currentAffairs.getDailyQuiz(today);
    if (!questions) throw new HTTPException(404, { message: 'No quiz available for today' });

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

  // POST /v1/current-affairs/ingest — cron trigger (protected by CRON_SECRET or admin)
  app.post('/ingest', async (c) => {
    // Allow either auth'd admin or cron secret header
    const cronSecret = c.req.header('x-cron-secret');
    if (cronSecret !== 'nexigrate-cron-2026') {
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
