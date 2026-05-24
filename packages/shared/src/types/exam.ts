import type { ChapterId, ExamSlug, SubjectId } from './brand.js';

/**
 * Curriculum and target-exam types.
 *
 * The "live" exams form the MVP wedge (Class 11-12 + JEE Main/Advanced + NEET UG).
 * The "soon" exams are on the roadmap and surfaced on the marketing site as
 * "Coming soon" pills, while still accepted by the waitlist API so we capture
 * demand signal.
 */

export type ExamCategory =
  | 'school'
  | 'engineering'
  | 'medical'
  | 'civil-services'
  | 'defence'
  | 'banking'
  | 'state'
  | 'law'
  | 'management';

export type ExamStatus = 'live' | 'soon';

export interface Exam {
  /** Stable kebab-case slug used as a primary key. */
  id: ExamSlug;
  /** Human-readable name shown in UI. */
  name: string;
  category: ExamCategory;
  status: ExamStatus;
}

export type ClassLevel =
  | 'class-8'
  | 'class-9'
  | 'class-10'
  | 'class-11'
  | 'class-12'
  | 'graduation'
  | 'post-graduation';

export type Board = 'cbse' | 'icse' | 'state' | 'other';

/** A subject inside a curriculum tree (e.g. "Physics" under JEE Main). */
export interface Subject {
  id: SubjectId;
  exam: ExamSlug;
  name: string;
  /** Display order within the exam. */
  order: number;
}

/** A chapter inside a subject (e.g. "Kinematics" under Physics).
 *
 * NOTE: This is the curriculum-tree metadata stub used for the syllabus
 * tree. The full content chapter (with sections, AI verification, etc.)
 * lives in `types/chapter.ts` as `Chapter`. Different concerns; same
 * domain noun. Renamed here to avoid the export-name clash.
 */
export interface CurriculumChapter {
  id: ChapterId;
  subject: SubjectId;
  exam: ExamSlug;
  name: string;
  /** Display order within the subject. */
  order: number;
  /** Source citation, e.g. "NCERT Class 11 Physics Ch. 3". */
  source: string;
  /** Approximate study time in minutes, used for credit cost calculation. */
  estimatedMinutes: number;
}
