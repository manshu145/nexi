import type {
  AttemptId,
  ChapterId,
  ExamSlug,
  ISODateTime,
  McqId,
  MockTestId,
  SubjectId,
  UserId,
} from './brand.js';

/**
 * MCQ and mock-test types.
 *
 * Every MCQ ships with provenance (source URL/page) and a triple-verifier
 * record so we can prove our content trail to a curious student or auditor.
 */

export type McqDifficulty = 'easy' | 'medium' | 'hard';

export interface McqVerifierScore {
  modelId: string;        // e.g. 'gpt-4o-mini', 'gemini-2.5-flash', 'llama-3.3-70b'
  score: number;          // 0..1 confidence the answer is correct
  reasoning: string;      // free-form rationale captured for review
  passedAt: ISODateTime;
}

export interface MCQ {
  id: McqId;
  exam: ExamSlug;
  subject: SubjectId;
  chapter: ChapterId;
  question: string;
  options: { key: 'A' | 'B' | 'C' | 'D'; text: string }[];
  correctOption: 'A' | 'B' | 'C' | 'D';
  /** Markdown-formatted explanation of why the correct option is correct. */
  explanation: string;
  difficulty: McqDifficulty;
  /** Source citation URL. */
  source: string;
  /** Three independent verifier scores. Required before publishing. */
  verifiers: McqVerifierScore[];
  /** Was this MCQ approved by a human SME? null = AI-only. */
  smeApprovedBy: string | null;
  smeApprovedAt: ISODateTime | null;
  isPublished: boolean;
  createdAt: ISODateTime;
  updatedAt: ISODateTime;
}

export interface MCQAttempt {
  id: AttemptId;
  userId: UserId;
  mcq: McqId;
  /** What the user picked, or null if they ran out of time. */
  chosenOption: 'A' | 'B' | 'C' | 'D' | null;
  isCorrect: boolean;
  /** Milliseconds from question shown to answer submitted. */
  durationMs: number;
  /** The session this attempt belongs to (e.g. daily_mcq, mock_test, practice). */
  sessionKind: 'daily_mcq' | 'mock_test' | 'practice';
  /** If part of a daily MCQ session, which day-of-streak this counts toward. */
  streakDay: number | null;
  createdAt: ISODateTime;
}

/** A timed mock test made of pre-selected MCQs. */
export interface MockTest {
  id: MockTestId;
  exam: ExamSlug;
  name: string;
  /** MCQ ids in order. */
  mcqs: McqId[];
  durationMinutes: number;
  /** Credits charged when a user starts the test. */
  costCredits: number;
  isPublished: boolean;
  createdAt: ISODateTime;
}
