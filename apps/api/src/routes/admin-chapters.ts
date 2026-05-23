import { Hono } from 'hono';
import { HTTPException } from 'hono/http-exception';
import {
  asChapterId,
  asExamSlug,
  asISODateTime,
  asSubjectId,
  chapterUpsertSchema,
  type Chapter,
  type ChapterStatus,
  type ExamSlug,
  type SubjectId,
} from '@nexigrate/shared';
import { requireAnyAdmin } from '../auth.js';
import type { Env } from '../env.js';
import type { AdminUserStore } from '../lib/adminUserStore.js';
import {
  buildChapterDocId,
  estimateReadingTimeMinutes,
  type ChapterStore,
} from '../lib/chapterStore.js';
import type { Logger } from '../logger.js';

/**
 * Admin authoring routes for `chapters/*` (Phase 9).
 *
 * Workflow:
 *   1. Admin POSTs the full chapter body once -- we persist as 'draft'.
 *   2. Admin PATCHes the same id repeatedly while writing.
 *   3. Admin POSTs /publish -> status flips to 'published', record gets
 *      `publishedBy` + `publishedAt`. Students can now see it.
 *   4. To take down without losing audit trail, /archive moves to
 *      'archived'. Republishing re-runs /publish.
 *
 * Gating: `content_admin` is the minimum role -- super_admin / admin /
 * content_admin can author. support_admin is locked out.
 */

export interface AdminChaptersRoutesDeps {
  env: Env;
  chapters: ChapterStore;
  admins: AdminUserStore;
  logger: Logger;
}

export function makeAdminChaptersRoutes(deps: AdminChaptersRoutesDeps): Hono {
  const app = new Hono();
  const { env, chapters, admins, logger } = deps;

  app.get('/', async (c) => {
    await requireAnyAdmin(c, env, admins, 'content_admin');
    const examQ = c.req.query('exam');
    const subjectQ = c.req.query('subject');
    const statusQ = c.req.query('status') as ChapterStatus | undefined;
    const limit = Math.min(Number(c.req.query('limit') ?? '50') || 50, 200);
    const list = await chapters.list({
      ...(examQ ? { exam: asExamSlug(examQ) } : {}),
      ...(subjectQ ? { subject: asSubjectId(subjectQ) } : {}),
      ...(statusQ ? { status: statusQ } : {}),
      limit,
    });
    return c.json({ chapters: list });
  });

  app.get('/:id', async (c) => {
    await requireAnyAdmin(c, env, admins, 'content_admin');
    const ch = await chapters.get(c.req.param('id'));
    if (!ch) throw new HTTPException(404, { message: 'chapter not found' });
    return c.json({ chapter: ch });
  });

  app.post('/', async (c) => {
    const { principal } = await requireAnyAdmin(c, env, admins, 'content_admin');
    const body = await c.req.json().catch(() => null);
    const parsed = chapterUpsertSchema.safeParse(body);
    if (!parsed.success) {
      throw new HTTPException(400, {
        message: parsed.error.issues[0]?.message ?? 'invalid body',
      });
    }
    const data = parsed.data;
    const exam = asExamSlug(data.exam);
    const subject = asSubjectId(data.subject);
    const chapterSlug = asChapterId(data.chapterSlug);
    const id = buildChapterDocId(exam, subject, chapterSlug);

    const existing = await chapters.get(id);
    if (existing) {
      throw new HTTPException(409, {
        message: `chapter already exists: ${id} (use PATCH to update)`,
      });
    }

    const now = asISODateTime(new Date().toISOString());
    const chapter: Chapter = {
      id,
      exam,
      subject,
      chapterSlug,
      title: data.title,
      summary: data.summary,
      classLevel: data.classLevel,
      sections: data.sections,
      readingTimeMinutes: estimateReadingTimeMinutes(data.sections),
      source: data.source,
      status: 'draft',
      order: data.order,
      createdBy: principal.userId,
      publishedBy: null,
      publishedAt: null,
      archivedAt: null,
      createdAt: now,
      updatedAt: now,
    };
    await chapters.put(chapter);
    logger.info('chapters.created', {
      chapterId: id,
      createdBy: principal.userId,
      exam,
      subject,
      sections: data.sections.length,
    });
    return c.json({ chapter }, 201);
  });

  app.patch('/:id', async (c) => {
    const { principal } = await requireAnyAdmin(c, env, admins, 'content_admin');
    const id = c.req.param('id');
    const body = await c.req.json().catch(() => null);
    const parsed = chapterUpsertSchema.safeParse(body);
    if (!parsed.success) {
      throw new HTTPException(400, {
        message: parsed.error.issues[0]?.message ?? 'invalid body',
      });
    }
    const existing = await chapters.get(id);
    if (!existing) throw new HTTPException(404, { message: 'chapter not found' });

    const data = parsed.data;
    const exam = asExamSlug(data.exam);
    const subject = asSubjectId(data.subject);
    const chapterSlug = asChapterId(data.chapterSlug);
    const expectedId = buildChapterDocId(exam, subject, chapterSlug);
    if (expectedId !== id) {
      throw new HTTPException(400, {
        message: `cannot move a chapter across (exam, subject, slug). Expected ${id}, got ${expectedId}.`,
      });
    }

    const now = asISODateTime(new Date().toISOString());
    const updated: Chapter = {
      ...existing,
      title: data.title,
      summary: data.summary,
      classLevel: data.classLevel,
      sections: data.sections,
      readingTimeMinutes: estimateReadingTimeMinutes(data.sections),
      source: data.source,
      order: data.order,
      updatedAt: now,
    };
    await chapters.put(updated);
    logger.info('chapters.updated', {
      chapterId: id,
      updatedBy: principal.userId,
      sections: data.sections.length,
    });
    return c.json({ chapter: updated });
  });

  app.post('/:id/publish', async (c) => {
    const { principal } = await requireAnyAdmin(c, env, admins, 'content_admin');
    const id = c.req.param('id');
    const existing = await chapters.get(id);
    if (!existing) throw new HTTPException(404, { message: 'chapter not found' });
    if (existing.status === 'published') return c.json({ chapter: existing });

    const now = asISODateTime(new Date().toISOString());
    const updated: Chapter = {
      ...existing,
      status: 'published',
      publishedBy: principal.userId,
      publishedAt: now,
      archivedAt: null,
      updatedAt: now,
    };
    await chapters.put(updated);
    logger.info('chapters.published', {
      chapterId: id,
      publishedBy: principal.userId,
    });
    return c.json({ chapter: updated });
  });

  app.post('/:id/archive', async (c) => {
    const { principal } = await requireAnyAdmin(c, env, admins, 'content_admin');
    const id = c.req.param('id');
    const existing = await chapters.get(id);
    if (!existing) throw new HTTPException(404, { message: 'chapter not found' });
    if (existing.status === 'archived') return c.json({ chapter: existing });

    const now = asISODateTime(new Date().toISOString());
    const updated: Chapter = {
      ...existing,
      status: 'archived',
      archivedAt: now,
      updatedAt: now,
    };
    await chapters.put(updated);
    logger.info('chapters.archived', {
      chapterId: id,
      archivedBy: principal.userId,
    });
    return c.json({ chapter: updated });
  });

  return app;
}

/** Re-export for app.ts so it can construct types without two imports. */
export type ChapterAdminSubject = SubjectId;
