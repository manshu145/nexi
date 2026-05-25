import { Hono } from 'hono';
import { HTTPException } from 'hono/http-exception';
import { z } from 'zod';
import { requireAuth } from '../auth.js';
import type { Logger } from '../logger.js';
import type { UserStore } from '../lib/userStore.js';
import type { AIEngine } from '../lib/aiEngine.js';

export interface AssessmentRoutesDeps {
  users: UserStore;
  aiEngine: AIEngine;
  logger: Logger;
}

const questionsSchema = z.object({
  examSlug: z.string().min(1),
  language: z.enum(['en', 'hi']).default('en'),
});

const submitSchema = z.object({
  questions: z.array(
    z.object({
      id: z.string(),
      question: z.string(),
      options: z.array(
        z.object({
          key: z.enum(['A', 'B', 'C', 'D']),
          text: z.string(),
        }),
      ),
      correctOption: z.enum(['A', 'B', 'C', 'D']),
      explanation: z.string(),
      difficulty: z.enum(['easy', 'medium', 'hard']),
      subject: z.string().optional(),
      topic: z.string().optional(),
    }),
  ),
  answers: z.array(
    z.object({
      questionId: z.string(),
      chosen: z.string().nullable(),
    }),
  ),
});

export function makeAssessmentRoutes(deps: AssessmentRoutesDeps): Hono {
  const app = new Hono();

  // POST /v1/assessment/questions — generate assessment MCQs
  app.post('/questions', async (c) => {
    requireAuth(c); // must be authenticated
    const body = await c.req.json().catch(() => null);
    const parsed = questionsSchema.safeParse(body);
    if (!parsed.success) {
      throw new HTTPException(400, {
        message: parsed.error.issues[0]?.message ?? 'invalid body',
      });
    }

    const { examSlug, language } = parsed.data;
    const questions = await deps.aiEngine.generateAssessmentQuestions(examSlug, language, 15);

    deps.logger.info('assessment.questions_generated', { examSlug, language, count: questions.length });
    return c.json({ questions });
  });

  // POST /v1/assessment/submit — score assessment and save to user
  app.post('/submit', async (c) => {
    const principal = requireAuth(c);
    const body = await c.req.json().catch(() => null);
    const parsed = submitSchema.safeParse(body);
    if (!parsed.success) {
      throw new HTTPException(400, {
        message: parsed.error.issues[0]?.message ?? 'invalid body',
      });
    }

    const { questions, answers } = parsed.data;
    const result = await deps.aiEngine.scoreAssessment(questions, answers);

    // Save results to user profile
    await deps.users.update(principal.userId, {
      onboardingScore: result.score,
      onboardingLevel: result.level,
    });

    deps.logger.info('assessment.submitted', {
      userId: principal.userId,
      score: result.score,
      level: result.level,
    });

    return c.json(result);
  });

  return app;
}
