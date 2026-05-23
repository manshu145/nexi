import type { ChapterId, ExamSlug, ISODateTime, SubjectId, UserId } from './brand.js';

/**
 * Chapter content -- the reading material a student goes through BEFORE
 * the chapter test fires. Phase 9 introduces this as a first-class
 * collection (`chapters/{chapterDocId}`) separate from the existing
 * `chapter: ChapterId` slug used on MCQ records.
 *
 * The slug `ChapterId` (e.g. `units-and-measurements`) is the join key
 * used by both `MCQ` and `Chapter`. The chapter document id is a longer
 * deterministic string `{exam}-{subject}-{chapterSlug}` so admins (and
 * the URL `/read/{exam}/{subject}/{chapter}`) can derive it without a
 * separate lookup.
 *
 * Lifecycle:
 *   draft     -- author is still writing; only visible in admin
 *   published -- visible to students at /read/...; counts toward
 *                "today's reading" and unlocks the chapter MCQ test
 *   archived  -- hidden from students; preserved for audit + potential restore
 */

export type ChapterStatus = 'draft' | 'published' | 'archived';

/**
 * A single section within a chapter -- typically one numbered heading
 * (e.g. "1.1 What is a unit?") followed by some prose. Body is markdown
 * so admins can do bold / italic / lists / inline math without a rich
 * editor. Rendered with a safe-by-default markdown lib on the client.
 */
export interface ChapterSection {
  heading: string;
  body: string;
}

export interface Chapter {
  /**
   * Deterministic doc id -- `{exam}-{subject}-{chapterSlug}`, e.g.
   * `jee-main-physics-units-and-measurements`. Never displayed to users;
   * URLs use the three component slugs separately.
   */
  id: string;

  exam: ExamSlug;
  subject: SubjectId;
  /** Kebab-case chapter slug, joins with MCQ.chapter. */
  chapterSlug: ChapterId;

  /** Human-readable title, shown on the listing and at the top of the read view. */
  title: string;
  /** 1-2 sentence summary shown on the chapter list card. */
  summary: string;

  classLevel:
    | 'class-8'
    | 'class-9'
    | 'class-10'
    | 'class-11'
    | 'class-12'
    | 'graduation'
    | 'post-graduation'
    | null;

  sections: ChapterSection[];

  /**
   * Reading time in minutes, based on word count / 200 wpm. Computed by
   * the API on save so the frontend doesn't have to recompute on every
   * render. Capped at 120 (no chapter should be longer than 2 hours).
   */
  readingTimeMinutes: number;

  /**
   * Source citation. Free-form text e.g. "NCERT Class 11 Physics, Ch 1".
   * Required for every published chapter; `nexigrate-internal` is
   * accepted only for draft chapters that admins are still authoring.
   */
  source: string;

  status: ChapterStatus;

  /**
   * Sort order within the (exam, subject) listing. Lower = earlier.
   * Defaults to 1000 so newly-created chapters land at the bottom and
   * the admin can re-order without renumbering everything.
   */
  order: number;

  createdBy: UserId | null;
  publishedBy: UserId | null;
  publishedAt: ISODateTime | null;
  archivedAt: ISODateTime | null;
  createdAt: ISODateTime;
  updatedAt: ISODateTime;
}

/**
 * Per-user record of "I've read this chapter".
 *
 * Stored as `chaptersRead: ChapterReadRecord[]` on the user doc rather
 * than a sub-collection -- the array stays small (one entry per chapter)
 * and avoiding a sub-collection means dashboard + read-status checks are
 * one document read instead of N. A bigger student app (10k+ chapters)
 * would split this out, but for the current scope it's the right call.
 */
export interface ChapterReadRecord {
  chapterId: string;
  readAt: ISODateTime;
}
