import type { ExamSlug, ISODateTime, McqId, UserId } from './brand.js';

/**
 * Phase 12 -- progress tracking primitives.
 *
 * Three new collections back the /progress page and dashboard widgets:
 *
 *   mcq_attempts   - one doc per answered MCQ (by sessionId+mcqId).
 *                    Lets us roll up per-subject mastery, per-chapter
 *                    accuracy, and the 7d/30d accuracy trend without
 *                    rescoring the credit ledger each request.
 *
 *   chapter_reads  - one doc per (user, chapter) when the student taps
 *                    "Mark as read" at the end of the Kindle reader.
 *                    Drives the chapter-completion % on the dashboard.
 *
 *   exam_dates     - upcoming events (mains, advance, board start, etc.)
 *                    for each exam; fed by admin manually or seeded.
 *                    Surfaced as a countdown widget on the dashboard.
 *
 * All three are append-only from the API's perspective. The progress
 * snapshot is a derived read from these collections plus the existing
 * credit ledger.
 */

/** Was the session a daily MCQ or a chapter-test? */
export type McqSessionKind = 'daily' | 'chapter';

/**
 * One row per (user, mcq) per session attempt.
 *
 * Distinct from the legacy `MCQAttempt` interface in `mcq.ts` -- that one
 * captures fine-grained per-question detail (durationMs, streakDay). This
 * row is the analytics shape: cheaper to write in batch, indexed for
 * trend / mastery / weak-topic queries.
 *
 * If a student attempts the same MCQ in two different sessions (e.g. it
 * appeared in their daily on Monday and again on Wednesday), there are
 * two rows. The id is `${sessionId}:${mcqId}` so re-submitting the same
 * session is idempotent.
 */
export interface McqAttemptRow {
  id: string;
  userId: UserId;
  mcqId: McqId;
  sessionId: string;
  sessionKind: McqSessionKind;
  exam: ExamSlug;
  /** Lowercase subject string from the MCQ doc, e.g. 'physics'. */
  subject: string;
  /** Slugified chapter from the MCQ, e.g. 'kinematics'. */
  chapter: string;
  chosen: 'A' | 'B' | 'C' | 'D' | null;
  isCorrect: boolean;
  attemptedAt: ISODateTime;
}

/** A student's record of having read a chapter once. */
export interface ChapterRead {
  /** chapter id (same as Chapter.id) -- subcollection keyed by this. */
  id: string;
  userId: UserId;
  exam: ExamSlug;
  subject: string;
  slug: string;
  readAt: ISODateTime;
}

/** A planned exam event (countdown target on the dashboard). */
export interface ExamDate {
  id: string;
  exam: ExamSlug;
  /** Short label, e.g. 'JEE Main session 1'. */
  eventName: string;
  /** ISO date (YYYY-MM-DD) of the event. */
  eventDate: string;
  /** Categorisation -- helps the UI badge the event. */
  eventType:
    | 'application_open'
    | 'application_close'
    | 'admit_card'
    | 'exam'
    | 'result'
    | 'other';
  /** Source URL or note where the date was confirmed (e.g. NTA notice). */
  source: string;
  /** True if confirmed by official notification, false if tentative. */
  isOfficial: boolean;
  createdAt: ISODateTime;
  updatedAt: ISODateTime;
}

// ---------- progress snapshot --------------------------------------------

export interface SubjectMastery {
  subject: string;
  mcqsAttempted: number;
  mcqsCorrect: number;
  /** mcqsCorrect / mcqsAttempted * 100 (integer). 0 if mcqsAttempted=0. */
  masteryPct: number;
}

export interface ChapterProgressEntry {
  chapterId: string;
  exam: ExamSlug;
  subject: string;
  slug: string;
  title: string;
  /** Has the student tapped "Mark as read"? */
  isRead: boolean;
  /** ISO datetime of the last read, or null. */
  readAt: ISODateTime | null;
  /** Has the student finished at least one chapter test? */
  hasTested: boolean;
  /** Best-ever percentage on this chapter's test. 0..100. null if untested. */
  bestScorePct: number | null;
  /** Number of times the chapter test has been completed. */
  attempts: number;
}

export interface AccuracyTrendBucket {
  /** ISO date (YYYY-MM-DD). */
  date: string;
  mcqsAttempted: number;
  mcqsCorrect: number;
  /** mcqsCorrect / mcqsAttempted * 100, or null if 0 attempts. */
  accuracyPct: number | null;
}

export interface WeakTopic {
  chapterId: string;
  exam: ExamSlug;
  subject: string;
  slug: string;
  title: string;
  /** Accuracy on the most recent N attempts in this chapter. */
  accuracyPct: number;
  attempts: number;
  lastAttemptedAt: ISODateTime;
}

export interface ProgressCounts {
  mcqsAttempted: number;
  mcqsCorrect: number;
  chaptersRead: number;
  chaptersPublished: number;
  chapterTestsCompleted: number;
  dailyMcqsCompleted: number;
  mockTestsCompleted: number;
}

/**
 * Aggregate response from `GET /v1/users/me/progress?exam=...`.
 *
 * The server scopes everything to a single exam (the student's targetExam
 * by default) so the page is fast even for users prepping for two exams.
 * Mock-test data is included for the upcoming Phase 13 mock-test UI.
 */
export interface ProgressSnapshot {
  exam: ExamSlug;
  computedAt: ISODateTime;
  counts: ProgressCounts;
  /** Per-subject mastery, sorted by mcqsAttempted desc. */
  subjects: SubjectMastery[];
  /** Per-chapter completion + score, sorted by subject then title. */
  chapters: ChapterProgressEntry[];
  /** 30 buckets, oldest first. Last bucket is today (IST). */
  accuracyTrend30d: AccuracyTrendBucket[];
  /** Up to 5 chapters with the lowest accuracy in the last 30 days. */
  weakTopics: WeakTopic[];
}
