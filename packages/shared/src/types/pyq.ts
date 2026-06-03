import type { ExamSlug, ISODateTime } from './brand.js';

/**
 * Previous Year Questions (PYQ).
 *
 * Use case: a student picks their target exam and wants to see what was
 * asked in the most recent session(s) — the single highest-signal study
 * resource for any Indian competitive/board exam.
 *
 * Honesty + sourcing stance (important):
 *   - Reproducing an exam body's copyrighted question paper verbatim is a
 *     legal grey area, and we don't have authentic papers for all 60+
 *     exams on day one. So the DEFAULT layer is an AI-reconstructed
 *     "previous-year pattern" set: grounded (via web search) on the real
 *     topics, weightage, and difficulty of that exam's last session, and
 *     clearly LABELLED as a pattern-based practice set — never passed off
 *     as the verbatim original.
 *   - Where an admin curates/uploads a genuine paper, the same document is
 *     marked `source: 'admin-verified'` + `verified: true` and shown with
 *     a "Verified Original" badge.
 *
 * Caching:
 *   - One paper per (exam, year, language). Firestore doc id is
 *     `${examSlug}_${year}_${language}` so generation is idempotent and
 *     the cost is paid once, then shared by every student.
 */

export type PYQSource = 'ai-pattern' | 'admin-verified';

export interface PYQOption {
  key: 'A' | 'B' | 'C' | 'D';
  text: string;
}

export interface PYQQuestion {
  id: string;
  question: string;
  options: PYQOption[];
  correctOption: 'A' | 'B' | 'C' | 'D';
  /** Why the correct option is correct — students revise from this. */
  explanation: string;
  difficulty?: 'easy' | 'medium' | 'hard';
  subject?: string;
  topic?: string;
}

export interface PYQPaper {
  /** `${examSlug}_${year}_${language}` — stable + idempotent. */
  id: string;
  examSlug: ExamSlug;
  examName: string;
  /** The exam session year these questions represent (e.g. 2025). */
  year: number;
  language: 'en' | 'hi';
  /** AI-reconstructed pattern vs an admin-curated genuine paper. */
  source: PYQSource;
  /** True once an admin has reviewed/approved the paper. */
  verified: boolean;
  questions: PYQQuestion[];
  /** Student-facing disclaimer / note (e.g. the pattern-based caveat). */
  note?: string;
  generatedBy: string;
  createdAt: ISODateTime;
  updatedAt: ISODateTime;
}

/** Slim shape for the "available years" list on the exam landing page. */
export interface PYQPaperSummary {
  id: string;
  examSlug: ExamSlug;
  examName: string;
  year: number;
  language: 'en' | 'hi';
  source: PYQSource;
  verified: boolean;
  questionCount: number;
}
