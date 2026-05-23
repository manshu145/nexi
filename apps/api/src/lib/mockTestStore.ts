import type { Firestore } from 'firebase-admin/firestore';
import {
  asISODateTime,
  type ExamSlug,
  type ISODateTime,
  type MockTest,
  type MockTestId,
  type MockTestSession,
  type UserId,
} from '@nexigrate/shared';
import { SEED_MOCK_TESTS } from '../data/seed-mock-tests.js';

/**
 * Mock-test persistence.
 *
 * Two collections of concern:
 *   - `mock_tests/{id}`         catalogue, slowly-changing, populated from
 *                                seed-mock-tests.ts on first read fallback.
 *   - `mock_test_sessions/{id}` per-user attempts. Idempotent on
 *                                {userId, mockTestId, IST day} so a user
 *                                cannot start the same test twice on the
 *                                same day without paying again.
 */

export interface MockTestStore {
  list(exam: ExamSlug): Promise<MockTest[]>;
  get(id: MockTestId): Promise<MockTest | null>;
}

export interface MockTestSessionStore {
  /** Get an existing session for (userId, mockTestId, day) or null. */
  getActive(userId: UserId, mockTestId: MockTestId, day: string): Promise<MockTestSession | null>;
  put(session: MockTestSession): Promise<void>;
  /**
   * Atomically transition status to 'submitted' with the given grading
   * fields. No-op if already submitted.
   */
  submit(
    sessionId: string,
    score: number,
    total: number,
    answers: Record<string, 'A' | 'B' | 'C' | 'D' | null>,
    submittedAt: ISODateTime,
  ): Promise<MockTestSession | null>;
  get(sessionId: string): Promise<MockTestSession | null>;
}

const TESTS_COLLECTION = 'mock_tests';
const SESSIONS_COLLECTION = 'mock_test_sessions';

// ---------------- in-memory ------------------------------------------------

export class InMemoryMockTestStore implements MockTestStore {
  async list(exam: ExamSlug): Promise<MockTest[]> {
    return SEED_MOCK_TESTS.filter((t) => t.exam === exam && t.isPublished);
  }
  async get(id: MockTestId): Promise<MockTest | null> {
    return SEED_MOCK_TESTS.find((t) => t.id === id) ?? null;
  }
}

export class InMemoryMockTestSessionStore implements MockTestSessionStore {
  private byId = new Map<string, MockTestSession>();

  async getActive(
    userId: UserId,
    mockTestId: MockTestId,
    day: string,
  ): Promise<MockTestSession | null> {
    const id = `mts:${userId}:${mockTestId}:${day}`;
    return this.byId.get(id) ?? null;
  }

  async put(session: MockTestSession): Promise<void> {
    this.byId.set(session.id, session);
  }

  async submit(
    sessionId: string,
    score: number,
    total: number,
    answers: Record<string, 'A' | 'B' | 'C' | 'D' | null>,
    submittedAt: ISODateTime,
  ): Promise<MockTestSession | null> {
    const cur = this.byId.get(sessionId);
    if (!cur) return null;
    if (cur.status === 'submitted') return cur;
    const updated: MockTestSession = {
      ...cur,
      score,
      total,
      answers,
      submittedAt,
      status: 'submitted',
    };
    this.byId.set(sessionId, updated);
    return updated;
  }

  async get(sessionId: string): Promise<MockTestSession | null> {
    return this.byId.get(sessionId) ?? null;
  }
}

// ---------------- firestore ------------------------------------------------

export class FirestoreMockTestStore implements MockTestStore {
  constructor(
    private readonly db: Firestore,
    private readonly fallback: MockTestStore = new InMemoryMockTestStore(),
  ) {}

  async list(exam: ExamSlug): Promise<MockTest[]> {
    const snap = await this.db
      .collection(TESTS_COLLECTION)
      .where('exam', '==', exam)
      .where('isPublished', '==', true)
      .limit(100)
      .get();
    if (snap.empty) {
      return this.fallback.list(exam);
    }
    return snap.docs.map((d) => d.data() as MockTest);
  }

  async get(id: MockTestId): Promise<MockTest | null> {
    const snap = await this.db.collection(TESTS_COLLECTION).doc(id).get();
    if (!snap.exists) return this.fallback.get(id);
    return snap.data() as MockTest;
  }
}

export class FirestoreMockTestSessionStore implements MockTestSessionStore {
  constructor(private readonly db: Firestore) {}

  async getActive(
    userId: UserId,
    mockTestId: MockTestId,
    day: string,
  ): Promise<MockTestSession | null> {
    const id = `mts:${userId}:${mockTestId}:${day}`;
    const snap = await this.db.collection(SESSIONS_COLLECTION).doc(id).get();
    return snap.exists ? (snap.data() as MockTestSession) : null;
  }

  async put(session: MockTestSession): Promise<void> {
    await this.db.collection(SESSIONS_COLLECTION).doc(session.id).set(session);
  }

  async submit(
    sessionId: string,
    score: number,
    total: number,
    answers: Record<string, 'A' | 'B' | 'C' | 'D' | null>,
    submittedAt: ISODateTime,
  ): Promise<MockTestSession | null> {
    const ref = this.db.collection(SESSIONS_COLLECTION).doc(sessionId);
    return this.db.runTransaction(async (tx) => {
      const snap = await tx.get(ref);
      if (!snap.exists) return null;
      const cur = snap.data() as MockTestSession;
      if (cur.status === 'submitted') return cur;
      const updated: MockTestSession = {
        ...cur,
        score,
        total,
        answers,
        submittedAt,
        status: 'submitted',
      };
      tx.set(ref, updated);
      return updated;
    });
  }

  async get(sessionId: string): Promise<MockTestSession | null> {
    const snap = await this.db.collection(SESSIONS_COLLECTION).doc(sessionId).get();
    return snap.exists ? (snap.data() as MockTestSession) : null;
  }
}

/** Helper used by the routes (re-exported for tests). */
export function istDayKey(now: ISODateTime): string {
  const t = new Date(now).getTime() + 5.5 * 60 * 60 * 1000;
  const d = new Date(t);
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(
    d.getUTCDate(),
  ).padStart(2, '0')}`;
}

export function _unused_to_silence_iso(_x: ISODateTime): void {
  return;
}
