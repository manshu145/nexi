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

/**
 * A draft MCQ produced by the 3-AI generation pipeline awaiting SME review.
 *
 * Lifecycle:
 *   1. Generator model emits a draft  (status: 'pending')
 *   2. Two verifier models score it   (status: 'pending', verifiers populated)
 *   3. SME approves or rejects        (status: 'approved' | 'rejected')
 *   4. On approve, the corresponding MCQ is published into `mcqs`.
 */
export type McqDraftStatus = 'pending' | 'approved' | 'rejected';

export interface McqDraft {
  id: McqId;
  exam: ExamSlug;
  subject: SubjectId;
  chapter: ChapterId;
  question: string;
  options: { key: 'A' | 'B' | 'C' | 'D'; text: string }[];
  correctOption: 'A' | 'B' | 'C' | 'D';
  explanation: string;
  difficulty: McqDifficulty;
  source: string;
  /** Verifier scores from the second + third LLM passes. */
  verifiers: McqVerifierScore[];
  /** Combined verification score in [0, 1]. >= 0.66 = both verifiers agree. */
  verificationScore: number;
  /** Which model originally generated the draft. */
  generatedBy: string;
  status: McqDraftStatus;
  /** Filled when status moves out of 'pending'. */
  reviewedBy: string | null;
  reviewedAt: ISODateTime | null;
  /** Free-form rejection reason supplied by the SME. */
  rejectionReason: string | null;
  createdAt: ISODateTime;
  updatedAt: ISODateTime;
}

/**
 * A user's session of a timed mock test.
 *
 * Created when the user clicks "Start" -- credits are charged immediately.
 * Closed when the user either submits or runs out of time. Idempotent on
 * (userId, mockTestId, day) so a user cannot start the same mock twice on
 * the same day without paying again, but they can retry tomorrow.
 */
export type MockTestSessionStatus = 'in_progress' | 'submitted' | 'expired';

export interface MockTestSession {
  /** `mts:${userId}:${mockTestId}:${YYYY-MM-DD-IST}`. */
  id: string;
  userId: UserId;
  mockTest: MockTestId;
  startedAt: ISODateTime;
  /** Server-computed deadline = startedAt + mockTest.durationMinutes. */
  expiresAt: ISODateTime;
  submittedAt: ISODateTime | null;
  status: MockTestSessionStatus;
  /** Score after submit. -1 while in_progress. */
  score: number;
  total: number;
  /** Answers indexed by mcq id, populated on submit. */
  answers: Record<string, 'A' | 'B' | 'C' | 'D' | null>;
  /** Credits spent to start. */
  costCredits: number;
  createdAt: ISODateTime;
}

/**
 * Streak-milestone badge awarded for hitting a sustained daily streak.
 *
 * Pure data: the engine in shared/credits awards a credit bonus and the
 * badge value gets pushed onto `User.streakBadges` so the UI can light up
 * a trophy without re-deriving the milestone every render.
 */
export type StreakBadgeKind = 'streak_3' | 'streak_7' | 'streak_30' | 'streak_100' | 'streak_365';

export interface StreakBadge {
  kind: StreakBadgeKind;
  /** Streak value at the moment the badge was earned. */
  streak: number;
  /** Bonus credits awarded with this badge. */
  bonusCredits: number;
  earnedAt: ISODateTime;
}
