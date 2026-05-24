import type { Firestore } from 'firebase-admin/firestore';
import type { ExamSlug, ISODateTime, McqAttemptRow, UserId } from '@nexigrate/shared';

/**
 * Per-MCQ-attempt persistence used by Phase 12 progress aggregation.
 *
 *   collection 'mcq_attempts'
 *   docId      = `${sessionId}:${mcqId}` (idempotent on session resubmit)
 *
 * Two implementations behind a single interface:
 *   - InMemory: tests + dev. Filterable like a tiny in-process index.
 *   - Firestore: production. Composite index on (userId, attemptedAt) is
 *     declared in firestore.indexes.json so the trend query is cheap.
 *
 * The store is APPEND-only from the API's perspective: if the same
 * (sessionId, mcqId) is written twice the second write replaces the
 * first (idempotent on session resubmit, e.g. retry on 502). We never
 * delete, never mutate -- the answer history is the audit trail.
 */
export interface ListAttemptsOptions {
  userId: UserId;
  exam?: ExamSlug;
  /** Inclusive lower bound. Used by the 30-day trend computation. */
  sinceIsoDate?: string;
  /** Hard cap; protects the API from a runaway power-user. */
  limit?: number;
}

export interface McqAttemptStore {
  putBatch(attempts: ReadonlyArray<McqAttemptRow>): Promise<void>;
  list(opts: ListAttemptsOptions): Promise<McqAttemptRow[]>;
}

const COLLECTION = 'mcq_attempts';

export class InMemoryMcqAttemptStore implements McqAttemptStore {
  private map = new Map<string, McqAttemptRow>();

  async putBatch(attempts: ReadonlyArray<McqAttemptRow>): Promise<void> {
    for (const a of attempts) this.map.set(a.id, a);
  }

  async list(opts: ListAttemptsOptions): Promise<McqAttemptRow[]> {
    const limit = Math.min(opts.limit ?? 5000, 10000);
    const since = opts.sinceIsoDate ? new Date(opts.sinceIsoDate).getTime() : 0;
    const out: McqAttemptRow[] = [];
    for (const a of this.map.values()) {
      if (a.userId !== opts.userId) continue;
      if (opts.exam && a.exam !== opts.exam) continue;
      if (since > 0 && new Date(a.attemptedAt).getTime() < since) continue;
      out.push(a);
    }
    out.sort((a, b) => (a.attemptedAt < b.attemptedAt ? 1 : -1));
    return out.slice(0, limit);
  }
}

export class FirestoreMcqAttemptStore implements McqAttemptStore {
  constructor(private readonly db: Firestore) {}

  async putBatch(attempts: ReadonlyArray<McqAttemptRow>): Promise<void> {
    if (attempts.length === 0) return;
    // Firestore caps a write batch at 500 operations.
    for (let i = 0; i < attempts.length; i += 400) {
      const slice = attempts.slice(i, i + 400);
      const batch = this.db.batch();
      for (const a of slice) {
        batch.set(this.db.collection(COLLECTION).doc(a.id), a);
      }
      await batch.commit();
    }
  }

  async list(opts: ListAttemptsOptions): Promise<McqAttemptRow[]> {
    const limit = Math.min(opts.limit ?? 2000, 5000);
    let q = this.db
      .collection(COLLECTION)
      .where('userId', '==', opts.userId)
      .orderBy('attemptedAt', 'desc')
      .limit(limit);
    if (opts.exam) q = q.where('exam', '==', opts.exam);
    if (opts.sinceIsoDate) {
      q = q.where('attemptedAt', '>=', opts.sinceIsoDate as ISODateTime);
    }
    const snap = await q.get();
    return snap.docs.map((d) => d.data() as McqAttemptRow);
  }
}
