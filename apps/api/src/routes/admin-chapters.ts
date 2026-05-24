import { Hono } from 'hono';
import { HTTPException } from 'hono/http-exception';
import { z } from 'zod';
import {
  asISODateTime,
  isExamSlug,
  type Chapter,
  type ChapterDraft,
  type ChapterDraftStatus,
  type ChapterId,
  type ExamSlug,
  type ISODateTime,
} from '@nexigrate/shared';
import { requireAnyAdmin, requireAuth } from '../auth.js';
import type { Env } from '../env.js';
import type { AdminUserStore } from '../lib/adminUserStore.js';
import type { ChapterDraftStore, ChapterStore } from '../lib/chapterDraftStore.js';
import {
  makeChapterRead,
  type ChapterReadStore,
} from '../lib/chapterReadStore.js';
import { generateChapter } from '../lib/chapterGen/generate.js';
import { GeminiClient } from '../lib/llm/gemini.js';
import { GroqClient } from '../lib/llm/groq.js';
import { OpenAIClient } from '../lib/llm/openai.js';
import type { Logger } from '../logger.js';

/**
 * Admin-only routes for the AI-driven chapter pipeline.
 *
 *   POST   /v1/admin/chapters/generate                 kick off a 3-AI draft
 *   GET    /v1/admin/chapter-drafts                    list drafts (filter by status, exam, subject)
 *   GET    /v1/admin/chapter-drafts/:id                single draft
 *   PATCH  /v1/admin/chapter-drafts/:id                light edits to title/summary/sections
 *   POST   /v1/admin/chapter-drafts/:id/approve        publish to chapters collection
 *   POST   /v1/admin/chapter-drafts/:id/reject         drop with a reason
 *   POST   /v1/admin/chapter-drafts/:id/regenerate     fresh draft, same slot
 *
 * Same RBAC as MCQ drafts: requires content_admin role or higher.
 */
export interface AdminChapterRoutesDeps {
  env: Env;
  drafts: ChapterDraftStore;
  chapters: ChapterStore;
  admins: AdminUserStore;
  logger: Logger;
}

const generateSchema = z.object({
  exam: z.string().refine(isExamSlug, { message: 'unknown exam slug' }),
  subject: z.string().min(1).max(64),
  /** Stable kebab-case slug, e.g. 'units-and-measurements'. */
  slug: z
    .string()
    .min(1)
    .max(96)
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'slug must be kebab-case lowercase'),
  /** Human-readable chapter title for the AI prompt. */
  chapterTitle: z.string().min(2).max(128),
  classLevel: z.string().min(1).max(32),
  sourceHint: z.string().max(256).optional(),
  targetReadMinutes: z.number().int().min(3).max(60).optional(),
});

const editSchema = z.object({
  title: z.string().min(2).max(160).optional(),
  summary: z.string().min(5).max(500).optional(),
  source: z.string().max(256).optional(),
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

const examNameByMappingSlug: Record<string, string> = {
  'jee-main': 'JEE Main',
  'jee-advanced': 'JEE Advanced',
  'neet-ug': 'NEET UG',
  'class-11-cbse': 'Class 11 CBSE',
  'class-12-cbse': 'Class 12 CBSE',
  upsc: 'UPSC Civil Services',
  ssc: 'SSC',
};

export function makeAdminChapterRoutes(deps: AdminChapterRoutesDeps): Hono {
  const app = new Hono();
  const { env, drafts, chapters, admins, logger } = deps;

  // ========================================================================
  // POST /v1/admin/chapters/generate
  // 3-AI generation: OpenAI generator + Gemini & Groq verifiers.
  // ========================================================================
  app.post('/chapters/generate', async (c) => {
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

    try {
      const { draft, verifierDisagreement } = await generateChapter({
        exam,
        subject: parsed.data.subject,
        slug: parsed.data.slug,
        classLevel: parsed.data.classLevel,
        context: {
          examName,
          subject: parsed.data.subject,
          chapterTitle: parsed.data.chapterTitle,
          classLevel: parsed.data.classLevel,
          ...(parsed.data.sourceHint ? { sourceHint: parsed.data.sourceHint } : {}),
          ...(parsed.data.targetReadMinutes
            ? { targetReadMinutes: parsed.data.targetReadMinutes }
            : {}),
        },
        generator,
        verifiers,
      });
      await drafts.put(draft);
      logger.info('chaptergen.draft.created', {
        draftId: draft.id,
        exam: draft.exam,
        subject: draft.subject,
        slug: draft.slug,
        verificationScore: draft.verificationScore,
        verifierDisagreement,
      });
      return c.json({ draft, verifierDisagreement });
    } catch (e) {
      const message = e instanceof Error ? e.message : 'unknown error';
      logger.warn('chaptergen.draft.failed', {
        slug: parsed.data.slug,
        error: message,
      });
      throw new HTTPException(502, { message });
    }
  });

  // ========================================================================
  // POST /v1/admin/chapter-drafts/:id/regenerate
  // Re-runs generation with the SAME slot params from a previous draft.
  // Useful when a first attempt was bad and you don't want to retype the
  // form. Returns a NEW draft (different id).
  // ========================================================================
  app.post('/chapter-drafts/:id/regenerate', async (c) => {
    await requireAnyAdmin(c, env, admins, 'content_admin');
    const id = c.req.param('id') as ChapterId;
    const previous = await drafts.get(id);
    if (!previous) throw new HTTPException(404, { message: 'draft not found' });

    if (!env.OPENAI_API_KEY || !env.GEMINI_API_KEY || !env.GROQ_API_KEY) {
      throw new HTTPException(503, {
        message:
          'LLM credentials missing. Set OPENAI_API_KEY, GEMINI_API_KEY, and GROQ_API_KEY.',
      });
    }

    const examName = examNameByMappingSlug[previous.exam] ?? previous.exam;
    const generator = new OpenAIClient(env.OPENAI_API_KEY);
    const verifiers: [GeminiClient, GroqClient] = [
      new GeminiClient(env.GEMINI_API_KEY),
      new GroqClient(env.GROQ_API_KEY),
    ];

    try {
      const { draft } = await generateChapter({
        exam: previous.exam,
        subject: previous.subject,
        slug: previous.slug,
        classLevel: previous.classLevel,
        context: {
          examName,
          subject: previous.subject,
          chapterTitle: previous.title,
          classLevel: previous.classLevel,
          sourceHint: previous.source,
        },
        generator,
        verifiers,
      });
      await drafts.put(draft);
      logger.info('chaptergen.draft.regenerated', {
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

  // ========================================================================
  // GET /v1/admin/chapter-drafts
  // ========================================================================
  app.get('/chapter-drafts', async (c) => {
    await requireAnyAdmin(c, env, admins, 'content_admin');
    const status = c.req.query('status') as ChapterDraftStatus | undefined;
    const examQ = c.req.query('exam');
    const exam = examQ && isExamSlug(examQ) ? (examQ as ExamSlug) : undefined;
    const subject = c.req.query('subject') ?? undefined;
    const limit = Number(c.req.query('limit') ?? '50');
    const opts: Parameters<ChapterDraftStore['list']>[0] = { limit };
    if (status) opts.status = status;
    if (exam) opts.exam = exam;
    if (subject) opts.subject = subject;
    const list = await drafts.list(opts);
    return c.json({ drafts: list });
  });

  // ========================================================================
  // GET /v1/admin/chapter-drafts/:id
  // ========================================================================
  app.get('/chapter-drafts/:id', async (c) => {
    await requireAnyAdmin(c, env, admins, 'content_admin');
    const draft = await drafts.get(c.req.param('id') as ChapterId);
    if (!draft) throw new HTTPException(404, { message: 'draft not found' });
    return c.json({ draft });
  });

  // ========================================================================
  // PATCH /v1/admin/chapter-drafts/:id
  // Light edits to title / summary / sections / source. Pre-approval only.
  // ========================================================================
  app.patch('/chapter-drafts/:id', async (c) => {
    const { principal } = await requireAnyAdmin(c, env, admins, 'content_admin');
    const id = c.req.param('id') as ChapterId;
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
    const updated = await drafts.updateBody(id, parsed.data, principal.userId);
    if (!updated) throw new HTTPException(404, { message: 'draft not found' });
    logger.info('chaptergen.draft.edited', { draftId: id, editedBy: principal.userId });
    return c.json({ draft: updated });
  });

  // ========================================================================
  // POST /v1/admin/chapter-drafts/:id/approve
  // ========================================================================
  app.post('/chapter-drafts/:id/approve', async (c) => {
    const { principal } = await requireAnyAdmin(c, env, admins, 'content_admin');
    const id = c.req.param('id') as ChapterId;
    const draft = await drafts.get(id);
    if (!draft) throw new HTTPException(404, { message: 'draft not found' });
    if (draft.status === 'approved') {
      const ch = await chapters.get(id);
      return c.json({ draft, chapter: ch });
    }
    if (draft.status === 'rejected') {
      throw new HTTPException(400, {
        message: 'draft was already rejected; regenerate instead',
      });
    }

    const reviewed = await drafts.review(id, 'approved', principal.userId);
    if (!reviewed) throw new HTTPException(404, { message: 'draft not found' });

    const now = asISODateTime(new Date().toISOString());
    const chapter: Chapter = {
      id: draft.id,
      exam: draft.exam,
      subject: draft.subject,
      slug: draft.slug,
      classLevel: draft.classLevel,
      title: draft.title,
      summary: draft.summary,
      sections: draft.sections,
      estimatedReadMinutes: draft.estimatedReadMinutes,
      source: draft.source,
      generatedBy: draft.generatedBy,
      verifiers: draft.verifiers,
      verificationScore: draft.verificationScore,
      smeApprovedBy: principal.userId,
      smeApprovedAt: now,
      isPublished: true,
      createdAt: draft.createdAt,
      updatedAt: now,
    };
    await chapters.put(chapter);
    logger.info('chaptergen.draft.approved', {
      draftId: draft.id,
      slug: draft.slug,
      reviewedBy: principal.userId,
    });
    return c.json({ draft: reviewed, chapter });
  });

  // ========================================================================
  // POST /v1/admin/chapter-drafts/:id/reject
  // ========================================================================
  app.post('/chapter-drafts/:id/reject', async (c) => {
    const { principal } = await requireAnyAdmin(c, env, admins, 'content_admin');
    const id = c.req.param('id') as ChapterId;
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
    logger.info('chaptergen.draft.rejected', {
      draftId: id,
      reviewedBy: principal.userId,
      reason: parsed.data.rejectionReason,
    });
    return c.json({ draft: reviewed });
  });

  return app;
}

// ============================================================================
// Student-facing chapter routes (read-only + mark-as-read)
// ============================================================================

export interface StudentChapterRoutesDeps {
  chapters: ChapterStore;
  reads: ChapterReadStore;
  logger: Logger;
  now: () => ISODateTime;
}

export function makeStudentChapterRoutes(deps: StudentChapterRoutesDeps): Hono {
  const app = new Hono();
  const { chapters, reads, logger, now } = deps;

  // GET /v1/chapters?exam=...&subject=...
  app.get('/', async (c) => {
    const principal = requireAuth(c);
    const examQ = c.req.query('exam');
    const exam = examQ && isExamSlug(examQ) ? (examQ as ExamSlug) : undefined;
    const subject = c.req.query('subject') ?? undefined;
    const opts: Parameters<ChapterStore['list']>[0] = {
      publishedOnly: true,
      limit: 200,
    };
    if (exam) opts.exam = exam;
    if (subject) opts.subject = subject;
    const [list, readRows] = await Promise.all([
      chapters.list(opts),
      reads.list(principal.userId, exam),
    ]);
    const readSet = new Set<string>(readRows.map((r) => r.id));
    // Strip section bodies from the listing payload to keep responses small.
    // Students get the full body when they open a single chapter.
    const slim = list.map((c2) => ({
      id: c2.id,
      exam: c2.exam,
      subject: c2.subject,
      slug: c2.slug,
      classLevel: c2.classLevel,
      title: c2.title,
      summary: c2.summary,
      estimatedReadMinutes: c2.estimatedReadMinutes,
      source: c2.source,
      sectionCount: c2.sections.length,
      isRead: readSet.has(c2.id),
    }));
    return c.json({ chapters: slim });
  });

  // GET /v1/chapters/:exam/:subject/:slug -- student reading view.
  app.get('/:exam/:subject/:slug', async (c) => {
    const principal = requireAuth(c);
    const examP = c.req.param('exam');
    if (!isExamSlug(examP)) {
      throw new HTTPException(400, { message: 'unknown exam slug' });
    }
    const ch = await chapters.getBySlug(
      examP as ExamSlug,
      c.req.param('subject'),
      c.req.param('slug'),
    );
    if (!ch || !ch.isPublished) {
      throw new HTTPException(404, { message: 'chapter not found' });
    }
    const readDoc = await reads.get(principal.userId, ch.id);
    return c.json({ chapter: ch, isRead: !!readDoc, readAt: readDoc?.readAt ?? null });
  });

  // POST /v1/chapters/:exam/:subject/:slug/mark-read -- record completion.
  // Idempotent: re-tapping bumps readAt but doesn't double-credit.
  app.post('/:exam/:subject/:slug/mark-read', async (c) => {
    const principal = requireAuth(c);
    const examP = c.req.param('exam');
    if (!isExamSlug(examP)) {
      throw new HTTPException(400, { message: 'unknown exam slug' });
    }
    const ch = await chapters.getBySlug(
      examP as ExamSlug,
      c.req.param('subject'),
      c.req.param('slug'),
    );
    if (!ch || !ch.isPublished) {
      throw new HTTPException(404, { message: 'chapter not found' });
    }
    const readAt = now();
    const read = makeChapterRead(
      principal.userId,
      ch.id,
      ch.exam,
      ch.subject,
      ch.slug,
      readAt,
    );
    await reads.put(read);
    logger.info('chapter.mark_read', {
      userId: principal.userId,
      chapterId: ch.id,
      slug: ch.slug,
    });
    return c.json({ read });
  });

  return app;
}

