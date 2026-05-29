/**
 * Mock test attempt persistence (lock §5.5).
 *
 * Closes the founder's lock-§5.5 promise: "isko bna de pura functional
 * akdum reality se bnana". Each mock test attempt is a single Firestore
 * document containing the AI-generated question set, the user's
 * in-progress answers, and the final scoring once submitted. Attempts
 * are user-scoped (we never share an attempt across users) so the doc
 * id is unique per attempt and queries always filter on userId.
 *
 * Why a dedicated store rather than reusing `chatSessions` or
 * `studyProgress`:
 *   - Mock tests have a strict timer + non-resumable submit flow that's
 *     materially different from the open-ended study flow. Mixing them
 *     leads to UI ambiguity ("is this an active test or a study session?").
 *   - The schema needs to evolve independently (per-subject breakdown,
 *     leaderboard tags later, etc.) without colliding with study or
 *     chat semantics.
 *   - We want to run analytics queries like "completion rate by exam"
 *     without pre-filtering chatSessions.
 *
 * Stored in Firestore at `mockTestAttempts/{attemptId}` with a userId
 * field for the right-to-erasure walk in lib/userData.ts (PR-20).
 */

import type { Firestore } from 'firebase-admin/firestore';
import type { ExamSlug, ISODateTime, UserId } from '@nexigrate/shared';
import type { GeneratedMCQ } from './aiEngine.js';

export type MockTestStatus = 'in_progress' | 'submitted' | 'expired';

export interface MockTestAttempt {
  id: string;
  userId: UserId;
  examSlug: ExamSlug;
  language: 'en' | 'hi';
  questions: GeneratedMCQ[];
  /** User's answers, keyed by questionId. Updated on submit (we don't autosave intermediate state in MVP). */
  answers: Record<string, 'A' | 'B' | 'C' | 'D' | null>;
  status: MockTestStatus;
  /** When the user clicked Start. Server-side timestamp; the duration is enforced against this. */
  startedAt: ISODateTime;
  /** Total minutes the user has from `startedAt` to submit. */
  durationMinutes: number;
  /** Optional submission timestamp -- only set when status flips to 'submitted'. */
  submittedAt: ISODateTime | null;
  /** Final score -- only populated after submission. */
  score: number | null;
  /** Total questions in the attempt. */
  total: number;
  /** Percentage 0-100 -- only populated after submission. */
  percentage: number | null;
  /** Per-subject correct / total -- only populated after submission. Useful for "weak areas" UI. */
  subjectBreakdown: Record<string, { correct: number; total: number }> | null;
  /** Credits charged for starting this attempt. Stored for audit / refund. */
  creditCost: number;
}

export interface MockTestStore {
  create(attempt: MockTestAttempt): Promise<void>;
  get(id: string): Promise<MockTestAttempt | null>;
  /** Update only the changed fields. Returns the updated attempt. */
  update(id: string, patch: Partial<Omit<MockTestAttempt, 'id' | 'userId' | 'examSlug'>>): Promise<MockTestAttempt>;
  /** List the user's attempts, newest first. Capped at 50 to keep the response cheap. */
  listByUser(userId: UserId, limit?: number): Promise<MockTestAttempt[]>;
}

// ─── Firestore implementation ─────────────────────────────────────────────

const COLLECTION = 'mockTestAttempts';

export class FirestoreMockTestStore implements MockTestStore {
  constructor(private readonly db: Firestore) {}

  async create(attempt: MockTestAttempt): Promise<void> {
    await this.db.collection(COLLECTION).doc(attempt.id).set(attempt);
  }

  async get(id: string): Promise<MockTestAttempt | null> {
    const snap = await this.db.collection(COLLECTION).doc(id).get();
    return snap.exists ? (snap.data() as MockTestAttempt) : null;
  }

  async update(id: string, patch: Partial<MockTestAttempt>): Promise<MockTestAttempt> {
    const ref = this.db.collection(COLLECTION).doc(id);
    await ref.update(patch);
    const snap = await ref.get();
    if (!snap.exists) throw new Error(`mock test attempt ${id} disappeared during update`);
    return snap.data() as MockTestAttempt;
  }

  async listByUser(userId: UserId, limit = 20): Promise<MockTestAttempt[]> {
    // No orderBy here -- pairing where('userId') with orderBy('startedAt')
    // requires a composite index, and we hit this exact pitfall in PR-03
    // (hotfix #182). In-memory sort is cheap because we cap at 50 docs
    // per user.
    const snap = await this.db.collection(COLLECTION).where('userId', '==', userId).limit(50).get();
    const all = snap.docs.map(d => d.data() as MockTestAttempt);
    all.sort((a, b) => b.startedAt.localeCompare(a.startedAt));
    return all.slice(0, limit);
  }
}

// ─── In-memory implementation (tests + local dev) ─────────────────────────

export class InMemoryMockTestStore implements MockTestStore {
  private readonly attempts = new Map<string, MockTestAttempt>();

  async create(attempt: MockTestAttempt): Promise<void> {
    this.attempts.set(attempt.id, { ...attempt });
  }

  async get(id: string): Promise<MockTestAttempt | null> {
    const a = this.attempts.get(id);
    return a ? { ...a } : null;
  }

  async update(id: string, patch: Partial<MockTestAttempt>): Promise<MockTestAttempt> {
    const a = this.attempts.get(id);
    if (!a) throw new Error(`mock test attempt ${id} not found`);
    const next = { ...a, ...patch };
    this.attempts.set(id, next);
    return next;
  }

  async listByUser(userId: UserId, limit = 20): Promise<MockTestAttempt[]> {
    const all = Array.from(this.attempts.values()).filter(a => a.userId === userId);
    all.sort((a, b) => b.startedAt.localeCompare(a.startedAt));
    return all.slice(0, limit);
  }
}
