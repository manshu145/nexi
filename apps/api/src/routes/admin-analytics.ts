import { Hono } from 'hono';
import type { ExamSlug } from '@nexigrate/shared';
import { requireAnyAdmin } from '../auth.js';
import type { Env } from '../env.js';
import type { AdminUserStore } from '../lib/adminUserStore.js';
import type { ChapterStore } from '../lib/chapterDraftStore.js';
import type { NexipediaArticleStore } from '../lib/nexipediaArticleStore.js';
import type { UserStore } from '../lib/userStore.js';
import type { Logger } from '../logger.js';

/**
 * Phase 20 -- minimal admin analytics overview.
 *
 *   GET /v1/admin/analytics
 *
 * Returns counts that we can derive from the stores we already have, with
 * defensive degradation -- a single sub-call failure produces zeros for
 * that section rather than 500ing the whole page.
 *
 * Deliberately small and crude. Real analytics (DAU, MAU, cohort retention,
 * funnel) belongs in BigQuery / a warehouse and is a follow-up. For day-1
 * admin operations 'how many users / how much content / signup velocity'
 * is enough.
 *
 * MCQ counts are intentionally NOT here: McqStore has no list() method
 * (the store is keyed by exam + chapter for the daily pick). Approved MCQ
 * counts are surfaced on the existing /admin/mcq-drafts page; we'd need
 * to add a list endpoint to McqStore to count published MCQs and that's
 * a follow-up.
 */
export interface AdminAnalyticsRoutesDeps {
  env: Env;
  users: UserStore;
  chapters: ChapterStore;
  articles: NexipediaArticleStore;
  admins: AdminUserStore;
  logger: Logger;
}

export function makeAdminAnalyticsRoutes(deps: AdminAnalyticsRoutesDeps): Hono {
  const app = new Hono();
  const { env, users, chapters, articles, admins, logger } = deps;

  app.get('/analytics', async (c) => {
    await requireAnyAdmin(c, env, admins, 'support_admin');

    // Pull a 200-row window in createdAt-desc order; that's enough to
    // surface "today / 7d / 30d signups" without scanning the whole
    // collection.
    const recentUsers = await users.list({ limit: 200 }).catch((err) => {
      logger.warn('admin.analytics.users_failed', {
        error: err instanceof Error ? err.message : 'unknown',
      });
      return [];
    });

    const now = Date.now();
    const dayMs = 24 * 60 * 60 * 1000;
    const usersLast24h = recentUsers.filter(
      (u) => now - new Date(u.createdAt).getTime() < dayMs,
    ).length;
    const usersLast7d = recentUsers.filter(
      (u) => now - new Date(u.createdAt).getTime() < 7 * dayMs,
    ).length;
    const usersLast30d = recentUsers.filter(
      (u) => now - new Date(u.createdAt).getTime() < 30 * dayMs,
    ).length;

    const examBreakdown = new Map<ExamSlug | 'unknown', number>();
    for (const u of recentUsers) {
      const k = (u.targetExam ?? 'unknown') as ExamSlug | 'unknown';
      examBreakdown.set(k, (examBreakdown.get(k) ?? 0) + 1);
    }

    const verifiedRecent = recentUsers.filter((u) => u.isVerified).length;

    // Content totals -- "list with no filter" works on every store but is
    // intentionally bounded so a stuck index doesn't take the page down.
    const [chapterList, articleList] = await Promise.all([
      chapters.list({ limit: 1000 }).catch((err) => {
        logger.warn('admin.analytics.chapters_failed', {
          error: err instanceof Error ? err.message : 'unknown',
        });
        return [];
      }),
      articles.list({ limit: 1000 }).catch((err) => {
        logger.warn('admin.analytics.articles_failed', {
          error: err instanceof Error ? err.message : 'unknown',
        });
        return [];
      }),
    ]);

    return c.json({
      users: {
        // recentUsers is the last 200 by createdAt -- recentTotal is a
        // floor (it'll undercount only if the platform has more than 200
        // signups in the last 200 createdAts, which is the same set).
        recentTotal: recentUsers.length,
        last24h: usersLast24h,
        last7d: usersLast7d,
        last30d: usersLast30d,
        verifiedInRecent: verifiedRecent,
        examBreakdown: Object.fromEntries(examBreakdown.entries()),
      },
      content: {
        publishedChapters: chapterList.length,
        publishedNexipediaArticles: articleList.length,
      },
      // Rough server timestamp so the dashboard can show "as of ..."
      asOf: new Date().toISOString(),
    });
  });

  return app;
}
