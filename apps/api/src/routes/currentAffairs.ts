import { Hono } from 'hono';
import { HTTPException } from 'hono/http-exception';
import { requireAuth } from '../auth.js';
import type { Logger } from '../logger.js';
import type { UserStore } from '../lib/userStore.js';
import type { AIEngine } from '../lib/aiEngine.js';
import type { CurrentAffairsStore } from '../lib/currentAffairsStore.js';
import type { Env } from '../env.js';
import { ingestCurrentAffairs } from '../lib/rssIngestion.js';

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
      let items: any[] = [];
      let winner: any = null;
      try { items = await deps.currentAffairs.getTodayItems(today); } catch (e) { deps.logger.error('ca.getTodayItems_error', { error: String(e) }); }
      try { winner = await deps.currentAffairs.getYesterdayWinner(); } catch (e) { deps.logger.error('ca.getWinner_error', { error: String(e) }); }
      return c.json({ date: today, items, yesterdayWinner: winner });
    } catch (e) {
      if (e instanceof HTTPException) throw e;
      deps.logger.error('ca.route_error', { error: e instanceof Error ? e.message : String(e), stack: e instanceof Error ? e.stack : '' });
      return c.json({ date: new Date().toISOString().split('T')[0], items: [], yesterdayWinner: null });
    }
  });

  // GET /v1/current-affairs/quiz — daily 20 MCQs
  app.get('/quiz', async (c) => {
    requireAuth(c);
    const today = new Date().toISOString().split('T')[0]!;

    // Check if quiz already generated for today
    let questions = await deps.currentAffairs.getDailyQuiz(today);
    if (!questions) {
      // Generate quiz from today's items
      const items = await deps.currentAffairs.getTodayItems(today);
      if (items.length === 0) {
        throw new HTTPException(404, { message: 'No current affairs available for today. Try again later.' });
      }
      // Generate 20 MCQs from today's current affairs
      const headlines = items.map(item => `[${item.category}] ${item.headline}: ${item.summary}`).join('\n');
      questions = await deps.aiEngine.generateCurrentAffairsQuiz(headlines, 20);
      await deps.currentAffairs.saveDailyQuiz(today, questions);
      deps.logger.info('ca.quiz_generated', { date: today, count: questions.length });
    }

    return c.json({ date: today, questions });
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

    const result = await ingestCurrentAffairs(deps.currentAffairs, deps.env, deps.logger);
    return c.json({ success: true, ...result });
  });

  return app;
}
