import type { Firestore } from 'firebase-admin/firestore';
import {
  asISODateTime,
  type ExamSlug,
  type McqDraft,
  type McqDraftStatus,
  type McqId,
} from '@nexigrate/shared';

/**
 * Persistence for AI-generated MCQ drafts awaiting SME review.
 *
 * Two implementations behind one interface, mirroring the rest of the API:
 *   - InMemoryMcqDraftStore: useful in tests and single-instance dev
 *   - FirestoreMcqDraftStore: backed by `mcq_drafts/{draftId}`
 *
 * Drafts are immutable except for the review fields (status, reviewedBy,
 * reviewedAt, rejectionReason, updatedAt) and `verifiers` re-runs. The
 * SME never edits a draft in place; on a fix, they reject + ask for a
 * fresh generation.
 */
export interface ListDraftsOptions {
  status?: McqDraftStatus;
  exam?: ExamSlug;
  /** Maximum number of drafts to return. Default 50, hard cap 200. */
  limit?: number;
}

export interface McqDraftStore {
  put(draft: McqDraft): Promise<void>;
  get(id: McqId): Promise<McqDraft | null>;
  list(opts: ListDraftsOptions): Promise<McqDraft[]>;
  /**
   * Move a draft to `approved` or `rejected`. Returns the updated draft.
   * Idempotent: re-applying the same status is a no-op (same updatedAt).
   */
  review(
    id: McqId,
    status: 'approved' | 'rejected',
    reviewedBy: string,
    rejectionReason?: string,
  ): Promise<McqDraft | null>;
}

const COLLECTION = 'mcq_drafts';

export class InMemoryMcqDraftStore implements McqDraftStore {
  private map = new Map<McqId, McqDraft>();

  async put(draft: McqDraft): Promise<void> {
    this.map.set(draft.id, draft);
  }

  async get(id: McqId): Promise<McqDraft | null> {
    return this.map.get(id) ?? null;
  }

  async list(opts: ListDraftsOptions): Promise<McqDraft[]> {
    const limit = Math.min(opts.limit ?? 50, 200);
    const all = Array.from(this.map.values());
    const filtered = all.filter((d) => {
      if (opts.status && d.status !== opts.status) return false;
      if (opts.exam && d.exam !== opts.exam) return false;
      return true;
    });
    // Newest pending drafts first (highest signal for the SME queue).
    filtered.sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
    return filtered.slice(0, limit);
  }

  async review(
    id: McqId,
    status: 'approved' | 'rejected',
    reviewedBy: string,
    rejectionReason?: string,
  ): Promise<McqDraft | null> {
    const cur = this.map.get(id);
    if (!cur) return null;
    if (cur.status === status) return cur; // idempotent
    const now = asISODateTime(new Date().toISOString());
    const updated: McqDraft = {
      ...cur,
      status,
      reviewedBy,
      reviewedAt: now,
      rejectionReason: status === 'rejected' ? rejectionReason ?? null : null,
      updatedAt: now,
    };
    this.map.set(id, updated);
    return updated;
  }
}

export class FirestoreMcqDraftStore implements McqDraftStore {
  constructor(private readonly db: Firestore) {}

  async put(draft: McqDraft): Promise<void> {
    await this.db.collection(COLLECTION).doc(draft.id).set(draft);
  }

  async get(id: McqId): Promise<McqDraft | null> {
    const snap = await this.db.collection(COLLECTION).doc(id).get();
    return snap.exists ? (snap.data() as McqDraft) : null;
  }

  async list(opts: ListDraftsOptions): Promise<McqDraft[]> {
    const limit = Math.min(opts.limit ?? 50, 200);
    let q = this.db.collection(COLLECTION).orderBy('createdAt', 'desc').limit(limit);
    if (opts.status) q = q.where('status', '==', opts.status);
    if (opts.exam) q = q.where('exam', '==', opts.exam);
    const snap = await q.get();
    return snap.docs.map((d) => d.data() as McqDraft);
  }

  async review(
    id: McqId,
    status: 'approved' | 'rejected',
    reviewedBy: string,
    rejectionReason?: string,
  ): Promise<McqDraft | null> {
    const ref = this.db.collection(COLLECTION).doc(id);
    return this.db.runTransaction(async (tx) => {
      const snap = await tx.get(ref);
      if (!snap.exists) return null;
      const cur = snap.data() as McqDraft;
      if (cur.status === status) return cur;
      const now = asISODateTime(new Date().toISOString());
      const updated: McqDraft = {
        ...cur,
        status,
        reviewedBy,
        reviewedAt: now,
        rejectionReason: status === 'rejected' ? rejectionReason ?? null : null,
        updatedAt: now,
      };
      tx.set(ref, updated);
      return updated;
    });
  }
}
