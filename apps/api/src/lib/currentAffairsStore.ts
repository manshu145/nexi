import type { Firestore } from 'firebase-admin/firestore';
import type { CurrentAffairsItem, CurrentAffairsCategory } from '@nexigrate/shared';
import type { GeneratedMCQ } from './aiEngine.js';

export interface CurrentAffairsStoreItem extends CurrentAffairsItem {
  date: string; // YYYY-MM-DD
  summary: string;
  factChecked: boolean;
  publishedAt: string;
  headlineHi?: string;  // Hindi translation (pre-computed at ingestion)
  summaryHi?: string;   // Hindi translation (pre-computed at ingestion)
}

export interface DailyQuizResult {
  userId: string;
  date: string;
  score: number;
  total: number;
  timeTaken: number; // seconds
  completedAt: string;
}

export interface LeaderboardEntry {
  userId: string;
  userName: string;
  score: number;
  timeTaken: number;
  date: string;
}

/**
 * Async ingestion job status. Persisted on the `system/ingestionStatus`
 * doc alongside `lastIngestedAt`, so the admin "Ingest now" button can
 * kick the job off in the background and poll for progress instead of
 * blocking a 60-150s HTTP request (which used to time out on slow-AI
 * runs and made the button feel broken).
 */
export interface IngestStatus {
  state: 'idle' | 'running' | 'error';
  startedAt: string | null;
  finishedAt: string | null;
  fetched: number | null;
  saved: number | null;
  error: string | null;
  lastIngestedAt: string | null;
}

export interface CurrentAffairsStore {
  getTodayItems(date: string): Promise<CurrentAffairsStoreItem[]>;
  getItemById(date: string, itemId: string): Promise<CurrentAffairsStoreItem | null>;
  saveItems(date: string, items: CurrentAffairsStoreItem[]): Promise<void>;
  getDailyQuiz(date: string): Promise<GeneratedMCQ[] | null>;
  saveDailyQuiz(date: string, questions: GeneratedMCQ[]): Promise<void>;
  submitQuizResult(result: DailyQuizResult): Promise<{ rank: number }>;
  getLeaderboard(date: string): Promise<LeaderboardEntry[]>;
  getYesterdayWinner(): Promise<LeaderboardEntry | null>;
  /** Get last ingestion timestamp (ISO string) */
  getLastIngestedAt(): Promise<string | null>;
  /** Set last ingestion timestamp */
  setLastIngestedAt(timestamp: string): Promise<void>;
  /** Like/unlike an item. Returns new like count */
  toggleLike(itemId: string, userId: string): Promise<{ liked: boolean; count: number }>;
  /** Bookmark/unbookmark an item */
  toggleBookmark(itemId: string, userId: string): Promise<{ bookmarked: boolean }>;
  /** Get user's bookmarked item IDs */
  getUserBookmarks(userId: string): Promise<string[]>;
  /** Get user's liked item IDs */
  getUserLikes(userId: string): Promise<string[]>;
  /** Get like count for items */
  getLikeCounts(itemIds: string[]): Promise<Record<string, number>>;
  /** Get the list of state/UT slugs the admin has marked "live" for the
   *  Current Affairs state selector. Empty = national-only (default). */
  getLiveStates(): Promise<string[]>;
  /** Read the current/last ingestion job status (for async "Ingest now"). */
  getIngestStatus(): Promise<IngestStatus>;
  /** Merge a partial patch into the ingestion job status. */
  setIngestStatus(patch: Partial<IngestStatus>): Promise<void>;
}

/** Default status when nothing has run yet. */
export const DEFAULT_INGEST_STATUS: IngestStatus = {
  state: 'idle', startedAt: null, finishedAt: null,
  fetched: null, saved: null, error: null, lastIngestedAt: null,
};

// ---------- in-memory implementation ----------------------------------------

export class InMemoryCurrentAffairsStore implements CurrentAffairsStore {
  private items = new Map<string, CurrentAffairsStoreItem[]>();
  private quizzes = new Map<string, GeneratedMCQ[]>();
  private results = new Map<string, DailyQuizResult[]>();
  private likes = new Map<string, Set<string>>(); // itemId -> Set<userId>
  private bookmarks = new Map<string, Set<string>>(); // userId -> Set<itemId>

  async getTodayItems(date: string) {
    return this.items.get(date) ?? [];
  }

  async getItemById(date: string, itemId: string) {
    const items = this.items.get(date) ?? [];
    return items.find(i => i.id === itemId) ?? null;
  }

  async saveItems(date: string, items: CurrentAffairsStoreItem[]) {
    const existing = this.items.get(date) ?? [];
    this.items.set(date, [...existing, ...items]);
  }

  async getDailyQuiz(date: string) {
    return this.quizzes.get(date) ?? null;
  }

  async saveDailyQuiz(date: string, questions: GeneratedMCQ[]) {
    this.quizzes.set(date, questions);
  }

  async submitQuizResult(result: DailyQuizResult) {
    const key = result.date;
    const existing = this.results.get(key) ?? [];
    existing.push(result);
    this.results.set(key, existing);
    // Calculate rank (sorted by score desc, then time asc)
    const sorted = existing.sort((a, b) => b.score - a.score || a.timeTaken - b.timeTaken);
    const rank = sorted.findIndex(r => r.userId === result.userId) + 1;
    return { rank };
  }

  async getLeaderboard(date: string) {
    const results = this.results.get(date) ?? [];
    return results
      .sort((a, b) => b.score - a.score || a.timeTaken - b.timeTaken)
      .slice(0, 10)
      .map(r => ({ userId: r.userId, userName: r.userId, score: r.score, timeTaken: r.timeTaken, date: r.date }));
  }

  async getYesterdayWinner() {
    const yesterday = new Date(Date.now() - 86400000).toISOString().split('T')[0]!;
    const results = this.results.get(yesterday) ?? [];
    if (results.length === 0) return null;
    const sorted = results.sort((a, b) => b.score - a.score || a.timeTaken - b.timeTaken);
    const winner = sorted[0]!;
    return { userId: winner.userId, userName: winner.userId, score: winner.score, timeTaken: winner.timeTaken, date: yesterday };
  }

  private lastIngestedAt: string | null = null;
  async getLastIngestedAt() { return this.lastIngestedAt; }
  async setLastIngestedAt(timestamp: string) { this.lastIngestedAt = timestamp; }

  async toggleLike(itemId: string, userId: string) {
    if (!this.likes.has(itemId)) this.likes.set(itemId, new Set());
    const set = this.likes.get(itemId)!;
    if (set.has(userId)) { set.delete(userId); return { liked: false, count: set.size }; }
    set.add(userId);
    return { liked: true, count: set.size };
  }

  async toggleBookmark(itemId: string, userId: string) {
    if (!this.bookmarks.has(userId)) this.bookmarks.set(userId, new Set());
    const set = this.bookmarks.get(userId)!;
    if (set.has(itemId)) { set.delete(itemId); return { bookmarked: false }; }
    set.add(itemId);
    return { bookmarked: true };
  }

  async getUserBookmarks(userId: string) {
    return Array.from(this.bookmarks.get(userId) ?? []);
  }

  async getUserLikes(userId: string) {
    const liked: string[] = [];
    for (const [itemId, set] of this.likes) { if (set.has(userId)) liked.push(itemId); }
    return liked;
  }

  async getLikeCounts(itemIds: string[]) {
    const counts: Record<string, number> = {};
    for (const id of itemIds) { counts[id] = this.likes.get(id)?.size ?? 0; }
    return counts;
  }

  private liveStates: string[] = [];
  async getLiveStates() { return this.liveStates; }

  private ingestStatus: IngestStatus = { ...DEFAULT_INGEST_STATUS };
  async getIngestStatus() { return { ...this.ingestStatus }; }
  async setIngestStatus(patch: Partial<IngestStatus>) {
    this.ingestStatus = { ...this.ingestStatus, ...patch };
  }
}

// ---------- firestore implementation ----------------------------------------

export class FirestoreCurrentAffairsStore implements CurrentAffairsStore {
  constructor(private readonly db: Firestore) {}

  async getTodayItems(date: string) {
    try {
      // Use IST date for Indian users (UTC+5:30)
      const now = new Date();
      const istOffset = 5.5 * 60 * 60 * 1000;
      const istNow = new Date(now.getTime() + istOffset);
      const istTodayKey = istNow.toISOString().split('T')[0]!;

      // Try today's IST bucket first
      const snap = await this.db.collection('currentAffairs').doc(istTodayKey).collection('items').get();
      if (!snap.empty) {
        return snap.docs.map(d => d.data() as CurrentAffairsStoreItem);
      }

      // Fallback: if today's bucket is empty, try the provided date key
      if (date !== istTodayKey) {
        const fallbackSnap = await this.db.collection('currentAffairs').doc(date).collection('items').get();
        if (!fallbackSnap.empty) {
          return fallbackSnap.docs.map(d => ({ ...d.data(), _isFromYesterday: true } as CurrentAffairsStoreItem & { _isFromYesterday?: boolean }));
        }
      }

      // Last resort: try yesterday's IST bucket
      const yesterdayIst = new Date(istNow.getTime() - 24 * 60 * 60 * 1000);
      const yesterdayKey = yesterdayIst.toISOString().split('T')[0]!;
      const yesterdaySnap = await this.db.collection('currentAffairs').doc(yesterdayKey).collection('items').get();
      if (!yesterdaySnap.empty) {
        return yesterdaySnap.docs.map(d => ({ ...d.data(), _isFromYesterday: true } as CurrentAffairsStoreItem & { _isFromYesterday?: boolean }));
      }

      return [];
    } catch { return []; }
  }

  async saveItems(date: string, items: CurrentAffairsStoreItem[]) {
    const batch = this.db.batch();
    for (const item of items) {
      const ref = this.db.collection('currentAffairs').doc(date).collection('items').doc(item.id);
      batch.set(ref, item, { merge: true });
    }
    // Also save a summary doc
    batch.set(this.db.collection('currentAffairs').doc(date), { date, itemCount: items.length, updatedAt: new Date().toISOString() }, { merge: true });
    await batch.commit();
  }

  async getDailyQuiz(date: string) {
    const snap = await this.db.collection('dailyQuizzes').doc(date).get();
    if (!snap.exists) return null;
    return (snap.data() as { questions: GeneratedMCQ[] }).questions;
  }

  async saveDailyQuiz(date: string, questions: GeneratedMCQ[]) {
    await this.db.collection('dailyQuizzes').doc(date).set({ date, questions, createdAt: new Date().toISOString() });
  }

  async submitQuizResult(result: DailyQuizResult) {
    const ref = this.db.collection('quizResults').doc(result.date).collection('results').doc(result.userId);
    await ref.set(result);
    // Get rank — use single orderBy to avoid composite index requirement
    try {
      const snap = await this.db.collection('quizResults').doc(result.date).collection('results')
        .orderBy('score', 'desc').get();
      const rank = snap.docs.findIndex(d => d.id === result.userId) + 1;
      return { rank: rank || 1 };
    } catch { return { rank: 1 }; }
  }

  async getLeaderboard(date: string) {
    try {
      const snap = await this.db.collection('quizResults').doc(date).collection('results')
        .orderBy('score', 'desc').limit(10).get();
      return snap.docs.map(d => {
        const data = d.data() as DailyQuizResult;
        return { userId: data.userId, userName: data.userId, score: data.score, timeTaken: data.timeTaken, date };
      });
    } catch { return []; }
  }

  async getYesterdayWinner() {
    try {
      const yesterday = new Date(Date.now() - 86400000).toISOString().split('T')[0]!;
      const snap = await this.db.collection('quizResults').doc(yesterday).collection('results')
        .orderBy('score', 'desc').limit(1).get();
      if (snap.empty) return null;
      const data = snap.docs[0]!.data() as DailyQuizResult;
      // Look up user's display name
      let userName = data.userId;
      try {
        const userSnap = await this.db.collection('users').doc(data.userId).get();
        if (userSnap.exists) userName = userSnap.data()?.name || data.userId;
      } catch { /* fallback to userId */ }
      return { userId: data.userId, userName, score: data.score, timeTaken: data.timeTaken, date: yesterday };
    } catch { return null; }
  }

  async getLastIngestedAt(): Promise<string | null> {
    try {
      const snap = await this.db.collection('system').doc('ingestionStatus').get();
      return snap.exists ? (snap.data()?.lastIngestedAt ?? null) : null;
    } catch { return null; }
  }

  async setLastIngestedAt(timestamp: string): Promise<void> {
    await this.db.collection('system').doc('ingestionStatus').set({ lastIngestedAt: timestamp }, { merge: true });
  }

  async getItemById(date: string, itemId: string): Promise<CurrentAffairsStoreItem | null> {
    try {
      // Try today's IST bucket first
      const now = new Date();
      const istOffset = 5.5 * 60 * 60 * 1000;
      const istNow = new Date(now.getTime() + istOffset);
      const istTodayKey = istNow.toISOString().split('T')[0]!;

      let snap = await this.db.collection('currentAffairs').doc(istTodayKey).collection('items').doc(itemId).get();
      if (snap.exists) return snap.data() as CurrentAffairsStoreItem;

      // Try provided date
      if (date !== istTodayKey) {
        snap = await this.db.collection('currentAffairs').doc(date).collection('items').doc(itemId).get();
        if (snap.exists) return snap.data() as CurrentAffairsStoreItem;
      }

      // Try yesterday
      const yesterdayKey = new Date(istNow.getTime() - 24 * 60 * 60 * 1000).toISOString().split('T')[0]!;
      snap = await this.db.collection('currentAffairs').doc(yesterdayKey).collection('items').doc(itemId).get();
      if (snap.exists) return snap.data() as CurrentAffairsStoreItem;

      return null;
    } catch { return null; }
  }

  async toggleLike(itemId: string, userId: string) {
    const ref = this.db.collection('newsLikes').doc(`${itemId}_${userId}`);
    const countRef = this.db.collection('newsLikeCounts').doc(itemId);
    const snap = await ref.get();
    if (snap.exists) {
      await ref.delete();
      const countSnap = await countRef.get();
      const current = countSnap.exists ? (countSnap.data()?.count ?? 1) : 1;
      const newCount = Math.max(0, current - 1);
      await countRef.set({ count: newCount }, { merge: true });
      return { liked: false, count: newCount };
    }
    await ref.set({ itemId, userId, createdAt: new Date().toISOString() });
    const countSnap = await countRef.get();
    const current = countSnap.exists ? (countSnap.data()?.count ?? 0) : 0;
    const newCount = current + 1;
    await countRef.set({ count: newCount }, { merge: true });
    return { liked: true, count: newCount };
  }

  async toggleBookmark(itemId: string, userId: string) {
    const ref = this.db.collection('newsBookmarks').doc(`${userId}_${itemId}`);
    const snap = await ref.get();
    if (snap.exists) {
      await ref.delete();
      return { bookmarked: false };
    }
    await ref.set({ itemId, userId, createdAt: new Date().toISOString() });
    return { bookmarked: true };
  }

  async getUserBookmarks(userId: string) {
    try {
      const snap = await this.db.collection('newsBookmarks').where('userId', '==', userId).get();
      return snap.docs.map(d => d.data().itemId as string);
    } catch { return []; }
  }

  async getUserLikes(userId: string) {
    try {
      const snap = await this.db.collection('newsLikes').where('userId', '==', userId).get();
      return snap.docs.map(d => d.data().itemId as string);
    } catch { return []; }
  }

  async getLikeCounts(itemIds: string[]) {
    const counts: Record<string, number> = {};
    try {
      for (const id of itemIds) {
        const snap = await this.db.collection('newsLikeCounts').doc(id).get();
        counts[id] = snap.exists ? (snap.data()?.count ?? 0) : 0;
      }
    } catch { /* fallback to zeros */ }
    return counts;
  }

  async getLiveStates(): Promise<string[]> {
    try {
      const snap = await this.db.collection('currentAffairsConfig').doc('states').get();
      const raw = snap.exists ? (snap.data()?.liveStates as unknown) : null;
      return Array.isArray(raw) ? raw.filter((s): s is string => typeof s === 'string') : [];
    } catch { return []; }
  }

  async getIngestStatus(): Promise<IngestStatus> {
    try {
      const snap = await this.db.collection('system').doc('ingestionStatus').get();
      const d = snap.exists ? snap.data() : null;
      return {
        state: (d?.state as IngestStatus['state']) ?? 'idle',
        startedAt: d?.startedAt ?? null,
        finishedAt: d?.finishedAt ?? null,
        fetched: typeof d?.fetched === 'number' ? d.fetched : null,
        saved: typeof d?.saved === 'number' ? d.saved : null,
        error: d?.error ?? null,
        lastIngestedAt: d?.lastIngestedAt ?? null,
      };
    } catch { return { ...DEFAULT_INGEST_STATUS }; }
  }

  async setIngestStatus(patch: Partial<IngestStatus>): Promise<void> {
    try {
      await this.db.collection('system').doc('ingestionStatus').set(patch, { merge: true });
    } catch { /* status write is best-effort; never block ingestion */ }
  }
}
