import { Hono } from 'hono';
import { HTTPException } from 'hono/http-exception';
import { z } from 'zod';
import {
  asExamSlug,
  asISODateTime,
  asNexipediaArticleId,
  isExamSlug,
  NEXIPEDIA_CATEGORIES,
  type ExamSlug,
  type ISODateTime,
  type NexipediaArticle,
  type NexipediaArticleId,
  type NexipediaArticleStatus,
  type NexipediaCategory,
  type NexipediaArticleSummary,
} from '@nexigrate/shared';
import { requireAnyAdmin, requireAuth } from '../auth.js';
import type { Env } from '../env.js';
import type { AdminUserStore } from '../lib/adminUserStore.js';
import {
  generateNexipediaArticle,
  makeSearchTokens,
} from '../lib/nexipediaGen/generate.js';
import type {
  NexipediaArticleStore,
  NexipediaDraftStore,
} from '../lib/nexipediaArticleStore.js';
import { GeminiClient } from '../lib/llm/gemini.js';
import { GroqClient } from '../lib/llm/groq.js';
import { OpenAIClient } from '../lib/llm/openai.js';
import type { Logger } from '../logger.js';

/**
 * Nexipedia HTTP routes (Phase 14).
 *
 * Admin pipeline:
 *   POST   /v1/admin/nexipedia/generate              kick off a 3-AI draft
 *   POST   /v1/admin/nexipedia-drafts/:id/regenerate fresh draft, same slot
 *   GET    /v1/admin/nexipedia-drafts                list drafts (filter by status, category)
 *   GET    /v1/admin/nexipedia-drafts/:id            single draft
 *   PATCH  /v1/admin/nexipedia-drafts/:id            edit title/summary/sections
 *   POST   /v1/admin/nexipedia-drafts/:id/approve    publish
 *   POST   /v1/admin/nexipedia-drafts/:id/reject     drop with a reason
 *
 * Student pipeline (no auth wall here -- still requires Firebase auth via
 * the global authMiddleware, just not an admin role):
 *   GET    /v1/nexipedia                             list/search published articles
 *   GET    /v1/nexipedia/:slug                       single article (full body)
 */

export interface AdminNexipediaRoutesDeps {
  env: Env;
  drafts: NexipediaDraftStore;
  articles: NexipediaArticleStore;
  admins: AdminUserStore;
  logger: Logger;
}

const generateSchema = z.object({
  /** Stable kebab-case slug for the article. Must be unique. */
  slug: z
    .string()
    .min(1)
    .max(96)
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'slug must be kebab-case lowercase'),
  title: z.string().min(2).max(160),
  category: z.enum(NEXIPEDIA_CATEGORIES),
  outlineHint: z.string().max(500).optional(),
  sourceHint: z.string().max(256).optional(),
  targetReadMinutes: z.number().int().min(3).max(60).optional(),
});

const editSchema = z.object({
  title: z.string().min(2).max(160).optional(),
  summary: z.string().min(10).max(600).optional(),
  source: z.string().max(256).optional(),
  relatedExams: z
    .array(z.string().refine(isExamSlug, { message: 'unknown exam slug' }))
    .max(8)
    .optional(),
  sections: z
    .array(
      z.object({
        id: z.string().min(1).max(64),
        heading: z.string().min(1).max(160),
        body: z.string().min(20).max(20_000),
        order: z.number().int().min(1).max(50),
      }),
    )
    .min(2)
    .max(12)
    .optional(),
});

const reviewSchema = z.object({
  rejectionReason: z.string().max(500).optional(),
});

export function makeAdminNexipediaRoutes(deps: AdminNexipediaRoutesDeps): Hono {
  const app = new Hono();
  const { env, drafts, articles, admins, logger } = deps;

  // ---------- generate ------------------------------------------------------
  app.post('/nexipedia/generate', async (c) => {
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

    // Reject duplicate slug eagerly so authors can rename before regenerate.
    const existing = await articles.getBySlug(parsed.data.slug);
    if (existing) {
      throw new HTTPException(409, {
        message: `slug "${parsed.data.slug}" already published; pick a different slug or edit the existing article`,
      });
    }

    const generator = new OpenAIClient(env.OPENAI_API_KEY);
    const verifiers: [GeminiClient, GroqClient] = [
      new GeminiClient(env.GEMINI_API_KEY),
      new GroqClient(env.GROQ_API_KEY),
    ];

    try {
      const { draft, verifierDisagreement } = await generateNexipediaArticle({
        slug: parsed.data.slug,
        title: parsed.data.title,
        category: parsed.data.category,
        context: {
          slug: parsed.data.slug,
          title: parsed.data.title,
          category: parsed.data.category,
          ...(parsed.data.outlineHint ? { outlineHint: parsed.data.outlineHint } : {}),
          ...(parsed.data.sourceHint ? { sourceHint: parsed.data.sourceHint } : {}),
          ...(parsed.data.targetReadMinutes
            ? { targetReadMinutes: parsed.data.targetReadMinutes }
            : {}),
        },
        generator,
        verifiers,
      });
      await drafts.put(draft);
      logger.info('nexipedia.draft.created', {
        draftId: draft.id,
        slug: draft.slug,
        category: draft.category,
        verificationScore: draft.verificationScore,
        verifierDisagreement,
      });
      return c.json({ draft, verifierDisagreement });
    } catch (e) {
      const message = e instanceof Error ? e.message : 'unknown error';
      logger.warn('nexipedia.draft.failed', {
        slug: parsed.data.slug,
        error: message,
      });
      throw new HTTPException(502, { message });
    }
  });

  // ---------- regenerate ----------------------------------------------------
  app.post('/nexipedia-drafts/:id/regenerate', async (c) => {
    await requireAnyAdmin(c, env, admins, 'content_admin');
    const id = asNexipediaArticleId(c.req.param('id'));
    const previous = await drafts.get(id);
    if (!previous) throw new HTTPException(404, { message: 'draft not found' });
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
      const { draft } = await generateNexipediaArticle({
        slug: previous.slug,
        title: previous.title,
        category: previous.category,
        context: {
          slug: previous.slug,
          title: previous.title,
          category: previous.category,
          sourceHint: previous.source,
        },
        generator,
        verifiers,
      });
      await drafts.put(draft);
      logger.info('nexipedia.draft.regenerated', {
        previousId: previous.id,
        newId: draft.id,
        slug: previous.slug,
      });
      return c.json({ draft });
    } catch (e) {
      const message = e instanceof Error ? e.message : 'unknown error';
      throw new HTTPException(502, { message });
    }
  });

  // ---------- list / get / edit --------------------------------------------
  app.get('/nexipedia-drafts', async (c) => {
    await requireAnyAdmin(c, env, admins, 'content_admin');
    const status = c.req.query('status') as NexipediaArticleStatus | undefined;
    const categoryQ = c.req.query('category');
    const category =
      categoryQ && (NEXIPEDIA_CATEGORIES as readonly string[]).includes(categoryQ)
        ? (categoryQ as NexipediaCategory)
        : undefined;
    const limit = Number(c.req.query('limit') ?? '50');
    const opts: Parameters<NexipediaDraftStore['list']>[0] = { limit };
    if (status) opts.status = status;
    if (category) opts.category = category;
    const list = await drafts.list(opts);
    return c.json({ drafts: list });
  });

  app.get('/nexipedia-drafts/:id', async (c) => {
    await requireAnyAdmin(c, env, admins, 'content_admin');
    const draft = await drafts.get(asNexipediaArticleId(c.req.param('id')));
    if (!draft) throw new HTTPException(404, { message: 'draft not found' });
    return c.json({ draft });
  });

  app.patch('/nexipedia-drafts/:id', async (c) => {
    const { principal } = await requireAnyAdmin(c, env, admins, 'content_admin');
    const id = asNexipediaArticleId(c.req.param('id'));
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
    // Coerce relatedExams strings to ExamSlug brand for the store.
    const updates = parsed.data.relatedExams
      ? {
          ...parsed.data,
          relatedExams: parsed.data.relatedExams.map((e) => asExamSlug(e)),
        }
      : parsed.data;
    const updated = await drafts.updateBody(id, updates, principal.userId);
    if (!updated) throw new HTTPException(404, { message: 'draft not found' });
    logger.info('nexipedia.draft.edited', { draftId: id, editedBy: principal.userId });
    return c.json({ draft: updated });
  });

  // ---------- approve / reject ---------------------------------------------
  app.post('/nexipedia-drafts/:id/approve', async (c) => {
    const { principal } = await requireAnyAdmin(c, env, admins, 'content_admin');
    const id = asNexipediaArticleId(c.req.param('id'));
    const draft = await drafts.get(id);
    if (!draft) throw new HTTPException(404, { message: 'draft not found' });
    if (draft.status === 'approved') {
      const a = await articles.get(id);
      return c.json({ draft, article: a });
    }
    if (draft.status === 'rejected') {
      throw new HTTPException(400, {
        message: 'draft was already rejected; regenerate instead',
      });
    }

    // Eagerly reject if a different article has already claimed this slug
    // (could happen if two drafts with the same slug were generated).
    const existingBySlug = await articles.getBySlug(draft.slug);
    if (existingBySlug && existingBySlug.id !== draft.id) {
      throw new HTTPException(409, {
        message: `slug "${draft.slug}" already published as a different article`,
      });
    }

    const reviewed = await drafts.review(id, 'approved', principal.userId);
    if (!reviewed) throw new HTTPException(404, { message: 'draft not found' });

    const now = asISODateTime(new Date().toISOString());
    const article: NexipediaArticle = {
      id: draft.id,
      slug: draft.slug,
      title: draft.title,
      summary: draft.summary,
      category: draft.category,
      relatedExams: draft.relatedExams,
      sections: draft.sections,
      estimatedReadMinutes: draft.estimatedReadMinutes,
      source: draft.source,
      searchTokens: makeSearchTokens(draft.title, draft.summary, draft.category),
      generatedBy: draft.generatedBy,
      verifiers: draft.verifiers,
      verificationScore: draft.verificationScore,
      smeApprovedBy: principal.userId,
      smeApprovedAt: now,
      isPublished: true,
      createdAt: draft.createdAt,
      updatedAt: now,
    };
    await articles.put(article);
    logger.info('nexipedia.draft.approved', {
      draftId: draft.id,
      slug: draft.slug,
      reviewedBy: principal.userId,
    });
    return c.json({ draft: reviewed, article });
  });

  app.post('/nexipedia-drafts/:id/reject', async (c) => {
    const { principal } = await requireAnyAdmin(c, env, admins, 'content_admin');
    const id = asNexipediaArticleId(c.req.param('id'));
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
    logger.info('nexipedia.draft.rejected', {
      draftId: id,
      reviewedBy: principal.userId,
      reason: parsed.data.rejectionReason,
    });
    return c.json({ draft: reviewed });
  });

  return app;
}

// ============================================================================
// Student-facing routes
// ============================================================================

export interface StudentNexipediaRoutesDeps {
  articles: NexipediaArticleStore;
  logger: Logger;
  now: () => ISODateTime;
}

export function makeStudentNexipediaRoutes(deps: StudentNexipediaRoutesDeps): Hono {
  const app = new Hono();
  const { articles, logger } = deps;
  void logger;

  // GET /v1/nexipedia?q=<text>&category=<slug>
  app.get('/', async (c) => {
    requireAuth(c);
    const q = c.req.query('q') ?? undefined;
    const categoryQ = c.req.query('category');
    const category =
      categoryQ && (NEXIPEDIA_CATEGORIES as readonly string[]).includes(categoryQ)
        ? (categoryQ as NexipediaCategory)
        : undefined;
    const limitN = Math.min(Number(c.req.query('limit') ?? '60'), 200);
    const opts: Parameters<NexipediaArticleStore['list']>[0] = {
      publishedOnly: true,
      limit: limitN,
    };
    if (q) opts.query = q;
    if (category) {
      opts.category = category;
    } else {
      // Default encyclopedia listing excludes exam-guide and learning-tip:
      // those have their own dedicated student surfaces (/guides, /learn).
      // Callers that explicitly filter by either category still get them.
      opts.excludeCategories = ['exam-guide', 'learning-tip'];
    }
    let list: NexipediaArticle[];
    try {
      list = await articles.list(opts);
    } catch {
      // Same defensive degradation pattern as /chapters and /progress: a
      // transient Firestore failure (e.g. an index still building) should
      // not blank the page. Empty list + warn, render the empty state.
      list = [];
    }
    const slim: NexipediaArticleSummary[] = list.map((a) => ({
      id: a.id,
      slug: a.slug,
      title: a.title,
      summary: a.summary,
      category: a.category,
      relatedExams: a.relatedExams,
      estimatedReadMinutes: a.estimatedReadMinutes,
      source: a.source,
      sectionCount: a.sections.length,
    }));
    return c.json({ articles: slim });
  });

  // GET /v1/nexipedia/:slug
  app.get('/:slug', async (c) => {
    requireAuth(c);
    const slug = c.req.param('slug');
    const a = await articles.getBySlug(slug);
    if (!a || !a.isPublished) {
      throw new HTTPException(404, { message: 'article not found' });
    }
    return c.json({ article: a });
  });

  return app;
}

// Type guards used above; re-exported for tests.
export type { NexipediaCategory, ExamSlug, NexipediaArticleId };
