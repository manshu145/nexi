import { Hono } from 'hono';
import { HTTPException } from 'hono/http-exception';
import { z } from 'zod';
import { requireAuth } from '../auth.js';
import type { Logger } from '../logger.js';
import type { UserStore } from '../lib/userStore.js';
import type { AIEngine, GeneratedMCQ, StageResults } from '../lib/aiEngine.js';
import type { CreditLedger } from '../lib/creditLedger.js';

export interface AssessmentRoutesDeps {
  users: UserStore;
  aiEngine: AIEngine;
  logger: Logger;
  env?: import('../env.js').Env;
  // The credit ledger is not consumed inside this file today, but completing
  // an assessment is the natural place to award future engagement bonuses
  // (e.g. "first assessment finished"). Accepting the dep at the boundary
  // means PR-04 onwards can wire those grants without changing call sites.
  ledger?: CreditLedger;
}

const questionsSchema = z.object({ examSlug: z.string().min(1), language: z.enum(['en', 'hi']).default('en') });

const stageResultsSchema = z.object({
  questions: z.array(z.object({ id: z.string(), question: z.string(), options: z.array(z.object({ key: z.enum(['A', 'B', 'C', 'D']), text: z.string() })), correctOption: z.enum(['A', 'B', 'C', 'D']), explanation: z.string(), difficulty: z.enum(['easy', 'medium', 'hard']), subject: z.string().optional(), topic: z.string().optional() })),
  answers: z.array(z.object({ questionId: z.string(), chosen: z.string().nullable() })),
});

const stage2Schema = z.object({
  examSlug: z.string().min(1),
  language: z.enum(['en', 'hi']).default('en'),
  stage1Results: stageResultsSchema,
});

const stage3Schema = z.object({
  examSlug: z.string().min(1),
  language: z.enum(['en', 'hi']).default('en'),
  stage1Results: stageResultsSchema,
  stage2Results: stageResultsSchema,
});

const submitSchema = z.object({
  questions: z.array(z.object({ id: z.string(), question: z.string(), options: z.array(z.object({ key: z.enum(['A', 'B', 'C', 'D']), text: z.string() })), correctOption: z.enum(['A', 'B', 'C', 'D']), explanation: z.string(), difficulty: z.enum(['easy', 'medium', 'hard']), subject: z.string().optional(), topic: z.string().optional() })).optional(),
  answers: z.array(z.object({ questionId: z.string(), chosen: z.string().nullable() })).optional(),
  // Multi-stage submission
  multiStage: z.boolean().optional(),
  stage1: stageResultsSchema.optional(),
  stage2: stageResultsSchema.optional(),
  stage3: stageResultsSchema.optional(),
});

export function makeAssessmentRoutes(deps: AssessmentRoutesDeps): Hono {
  const app = new Hono();

  // POST /v1/assessment/questions — Stage 1: Core subjects (10 questions)
  app.post('/questions', async (c) => {
    requireAuth(c);
    const body = await c.req.json().catch(() => null);
    const parsed = questionsSchema.safeParse(body);
    if (!parsed.success) throw new HTTPException(400, { message: parsed.error.issues[0]?.message ?? 'invalid body' });
    try {
      const questions = await deps.aiEngine.generateStage1Questions(parsed.data.examSlug, parsed.data.language);
      deps.logger.info('assessment.stage1_generated', { examSlug: parsed.data.examSlug, count: questions.length });
      return c.json({ questions, stage: 1, totalStages: 3 });
    } catch (err) {
      // Log the FULL error chain for admin /admin/logs visibility (the
      // engine throws with each provider's failure mode joined by ' | ').
      // The user-facing message stays friendly + actionable.
      deps.logger.error('assessment.stage1_error', {
        examSlug: parsed.data.examSlug,
        language: parsed.data.language,
        error: err instanceof Error ? err.message : String(err),
      });
      throw new HTTPException(503, {
        message: 'Could not generate your assessment right now. Please tap Retry — if it still fails after a minute, switch your language preference and try again.',
      });
    }
  });

  // POST /v1/assessment/stage2 — Difficulty calibration (8 questions)
  app.post('/stage2', async (c) => {
    requireAuth(c);
    const body = await c.req.json().catch(() => null);
    const parsed = stage2Schema.safeParse(body);
    if (!parsed.success) throw new HTTPException(400, { message: parsed.error.issues[0]?.message ?? 'invalid body' });
    try {
      const questions = await deps.aiEngine.generateStage2Questions(
        parsed.data.examSlug,
        parsed.data.language,
        parsed.data.stage1Results as StageResults,
      );
      deps.logger.info('assessment.stage2_generated', { examSlug: parsed.data.examSlug, count: questions.length });
      return c.json({ questions, stage: 2, totalStages: 3 });
    } catch (err) {
      deps.logger.error('assessment.stage2_error', {
        examSlug: parsed.data.examSlug,
        language: parsed.data.language,
        error: err instanceof Error ? err.message : String(err),
      });
      throw new HTTPException(503, {
        message: 'Stage 2 generation failed. Tap Retry; if it persists, your previous answers are saved and you can resume from where you left off.',
      });
    }
  });

  // POST /v1/assessment/stage3 — Weak area deep dive (5 questions)
  app.post('/stage3', async (c) => {
    requireAuth(c);
    const body = await c.req.json().catch(() => null);
    const parsed = stage3Schema.safeParse(body);
    if (!parsed.success) throw new HTTPException(400, { message: parsed.error.issues[0]?.message ?? 'invalid body' });
    try {
      const questions = await deps.aiEngine.generateStage3Questions(
        parsed.data.examSlug,
        parsed.data.language,
        parsed.data.stage1Results as StageResults,
        parsed.data.stage2Results as StageResults,
      );
      deps.logger.info('assessment.stage3_generated', { examSlug: parsed.data.examSlug, count: questions.length });
      return c.json({ questions, stage: 3, totalStages: 3 });
    } catch (err) {
      deps.logger.error('assessment.stage3_error', {
        examSlug: parsed.data.examSlug,
        language: parsed.data.language,
        error: err instanceof Error ? err.message : String(err),
      });
      throw new HTTPException(503, {
        message: 'Stage 3 generation failed. Tap Retry; your previous answers are saved.',
      });
    }
  });

  // POST /v1/assessment/submit — Final scoring (supports both legacy single-stage and multi-stage)
  app.post('/submit', async (c) => {
    const principal = requireAuth(c);
    const body = await c.req.json().catch(() => null);
    const parsed = submitSchema.safeParse(body);
    if (!parsed.success) throw new HTTPException(400, { message: parsed.error.issues[0]?.message ?? 'invalid body' });

    // Multi-stage assessment submission
    if (parsed.data.multiStage && parsed.data.stage1 && parsed.data.stage2 && parsed.data.stage3) {
      const result = await deps.aiEngine.scoreMultiStageAssessment(
        parsed.data.stage1 as StageResults,
        parsed.data.stage2 as StageResults,
        parsed.data.stage3 as StageResults,
      );

      // Save to user profile
      const updateData: Record<string, unknown> = {
        onboardingScore: result.score,
        onboardingLevel: result.level,
      };
      // Save weak/strong areas if available
      if (result.weakAreas) (updateData as any).weakAreas = result.weakAreas;
      if (result.strongAreas) (updateData as any).strongAreas = result.strongAreas;

      await deps.users.update(principal.userId, updateData as any);

      // Trigger welcome email
      try {
        const { createEmailService } = await import('../lib/emailService.js');
        if (deps.env) {
          const emailService = createEmailService(deps.env, deps.logger);
          const updatedUser = await deps.users.get(principal.userId);
          if (updatedUser?.email) {
            await emailService.sendWelcome(updatedUser.email, updatedUser.name ?? 'Student', result.level, updatedUser.credits ?? 100, updatedUser.language ?? 'en');
          }
        }
      } catch { /* email is non-critical */ }

      deps.logger.info('assessment.multi_stage_submitted', {
        userId: principal.userId,
        score: result.score,
        total: result.total,
        level: result.level,
        weakAreas: result.weakAreas,
        strongAreas: result.strongAreas,
      });
      return c.json(result);
    }

    // Legacy single-stage fallback
    if (!parsed.data.questions || !parsed.data.answers) {
      throw new HTTPException(400, { message: 'Either multiStage data or questions+answers required' });
    }
    const result = await deps.aiEngine.scoreAssessment(
      parsed.data.questions as GeneratedMCQ[],
      parsed.data.answers,
    );
    await deps.users.update(principal.userId, { onboardingScore: result.score, onboardingLevel: result.level });
    deps.logger.info('assessment.submitted', { userId: principal.userId, score: result.score, level: result.level });
    return c.json(result);
  });

  return app;
}
