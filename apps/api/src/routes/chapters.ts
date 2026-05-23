import { Hono } from 'hono';
import { HTTPException } from 'hono/http-exception';
import {
  asISODateTime,
  asSubjectId,
  isExamSlug,
  type Chapter,
  type ChapterReadRecord,
  type ExamSlug,
  type SubjectId,
} from '@nexigrate/shared';
import { requireAuth } from '../auth.js';
import type { ChapterStore } from '../lib/chapterStore.js';
import type { UserStore } from '../lib/userStore.js';
import type { Logger } from '../logger.js';

/**
 * Student-facing chapter routes. Phase 9.
 *
 *   GET  /v1/chapters                 list all published chapters,
 *                                     optionally filtered by exam + subject.
 *                                     Defaults to the user's targetExam.
 *   GET  /v1/chapters/:id             single chapter (must be published)
 *   POST /v1/chapters/:id/read        mark the chapter as read for the
 *                                     current user. Idempotent. Returns
 *                                     the updated read-record so the
 *                                     client can re-render without a
 *                                     second /me call.
 *
 * Drafts and archived chapters are 404 to non-admins -- the admin
 * routes (/v1/admin/chapters/*) serve those.
 */

export interface ChaptersRoutesDeps {
  chapters: ChapterStore;
  users: UserStore;
  logger: Logger;
  /** Resolves the user's preferred exam when no `?exam=` query is given. */
  getTargetExam: (userId: import('@nexigrate/shared').UserId) => Promise<ExamSlug>;
}

export function makeChaptersRoutes(deps: ChaptersRoutesDeps): Hono {
  const app = new Hono();
  const { chapters, users, logger, getTargetExam } = deps;

  app.get('/', async (c) => {
    const principal = requireAuth(c);
    const examQ = c.req.query('exam');
    const subjectQ = c.req.query('subject');
    const limit = Math.min(Number(c.req.query('limit') ?? '50') || 50, 200);

    let exam: ExamSlug;
    if (examQ && isExamSlug(examQ)) {
      exam = examQ as ExamSlug;
    } else if (examQ) {
      throw new HTTPException(400, { message: 'unknown exam slug' });
    } else {
      exam = await getTargetExam(principal.userId);
    }

    const subject: SubjectId | undefined = subjectQ ? asSubjectId(subjectQ) : undefined;

    const list = await chapters.list({
      exam,
      ...(subject ? { subject } : {}),
      status: 'published',
      limit,
    });

    // Annotate each chapter with the user's read state so the listing
    // can render "Read" badges without a second round-trip.
    const u = await users.get(principal.userId);
    const readSet = new Set<string>(
      (u?.chaptersRead ?? []).map((r) => r.chapterId),
    );

    return c.json({
      exam,
      ...(subject ? { subject } : {}),
      chapters: list.map((ch) => ({ ...ch, isRead: readSet.has(ch.id) })),
    });
  });

  app.get('/:id', async (c) => {
    const principal = requireAuth(c);
    const id = c.req.param('id');
    const ch = await chapters.get(id);
    if (!ch || ch.status !== 'published') {
      throw new HTTPException(404, { message: 'chapter not found' });
    }
    const u = await users.get(principal.userId);
    const isRead = (u?.chaptersRead ?? []).some((r) => r.chapterId === id);
    return c.json({ chapter: ch, isRead });
  });

  app.post('/:id/read', async (c) => {
    const principal = requireAuth(c);
    const id = c.req.param('id');
    const ch = await chapters.get(id);
    if (!ch || ch.status !== 'published') {
      throw new HTTPException(404, { message: 'chapter not found' });
    }
    const now = asISODateTime(new Date().toISOString());
    const updated = await users.markChapterRead(principal.userId, id, now);
    const record: ChapterReadRecord | undefined = (updated.chaptersRead ?? []).find(
      (r) => r.chapterId === id,
    );
    logger.info('chapters.read', {
      userId: principal.userId,
      chapterId: id,
      readAt: record?.readAt ?? now,
    });
    return c.json({
      chapterId: id,
      readAt: record?.readAt ?? now,
      totalChaptersRead: (updated.chaptersRead ?? []).length,
    });
  });

  return app;
}

/**
 * Admin-facing chapter authoring routes. Phase 9.
 *
 *   GET    /v1/admin/chapters            list (any status, default 50)
 *   GET    /v1/admin/chapters/:id        single (any status)
 *   POST   /v1/admin/chapters            create as draft
 *   PATCH  /v1/admin/chapters/:id        update fields (still a draft
 *                                        until /publish is called)
 *   POST   /v1/admin/chapters/:id/publish   move status -> 'published'
 *   POST   /v1/admin/chapters/:id/archive   move status -> 'archived'
 *
 * Mounted under /v1/admin/chapters by app.ts. Gating handled by the
 * route handlers using `requireAnyAdmin(..., 'content_admin')`.
 */

export type AdminChapter = Chapter;
