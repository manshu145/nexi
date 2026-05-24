import { Hono } from 'hono';
import { HTTPException } from 'hono/http-exception';
import { z } from 'zod';
import {
  asCurrentAffairsDigestId,
  asISODateTime,
  CURRENT_AFFAIRS_CATEGORIES,
  isExamSlug,
  type CurrentAffairsCategory,
  type CurrentAffairsDigest,
  type CurrentAffairsDigestStatus,
  type CurrentAffairsDigestSummary,
  type CurrentAffairsItem,
  type ExamSlug,
  type ISODateTime,
} from '@nexigrate/shared';
import { requireAnyAdmin, requireAuth } from '../auth.js';
import type { Env } from '../env.js';
import type { AdminUserStore } from '../lib/adminUserStore.js';
import {
  generateCurrentAffairsDigest,
  todayIstDate,
} from '../lib/currentAffairsGen/generate.js';
import type {
  CurrentAffairsDigestStore,
  CurrentAffairsDraftStore,
} from '../lib/currentAffairsStore.js';
import { GeminiClient } from '../lib/llm/gemini.js';
import { GroqClient } from '../lib/llm/groq.js';
import { OpenAIClient } from '../lib/llm/openai.js';
import type { Logger } from '../logger.js';

/**
 * Phase 19 -- Current affairs daily digest HTTP routes.
 *
 * Admin pipeline (content_admin):
 *   POST   /v1/admin/current-affairs/generate              kick off a digest from raw notes
 *   POST   /v1/admin/current-affairs-drafts/:id/regenerate fresh draft same date
 *   GET    /v1/admin/current-affairs-drafts                list drafts
 *   GET    /v1/admin/current-affairs-drafts/:id            single draft
 *   PATCH  /v1/admin/current-affairs-drafts/:id            light pre-approval edits
 *   POST   /v1/admin/current-affairs-drafts/:id/approve    publish
 *   POST   /v1/admin/current-affairs-drafts/:id/reject     drop with a reason
 *
 * Student (auth required):
 *   GET    /v1/current-affairs/today                       latest published digest
 *   GET    /v1/current-affairs                             archive list
 *   GET    /v1/current-affairs/:date                       single digest by date
 */

const DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/;

const generateSchema = z.object({
  date: z.string().regex(DATE_REGEX, 'date must be YYYY-MM-DD'),
  rawNotes: z.string().min(40).max(20_000),
  focusHint: z.string().max(500).optional(),
});

const itemSchema = z.object({
  id: z.string().min(1).max(64),
  headline: z.string().min(5).max(200),
  body: z.string().min(20).max(2000),
  category: z.enum(CURRENT_AFFAIRS_CATEGORIES),
  sources: z.array(z.string().max(500)).max(10),
  relevantExams: z.array(z.string().refine(isExamSlug, { message: 'unknown exam slug' })).max(8),
  tags: z.array(z.string().max(40)).max(10),
});

const editSchema = z.object({
  summary: z.string().min(5).max(500).optional(),
  items: z.array(itemSchema).min(1).max(25).optional(),
});

const reviewSchema = z.object({
  rejectionReason: z.string().max(500).optional(),
});

// ============================================================================
// Admin
// ============================================================================

export interface AdminCurrentAffairsRoutesDeps {
  env: Env;
  drafts: CurrentAffairsDraftStore;
  digests: CurrentAffairsDigestStore;
  admins: AdminUserStore;
  logger: Logger;
}

export function makeAdminCurrentAffairsRoutes(
  deps: AdminCurrentAffairsRoutesDeps,
): Hono {
  const app = new Hono();
  const { env, drafts, digests, admins, logger } = deps;

  app.post('/current-affairs/generate', async (c) => {
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

    const generator = new OpenAIClient(env.OPENAI_API_KEY);
    const verifiers: [GeminiClient, GroqClient] = [
      new GeminiClient(env.GEMINI_API_KEY),
      new GroqClient(env.GROQ_API_KEY),
    ];
    try {
      const { draft, verifierDisagreement } = await generateCurrentAffairsDigest({
        date: parsed.data.date,
        context: {
          date: parsed.data.date,
          rawNotes: parsed.data.rawNotes,
          ...(parsed.data.focusHint ? { focusHint: parsed.data.focusHint } : {}),
        },
        generator,
        verifiers,
      });
      await drafts.put(draft);
      logger.info('current_affairs.draft.created', {
        draftId: draft.id,
        date: draft.date,
        items: draft.items.length,
        verificationScore: draft.verificationScore,
        verifierDisagreement,
      });
      return c.json({ draft, verifierDisagreement });
    } catch (e) {
      const message = e instanceof Error ? e.message : 'unknown error';
      logger.warn('current_affairs.draft.failed', { date: parsed.data.date, error: message });
      throw new HTTPException(502, { message });
    }
  });

  app.post('/current-affairs-drafts/:id/regenerate', async (c) => {
    await requireAnyAdmin(c, env, admins, 'content_admin');
    const id = asCurrentAffairsDigestId(c.req.param('id'));
    const previous = await drafts.get(id);
    if (!previous) throw new HTTPException(404, { message: 'draft not found' });
    if (!env.OPENAI_API_KEY || !env.GEMINI_API_KEY || !env.GROQ_API_KEY) {
      throw new HTTPException(503, { message: 'LLM credentials missing' });
    }
    const generator = new OpenAIClient(env.OPENAI_API_KEY);
    const verifiers: [GeminiClient, GroqClient] = [
      new GeminiClient(env.GEMINI_API_KEY),
      new GroqClient(env.GROQ_API_KEY),
    ];
    try {
      const { draft } = await generateCurrentAffairsDigest({
        date: previous.date,
        context: { date: previous.date, rawNotes: previous.rawNotes },
        generator,
        verifiers,
      });
      await drafts.put(draft);
      logger.info('current_affairs.draft.regenerated', { id: previous.id });
      return c.json({ draft });
    } catch (e) {
      const message = e instanceof Error ? e.message : 'unknown error';
      throw new HTTPException(502, { message });
    }
  });

  app.get('/current-affairs-drafts', async (c) => {
    await requireAnyAdmin(c, env, admins, 'content_admin');
    const status = c.req.query('status') as CurrentAffairsDigestStatus | undefined;
    const limit = Number(c.req.query('limit') ?? '50');
    const opts: Parameters<CurrentAffairsDraftStore['list']>[0] = { limit };
    if (status) opts.status = status;
    const list = await drafts.list(opts);
    return c.json({ drafts: list });
  });

  app.get('/current-affairs-drafts/:id', async (c) => {
    await requireAnyAdmin(c, env, admins, 'content_admin');
    const draft = await drafts.get(asCurrentAffairsDigestId(c.req.param('id')));
    if (!draft) throw new HTTPException(404, { message: 'draft not found' });
    return c.json({ draft });
  });

  app.patch('/current-affairs-drafts/:id', async (c) => {
    const { principal } = await requireAnyAdmin(c, env, admins, 'content_admin');
    const id = asCurrentAffairsDigestId(c.req.param('id'));
    const body = await c.req.json().catch(() => null);
    const parsed = editSchema.safeParse(body);
    if (!parsed.success) {
      throw new HTTPException(400, {
        message: parsed.error.issues[0]?.message ?? 'invalid body',
      });
    }
    const cur = await drafts.get(id);
    if (!cur) throw new HTTPException(404, { message: 'draft not found' });
    if (cur.status !== 'pending') {
      throw new HTTPException(400, { message: 'edits only allowed on pending drafts' });
    }
    // Coerce items relevantExams strings to ExamSlug brand if provided.
    const updates: Partial<{ summary: string; items: CurrentAffairsItem[] }> = {};
    if (parsed.data.summary !== undefined) updates.summary = parsed.data.summary;
    if (parsed.data.items) {
      updates.items = parsed.data.items.map((it) => ({
        id: it.id,
        headline: it.headline,
        body: it.body,
        category: it.category as CurrentAffairsCategory,
        sources: it.sources,
        relevantExams: it.relevantExams as ExamSlug[],
        tags: it.tags,
      }));
    }
    const updated = await drafts.updateBody(id, updates, principal.userId);
    if (!updated) throw new HTTPException(404, { message: 'draft not found' });
    logger.info('current_affairs.draft.edited', { id, editedBy: principal.userId });
    return c.json({ draft: updated });
  });

  app.post('/current-affairs-drafts/:id/approve', async (c) => {
    const { principal } = await requireAnyAdmin(c, env, admins, 'content_admin');
    const id = asCurrentAffairsDigestId(c.req.param('id'));
    const draft = await drafts.get(id);
    if (!draft) throw new HTTPException(404, { message: 'draft not found' });
    if (draft.status === 'approved') {
      const d = await digests.get(id);
      return c.json({ draft, digest: d });
    }
    if (draft.status === 'rejected') {
      throw new HTTPException(400, {
        message: 'draft was already rejected; regenerate instead',
      });
    }
    const reviewed = await drafts.review(id, 'approved', principal.userId);
    if (!reviewed) throw new HTTPException(404, { message: 'draft not found' });

    const now = asISODateTime(new Date().toISOString());
    const digest: CurrentAffairsDigest = {
      id: draft.id,
      date: draft.date,
      summary: draft.summary,
      items: draft.items,
      generatedBy: draft.generatedBy,
      verifiers: draft.verifiers,
      verificationScore: draft.verificationScore,
      smeApprovedBy: principal.userId,
      smeApprovedAt: now,
      isPublished: true,
      createdAt: draft.createdAt,
      updatedAt: now,
    };
    await digests.put(digest);
    logger.info('current_affairs.draft.approved', {
      id: draft.id,
      date: draft.date,
      reviewedBy: principal.userId,
    });
    return c.json({ draft: reviewed, digest });
  });

  app.post('/current-affairs-drafts/:id/reject', async (c) => {
    const { principal } = await requireAnyAdmin(c, env, admins, 'content_admin');
    const id = asCurrentAffairsDigestId(c.req.param('id'));
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
    logger.info('current_affairs.draft.rejected', { id, reason: parsed.data.rejectionReason });
    return c.json({ draft: reviewed });
  });

  // Helper convenience endpoint for the admin UI (auto-fills today's date).
  app.get('/current-affairs/today-date', async (c) => {
    await requireAnyAdmin(c, env, admins, 'content_admin');
    return c.json({ date: todayIstDate() });
  });

  return app;
}

// ============================================================================
// Student
// ============================================================================

export interface StudentCurrentAffairsRoutesDeps {
  digests: CurrentAffairsDigestStore;
  logger: Logger;
  now: () => ISODateTime;
}

export function makeStudentCurrentAffairsRoutes(
  deps: StudentCurrentAffairsRoutesDeps,
): Hono {
  const app = new Hono();
  const { digests, logger } = deps;
  void logger;

  // GET /v1/current-affairs/today -- latest published digest
  app.get('/today', async (c) => {
    requireAuth(c);
    let digest: CurrentAffairsDigest | null;
    try {
      digest = await digests.getLatest();
    } catch {
      digest = null;
    }
    if (!digest) {
      return c.json({ digest: null });
    }
    return c.json({ digest });
  });

  // GET /v1/current-affairs?limit=...
  app.get('/', async (c) => {
    requireAuth(c);
    const limit = Math.min(Number(c.req.query('limit') ?? '60'), 365);
    let list: CurrentAffairsDigest[];
    try {
      list = await digests.list({ publishedOnly: true, limit });
    } catch {
      list = [];
    }
    const slim: CurrentAffairsDigestSummary[] = list.map((d) => ({
      id: d.id,
      date: d.date,
      summary: d.summary,
      itemCount: d.items.length,
      publishedAt: d.smeApprovedAt,
    }));
    return c.json({ digests: slim });
  });

  // GET /v1/current-affairs/:date -- single digest
  app.get('/:date', async (c) => {
    requireAuth(c);
    const date = c.req.param('date');
    if (!DATE_REGEX.test(date)) {
      throw new HTTPException(400, { message: 'date must be YYYY-MM-DD' });
    }
    const d = await digests.getByDate(date);
    if (!d) throw new HTTPException(404, { message: 'digest not found' });
    return c.json({ digest: d });
  });

  return app;
}
