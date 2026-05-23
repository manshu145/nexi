import { Hono } from 'hono';
import { HTTPException } from 'hono/http-exception';
import { z } from 'zod';
import {
  asExamSlug,
  isExamSlug,
  type ChapterId,
  type DraftStatus,
  type SubjectId,
} from '@nexigrate/shared';
import { requireAdmin } from '../auth.js';
import type { Logger } from '../logger.js';
import type { LLMTriad } from '../lib/llm/index.js';
import {
  generateMcqDraft,
  type McqDraftStore,
} from '../lib/mcqGen/index.js';

/**
 * Admin-only routes. The whole /v1/admin/* tree is gated by a
 * `requireAdmin(c)` call at the top of every handler.
 *
 * Endpoints:
 *   POST /v1/admin/mcq-drafts/generate    Kick off 3-AI generation; returns the draft.
 *   GET  /v1/admin/mcq-drafts             List drafts (default: pending only).
 *   GET  /v1/admin/mcq-drafts/:id         Fetch a single draft.
 *   POST /v1/admin/mcq-drafts/:id/approve Publish the chosen candidate as a MCQ.
 *   POST /v1/admin/mcq-drafts/:id/reject  Mark draft rejected with a reviewer note.
 *
 * The admin panel (Phase 5) consumes these endpoints; for now `gcloud run
 * services proxy` + curl works fine with a stub-mode admin token.
 */
export interface AdminRoutesDeps {
  drafts: McqDraftStore;
  triad: LLMTriad;
  logger: Logger;
}

const generateBodySchema = z.object({
  exam: z.string().refine(isExamSlug, 'unknown exam slug'),
  subject: z.string().min(1),
  chapter: z.string().min(1),
  sourceText: z.string().min(40, 'sourceText must be at least 40 chars'),
  sourceCitation: z.string().min(3),
  difficulty: z.enum(['easy', 'medium', 'hard']).default('medium'),
});

const reviewBodySchema = z.object({
  note: z.string().max(1000).optional().default(''),
});

const listQuerySchema = z.object({
  status: z.enum(['pending', 'approved', 'rejected']).optional(),
  limit: z.coerce.number().int().positive().max(200).optional(),
});

export function makeAdminRoutes(deps: AdminRoutesDeps): Hono {
  const app = new Hono();

  app.post('/mcq-drafts/generate', async (c) => {
    const principal = requireAdmin(c);
    if (!deps.triad.isLive) {
      throw new HTTPException(503, {
        message:
          'AI providers not configured. Set OPENAI_API_KEY / GEMINI_API_KEY / GROQ_API_KEY in GitHub Secrets and redeploy.',
      });
    }

    const body = await c.req.json().catch(() => null);
    const parsed = generateBodySchema.safeParse(body);
    if (!parsed.success) {
      throw new HTTPException(400, {
        message: parsed.error.issues[0]?.message ?? 'invalid body',
      });
    }

    const draft = await generateMcqDraft(
      {
        exam: asExamSlug(parsed.data.exam),
        subject: parsed.data.subject as SubjectId,
        chapter: parsed.data.chapter as ChapterId,
        sourceText: parsed.data.sourceText,
        sourceCitation: parsed.data.sourceCitation,
        requestedDifficulty: parsed.data.difficulty,
        requestedBy: principal.userId,
      },
      deps.triad,
    );
    await deps.drafts.save(draft);

    deps.logger.info('admin.mcq_draft.generated', {
      adminId: principal.userId,
      draftId: draft.id,
      exam: draft.prompt.exam,
      consensusIndex: draft.chosenCandidateIndex,
      verifierApproved: draft.verifier?.approved ?? false,
      verifierConfidence: draft.verifier?.confidence ?? null,
      candidates: draft.candidates.map((c) => ({
        modelId: c.modelId,
        ok: c.output !== null,
        durationMs: c.durationMs,
      })),
    });
    return c.json({ draft });
  });

  app.get('/mcq-drafts', async (c) => {
    requireAdmin(c);
    const parsed = listQuerySchema.safeParse({
      status: c.req.query('status'),
      limit: c.req.query('limit'),
    });
    if (!parsed.success) {
      throw new HTTPException(400, {
        message: parsed.error.issues[0]?.message ?? 'invalid query',
      });
    }
    const drafts = await deps.drafts.list({
      status: parsed.data.status as DraftStatus | undefined,
      limit: parsed.data.limit,
    });
    return c.json({ drafts });
  });

  app.get('/mcq-drafts/:id', async (c) => {
    requireAdmin(c);
    const draft = await deps.drafts.get(c.req.param('id'));
    if (!draft) throw new HTTPException(404, { message: 'draft not found' });
    return c.json({ draft });
  });

  app.post('/mcq-drafts/:id/approve', async (c) => {
    const principal = requireAdmin(c);
    const body = await c.req.json().catch(() => ({}));
    const parsed = reviewBodySchema.safeParse(body);
    if (!parsed.success) {
      throw new HTTPException(400, { message: 'invalid body' });
    }
    try {
      const mcq = await deps.drafts.approve(
        c.req.param('id'),
        principal.userId,
        parsed.data.note || null,
      );
      deps.logger.info('admin.mcq_draft.approved', {
        adminId: principal.userId,
        draftId: c.req.param('id'),
        mcqId: mcq.id,
      });
      return c.json({ mcq });
    } catch (err) {
      throw new HTTPException(409, {
        message: err instanceof Error ? err.message : 'approval failed',
      });
    }
  });

  app.post('/mcq-drafts/:id/reject', async (c) => {
    const principal = requireAdmin(c);
    const body = await c.req.json().catch(() => ({}));
    const parsed = reviewBodySchema.safeParse(body);
    if (!parsed.success || !parsed.data.note) {
      throw new HTTPException(400, { message: 'rejection requires a note' });
    }
    try {
      const draft = await deps.drafts.reject(
        c.req.param('id'),
        principal.userId,
        parsed.data.note,
      );
      deps.logger.info('admin.mcq_draft.rejected', {
        adminId: principal.userId,
        draftId: draft.id,
      });
      return c.json({ draft });
    } catch (err) {
      throw new HTTPException(409, {
        message: err instanceof Error ? err.message : 'rejection failed',
      });
    }
  });

  return app;
}
