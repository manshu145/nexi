import { Hono } from 'hono';
import { HTTPException } from 'hono/http-exception';
import { z } from 'zod';
import { spend } from '@nexigrate/credits';
import {
  asExamSlug,
  asISODateTime,
  asLongAnswerAttemptId,
  asLongAnswerQuestionId,
  isExamSlug,
  LONG_ANSWER_LENGTH_HINTS,
  type ExamSlug,
  type ISODateTime,
  type LongAnswerAttempt,
  type LongAnswerAttemptId,
  type LongAnswerLength,
  type LongAnswerQuestion,
  type LongAnswerQuestionId,
  type UserId,
  type CreditEventId,
} from '@nexigrate/shared';
import { requireAnyAdmin, requireAuth } from '../auth.js';
import type { Env } from '../env.js';
import type { AdminUserStore } from '../lib/adminUserStore.js';
import {
  countWords,
  gradeLongAnswer,
} from '../lib/longAnswerGen/grade.js';
import {
  summarizeAttempt,
  type LongAnswerAttemptStore,
  type LongAnswerQuestionStore,
} from '../lib/longAnswerStore.js';
import { OpenAIClient } from '../lib/llm/openai.js';
import type { Logger } from '../logger.js';
import type { LedgerStore } from './credits.js';

/**
 * Phase 18 -- Long-form descriptive answers + AI grading.
 *
 * Admin pipeline:
 *   POST   /v1/admin/long-answers              create question
 *   GET    /v1/admin/long-answers              list (filter by exam/subject)
 *   GET    /v1/admin/long-answers/:id          single question (incl. unpublished)
 *   PATCH  /v1/admin/long-answers/:id          edit question
 *   POST   /v1/admin/long-answers/:id/publish  toggle isPublished=true
 *   POST   /v1/admin/long-answers/:id/unpublish toggle isPublished=false
 *   DELETE /v1/admin/long-answers/:id          delete (soft NOT supported here)
 *
 * Student pipeline (auth required):
 *   GET    /v1/long-answers                    list published questions for exam
 *   GET    /v1/long-answers/:slug              single question
 *   POST   /v1/long-answers/:id/submit         charge credits + run grader
 *   GET    /v1/users/me/long-answers           caller's submission history
 *   GET    /v1/users/me/long-answers/:id       caller's single attempt
 */

const LENGTH_VALUES = ['short', 'medium', 'long'] as const;

const createSchema = z.object({
  slug: z
    .string()
    .min(1)
    .max(96)
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'slug must be kebab-case lowercase'),
  exam: z.string().refine(isExamSlug, { message: 'unknown exam slug' }),
  subject: z.string().min(1).max(64),
  source: z.string().min(1).max(160),
  prompt: z.string().min(20).max(2000),
  expectedLength: z.enum(LENGTH_VALUES),
  rubricNotes: z.string().max(5000).optional(),
  isPublished: z.boolean().optional(),
});

const editSchema = z.object({
  exam: z.string().refine(isExamSlug, { message: 'unknown exam slug' }).optional(),
  subject: z.string().min(1).max(64).optional(),
  source: z.string().min(1).max(160).optional(),
  prompt: z.string().min(20).max(2000).optional(),
  expectedLength: z.enum(LENGTH_VALUES).optional(),
  rubricNotes: z.string().max(5000).optional(),
});

const submitSchema = z.object({
  answer: z.string().min(20).max(20_000),
  /**
   * Optional client-supplied nonce. Without it, the server will treat
   * each submission as unique. When supplied, two submissions with the
   * same nonce + same userId + same question are idempotent (useful for
   * mobile clients that retry under flaky networks).
   */
  nonce: z.string().min(1).max(64).optional(),
});

// ============================================================================
// Admin routes
// ============================================================================

export interface AdminLongAnswerRoutesDeps {
  env: Env;
  questions: LongAnswerQuestionStore;
  admins: AdminUserStore;
  logger: Logger;
  newId: () => string;
  now: () => ISODateTime;
}

export function makeAdminLongAnswerRoutes(deps: AdminLongAnswerRoutesDeps): Hono {
  const app = new Hono();
  const { env, questions, admins, logger, newId, now } = deps;

  app.post('/long-answers', async (c) => {
    const { principal } = await requireAnyAdmin(c, env, admins, 'content_admin');
    const body = await c.req.json().catch(() => null);
    const parsed = createSchema.safeParse(body);
    if (!parsed.success) {
      throw new HTTPException(400, {
        message: parsed.error.issues[0]?.message ?? 'invalid body',
      });
    }
    // Reject duplicate slug eagerly; admin can rename and retry.
    const existing = await questions.getBySlug(parsed.data.slug);
    if (existing) {
      throw new HTTPException(409, { message: `slug "${parsed.data.slug}" already exists` });
    }

    const ts = now();
    const q: LongAnswerQuestion = {
      id: asLongAnswerQuestionId(`la_q_${newId()}`),
      slug: parsed.data.slug,
      exam: asExamSlug(parsed.data.exam),
      subject: parsed.data.subject,
      source: parsed.data.source,
      prompt: parsed.data.prompt,
      expectedLength: parsed.data.expectedLength as LongAnswerLength,
      rubricNotes: parsed.data.rubricNotes ?? '',
      isPublished: parsed.data.isPublished ?? false,
      createdBy: principal.userId,
      createdAt: ts,
      updatedAt: ts,
    };
    await questions.put(q);
    logger.info('long_answer.question.created', {
      questionId: q.id,
      slug: q.slug,
      exam: q.exam,
      isPublished: q.isPublished,
    });
    return c.json({ question: q });
  });

  app.get('/long-answers', async (c) => {
    await requireAnyAdmin(c, env, admins, 'content_admin');
    const examQ = c.req.query('exam');
    const exam =
      examQ && isExamSlug(examQ) ? asExamSlug(examQ) : undefined;
    const subject = c.req.query('subject') ?? undefined;
    const limit = Number(c.req.query('limit') ?? '100');
    const opts: Parameters<LongAnswerQuestionStore['list']>[0] = {
      publishedOnly: false,
      limit,
    };
    if (exam) opts.exam = exam;
    if (subject) opts.subject = subject;
    const list = await questions.list(opts);
    return c.json({ questions: list });
  });

  app.get('/long-answers/:id', async (c) => {
    await requireAnyAdmin(c, env, admins, 'content_admin');
    const id = asLongAnswerQuestionId(c.req.param('id'));
    const q = await questions.get(id);
    if (!q) throw new HTTPException(404, { message: 'question not found' });
    return c.json({ question: q });
  });

  app.patch('/long-answers/:id', async (c) => {
    await requireAnyAdmin(c, env, admins, 'content_admin');
    const id = asLongAnswerQuestionId(c.req.param('id'));
    const body = await c.req.json().catch(() => null);
    const parsed = editSchema.safeParse(body);
    if (!parsed.success) {
      throw new HTTPException(400, {
        message: parsed.error.issues[0]?.message ?? 'invalid body',
      });
    }
    const cur = await questions.get(id);
    if (!cur) throw new HTTPException(404, { message: 'question not found' });
    const ts = now();
    const updated: LongAnswerQuestion = {
      ...cur,
      ...(parsed.data.exam ? { exam: asExamSlug(parsed.data.exam) } : {}),
      ...(parsed.data.subject !== undefined ? { subject: parsed.data.subject } : {}),
      ...(parsed.data.source !== undefined ? { source: parsed.data.source } : {}),
      ...(parsed.data.prompt !== undefined ? { prompt: parsed.data.prompt } : {}),
      ...(parsed.data.expectedLength
        ? { expectedLength: parsed.data.expectedLength as LongAnswerLength }
        : {}),
      ...(parsed.data.rubricNotes !== undefined
        ? { rubricNotes: parsed.data.rubricNotes }
        : {}),
      updatedAt: ts,
    };
    await questions.put(updated);
    logger.info('long_answer.question.edited', { questionId: id });
    return c.json({ question: updated });
  });

  app.post('/long-answers/:id/publish', async (c) => {
    await requireAnyAdmin(c, env, admins, 'content_admin');
    const id = asLongAnswerQuestionId(c.req.param('id'));
    const cur = await questions.get(id);
    if (!cur) throw new HTTPException(404, { message: 'question not found' });
    if (cur.isPublished) return c.json({ question: cur });
    const updated: LongAnswerQuestion = { ...cur, isPublished: true, updatedAt: now() };
    await questions.put(updated);
    logger.info('long_answer.question.published', { questionId: id });
    return c.json({ question: updated });
  });

  app.post('/long-answers/:id/unpublish', async (c) => {
    await requireAnyAdmin(c, env, admins, 'content_admin');
    const id = asLongAnswerQuestionId(c.req.param('id'));
    const cur = await questions.get(id);
    if (!cur) throw new HTTPException(404, { message: 'question not found' });
    if (!cur.isPublished) return c.json({ question: cur });
    const updated: LongAnswerQuestion = { ...cur, isPublished: false, updatedAt: now() };
    await questions.put(updated);
    logger.info('long_answer.question.unpublished', { questionId: id });
    return c.json({ question: updated });
  });

  app.delete('/long-answers/:id', async (c) => {
    await requireAnyAdmin(c, env, admins, 'content_admin');
    const id = asLongAnswerQuestionId(c.req.param('id'));
    const ok = await questions.delete(id);
    if (!ok) throw new HTTPException(404, { message: 'question not found' });
    logger.info('long_answer.question.deleted', { questionId: id });
    return c.json({ ok: true });
  });

  return app;
}

// ============================================================================
// Student routes
// ============================================================================

export interface StudentLongAnswerRoutesDeps {
  env: Env;
  questions: LongAnswerQuestionStore;
  attempts: LongAnswerAttemptStore;
  ledger: LedgerStore;
  logger: Logger;
  newId: () => string;
  newEventId: () => CreditEventId;
  now: () => ISODateTime;
  /** Used by submit endpoint to find caller's exam if not in body. */
  getTargetExam: (userId: UserId) => Promise<ExamSlug>;
}

export function makeStudentLongAnswerRoutes(
  deps: StudentLongAnswerRoutesDeps,
): Hono {
  const app = new Hono();
  const { env, questions, attempts, ledger, logger, newId, newEventId, now } = deps;

  // GET /v1/long-answers?exam=...&subject=...
  app.get('/', async (c) => {
    requireAuth(c);
    const examQ = c.req.query('exam');
    const exam = examQ && isExamSlug(examQ) ? asExamSlug(examQ) : undefined;
    const subject = c.req.query('subject') ?? undefined;
    const limit = Math.min(Number(c.req.query('limit') ?? '100'), 200);
    const opts: Parameters<LongAnswerQuestionStore['list']>[0] = {
      publishedOnly: true,
      limit,
    };
    if (exam) opts.exam = exam;
    if (subject) opts.subject = subject;
    let list: LongAnswerQuestion[];
    try {
      list = await questions.list(opts);
    } catch {
      // Defensive degradation: a transient store failure should not blank
      // the page. Same pattern as /chapters and /nexipedia.
      list = [];
    }
    return c.json({ questions: list });
  });

  // GET /v1/long-answers/:slug
  app.get('/:slug', async (c) => {
    requireAuth(c);
    const slug = c.req.param('slug');
    const q = await questions.getBySlug(slug);
    if (!q || !q.isPublished) {
      throw new HTTPException(404, { message: 'question not found' });
    }
    return c.json({ question: q });
  });

  // POST /v1/long-answers/:id/submit
  app.post('/:id/submit', async (c) => {
    const principal = requireAuth(c);
    const userId = principal.userId;
    const id = asLongAnswerQuestionId(c.req.param('id'));
    const body = await c.req.json().catch(() => null);
    const parsed = submitSchema.safeParse(body);
    if (!parsed.success) {
      throw new HTTPException(400, {
        message: parsed.error.issues[0]?.message ?? 'invalid body',
      });
    }

    const question = await questions.get(id);
    if (!question || !question.isPublished) {
      throw new HTTPException(404, { message: 'question not found' });
    }

    const wordCount = countWords(parsed.data.answer);
    const lenHint = LONG_ANSWER_LENGTH_HINTS[question.expectedLength];
    if (wordCount < lenHint.minWords) {
      throw new HTTPException(400, {
        message: `answer too short (${wordCount} words). aim for at least ${lenHint.minWords} words for a "${question.expectedLength}" answer`,
      });
    }
    if (wordCount > lenHint.maxWords) {
      throw new HTTPException(400, {
        message: `answer too long (${wordCount} words). max ${lenHint.maxWords} words for a "${question.expectedLength}" answer`,
      });
    }

    if (!env.OPENAI_API_KEY) {
      throw new HTTPException(503, {
        message: 'grader unavailable. set OPENAI_API_KEY.',
      });
    }

    // Charge credits BEFORE running the grader. Idempotency key allows
    // safe retries: same userId + same question + same nonce -> same row.
    const nonce =
      parsed.data.nonce?.trim() ||
      `${now()}-${globalThis.crypto.randomUUID().slice(0, 8)}`;
    const idempotencyKey = `long_answer:${userId}:${id}:${nonce}`;

    const events = await ledger.read(userId);
    const spendResult = spend(
      {
        userId,
        reason: 'long_answer_grading',
        sourceRef: id,
        idempotencyKey,
      },
      events,
      { newId: newEventId, now },
    );

    if (spendResult.kind === 'insufficient') {
      throw new HTTPException(402, {
        message: `not enough credits: have ${spendResult.balance}, need ${spendResult.required}`,
      });
    }

    let attemptId: LongAnswerAttemptId;
    let creditsSpent = 0;
    let alreadySubmitted = false;

    if (spendResult.kind === 'duplicate') {
      // Same idempotency key -> return the earlier attempt (if any) so the
      // client can show the grade even if the original response was lost.
      alreadySubmitted = true;
      const recent = await attempts.list({
        userId,
        questionId: id,
        limit: 5,
      });
      const match = recent.find(
        (a) => a.creditsSpent > 0 && a.answer.trim() === parsed.data.answer.trim(),
      );
      if (match) {
        return c.json({
          attempt: match,
          alreadySubmitted: true,
          balance: spendResult.balance,
        });
      }
      // Idempotency hit but we lost the attempt row -- fall through and
      // re-grade against the same idempotency key (no double charge).
      creditsSpent = 0;
      attemptId = asLongAnswerAttemptId(`la_a_${newId()}`);
    } else {
      // spent
      await ledger.append(spendResult.event);
      creditsSpent = -spendResult.event.amount; // event.amount is negative
      attemptId = asLongAnswerAttemptId(`la_a_${newId()}`);
    }

    const ts = now();
    const pending: LongAnswerAttempt = {
      id: attemptId,
      questionId: id,
      userId,
      answer: parsed.data.answer,
      wordCount,
      creditsSpent,
      status: 'pending',
      grade: null,
      failureReason: null,
      submittedAt: ts,
      createdAt: ts,
      updatedAt: ts,
    };
    await attempts.put(pending);

    // Run the grader synchronously. For our scale (handful of submissions
    // per minute) this is fine; if it ever becomes a bottleneck we can
    // move to a Pub/Sub queue and have the client poll the attempt.
    const grader = new OpenAIClient(env.OPENAI_API_KEY);
    try {
      const grade = await gradeLongAnswer({
        context: {
          prompt: question.prompt,
          source: question.source,
          subject: question.subject,
          expectedLength: question.expectedLength,
          rubricNotes: question.rubricNotes,
          answer: parsed.data.answer,
          wordCount,
        },
        grader,
        now,
      });
      const graded = await attempts.setGrade(attemptId, grade, 'graded', null);
      logger.info('long_answer.attempt.graded', {
        attemptId,
        questionId: id,
        userId,
        overall: grade.overall,
        wordCount,
      });
      return c.json({
        attempt: graded ?? { ...pending, status: 'graded', grade },
        alreadySubmitted,
        balance:
          spendResult.kind === 'spent'
            ? spendResult.newBalance
            : spendResult.balance,
      });
    } catch (e) {
      const message = e instanceof Error ? e.message : 'grader error';
      const failed = await attempts.setGrade(attemptId, null, 'failed', message);
      logger.warn('long_answer.attempt.grade_failed', {
        attemptId,
        questionId: id,
        userId,
        error: message,
      });
      // We do NOT refund credits on grader failure here; admin can do that
      // out-of-band. Spending behaviour is the same as for any AI call
      // that runs and produces a useful (if degraded) result.
      throw new HTTPException(502, {
        message: `grading failed: ${message}. attempt id: ${attemptId}`,
        cause: failed,
      });
    }
  });

  return app;
}

// ============================================================================
// "My attempts" routes mounted under /v1/users
// ============================================================================

export interface UserLongAnswerRoutesDeps {
  questions: LongAnswerQuestionStore;
  attempts: LongAnswerAttemptStore;
  logger: Logger;
}

export function makeUserLongAnswerRoutes(
  deps: UserLongAnswerRoutesDeps,
): Hono {
  const app = new Hono();
  const { questions, attempts, logger } = deps;
  void logger;

  // GET /v1/users/me/long-answers
  app.get('/me/long-answers', async (c) => {
    const principal = requireAuth(c);
    const limit = Math.min(Number(c.req.query('limit') ?? '50'), 200);
    let list: LongAnswerAttempt[];
    try {
      list = await attempts.list({ userId: principal.userId, limit });
    } catch {
      list = [];
    }
    // Hydrate question prompts so the list page can render without a
    // second round-trip. Bounded by `limit`, so this is cheap.
    const qIds = Array.from(new Set(list.map((a) => a.questionId)));
    const qs = await Promise.all(qIds.map((id) => questions.get(id).catch(() => null)));
    const qMap = new Map<LongAnswerQuestionId, LongAnswerQuestion | null>(
      qIds.map((id, i) => [id, qs[i] ?? null]),
    );
    const summaries = list.map((a) => summarizeAttempt(a, qMap.get(a.questionId) ?? null));
    return c.json({ attempts: summaries });
  });

  // GET /v1/users/me/long-answers/:id
  app.get('/me/long-answers/:id', async (c) => {
    const principal = requireAuth(c);
    const id = asLongAnswerAttemptId(c.req.param('id'));
    const a = await attempts.get(id);
    if (!a || a.userId !== principal.userId) {
      throw new HTTPException(404, { message: 'attempt not found' });
    }
    const q = await questions.get(a.questionId).catch(() => null);
    return c.json({ attempt: a, question: q });
  });

  return app;
}
