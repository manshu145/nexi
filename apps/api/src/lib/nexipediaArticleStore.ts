import type { Firestore } from 'firebase-admin/firestore';
import {
  asISODateTime,
  type NexipediaArticle,
  type NexipediaArticleDraft,
  type NexipediaArticleId,
  type NexipediaArticleStatus,
  type NexipediaCategory,
  type NexipediaSection,
} from '@nexigrate/shared';

/**
 * Persistence for Nexipedia drafts + published articles.
 *
 * Mirrors ChapterDraftStore + ChapterStore with a few differences:
 *   - Articles are topic-scoped (slug is unique across the whole corpus),
 *     not exam-scoped, so getBySlug doesn't take an exam.
 *   - Published articles carry searchTokens used by /v1/nexipedia?q=...
 *     for substring search. That field lives only on the published doc,
 *     not on the draft.
 */

// ---------- drafts ----------------------------------------------------------

export interface ListNexipediaDraftsOptions {
  status?: NexipediaArticleStatus;
  category?: NexipediaCategory;
  limit?: number;
}

export interface NexipediaDraftStore {
  put(draft: NexipediaArticleDraft): Promise<void>;
  get(id: NexipediaArticleId): Promise<NexipediaArticleDraft | null>;
  list(opts: ListNexipediaDraftsOptions): Promise<NexipediaArticleDraft[]>;
  review(
    id: NexipediaArticleId,
    status: 'approved' | 'rejected',
    reviewedBy: string,
    rejectionReason?: string,
  ): Promise<NexipediaArticleDraft | null>;
  updateBody(
    id: NexipediaArticleId,
    edits: Partial<
      Pick<NexipediaArticleDraft, 'title' | 'summary' | 'sections' | 'source' | 'relatedExams'>
    >,
    editedBy: string,
  ): Promise<NexipediaArticleDraft | null>;
}

const DRAFTS_COLLECTION = 'nexipedia_drafts';

export class InMemoryNexipediaDraftStore implements NexipediaDraftStore {
  private map = new Map<NexipediaArticleId, NexipediaArticleDraft>();

  async put(draft: NexipediaArticleDraft): Promise<void> {
    this.map.set(draft.id, draft);
  }

  async get(id: NexipediaArticleId): Promise<NexipediaArticleDraft | null> {
    return this.map.get(id) ?? null;
  }

  async list(opts: ListNexipediaDraftsOptions): Promise<NexipediaArticleDraft[]> {
    const limit = Math.min(opts.limit ?? 50, 200);
    const all = Array.from(this.map.values());
    const filtered = all.filter((d) => {
      if (opts.status && d.status !== opts.status) return false;
      if (opts.category && d.category !== opts.category) return false;
      return true;
    });
    filtered.sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
    return filtered.slice(0, limit);
  }

  async review(
    id: NexipediaArticleId,
    status: 'approved' | 'rejected',
    reviewedBy: string,
    rejectionReason?: string,
  ): Promise<NexipediaArticleDraft | null> {
    const cur = this.map.get(id);
    if (!cur) return null;
    if (cur.status === status) return cur;
    const now = asISODateTime(new Date().toISOString());
    const updated: NexipediaArticleDraft = {
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
    id: NexipediaArticleId,
    edits: Partial<
      Pick<NexipediaArticleDraft, 'title' | 'summary' | 'sections' | 'source' | 'relatedExams'>
    >,
    _editedBy: string,
  ): Promise<NexipediaArticleDraft | null> {
    const cur = this.map.get(id);
    if (!cur) return null;
    if (cur.status !== 'pending') return cur;
    const now = asISODateTime(new Date().toISOString());
    const updated: NexipediaArticleDraft = {
      ...cur,
      ...(edits.title !== undefined ? { title: edits.title } : {}),
      ...(edits.summary !== undefined ? { summary: edits.summary } : {}),
      ...(edits.sections !== undefined ? { sections: edits.sections } : {}),
      ...(edits.source !== undefined ? { source: edits.source } : {}),
      ...(edits.relatedExams !== undefined ? { relatedExams: edits.relatedExams } : {}),
      updatedAt: now,
    };
    this.map.set(id, updated);
    return updated;
  }
}

export class FirestoreNexipediaDraftStore implements NexipediaDraftStore {
  constructor(private readonly db: Firestore) {}

  async put(draft: NexipediaArticleDraft): Promise<void> {
    await this.db.collection(DRAFTS_COLLECTION).doc(draft.id).set(draft);
  }

  async get(id: NexipediaArticleId): Promise<NexipediaArticleDraft | null> {
    const snap = await this.db.collection(DRAFTS_COLLECTION).doc(id).get();
    return snap.exists ? (snap.data() as NexipediaArticleDraft) : null;
  }

  async list(opts: ListNexipediaDraftsOptions): Promise<NexipediaArticleDraft[]> {
    const limit = Math.min(opts.limit ?? 50, 200);
    let q = this.db.collection(DRAFTS_COLLECTION).orderBy('createdAt', 'desc').limit(limit);
    if (opts.status) q = q.where('status', '==', opts.status);
    if (opts.category) q = q.where('category', '==', opts.category);
    const snap = await q.get();
    return snap.docs.map((d) => d.data() as NexipediaArticleDraft);
  }

  async review(
    id: NexipediaArticleId,
    status: 'approved' | 'rejected',
    reviewedBy: string,
    rejectionReason?: string,
  ): Promise<NexipediaArticleDraft | null> {
    const ref = this.db.collection(DRAFTS_COLLECTION).doc(id);
    return this.db.runTransaction(async (tx) => {
      const snap = await tx.get(ref);
      if (!snap.exists) return null;
      const cur = snap.data() as NexipediaArticleDraft;
      if (cur.status === status) return cur;
      const now = asISODateTime(new Date().toISOString());
      const updated: NexipediaArticleDraft = {
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
    id: NexipediaArticleId,
    edits: Partial<
      Pick<NexipediaArticleDraft, 'title' | 'summary' | 'sections' | 'source' | 'relatedExams'>
    >,
    _editedBy: string,
  ): Promise<NexipediaArticleDraft | null> {
    const ref = this.db.collection(DRAFTS_COLLECTION).doc(id);
    return this.db.runTransaction(async (tx) => {
      const snap = await tx.get(ref);
      if (!snap.exists) return null;
      const cur = snap.data() as NexipediaArticleDraft;
      if (cur.status !== 'pending') return cur;
      const now = asISODateTime(new Date().toISOString());
      const updated: NexipediaArticleDraft = {
        ...cur,
        ...(edits.title !== undefined ? { title: edits.title } : {}),
        ...(edits.summary !== undefined ? { summary: edits.summary } : {}),
        ...(edits.sections !== undefined
          ? { sections: edits.sections as NexipediaSection[] }
          : {}),
        ...(edits.source !== undefined ? { source: edits.source } : {}),
        ...(edits.relatedExams !== undefined ? { relatedExams: edits.relatedExams } : {}),
        updatedAt: now,
      };
      tx.set(ref, updated);
      return updated;
    });
  }
}

// ---------- published articles ---------------------------------------------

export interface ListNexipediaArticlesOptions {
  category?: NexipediaCategory;
  /** Lowercased substring; filters on searchTokens client-side after fetch. */
  query?: string;
  publishedOnly?: boolean;
  limit?: number;
}

export interface NexipediaArticleStore {
  put(article: NexipediaArticle): Promise<void>;
  get(id: NexipediaArticleId): Promise<NexipediaArticle | null>;
  getBySlug(slug: string): Promise<NexipediaArticle | null>;
  list(opts: ListNexipediaArticlesOptions): Promise<NexipediaArticle[]>;
}

const ARTICLES_COLLECTION = 'nexipedia_articles';

export class InMemoryNexipediaArticleStore implements NexipediaArticleStore {
  private map = new Map<NexipediaArticleId, NexipediaArticle>();

  async put(article: NexipediaArticle): Promise<void> {
    this.map.set(article.id, article);
  }

  async get(id: NexipediaArticleId): Promise<NexipediaArticle | null> {
    return this.map.get(id) ?? null;
  }

  async getBySlug(slug: string): Promise<NexipediaArticle | null> {
    for (const a of this.map.values()) if (a.slug === slug) return a;
    return null;
  }

  async list(opts: ListNexipediaArticlesOptions): Promise<NexipediaArticle[]> {
    const limit = Math.min(opts.limit ?? 100, 500);
    const publishedOnly = opts.publishedOnly !== false;
    const q = (opts.query ?? '').toLowerCase().trim();
    const all = Array.from(this.map.values());
    const filtered = all.filter((a) => {
      if (publishedOnly && !a.isPublished) return false;
      if (opts.category && a.category !== opts.category) return false;
      if (q) {
        const inTitle = a.title.toLowerCase().includes(q);
        const inSummary = a.summary.toLowerCase().includes(q);
        const inTokens = a.searchTokens.some((t) => t.includes(q));
        if (!inTitle && !inSummary && !inTokens) return false;
      }
      return true;
    });
    filtered.sort((a, b) => (a.title < b.title ? -1 : 1));
    return filtered.slice(0, limit);
  }
}

export class FirestoreNexipediaArticleStore implements NexipediaArticleStore {
  constructor(private readonly db: Firestore) {}

  async put(article: NexipediaArticle): Promise<void> {
    await this.db.collection(ARTICLES_COLLECTION).doc(article.id).set(article);
  }

  async get(id: NexipediaArticleId): Promise<NexipediaArticle | null> {
    const snap = await this.db.collection(ARTICLES_COLLECTION).doc(id).get();
    return snap.exists ? (snap.data() as NexipediaArticle) : null;
  }

  async getBySlug(slug: string): Promise<NexipediaArticle | null> {
    const snap = await this.db
      .collection(ARTICLES_COLLECTION)
      .where('slug', '==', slug)
      .limit(1)
      .get();
    return snap.empty ? null : (snap.docs[0]!.data() as NexipediaArticle);
  }

  async list(opts: ListNexipediaArticlesOptions): Promise<NexipediaArticle[]> {
    const limit = Math.min(opts.limit ?? 100, 500);
    const publishedOnly = opts.publishedOnly !== false;
    // Single equality on category if present + isPublished filter; do a
    // wider Firestore fetch and apply the substring search client-side
    // to avoid forcing a full-text index for the small initial corpus.
    let q = this.db.collection(ARTICLES_COLLECTION).limit(limit);
    if (publishedOnly) q = q.where('isPublished', '==', true);
    if (opts.category) q = q.where('category', '==', opts.category);
    const snap = await q.get();
    let rows = snap.docs.map((d) => d.data() as NexipediaArticle);
    const queryStr = (opts.query ?? '').toLowerCase().trim();
    if (queryStr) {
      rows = rows.filter((a) => {
        if (a.title.toLowerCase().includes(queryStr)) return true;
        if (a.summary.toLowerCase().includes(queryStr)) return true;
        return a.searchTokens.some((t) => t.includes(queryStr));
      });
    }
    rows.sort((a, b) => (a.title < b.title ? -1 : 1));
    return rows;
  }
}
