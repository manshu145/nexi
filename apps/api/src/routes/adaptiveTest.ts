/**
 * Phase C — Adaptive onboarding test routes.
 *
 *   POST /v1/users/me/adaptive-test/start    → generates 10 MCQs
 *   POST /v1/users/me/adaptive-test/complete → grades + generates study plan
 */
import { Hono } from 'hono';
import { HTTPException } from 'hono/http-exception';
import { requireAuth } from '../auth.js';
import type { LLMClient } from '../lib/llm/index.js';
import type { UserStore } from '../lib/userStore.js';
import type { Logger } from '../logger.js';
import {
  generateAdaptiveTest,
  generateStudyPlan,
  type AdaptiveQuestion,
} from '../lib/adaptiveTest/generate.js';

export interface AdaptiveTestDeps {
  users: UserStore;
  generator: LLMClient;
  logger: Logger;
}

export function makeAdaptiveTestRoutes(deps: AdaptiveTestDeps): Hono {
  const { users, generator, logger } = deps;
  const app = new Hono();

  // In-memory cache of generated tests (keyed by userId).
  // Cleared after completion. Simple because this is a one-time flow.
  const testCache = new Map<string, AdaptiveQuestion[]>();

  app.post('/me/adaptive-test/start', async (c) => {
    const principal = requireAuth(c);
    const uid = principal.userId;

    const user = await users.get(uid);
    if (!user) throw new HTTPException(404, { message: 'user not found' });

    const exam = (user as any).targetExam ?? 'jee-main';
    const classLevel = (user as any).classLevel ?? '';
    const language = (user as any).preferredLanguage ?? 'en';

    logger.info('adaptive-test.start', { userId: uid, exam, classLevel });

    const result = await generateAdaptiveTest(generator, exam, classLevel, language);

    if (result.questions.length === 0) {
      throw new HTTPException(500, { message: 'failed to generate test questions' });
    }

    // Cache questions for grading
    testCache.set(uid, result.questions);

    // Return questions WITHOUT correct answers
    const sanitized = result.questions.map((q) => ({
      id: q.id,
      question: q.question,
      options: q.options,
      difficulty: q.difficulty,
      subject: q.subject,
    }));

    return c.json({ questions: sanitized, totalQuestions: sanitized.length });
  });

  app.post('/me/adaptive-test/complete', async (c) => {
    const principal = requireAuth(c);
    const uid = principal.userId;

    const body = await c.req.json<{ answers: Record<string, string> }>().catch(() => null);
    if (!body || !body.answers) {
      throw new HTTPException(400, { message: 'answers required' });
    }

    const questions = testCache.get(uid);
    if (!questions || questions.length === 0) {
      throw new HTTPException(400, { message: 'no test in progress — start first' });
    }

    const user = await users.get(uid);
    const exam = (user as any)?.targetExam ?? 'jee-main';
    const classLevel = (user as any)?.classLevel ?? '';
    const language = (user as any)?.preferredLanguage ?? 'en';

    logger.info('adaptive-test.complete', { userId: uid, answersCount: Object.keys(body.answers).length });

    const { score, plan } = await generateStudyPlan(
      generator,
      exam,
      classLevel,
      language,
      questions,
      body.answers,
    );

    // Save study plan + skill level on user doc
    await users.updateProfile(uid, {
      studyPlan: plan,
      skillLevel: plan.overallLevel,
      adaptiveTestScore: score,
      adaptiveTestTotal: questions.length,
      adaptiveTestCompletedAt: new Date().toISOString(),
      onboardingVersion: 3, // Bump to 3 after adaptive test
    });

    // Clear cache
    testCache.delete(uid);

    // Return results with explanations
    const results = questions.map((q) => ({
      id: q.id,
      question: q.question,
      options: q.options,
      correctOption: q.correctOption,
      yourAnswer: body.answers[q.id] ?? null,
      isCorrect: body.answers[q.id] === q.correctOption,
      explanation: q.explanation,
      subject: q.subject,
      difficulty: q.difficulty,
    }));

    logger.info('adaptive-test.scored', { userId: uid, score, total: questions.length, level: plan.overallLevel });

    return c.json({
      score,
      totalQuestions: questions.length,
      percentage: Math.round((score / questions.length) * 100),
      level: plan.overallLevel,
      results,
      studyPlan: plan,
    });
  });

  return app;
}
