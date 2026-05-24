import type { Firestore } from 'firebase-admin/firestore';
import {
  asISODateTime,
  type Chapter,
  type ChapterDraft,
  type ChapterDraftStatus,
  type ChapterId,
  type ChapterSection,
  type ExamSlug,
} from '@nexigrate/shared';

/**
 * Persistence for AI-generated chapter drafts awaiting SME review.
 *
 * Same architectural pattern as McqDraftStore. Two implementations behind
 * one interface:
 *   - InMemoryChapterDraftStore: tests + single-instance dev
 *   - FirestoreChapterDraftStore: backed by `chapter_drafts/{draftId}`
 *
 * Drafts are mostly immutable. Two mutations are allowed:
 *   1. review()      -> approved/rejected (sets reviewedBy, reviewedAt)
 *   2. updateBody()  -> light edits to title/summary/sections by an admin
 *                       BEFORE approval. Used when the AI got 95% right
 *                       and the admin just wants to tweak wording.
 */
export interface ListChapterDraftsOptions {
  status?: ChapterDraftStatus;
  exam?: ExamSlug;
  subject?: string;
  /** Maximum number of drafts to return. Default 50, hard cap 200. */
  limit?: number;
}

export interface ChapterDraftStore {
  put(draft: ChapterDraft): Promise<void>;
  get(id: ChapterId): Promise<ChapterDraft | null>;
  list(opts: ListChapterDraftsOptions): Promise<ChapterDraft[]>;
  review(
    id: ChapterId,
    status: 'approved' | 'rejected',
    reviewedBy: string,
    rejectionReason?: string,
  ): Promise<ChapterDraft | null>;
  updateBody(
    id: ChapterId,
    edits: Partial<Pick<ChapterDraft, 'title' | 'summary' | 'sections' | 'source'>>,
    editedBy: string,
  ): Promise<ChapterDraft | null>;
}

const COLLECTION = 'chapter_drafts';

export class InMemoryChapterDraftStore implements ChapterDraftStore {
  private map = new Map<ChapterId, ChapterDraft>();

  async put(draft: ChapterDraft): Promise<void> {
    this.map.set(draft.id, draft);
  }

  async get(id: ChapterId): Promise<ChapterDraft | null> {
    return this.map.get(id) ?? null;
  }

  async list(opts: ListChapterDraftsOptions): Promise<ChapterDraft[]> {
    const limit = Math.min(opts.limit ?? 50, 200);
    const all = Array.from(this.map.values());
    const filtered = all.filter((d) => {
      if (opts.status && d.status !== opts.status) return false;
      if (opts.exam && d.exam !== opts.exam) return false;
      if (opts.subject && d.subject !== opts.subject) return false;
      return true;
    });
    filtered.sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
    return filtered.slice(0, limit);
  }

  async review(
    id: ChapterId,
    status: 'approved' | 'rejected',
    reviewedBy: string,
    rejectionReason?: string,
  ): Promise<ChapterDraft | null> {
    const cur = this.map.get(id);
    if (!cur) return null;
    if (cur.status === status) return cur;
    const now = asISODateTime(new Date().toISOString());
    const updated: ChapterDraft = {
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
    id: ChapterId,
    edits: Partial<Pick<ChapterDraft, 'title' | 'summary' | 'sections' | 'source'>>,
    _editedBy: string,
  ): Promise<ChapterDraft | null> {
    const cur = this.map.get(id);
    if (!cur) return null;
    if (cur.status !== 'pending') return cur; // edits only allowed pre-approval
    const now = asISODateTime(new Date().toISOString());
    const updated: ChapterDraft = {
      ...cur,
      ...(edits.title !== undefined ? { title: edits.title } : {}),
      ...(edits.summary !== undefined ? { summary: edits.summary } : {}),
      ...(edits.sections !== undefined ? { sections: edits.sections } : {}),
      ...(edits.source !== undefined ? { source: edits.source } : {}),
      updatedAt: now,
    };
    this.map.set(id, updated);
    return updated;
  }
}

export class FirestoreChapterDraftStore implements ChapterDraftStore {
  constructor(private readonly db: Firestore) {}

  async put(draft: ChapterDraft): Promise<void> {
    await this.db.collection(COLLECTION).doc(draft.id).set(draft);
  }

  async get(id: ChapterId): Promise<ChapterDraft | null> {
    const snap = await this.db.collection(COLLECTION).doc(id).get();
    return snap.exists ? (snap.data() as ChapterDraft) : null;
  }

  async list(opts: ListChapterDraftsOptions): Promise<ChapterDraft[]> {
    const limit = Math.min(opts.limit ?? 50, 200);
    let q = this.db.collection(COLLECTION).orderBy('createdAt', 'desc').limit(limit);
    if (opts.status) q = q.where('status', '==', opts.status);
    if (opts.exam) q = q.where('exam', '==', opts.exam);
    if (opts.subject) q = q.where('subject', '==', opts.subject);
    const snap = await q.get();
    return snap.docs.map((d) => d.data() as ChapterDraft);
  }

  async review(
    id: ChapterId,
    status: 'approved' | 'rejected',
    reviewedBy: string,
    rejectionReason?: string,
  ): Promise<ChapterDraft | null> {
    const ref = this.db.collection(COLLECTION).doc(id);
    return this.db.runTransaction(async (tx) => {
      const snap = await tx.get(ref);
      if (!snap.exists) return null;
      const cur = snap.data() as ChapterDraft;
      if (cur.status === status) return cur;
      const now = asISODateTime(new Date().toISOString());
      const updated: ChapterDraft = {
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
    id: ChapterId,
    edits: Partial<Pick<ChapterDraft, 'title' | 'summary' | 'sections' | 'source'>>,
    _editedBy: string,
  ): Promise<ChapterDraft | null> {
    const ref = this.db.collection(COLLECTION).doc(id);
    return this.db.runTransaction(async (tx) => {
      const snap = await tx.get(ref);
      if (!snap.exists) return null;
      const cur = snap.data() as ChapterDraft;
      if (cur.status !== 'pending') return cur;
      const now = asISODateTime(new Date().toISOString());
      const updated: ChapterDraft = {
        ...cur,
        ...(edits.title !== undefined ? { title: edits.title } : {}),
        ...(edits.summary !== undefined ? { summary: edits.summary } : {}),
        ...(edits.sections !== undefined
          ? { sections: edits.sections as ChapterSection[] }
          : {}),
        ...(edits.source !== undefined ? { source: edits.source } : {}),
        updatedAt: now,
      };
      tx.set(ref, updated);
      return updated;
    });
  }
}

/**
 * Persistence for published chapters that students read.
 *
 * Approved chapter drafts are copied into this collection when an admin
 * clicks "Approve and publish". The same id is reused so re-approval is
 * idempotent.
 */
export interface ListChaptersOptions {
  exam?: ExamSlug;
  subject?: string;
  classLevel?: string;
  /** Default true -- only publishedOnly. Set false to include unpublished. */
  publishedOnly?: boolean;
  limit?: number;
}

export interface ChapterStore {
  put(chapter: Chapter): Promise<void>;
  get(id: ChapterId): Promise<Chapter | null>;
  getBySlug(exam: ExamSlug, subject: string, slug: string): Promise<Chapter | null>;
  list(opts: ListChaptersOptions): Promise<Chapter[]>;
}

const PUBLISHED_COLLECTION = 'chapters';

export class InMemoryChapterStore implements ChapterStore {
  private map = new Map<ChapterId, Chapter>();

  async put(chapter: Chapter): Promise<void> {
    this.map.set(chapter.id, chapter);
  }

  async get(id: ChapterId): Promise<Chapter | null> {
    return this.map.get(id) ?? null;
  }

  async getBySlug(exam: ExamSlug, subject: string, slug: string): Promise<Chapter | null> {
    for (const c of this.map.values()) {
      if (c.exam === exam && c.subject === subject && c.slug === slug) return c;
    }
    return null;
  }

  async list(opts: ListChaptersOptions): Promise<Chapter[]> {
    const limit = Math.min(opts.limit ?? 100, 500);
    const publishedOnly = opts.publishedOnly !== false;
    const all = Array.from(this.map.values());
    const filtered = all.filter((c) => {
      if (publishedOnly && !c.isPublished) return false;
      if (opts.exam && c.exam !== opts.exam) return false;
      if (opts.subject && c.subject !== opts.subject) return false;
      if (opts.classLevel && c.classLevel !== opts.classLevel) return false;
      return true;
    });
    filtered.sort((a, b) => {
      if (a.subject !== b.subject) return a.subject < b.subject ? -1 : 1;
      return a.title < b.title ? -1 : 1;
    });
    return filtered.slice(0, limit);
  }
}

export class FirestoreChapterStore implements ChapterStore {
  constructor(private readonly db: Firestore) {}

  async put(chapter: Chapter): Promise<void> {
    await this.db.collection(PUBLISHED_COLLECTION).doc(chapter.id).set(chapter);
  }

  async get(id: ChapterId): Promise<Chapter | null> {
    const snap = await this.db.collection(PUBLISHED_COLLECTION).doc(id).get();
    return snap.exists ? (snap.data() as Chapter) : null;
  }

  async getBySlug(exam: ExamSlug, subject: string, slug: string): Promise<Chapter | null> {
    const snap = await this.db
      .collection(PUBLISHED_COLLECTION)
      .where('exam', '==', exam)
      .where('subject', '==', subject)
      .where('slug', '==', slug)
      .limit(1)
      .get();
    return snap.empty ? null : (snap.docs[0]!.data() as Chapter);
  }

  async list(opts: ListChaptersOptions): Promise<Chapter[]> {
    const limit = Math.min(opts.limit ?? 100, 500);
    const publishedOnly = opts.publishedOnly !== false;
    let q = this.db.collection(PUBLISHED_COLLECTION).limit(limit);
    if (publishedOnly) q = q.where('isPublished', '==', true);
    if (opts.exam) q = q.where('exam', '==', opts.exam);
    if (opts.subject) q = q.where('subject', '==', opts.subject);
    if (opts.classLevel) q = q.where('classLevel', '==', opts.classLevel);
    // Order client-side after fetch -- avoid forcing a composite index per
    // (exam, subject, classLevel, title) combination.
    const snap = await q.get();
    const results = snap.docs.map((d) => d.data() as Chapter);
    results.sort((a, b) => {
      if (a.subject !== b.subject) return a.subject < b.subject ? -1 : 1;
      return a.title < b.title ? -1 : 1;
    });
    return results;
  }
}
