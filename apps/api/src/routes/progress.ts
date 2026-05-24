import { Hono } from 'hono';
import { HTTPException } from 'hono/http-exception';
import {
  asExamSlug,
  asISODateTime,
  isExamSlug,
  type AccuracyTrendBucket,
  type ChapterProgressEntry,
  type ExamSlug,
  type ISODateTime,
  type McqAttemptRow,
  type ProgressSnapshot,
  type SubjectMastery,
  type UserId,
  type WeakTopic,
} from '@nexigrate/shared';
import { requireAuth } from '../auth.js';
import type { ChapterStore } from '../lib/chapterDraftStore.js';
import type { ChapterReadStore } from '../lib/chapterReadStore.js';
import type { McqAttemptStore } from '../lib/mcqAttemptStore.js';
import type { Logger } from '../logger.js';
import type { UserStore } from '../lib/userStore.js';

/**
 * Phase 12 -- aggregate progress snapshot.
 *
 *   GET /v1/users/me/progress?exam=<slug>
 *
 * Computed at request time from the mcq_attempts collection plus
 * the chapter_reads subcollection plus the published chapters list.
 *
 * Cost: 1 query against mcq_attempts (limit 2000), 1 list of
 * chapter_reads (small), and a list of published chapters for the exam
 * (small). On the InMemory store all three are O(N) over <= 5k rows.
 *
 * The endpoint is intentionally NOT cached for now -- progress changes
 * on every session complete and a stale cache would feel broken. If
 * the read pressure becomes a problem we can add a 30s cache keyed by
 * (userId, exam) without breaking the contract.
 */
export interface ProgressRoutesDeps {
  attempts: McqAttemptStore;
  reads: ChapterReadStore;
  chapters: ChapterStore;
  users: UserStore;
  logger: Logger;
  now: () => ISODateTime;
}

const TREND_DAYS = 30;
const WEAK_TOPIC_LIMIT = 5;
const WEAK_TOPIC_MIN_ATTEMPTS = 3;
const WEAK_TOPIC_MAX_ACCURACY = 0.6; // anything below 60%

/** Convert YYYY-MM-DD to a sortable timestamp (start-of-day UTC). */
function dayStartUtc(isoDate: string): number {
  return new Date(`${isoDate}T00:00:00.000Z`).getTime();
}

/** Slugify the same way McqStore does so attempts join with chapter slugs. */
function slugify(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/** YYYY-MM-DD key for an ISO datetime in UTC (close enough for 30d trend). */
function dayKeyUtc(iso: ISODateTime): string {
  return iso.slice(0, 10);
}

export function makeProgressRoutes(deps: ProgressRoutesDeps): Hono {
  const app = new Hono();

  // Mounted at /v1/users -- this gives /v1/users/me/progress.
  app.get('/me/progress', async (c) => {
    const principal = requireAuth(c);
    const examQ = c.req.query('exam');
    let exam: ExamSlug | undefined;
    if (examQ) {
      if (!isExamSlug(examQ)) {
        throw new HTTPException(400, { message: 'unknown exam slug' });
      }
      exam = examQ as ExamSlug;
    } else {
      const u = await deps.users.get(principal.userId);
      exam = u?.targetExam ?? asExamSlug('jee-main');
    }

    const snapshot = await computeSnapshot({
      userId: principal.userId,
      exam: exam!,
      attempts: deps.attempts,
      reads: deps.reads,
      chapters: deps.chapters,
      now: deps.now,
    });
    return c.json(snapshot);
  });

  return app;
}

/**
 * Pure aggregation -- takes already-fetched stores so it's easy to test
 * with the InMemory implementations.
 */
export async function computeSnapshot(input: {
  userId: UserId;
  exam: ExamSlug;
  attempts: McqAttemptStore;
  reads: ChapterReadStore;
  chapters: ChapterStore;
  now: () => ISODateTime;
}): Promise<ProgressSnapshot> {
  const { userId, exam, attempts, reads, chapters, now } = input;
  const computedAt = now();
  const todayUtc = computedAt.slice(0, 10);
  const sinceMs = dayStartUtc(todayUtc) - (TREND_DAYS - 1) * 24 * 60 * 60 * 1000;
  const sinceIso = new Date(sinceMs).toISOString();

  const [allAttempts, readRows, publishedChapters] = await Promise.all([
    // Each store call is wrapped so a transient failure in one
    // sub-query (e.g. a brand-new user with no mcq_attempts yet, or
    // a Firestore composite-index that's still building) doesn't
    // 500 the whole /progress endpoint. Logged-and-degraded is far
    // better than a screen-blanking error banner.
    attempts
      .list({ userId, exam, limit: 5000 })
      .catch(() => [] as Awaited<ReturnType<typeof attempts.list>>),
    reads
      .list(userId, exam)
      .catch(() => [] as Awaited<ReturnType<typeof reads.list>>),
    chapters
      .list({ exam, publishedOnly: true, limit: 500 })
      .catch(() => [] as Awaited<ReturnType<typeof chapters.list>>),
  ]);

  // ---------- counts + per-subject mastery (all-time) -----------------
  const subjectMap = new Map<string, { attempted: number; correct: number }>();
  let mcqsCorrect = 0;
  for (const a of allAttempts) {
    mcqsCorrect += a.isCorrect ? 1 : 0;
    const s = a.subject || 'general';
    const cur = subjectMap.get(s) ?? { attempted: 0, correct: 0 };
    cur.attempted += 1;
    if (a.isCorrect) cur.correct += 1;
    subjectMap.set(s, cur);
  }
  const subjects: SubjectMastery[] = Array.from(subjectMap.entries())
    .map(([subject, v]) => ({
      subject,
      mcqsAttempted: v.attempted,
      mcqsCorrect: v.correct,
      masteryPct:
        v.attempted === 0 ? 0 : Math.round((v.correct / v.attempted) * 100),
    }))
    .sort((a, b) => b.mcqsAttempted - a.mcqsAttempted);

  // ---------- accuracy trend (last 30 days) ---------------------------
  // Pre-fill a flat array of day buckets so days with zero attempts
  // still appear. Order: oldest -> today.
  const trendByDay = new Map<string, AccuracyTrendBucket>();
  for (let i = TREND_DAYS - 1; i >= 0; i--) {
    const d = new Date(dayStartUtc(todayUtc) - i * 24 * 60 * 60 * 1000)
      .toISOString()
      .slice(0, 10);
    trendByDay.set(d, {
      date: d,
      mcqsAttempted: 0,
      mcqsCorrect: 0,
      accuracyPct: null,
    });
  }
  for (const a of allAttempts) {
    if (a.attemptedAt < sinceIso) continue;
    const d = dayKeyUtc(a.attemptedAt);
    const b = trendByDay.get(d);
    if (!b) continue;
    b.mcqsAttempted += 1;
    if (a.isCorrect) b.mcqsCorrect += 1;
  }
  const accuracyTrend30d: AccuracyTrendBucket[] = [];
  for (const b of trendByDay.values()) {
    const finalised: AccuracyTrendBucket = {
      ...b,
      accuracyPct:
        b.mcqsAttempted === 0
          ? null
          : Math.round((b.mcqsCorrect / b.mcqsAttempted) * 100),
    };
    accuracyTrend30d.push(finalised);
  }
  accuracyTrend30d.sort((a, b) => a.date.localeCompare(b.date));

  // ---------- per-chapter progress ------------------------------------
  // Group attempts by slugified chapter so 'Kinematics' and 'kinematics'
  // collapse together. For each chapter we want best score and attempt
  // count from chapter sessions only.
  const sessionScoreByChapter = new Map<
    string,
    { totalSessions: number; bestScore: number; lastSeenAt: ISODateTime }
  >();
  // Group attempts by sessionId+chapter so we can score per-session.
  const bySession = new Map<
    string,
    { chapterSlug: string; right: number; total: number; lastAt: ISODateTime }
  >();
  for (const a of allAttempts) {
    if (a.sessionKind !== 'chapter') continue;
    const k = `${a.sessionId}::${slugify(a.chapter)}`;
    const cur = bySession.get(k);
    if (cur) {
      cur.total += 1;
      if (a.isCorrect) cur.right += 1;
      if (a.attemptedAt > cur.lastAt) cur.lastAt = a.attemptedAt;
    } else {
      bySession.set(k, {
        chapterSlug: slugify(a.chapter),
        right: a.isCorrect ? 1 : 0,
        total: 1,
        lastAt: a.attemptedAt,
      });
    }
  }
  for (const v of bySession.values()) {
    const scorePct = v.total === 0 ? 0 : Math.round((v.right / v.total) * 100);
    const cur = sessionScoreByChapter.get(v.chapterSlug);
    if (cur) {
      cur.totalSessions += 1;
      if (scorePct > cur.bestScore) cur.bestScore = scorePct;
      if (v.lastAt > cur.lastSeenAt) cur.lastSeenAt = v.lastAt;
    } else {
      sessionScoreByChapter.set(v.chapterSlug, {
        totalSessions: 1,
        bestScore: scorePct,
        lastSeenAt: v.lastAt,
      });
    }
  }

  const readSet = new Map<string, ISODateTime>();
  for (const r of readRows) readSet.set(r.id, r.readAt);

  const chapterEntries: ChapterProgressEntry[] = publishedChapters.map((ch) => {
    const slug = ch.slug;
    const session = sessionScoreByChapter.get(slug);
    const readAt = readSet.get(ch.id) ?? null;
    return {
      chapterId: ch.id,
      exam: ch.exam,
      subject: ch.subject,
      slug,
      title: ch.title,
      isRead: !!readAt,
      readAt,
      hasTested: session !== undefined,
      bestScorePct: session?.bestScore ?? null,
      attempts: session?.totalSessions ?? 0,
    };
  });
  chapterEntries.sort((a, b) => {
    if (a.subject !== b.subject) return a.subject < b.subject ? -1 : 1;
    return a.title < b.title ? -1 : 1;
  });

  // ---------- weak topics (last 30d, recent attempts) -----------------
  // Recompute per-chapter accuracy from attempts in the last 30 days
  // only, so improving over time pulls a chapter out of the weak list.
  const recentByChapter = new Map<
    string,
    { right: number; total: number; lastAt: ISODateTime }
  >();
  for (const a of allAttempts) {
    if (a.attemptedAt < sinceIso) continue;
    const slug = slugify(a.chapter);
    const cur = recentByChapter.get(slug);
    if (cur) {
      cur.total += 1;
      if (a.isCorrect) cur.right += 1;
      if (a.attemptedAt > cur.lastAt) cur.lastAt = a.attemptedAt;
    } else {
      recentByChapter.set(slug, {
        right: a.isCorrect ? 1 : 0,
        total: 1,
        lastAt: a.attemptedAt,
      });
    }
  }
  const weakRaw: WeakTopic[] = [];
  for (const ch of publishedChapters) {
    const r = recentByChapter.get(ch.slug);
    if (!r) continue;
    if (r.total < WEAK_TOPIC_MIN_ATTEMPTS) continue;
    const acc = r.right / r.total;
    if (acc >= WEAK_TOPIC_MAX_ACCURACY) continue;
    weakRaw.push({
      chapterId: ch.id,
      exam: ch.exam,
      subject: ch.subject,
      slug: ch.slug,
      title: ch.title,
      accuracyPct: Math.round(acc * 100),
      attempts: r.total,
      lastAttemptedAt: r.lastAt,
    });
  }
  weakRaw.sort((a, b) => a.accuracyPct - b.accuracyPct);
  const weakTopics = weakRaw.slice(0, WEAK_TOPIC_LIMIT);

  // ---------- header counts ------------------------------------------
  const distinctSessionIds = new Set<string>();
  let dailySessions = 0;
  let chapterSessions = 0;
  for (const a of allAttempts) {
    if (distinctSessionIds.has(a.sessionId)) continue;
    distinctSessionIds.add(a.sessionId);
    if (a.sessionKind === 'daily') dailySessions += 1;
    if (a.sessionKind === 'chapter') chapterSessions += 1;
  }

  return {
    exam,
    computedAt: asISODateTime(computedAt),
    counts: {
      mcqsAttempted: allAttempts.length,
      mcqsCorrect,
      chaptersRead: readRows.length,
      chaptersPublished: publishedChapters.length,
      chapterTestsCompleted: chapterSessions,
      dailyMcqsCompleted: dailySessions,
      // Mock tests will land in Phase 13 UI; stub to 0 for now so the
      // shape of the snapshot is stable.
      mockTestsCompleted: 0,
    },
    subjects,
    chapters: chapterEntries,
    accuracyTrend30d,
    weakTopics,
  };
}

// `McqAttemptRow` types are referenced via @nexigrate/shared above; this
// re-export silences unused-import linters in editors that don't see
// the JSDoc reference.
export type { McqAttemptRow };
