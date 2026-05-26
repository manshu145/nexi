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

export interface CurrentAffairsStore {
  getTodayItems(date: string): Promise<CurrentAffairsStoreItem[]>;
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
}

// ---------- in-memory implementation ----------------------------------------

export class InMemoryCurrentAffairsStore implements CurrentAffairsStore {
  private items = new Map<string, CurrentAffairsStoreItem[]>();
  private quizzes = new Map<string, GeneratedMCQ[]>();
  private results = new Map<string, DailyQuizResult[]>();

  async getTodayItems(date: string) {
    return this.items.get(date) ?? [];
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
}
