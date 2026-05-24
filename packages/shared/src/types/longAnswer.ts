import type { ExamSlug, ISODateTime, UserId } from './brand.js';

/**
 * Phase 18 -- Long-form descriptive answers + AI grading.
 *
 * Use case: UPSC mains, state PSC mains, CBSE/ICSE long-answer questions,
 * MBA WAT prep. Student writes a paragraph or essay-length answer to a
 * curated prompt; an AI grader scores it on a rubric and writes pointed
 * feedback the student can act on.
 *
 * Design choices:
 *   - SINGLE grader (gpt-4o-mini) rather than the 3-AI panel we use for
 *     content authoring. Grading is the deliverable, not the input -- a
 *     panel of disagreeing graders just confuses the student. We pin the
 *     model and rubric so two re-grades of the same answer produce the
 *     same score (deterministic enough for an exam-prep tool).
 *   - Rubric is a fixed 5-axis breakdown (relevance, structure, content,
 *     clarity, examples). Scores are integers 0-10 per axis; overall is
 *     the rounded mean. Improvements list is up to 5 specific bullets.
 *   - Submission is metered at 30 credits per attempt -- between a free
 *     daily MCQ and a 100-credit mock test. Idempotency key prevents a
 *     double-submit from charging twice.
 *   - Question authoring is admin-only and entirely manual (no AI
 *     generation for the prompts themselves -- the founder wants to
 *     curate UPSC-quality questions by hand at v1).
 */

export type LongAnswerQuestionId = string & {
  readonly __brand: 'LongAnswerQuestionId';
};

export const asLongAnswerQuestionId = (s: string): LongAnswerQuestionId =>
  s as LongAnswerQuestionId;

export type LongAnswerAttemptId = string & {
  readonly __brand: 'LongAnswerAttemptId';
};

export const asLongAnswerAttemptId = (s: string): LongAnswerAttemptId =>
  s as LongAnswerAttemptId;

/** Words target the student should aim for. Drives word-count guidance. */
export type LongAnswerLength = 'short' | 'medium' | 'long';

export const LONG_ANSWER_LENGTH_HINTS: Record<
  LongAnswerLength,
  { minWords: number; targetWords: number; maxWords: number; label: string }
> = {
  short: { minWords: 80, targetWords: 150, maxWords: 250, label: 'Short (~150 words)' },
  medium: { minWords: 200, targetWords: 300, maxWords: 500, label: 'Medium (~300 words)' },
  long: { minWords: 400, targetWords: 600, maxWords: 1000, label: 'Long (~600 words)' },
};

export interface LongAnswerQuestion {
  id: LongAnswerQuestionId;
  /** Stable kebab-case slug, e.g. 'fundamental-rights-vs-directive-principles'. */
  slug: string;
  /** Which exam this question is most relevant to. */
  exam: ExamSlug;
  /** Subject taxonomy, e.g. 'polity', 'history', 'economy', 'general-studies'. */
  subject: string;
  /** Year-cited paper origin, e.g. 'UPSC Mains 2019, GS Paper II, Q9'. */
  source: string;
  /** Question prompt the student writes against. */
  prompt: string;
  /** Expected answer length category. Drives word-count guidance + scoring. */
  expectedLength: LongAnswerLength;
  /**
   * Optional model-answer points the AI grader uses as a north star while
   * scoring. Hidden from the student. Author can leave empty for the AI
   * to grade purely on rubric.
   */
  rubricNotes: string;
  isPublished: boolean;
  createdBy: string;
  createdAt: ISODateTime;
  updatedAt: ISODateTime;
}

/** Five-axis rubric breakdown, scored 0-10 per axis. */
export interface LongAnswerRubric {
  /** Did the answer address the question asked, not a related one? */
  relevance: number;
  /** Intro -> body -> conclusion clarity, paragraph flow. */
  structure: number;
  /** Factual accuracy, depth, examples, citations. */
  content: number;
  /** Sentence clarity, jargon explained, no padding. */
  clarity: number;
  /**
   * Concrete examples / cases / data used. Scored separately from content
   * because exam markers reward example use even when content depth is OK.
   */
  examples: number;
}

export interface LongAnswerGrade {
  /** Rounded mean across the 5 rubric axes, 0-10. */
  overall: number;
  rubric: LongAnswerRubric;
  /** 2-4 sentence summary written for the student. */
  summary: string;
  /** Up to 5 bullet-style action items the student should fix next time. */
  improvements: string[];
  /** Up to 3 strengths to keep doing. */
  strengths: string[];
  /** Provider/model that produced this grade, for audit + cost analysis. */
  graderModelId: string;
  gradedAt: ISODateTime;
}

export type LongAnswerAttemptStatus = 'pending' | 'graded' | 'failed';

export interface LongAnswerAttempt {
  id: LongAnswerAttemptId;
  questionId: LongAnswerQuestionId;
  userId: UserId;
  /** Verbatim student response. Not edited server-side. */
  answer: string;
  /** Word count at submission time, for analytics + word-count guidance. */
  wordCount: number;
  /** How many credits this submission cost (before any later refunds). */
  creditsSpent: number;
  status: LongAnswerAttemptStatus;
  /** Populated once status='graded'. */
  grade: LongAnswerGrade | null;
  /** When status='failed', describes why the grader run errored out. */
  failureReason: string | null;
  submittedAt: ISODateTime;
  createdAt: ISODateTime;
  updatedAt: ISODateTime;
}

/** Slim list shape for the student dashboard. No answer body / rubric details. */
export interface LongAnswerAttemptSummary {
  id: LongAnswerAttemptId;
  questionId: LongAnswerQuestionId;
  questionPrompt: string;
  questionExam: ExamSlug;
  questionSubject: string;
  status: LongAnswerAttemptStatus;
  overall: number | null;
  wordCount: number;
  submittedAt: ISODateTime;
}
