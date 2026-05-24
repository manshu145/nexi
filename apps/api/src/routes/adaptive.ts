import { Hono } from 'hono';
import { HTTPException } from 'hono/http-exception';
import { z } from 'zod';
import { isExamSlug, type ExamSlug } from '@nexigrate/shared';
import { requireAuth } from '../auth.js';
import type { AIEngine, AdaptiveQuestion } from '../lib/aiEngine.js';
import type { UserStore } from '../lib/userStore.js';
import type { Logger } from '../logger.js';

export interface AdaptiveRoutesDeps {
  ai: AIEngine;
  users: UserStore;
  logger: Logger;
}

// In-memory store for ongoing assessments (per session)
const assessmentSessions = new Map<
  string,
  {
    exam: ExamSlug;
    round: number;
    allQuestions: AdaptiveQuestion[];
    allAnswers: { question: AdaptiveQuestion; chosen: string | null }[];
  }
>();

export function makeAdaptiveRoutes(deps: AdaptiveRoutesDeps): Hono {
  const app = new Hono();

  // Start adaptive test
  app.post('/start', async (c) => {
    const principal = requireAuth(c);
    const body = await c.req.json().catch(() => null);
    const schema = z.object({ exam: z.string().refine(isExamSlug) });
    const parsed = schema.safeParse(body);
    if (!parsed.success) throw new HTTPException(400, { message: 'invalid exam' });

    const exam = parsed.data.exam as ExamSlug;
    const questions = await deps.ai.generateAdaptiveQuestions(exam, 1);
    const sessionId = `adaptive:${principal.userId}:${Date.now()}`;

    assessmentSessions.set(sessionId, {
      exam,
      round: 1,
      allQuestions: questions,
      allAnswers: [],
    });

    deps.logger.info('adaptive.start', { userId: principal.userId, exam });

    return c.json({
      sessionId,
      round: 1,
      totalRounds: 3,
      questions: questions.map((q) => ({
        question: q.question,
        options: q.options,
        subject: q.subject,
        topic: q.topic,
      })),
    });
  });

  // Submit round answers and get next round or final result
  app.post('/submit-round', async (c) => {
    const _principal = requireAuth(c);
    const body = await c.req.json().catch(() => null);
    const schema = z.object({
      sessionId: z.string(),
      answers: z.array(
        z.object({ questionIndex: z.number(), chosen: z.string().nullable() }),
      ),
    });
    const parsed = schema.safeParse(body);
    if (!parsed.success) throw new HTTPException(400, { message: 'invalid body' });

    const session = assessmentSessions.get(parsed.data.sessionId);
    if (!session) throw new HTTPException(404, { message: 'session not found' });

    // Record answers for this round
    const roundStart = (session.round - 1) * 5;
    for (const a of parsed.data.answers) {
      const q = session.allQuestions[roundStart + a.questionIndex];
      if (q) session.allAnswers.push({ question: q, chosen: a.chosen });
    }

    if (session.round < 3) {
      // Generate next round based on performance so far
      const correct = session.allAnswers.filter(
        (a) => a.chosen === a.question.correctOption,
      ).length;
      const total = session.allAnswers.length;
      session.round++;

      const nextQuestions = await deps.ai.generateAdaptiveQuestions(
        session.exam,
        session.round,
        { correct, total },
      );
      session.allQuestions.push(...nextQuestions);

      return c.json({
        sessionId: parsed.data.sessionId,
        round: session.round,
        totalRounds: 3,
        questions: nextQuestions.map((q) => ({
          question: q.question,
          options: q.options,
          subject: q.subject,
          topic: q.topic,
        })),
      });
    }

    // Final round complete — assess
    const result = await deps.ai.assessStudent(session.exam, session.allAnswers);

    // Save to user profile
    try {
      await deps.users.updateProfile(_principal.userId, {
        skillLevel: result.skillLevel,
        weakSubjects: result.weakSubjects,
        strongSubjects: result.strongSubjects,
      });
    } catch (e) {
      deps.logger.warn('adaptive.save_failed', { error: String(e) });
    }

    assessmentSessions.delete(parsed.data.sessionId);
    deps.logger.info('adaptive.complete', {
      userId: _principal.userId,
      skillLevel: result.skillLevel,
      score: result.score,
    });

    return c.json({ complete: true, result });
  });

  return app;
}
