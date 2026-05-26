import type { ExamSlug } from './brand.js';

/**
 * Syllabus tree structure for the study engine.
 * Used by GET /v1/study/syllabus/:examSlug
 */

export interface SyllabusSubject {
  slug: string;
  name: string;
  nameHi: string;
  icon: string;
  chapters: SyllabusChapter[];
}

export interface SyllabusChapter {
  slug: string;
  name: string;
  nameHi: string;
  order: number;
  estimatedMinutes: number;
}

export interface SyllabusTree {
  exam: ExamSlug;
  examName: string;
  subjects: SyllabusSubject[];
  /** Official syllabus source URL */
  sourceUrl: string;
  /** ISO date when syllabus was last verified against official source */
  lastVerified: string;
  /** Warning shown when syllabus could not be verified from official sources */
  warning?: string;
  /** Body that conducts the exam (populated by AI fallback) */
  conductedBy?: string;
}

export interface StudyProgress {
  userId: string;
  exam: ExamSlug;
  completedChapters: string[];
  chapterScores: Record<string, number>;
  currentChapter: string | null;
  overallPercent: number;
}
