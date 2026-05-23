import { Hono } from 'hono';
import { HTTPException } from 'hono/http-exception';
import { z } from 'zod';
import {
  asISODateTime,
  asMcqId,
  isExamSlug,
  type ExamSlug,
  type MCQ,
  type McqDraft,
  type McqDraftStatus,
} from '@nexigrate/shared';
import { requireAnyAdmin } from '../auth.js';
import type { Env } from '../env.js';
import type { AdminUserStore } from '../lib/adminUserStore.js';
import type { McqDraftStore } from '../lib/mcqDraftStore.js';
import type { McqStore } from '../lib/mcqStore.js';
import { GeminiClient } from '../lib/llm/gemini.js';
import { GroqClient } from '../lib/llm/groq.js';
import { OpenAIClient } from '../lib/llm/openai.js';
import { generateOne } from '../lib/mcqGen/generate.js';
import type { Logger } from '../logger.js';

/**
 * Admin-only routes for the MCQ generation pipeline.
 *
 *   POST /v1/admin/mcq-drafts/generate    kick off N drafts for one slot
 *   GET  /v1/admin/mcq-drafts             list drafts (filterable by status)
 *   GET  /v1/admin/mcq-drafts/:id         single draft
 *   POST /v1/admin/mcq-drafts/:id/approve publish to mcqs collection
 *   POST /v1/admin/mcq-drafts/:id/reject  drop with a reason
 *
 * All gated by `requireAnyAdmin(c, env, admins, 'content_admin')` -- so
 * super_admin, admin, and content_admin can use these. support_admin is
 * locked out (read-only role).
 */
export interface AdminRoutesDeps {
  env: Env;
  drafts: McqDraftStore;
  mcqs: McqStore;
  admins: AdminUserStore;
  logger: Logger;
}

const generateSchema = z.object({
  exam: z.string().refine(isExamSlug, { message: 'unknown exam slug' }),
  subject: z.string().min(1).max(64),
  chapter: z.string().min(1).max(128),
  classLevel: z.string().min(1).max(32),
  difficulty: z.enum(['easy', 'medium', 'hard']),
  count: z.number().int().min(1).max(10).default(1),
  sourceHint: z.string().max(256).optional(),
});

const reviewSchema = z.object({
  rejectionReason: z.string().max(500).optional(),
});

const examNameByMappingSlug: Record<string, string> = {
  'jee-main': 'JEE Main',
  'jee-advanced': 'JEE Advanced',
  'neet-ug': 'NEET UG',
  'class-11-cbse': 'Class 11 CBSE',
  'class-12-cbse': 'Class 12 CBSE',
  upsc: 'UPSC Civil Services',
  ssc: 'SSC',
};

export function makeAdminRoutes(deps: AdminRoutesDeps): Hono {
  const app = new Hono();
  const { env, drafts, mcqs, admins, logger } = deps;

  app.post('/mcq-drafts/generate', async (c) => {
    await requireAnyAdmin(c, env, admins, 'content_admin');
    const body = await c.req.json().catch(() => null);
    const parsed = generateSchema.safeParse(body);
    if (!parsed.success) {
      throw new HTTPException(400, {
        message: parsed.error.issues[0]?.message ?? 'invalid body',
      });
    }
    if (!env.OPENAI_API_KEY || !env.GEMINI_API_KEY || !env.GROQ_API_KEY) {
      throw new HTTPException(503, {
        message:
          'LLM credentials missing. Set OPENAI_API_KEY, GEMINI_API_KEY, and GROQ_API_KEY.',
      });
    }

    const exam = parsed.data.exam as ExamSlug;
    const examName = examNameByMappingSlug[exam] ?? exam;

    const generator = new OpenAIClient(env.OPENAI_API_KEY);
    const verifiers: [GeminiClient, GroqClient] = [
      new GeminiClient(env.GEMINI_API_KEY),
      new GroqClient(env.GROQ_API_KEY),
    ];

    const created: McqDraft[] = [];
    const errors: { index: number; error: string }[] = [];

    for (let i = 0; i < parsed.data.count; i++) {
      try {
        const { draft, verifierDisagreement } = await generateOne({
          exam,
          subject: parsed.data.subject,
          chapter: parsed.data.chapter,
          context: {
            examName,
            subject: parsed.data.subject,
            chapter: parsed.data.chapter,
            classLevel: parsed.data.classLevel,
            difficulty: parsed.data.difficulty,
            sourceHint: parsed.data.sourceHint,
          },
          generator,
          verifiers,
        });
        await drafts.put(draft);
        logger.info('mcqgen.draft.created', {
          draftId: draft.id,
          exam: draft.exam,
          subject: draft.subject,
          verificationScore: draft.verificationScore,
          verifierDisagreement,
        });
        created.push(draft);
      } catch (e) {
        const message = e instanceof Error ? e.message : 'unknown error';
        logger.warn('mcqgen.draft.failed', { index: i, error: message });
        errors.push({ index: i, error: message });
      }
    }

    return c.json({ created, errors });
  });

  app.get('/mcq-drafts', async (c) => {
    await requireAnyAdmin(c, env, admins, 'content_admin');
    const status = c.req.query('status') as McqDraftStatus | undefined;
    const examQ = c.req.query('exam');
    const exam = examQ && isExamSlug(examQ) ? (examQ as ExamSlug) : undefined;
    const limit = Number(c.req.query('limit') ?? '50');
    const list = await drafts.list({ status, exam, limit });
    return c.json({ drafts: list });
  });

  app.get('/mcq-drafts/:id', async (c) => {
    await requireAnyAdmin(c, env, admins, 'content_admin');
    const draft = await drafts.get(asMcqId(c.req.param('id')));
    if (!draft) throw new HTTPException(404, { message: 'draft not found' });
    return c.json({ draft });
  });

  app.post('/mcq-drafts/:id/approve', async (c) => {
    const { principal } = await requireAnyAdmin(c, env, admins, 'content_admin');
    const id = asMcqId(c.req.param('id'));
    const draft = await drafts.get(id);
    if (!draft) throw new HTTPException(404, { message: 'draft not found' });
    if (draft.status === 'approved') {
      return c.json({ draft });
    }
    if (draft.status === 'rejected') {
      throw new HTTPException(400, {
        message: 'draft was already rejected; generate a new one instead',
      });
    }

    const reviewed = await drafts.review(id, 'approved', principal.userId);
    if (!reviewed) throw new HTTPException(404, { message: 'draft not found' });

    // Publish into the live MCQ collection. The id is the same so
    // re-approval is idempotent at the mcqs layer too.
    const now = asISODateTime(new Date().toISOString());
    const mcq: MCQ = {
      id: draft.id,
      exam: draft.exam,
      subject: draft.subject,
      chapter: draft.chapter,
      question: draft.question,
      options: draft.options,
      correctOption: draft.correctOption,
      explanation: draft.explanation,
      difficulty: draft.difficulty,
      source: draft.source,
      verifiers: draft.verifiers,
      smeApprovedBy: principal.userId,
      smeApprovedAt: now,
      isPublished: true,
      createdAt: draft.createdAt,
      updatedAt: now,
    };
    await mcqs.put(mcq);

    logger.info('mcqgen.draft.approved', {
      draftId: draft.id,
      reviewedBy: principal.userId,
    });
    return c.json({ draft: reviewed, mcq });
  });

  app.post('/mcq-drafts/:id/reject', async (c) => {
    const { principal } = await requireAnyAdmin(c, env, admins, 'content_admin');
    const id = asMcqId(c.req.param('id'));
    const body = await c.req.json().catch(() => ({}));
    const parsed = reviewSchema.safeParse(body);
    if (!parsed.success) {
      throw new HTTPException(400, {
        message: parsed.error.issues[0]?.message ?? 'invalid body',
      });
    }
    const reviewed = await drafts.review(
      id,
      'rejected',
      principal.userId,
      parsed.data.rejectionReason,
    );
    if (!reviewed) throw new HTTPException(404, { message: 'draft not found' });
    logger.info('mcqgen.draft.rejected', {
      draftId: id,
      reviewedBy: principal.userId,
      reason: parsed.data.rejectionReason,
    });
    return c.json({ draft: reviewed });
  });

  return app;
}
