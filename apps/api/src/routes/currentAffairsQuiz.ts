/**
 * Phase F — Current affairs daily quiz routes.
 *
 *   GET  /v1/current-affairs-quiz/today       — get today's quiz (questions without answers)
 *   POST /v1/current-affairs-quiz/submit      — submit answers + time, get score
 *   GET  /v1/current-affairs-quiz/leaderboard — today's leaderboard
 *   GET  /v1/current-affairs-quiz/winner      — yesterday's winner (shown on /today)
 */
import { Hono } from 'hono';
import { HTTPException } from 'hono/http-exception';
import { requireAuth } from '../auth.js';
import type { CurrentAffairsQuizStore } from '../lib/currentAffairsQuizStore.js';
import type { UserStore } from '../lib/userStore.js';
import type { Logger } from '../logger.js';

export interface QuizRouteDeps {
  quizStore: CurrentAffairsQuizStore;
  users: UserStore;
  logger: Logger;
  newId: () => string;
  now: () => string;
}

function todayIstDate(): string {
  const now = new Date();
  const ist = new Date(now.getTime() + 5.5 * 60 * 60 * 1000);
  return ist.toISOString().slice(0, 10);
}

function yesterdayIstDate(): string {
  const now = new Date();
  const ist = new Date(now.getTime() + 5.5 * 60 * 60 * 1000);
  ist.setDate(ist.getDate() - 1);
  return ist.toISOString().slice(0, 10);
}

export function makeCurrentAffairsQuizRoutes(deps: QuizRouteDeps): Hono {
  const { quizStore, users, logger, newId, now } = deps;
  const app = new Hono();

  /**
   * GET /today — Returns today's quiz without correct answers.
   * If no quiz exists for today, returns null.
   */
  app.get('/today', async (c) => {
    const date = todayIstDate();
    const quiz = await quizStore.getQuizByDate(date).catch(() => null);

    if (!quiz) {
      return c.json({ quiz: null, date });
    }

    // Strip correct answers
    const sanitized = quiz.questions.map((q) => ({
      id: q.id,
      question: q.question,
      options: q.options,
      sourceHeadline: q.sourceHeadline,
      category: q.category,
    }));

    // Check if user already attempted
    const principal = requireAuth(c);
    const existing = await quizStore.getAttempt(quiz.id, principal.userId).catch(() => null);

    return c.json({
      quiz: {
        id: quiz.id,
        date: quiz.date,
        questions: sanitized,
        timeLimitSeconds: quiz.timeLimitSeconds,
        totalQuestions: quiz.questions.length,
      },
      alreadyAttempted: !!existing,
      previousScore: existing?.score ?? null,
      previousTime: existing?.timeTakenSeconds ?? null,
    });
  });

  /**
   * POST /submit — Submit quiz answers.
   * Body: { answers: Record<string, string>, timeTakenSeconds: number }
   */
  app.post('/submit', async (c) => {
    const principal = requireAuth(c);
    const body = await c.req.json<{
      answers?: Record<string, string>;
      timeTakenSeconds?: number;
    }>().catch(() => null);

    if (!body || !body.answers || typeof body.timeTakenSeconds !== 'number') {
      throw new HTTPException(400, { message: 'answers and timeTakenSeconds required' });
    }

    const date = todayIstDate();
    const quiz = await quizStore.getQuizByDate(date);
    if (!quiz) {
      throw new HTTPException(404, { message: 'no quiz available today' });
    }

    // Check if already attempted (idempotent)
    const existing = await quizStore.getAttempt(quiz.id, principal.userId);
    if (existing) {
      return c.json({
        alreadySubmitted: true,
        score: existing.score,
        totalQuestions: existing.totalQuestions,
        timeTakenSeconds: existing.timeTakenSeconds,
      });
    }

    // Grade
    let score = 0;
    for (const q of quiz.questions) {
      if (body.answers[q.id] === q.correctOption) score++;
    }

    // Get user name
    let userName = principal.userId;
    try {
      const u = await users.get(principal.userId);
      if (u?.name) userName = u.name;
    } catch { /* tolerate */ }

    // Save attempt
    const attempt = {
      id: newId(),
      quizId: quiz.id,
      quizDate: date,
      userId: principal.userId,
      userName,
      answers: body.answers,
      score,
      totalQuestions: quiz.questions.length,
      timeTakenSeconds: Math.min(body.timeTakenSeconds, quiz.timeLimitSeconds),
      completedAt: now(),
    };
    await quizStore.saveAttempt(attempt);

    logger.info('ca-quiz.submitted', {
      userId: principal.userId,
      score,
      time: body.timeTakenSeconds,
      date,
    });

    // Return results with correct answers
    const results = quiz.questions.map((q) => ({
      id: q.id,
      question: q.question,
      options: q.options,
      correctOption: q.correctOption,
      yourAnswer: body.answers[q.id] ?? null,
      isCorrect: body.answers[q.id] === q.correctOption,
      sourceHeadline: q.sourceHeadline,
    }));

    return c.json({
      score,
      totalQuestions: quiz.questions.length,
      timeTakenSeconds: attempt.timeTakenSeconds,
      percentage: Math.round((score / quiz.questions.length) * 100),
      results,
      alreadySubmitted: false,
    });
  });

  /**
   * GET /leaderboard — Today's leaderboard (top 20).
   */
  app.get('/leaderboard', async (c) => {
    const date = c.req.query('date') || todayIstDate();
    const leaderboard = await quizStore.getLeaderboard(date, 20).catch(() => []);
    return c.json({ date, leaderboard });
  });

  /**
   * GET /winner — Yesterday's winner for the "It's now your turn" panel.
   */
  app.get('/winner', async (c) => {
    const date = yesterdayIstDate();
    const winner = await quizStore.getWinner(date).catch(() => null);
    return c.json({ date, winner });
  });

  return app;
}
