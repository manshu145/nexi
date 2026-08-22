/**
 * Auto Weak-Topic Drilling.
 *
 * Looks at the student's recent SUBMITTED mock-test attempts, works out which
 * topics/subjects they're weakest at (lowest accuracy), and generates a short,
 * focused practice set biased toward those weak areas.
 *
 * Reuse over reinvention: a "drill" is just a short mock-test attempt persisted
 * in the SAME `mockTestAttempts` store, so the existing /mock-tests/:id taking
 * + /submit scoring + result UI handle it with zero new surface. This route
 * only adds (a) the weak-area analysis and (b) a focused generation call.
 *
 *   GET  /v1/drill/weak    → analysed weak topics/subjects (for the intro screen)
 *   POST /v1/drill/start   → generate a focused drill, return its attemptId
 */
import { Hono } from 'hono';
import { HTTPException } from 'hono/http-exception';
import { asISODateTime, asUserId, isExamSlug } from '@nexigrate/shared';
import type { ExamSlug } from '@nexigrate/shared';
import { requireAuth } from '../auth.js';
import type { UserStore } from '../lib/userStore.js';
import type { AIEngine, GeneratedMCQ } from '../lib/aiEngine.js';
import type { MockTestStore, MockTestAttempt } from '../lib/mockTestStore.js';
import type { Logger } from '../logger.js';

export interface DrillRoutesDeps {
  users: UserStore;
  aiEngine: AIEngine;
  mockTests: MockTestStore;
  logger: Logger;
}

interface WeakArea { name: string; accuracy: number; correct: number; total: number; }

/** Group per-question correctness across attempts into topic + subject accuracy. */
function computeWeakAreas(attempts: MockTestAttempt[]): { topics: WeakArea[]; subjects: WeakArea[]; analyzed: number } {
  const topicAgg: Record<string, { correct: number; total: number }> = {};
  const subjAgg: Record<string, { correct: number; total: number }> = {};
  let analyzed = 0;
  for (const a of attempts) {
    if (a.status !== 'submitted' || !a.answers) continue;
    analyzed++;
    for (const q of a.questions ?? []) {
      const ans = a.answers[q.id];
      const correct = ans != null && ans === q.correctOption;
      if (q.topic) {
        const t = (topicAgg[q.topic] ??= { correct: 0, total: 0 });
        t.total++; if (correct) t.correct++;
      }
      const subjName = q.subject ?? 'general';
      const s = (subjAgg[subjName] ??= { correct: 0, total: 0 });
      s.total++; if (correct) s.correct++;
    }
  }
  const toWeak = (agg: Record<string, { correct: number; total: number }>, minTotal: number): WeakArea[] =>
    Object.entries(agg)
      .map(([name, s]) => ({ name, accuracy: s.total ? s.correct / s.total : 0, correct: s.correct, total: s.total }))
      .filter((w) => w.total >= minTotal && w.accuracy < 0.6)
      .sort((a, b) => a.accuracy - b.accuracy);
  return { topics: toWeak(topicAgg, 2), subjects: toWeak(subjAgg, 3), analyzed };
}

export function makeDrillRoutes(deps: DrillRoutesDeps): Hono {
  const app = new Hono();

  // GET /v1/drill/weak — analysed weak areas for the intro screen.
  app.get('/weak', async (c) => {
    const principal = requireAuth(c);
    const user = await deps.users.get(asUserId(principal.userId));
    const exam = user?.targetExam ?? null;
    const attempts = await deps.mockTests.listByUser(asUserId(principal.userId), 15).catch(() => []);
    const { topics, subjects, analyzed } = computeWeakAreas(attempts);
    return c.json({
      hasData: analyzed > 0,
      analyzed,
      exam,
      weakTopics: topics.slice(0, 6).map((w) => ({ name: w.name, accuracy: Math.round(w.accuracy * 100), total: w.total })),
      weakSubjects: subjects.slice(0, 6).map((w) => ({ name: w.name, accuracy: Math.round(w.accuracy * 100), total: w.total })),
    });
  });

  // POST /v1/drill/start — generate a focused drill, return its attemptId.
  app.post('/start', async (c) => {
    const principal = requireAuth(c);
    const body = (await c.req.json().catch(() => ({}))) as { count?: number };
    const user = await deps.users.get(asUserId(principal.userId));
    const examRaw = user?.targetExam;
    if (!examRaw || !isExamSlug(examRaw)) {
      throw new HTTPException(400, { message: 'Set your target exam first, then come back to drill your weak topics.' });
    }
    const exam = examRaw as ExamSlug;
    const language: 'en' | 'hi' = user?.language === 'hi' ? 'hi' : 'en';

    const attempts = await deps.mockTests.listByUser(asUserId(principal.userId), 15).catch(() => []);
    const { topics, subjects } = computeWeakAreas(attempts);
    // Prefer specific weak TOPICS; fall back to weak SUBJECTS; else a general
    // exam-pattern set (still useful for a brand-new student).
    const focus = (topics.length ? topics : subjects).slice(0, 4).map((w) => w.name);

    const count = Math.max(10, Math.min(25, Math.round(body.count ?? 15)));
    const easy = Math.round(count * 0.3);
    const hard = Math.round(count * 0.2);
    const medium = Math.max(0, count - easy - hard);

    let questions: GeneratedMCQ[];
    try {
      questions = await deps.aiEngine.generateMockTest(exam, language, {
        easy, medium, hard,
        ...(focus.length ? { weakSubjects: focus } : {}),
      });
      await deps.aiEngine.recordAICost(principal.userId, 0.03);
    } catch (err) {
      deps.logger.error('drill.generate_failed', { userId: principal.userId, error: err instanceof Error ? err.message : String(err) });
      throw new HTTPException(503, { message: 'Could not build your drill right now. Please try again.' });
    }
    if (!questions || questions.length === 0) {
      throw new HTTPException(503, { message: 'Could not build your drill right now. Please try again.' });
    }
    questions = questions.map((q, i) => ({ ...q, id: `m-q${i + 1}` }));

    const id = `mt_drill_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const now = new Date().toISOString();
    const attempt: MockTestAttempt = {
      id,
      userId: asUserId(principal.userId),
      examSlug: exam,
      language,
      questions,
      answers: Object.fromEntries(questions.map((q) => [q.id, null])),
      status: 'in_progress',
      startedAt: asISODateTime(now),
      durationMinutes: questions.length, // ~1 min/question; drills are short
      submittedAt: null,
      score: null,
      total: questions.length,
      percentage: null,
      subjectBreakdown: null,
      creditCost: 0,                 // drills are free practice
      negativeMarkPerWrong: 0,       // no negative marking — encourage practice
    };
    await deps.mockTests.create(attempt);
    deps.logger.info('drill.started', { userId: principal.userId, exam, focus, count: questions.length });
    return c.json({ attemptId: id, focus, count: questions.length });
  });

  return app;
}
