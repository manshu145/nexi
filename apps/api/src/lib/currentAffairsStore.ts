import type { Firestore } from 'firebase-admin/firestore';
import {
  asISODateTime,
  type CurrentAffairsDigest,
  type CurrentAffairsDigestDraft,
  type CurrentAffairsDigestId,
  type CurrentAffairsDigestStatus,
  type CurrentAffairsItem,
} from '@nexigrate/shared';

/**
 * Persistence for Phase 19 -- Current affairs daily digests + drafts.
 *
 * Two collections:
 *   - current_affairs_drafts/{id}        admin-pending drafts (id == ca_<date>)
 *   - current_affairs_digests/{id}       published digests (same id)
 *
 * Doc id is `ca_<YYYY-MM-DD>` so re-approval is naturally idempotent.
 */

// ---------- drafts ----------------------------------------------------------

export interface ListCurrentAffairsDraftsOptions {
  status?: CurrentAffairsDigestStatus;
  limit?: number;
}

export interface CurrentAffairsDraftStore {
  put(draft: CurrentAffairsDigestDraft): Promise<void>;
  get(id: CurrentAffairsDigestId): Promise<CurrentAffairsDigestDraft | null>;
  list(opts: ListCurrentAffairsDraftsOptions): Promise<CurrentAffairsDigestDraft[]>;
  review(
    id: CurrentAffairsDigestId,
    status: 'approved' | 'rejected',
    reviewedBy: string,
    rejectionReason?: string,
  ): Promise<CurrentAffairsDigestDraft | null>;
  updateBody(
    id: CurrentAffairsDigestId,
    edits: Partial<Pick<CurrentAffairsDigestDraft, 'summary' | 'items'>>,
    editedBy: string,
  ): Promise<CurrentAffairsDigestDraft | null>;
}

const DRAFTS_COLLECTION = 'current_affairs_drafts';

export class InMemoryCurrentAffairsDraftStore implements CurrentAffairsDraftStore {
  private map = new Map<CurrentAffairsDigestId, CurrentAffairsDigestDraft>();

  async put(d: CurrentAffairsDigestDraft): Promise<void> {
    this.map.set(d.id, d);
  }

  async get(id: CurrentAffairsDigestId): Promise<CurrentAffairsDigestDraft | null> {
    return this.map.get(id) ?? null;
  }

  async list(opts: ListCurrentAffairsDraftsOptions): Promise<CurrentAffairsDigestDraft[]> {
    const limit = Math.min(opts.limit ?? 50, 200);
    const all = Array.from(this.map.values());
    const filtered = all.filter((d) => !opts.status || d.status === opts.status);
    filtered.sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
    return filtered.slice(0, limit);
  }

  async review(
    id: CurrentAffairsDigestId,
    status: 'approved' | 'rejected',
    reviewedBy: string,
    rejectionReason?: string,
  ): Promise<CurrentAffairsDigestDraft | null> {
    const cur = this.map.get(id);
    if (!cur) return null;
    if (cur.status === status) return cur;
    const now = asISODateTime(new Date().toISOString());
    const updated: CurrentAffairsDigestDraft = {
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

  async updateBody(
    id: CurrentAffairsDigestId,
    edits: Partial<Pick<CurrentAffairsDigestDraft, 'summary' | 'items'>>,
    _editedBy: string,
  ): Promise<CurrentAffairsDigestDraft | null> {
    const cur = this.map.get(id);
    if (!cur) return null;
    if (cur.status !== 'pending') return cur;
    const now = asISODateTime(new Date().toISOString());
    const updated: CurrentAffairsDigestDraft = {
      ...cur,
      ...(edits.summary !== undefined ? { summary: edits.summary } : {}),
      ...(edits.items !== undefined ? { items: edits.items as CurrentAffairsItem[] } : {}),
      updatedAt: now,
    };
    this.map.set(id, updated);
    return updated;
  }
}

export class FirestoreCurrentAffairsDraftStore implements CurrentAffairsDraftStore {
  constructor(private readonly db: Firestore) {}

  async put(d: CurrentAffairsDigestDraft): Promise<void> {
    await this.db.collection(DRAFTS_COLLECTION).doc(d.id).set(d);
  }

  async get(id: CurrentAffairsDigestId): Promise<CurrentAffairsDigestDraft | null> {
    const snap = await this.db.collection(DRAFTS_COLLECTION).doc(id).get();
    return snap.exists ? (snap.data() as CurrentAffairsDigestDraft) : null;
  }

  async list(opts: ListCurrentAffairsDraftsOptions): Promise<CurrentAffairsDigestDraft[]> {
    const limit = Math.min(opts.limit ?? 50, 200);
    let q = this.db
      .collection(DRAFTS_COLLECTION)
      .orderBy('createdAt', 'desc')
      .limit(limit);
    if (opts.status) q = q.where('status', '==', opts.status);
    const snap = await q.get();
    return snap.docs.map((d) => d.data() as CurrentAffairsDigestDraft);
  }

  async review(
    id: CurrentAffairsDigestId,
    status: 'approved' | 'rejected',
    reviewedBy: string,
    rejectionReason?: string,
  ): Promise<CurrentAffairsDigestDraft | null> {
    const ref = this.db.collection(DRAFTS_COLLECTION).doc(id);
    return this.db.runTransaction(async (tx) => {
      const snap = await tx.get(ref);
      if (!snap.exists) return null;
      const cur = snap.data() as CurrentAffairsDigestDraft;
      if (cur.status === status) return cur;
      const now = asISODateTime(new Date().toISOString());
      const updated: CurrentAffairsDigestDraft = {
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

  async updateBody(
    id: CurrentAffairsDigestId,
    edits: Partial<Pick<CurrentAffairsDigestDraft, 'summary' | 'items'>>,
    _editedBy: string,
  ): Promise<CurrentAffairsDigestDraft | null> {
    const ref = this.db.collection(DRAFTS_COLLECTION).doc(id);
    return this.db.runTransaction(async (tx) => {
      const snap = await tx.get(ref);
      if (!snap.exists) return null;
      const cur = snap.data() as CurrentAffairsDigestDraft;
      if (cur.status !== 'pending') return cur;
      const now = asISODateTime(new Date().toISOString());
      const updated: CurrentAffairsDigestDraft = {
        ...cur,
        ...(edits.summary !== undefined ? { summary: edits.summary } : {}),
        ...(edits.items !== undefined ? { items: edits.items as CurrentAffairsItem[] } : {}),
        updatedAt: now,
      };
      tx.set(ref, updated);
      return updated;
    });
  }
}

// ---------- published digests ----------------------------------------------

export interface ListCurrentAffairsDigestsOptions {
  publishedOnly?: boolean;
  limit?: number;
}

export interface CurrentAffairsDigestStore {
  put(d: CurrentAffairsDigest): Promise<void>;
  get(id: CurrentAffairsDigestId): Promise<CurrentAffairsDigest | null>;
  getByDate(date: string): Promise<CurrentAffairsDigest | null>;
  /** Latest published digest, used by /today. */
  getLatest(): Promise<CurrentAffairsDigest | null>;
  list(opts: ListCurrentAffairsDigestsOptions): Promise<CurrentAffairsDigest[]>;
}

const DIGESTS_COLLECTION = 'current_affairs_digests';

export class InMemoryCurrentAffairsDigestStore implements CurrentAffairsDigestStore {
  private map = new Map<CurrentAffairsDigestId, CurrentAffairsDigest>();

  async put(d: CurrentAffairsDigest): Promise<void> {
    this.map.set(d.id, d);
  }

  async get(id: CurrentAffairsDigestId): Promise<CurrentAffairsDigest | null> {
    return this.map.get(id) ?? null;
  }

  async getByDate(date: string): Promise<CurrentAffairsDigest | null> {
    for (const d of this.map.values()) if (d.date === date && d.isPublished) return d;
    return null;
  }

  async getLatest(): Promise<CurrentAffairsDigest | null> {
    let latest: CurrentAffairsDigest | null = null;
    for (const d of this.map.values()) {
      if (!d.isPublished) continue;
      if (!latest || d.date > latest.date) latest = d;
    }
    return latest;
  }

  async list(opts: ListCurrentAffairsDigestsOptions): Promise<CurrentAffairsDigest[]> {
    const limit = Math.min(opts.limit ?? 60, 365);
    const publishedOnly = opts.publishedOnly !== false;
    const all = Array.from(this.map.values()).filter((d) =>
      publishedOnly ? d.isPublished : true,
    );
    all.sort((a, b) => (a.date < b.date ? 1 : -1));
    return all.slice(0, limit);
  }
}

export class FirestoreCurrentAffairsDigestStore implements CurrentAffairsDigestStore {
  constructor(private readonly db: Firestore) {}

  async put(d: CurrentAffairsDigest): Promise<void> {
    await this.db.collection(DIGESTS_COLLECTION).doc(d.id).set(d);
  }

  async get(id: CurrentAffairsDigestId): Promise<CurrentAffairsDigest | null> {
    const snap = await this.db.collection(DIGESTS_COLLECTION).doc(id).get();
    return snap.exists ? (snap.data() as CurrentAffairsDigest) : null;
  }

  async getByDate(date: string): Promise<CurrentAffairsDigest | null> {
    const snap = await this.db
      .collection(DIGESTS_COLLECTION)
      .where('date', '==', date)
      .where('isPublished', '==', true)
      .limit(1)
      .get();
    return snap.empty ? null : (snap.docs[0]!.data() as CurrentAffairsDigest);
  }

  async getLatest(): Promise<CurrentAffairsDigest | null> {
    const snap = await this.db
      .collection(DIGESTS_COLLECTION)
      .where('isPublished', '==', true)
      .orderBy('date', 'desc')
      .limit(1)
      .get();
    return snap.empty ? null : (snap.docs[0]!.data() as CurrentAffairsDigest);
  }

  async list(opts: ListCurrentAffairsDigestsOptions): Promise<CurrentAffairsDigest[]> {
    const limit = Math.min(opts.limit ?? 60, 365);
    const publishedOnly = opts.publishedOnly !== false;
    let q = this.db
      .collection(DIGESTS_COLLECTION)
      .orderBy('date', 'desc')
      .limit(limit);
    if (publishedOnly) q = q.where('isPublished', '==', true);
    const snap = await q.get();
    return snap.docs.map((d) => d.data() as CurrentAffairsDigest);
  }
}
