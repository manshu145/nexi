/**
 * Spaced-repetition review store (SM-2).
 *
 * After a student studies/quizzes a chapter we schedule it for review using
 * the classic SM-2 algorithm: items the student knows well drift further
 * apart, weak items come back tomorrow. The dashboard surfaces everything
 * "due today" so revision is driven by forgetting curves, not guesswork.
 *
 * Firestore: users/{uid}/reviewItems/{exam_subject_chapter}. Listing due
 * items uses a single-field range on `dueAt` (auto-indexed) so no composite
 * index is required.
 */

import type { Firestore } from 'firebase-admin/firestore';

export interface ReviewItem {
  id: string;                 // sanitized `${exam}_${subject}_${chapter}`
  exam: string;
  subject: string;
  chapter: string;
  easeFactor: number;         // SM-2 EF (>= 1.3)
  interval: number;           // days until next review
  repetitions: number;        // consecutive successful reviews
  dueAt: string;              // ISO timestamp when the item is next due
  lastScore: number;          // last quiz score (0-100)
  lastReviewedAt: string;
  createdAt: string;
}

export interface ReviewStore {
  /** Apply an SM-2 update from a quiz score (0-100) and (re)schedule. */
  schedule(userId: string, ref: { exam: string; subject: string; chapter: string }, score: number): Promise<ReviewItem>;
  /** Grade a manual review with an explicit quality 0-5 and reschedule. */
  grade(userId: string, itemId: string, quality: number): Promise<ReviewItem | null>;
  listDue(userId: string, nowISO: string, limit?: number): Promise<ReviewItem[]>;
  listAll(userId: string, limit?: number): Promise<ReviewItem[]>;
  countDue(userId: string, nowISO: string): Promise<number>;
}

const DAY_MS = 86_400_000;

function sanitizeId(exam: string, subject: string, chapter: string): string {
  return `${exam}_${subject}_${chapter}`.replace(/[^a-zA-Z0-9_-]/g, '-').slice(0, 200);
}

/** Map a 0-100 quiz score to an SM-2 quality rating 0-5. */
export function scoreToQuality(score: number): number {
  return Math.max(0, Math.min(5, Math.round(score / 20)));
}

/**
 * Core SM-2 step. Given the previous state and a quality 0-5, returns the
 * next ease factor, interval (days) and repetition count.
 */
export function sm2(prev: { easeFactor: number; interval: number; repetitions: number }, quality: number): { easeFactor: number; interval: number; repetitions: number } {
  const q = Math.max(0, Math.min(5, quality));
  let { easeFactor, repetitions } = prev;
  let interval: number;

  if (q < 3) {
    // Lapse — relearn from tomorrow.
    repetitions = 0;
    interval = 1;
  } else {
    repetitions += 1;
    if (repetitions === 1) interval = 1;
    else if (repetitions === 2) interval = 6;
    else interval = Math.round(prev.interval * easeFactor);
  }

  easeFactor = easeFactor + (0.1 - (5 - q) * (0.08 + (5 - q) * 0.02));
  if (easeFactor < 1.3) easeFactor = 1.3;

  return { easeFactor: Math.round(easeFactor * 100) / 100, interval: Math.max(1, interval), repetitions };
}

function applySchedule(existing: ReviewItem | null, ref: { exam: string; subject: string; chapter: string }, quality: number, score: number): ReviewItem {
  const now = Date.now();
  const base = existing ?? {
    id: sanitizeId(ref.exam, ref.subject, ref.chapter),
    exam: ref.exam, subject: ref.subject, chapter: ref.chapter,
    easeFactor: 2.5, interval: 0, repetitions: 0,
    dueAt: new Date(now).toISOString(), lastScore: score,
    lastReviewedAt: new Date(now).toISOString(), createdAt: new Date(now).toISOString(),
  };
  const stepped = sm2({ easeFactor: base.easeFactor, interval: base.interval, repetitions: base.repetitions }, quality);
  return {
    ...base,
    easeFactor: stepped.easeFactor,
    interval: stepped.interval,
    repetitions: stepped.repetitions,
    dueAt: new Date(now + stepped.interval * DAY_MS).toISOString(),
    lastScore: score,
    lastReviewedAt: new Date(now).toISOString(),
  };
}

export class InMemoryReviewStore implements ReviewStore {
  private items = new Map<string, Map<string, ReviewItem>>();

  private bucket(userId: string): Map<string, ReviewItem> {
    let b = this.items.get(userId);
    if (!b) { b = new Map(); this.items.set(userId, b); }
    return b;
  }

  async schedule(userId: string, ref: { exam: string; subject: string; chapter: string }, score: number): Promise<ReviewItem> {
    const b = this.bucket(userId);
    const id = sanitizeId(ref.exam, ref.subject, ref.chapter);
    const item = applySchedule(b.get(id) ?? null, ref, scoreToQuality(score), score);
    b.set(id, item);
    return item;
  }

  async grade(userId: string, itemId: string, quality: number): Promise<ReviewItem | null> {
    const b = this.bucket(userId);
    const existing = b.get(itemId);
    if (!existing) return null;
    const item = applySchedule(existing, { exam: existing.exam, subject: existing.subject, chapter: existing.chapter }, quality, existing.lastScore);
    b.set(itemId, item);
    return item;
  }

  async listDue(userId: string, nowISO: string, limit = 50): Promise<ReviewItem[]> {
    return [...this.bucket(userId).values()]
      .filter(i => i.dueAt <= nowISO)
      .sort((a, b) => a.dueAt.localeCompare(b.dueAt))
      .slice(0, limit);
  }

  async listAll(userId: string, limit = 200): Promise<ReviewItem[]> {
    return [...this.bucket(userId).values()].sort((a, b) => a.dueAt.localeCompare(b.dueAt)).slice(0, limit);
  }

  async countDue(userId: string, nowISO: string): Promise<number> {
    return [...this.bucket(userId).values()].filter(i => i.dueAt <= nowISO).length;
  }
}

export class FirestoreReviewStore implements ReviewStore {
  constructor(private db: Firestore) {}

  private col(userId: string) {
    return this.db.collection('users').doc(userId).collection('reviewItems');
  }

  async schedule(userId: string, ref: { exam: string; subject: string; chapter: string }, score: number): Promise<ReviewItem> {
    const id = sanitizeId(ref.exam, ref.subject, ref.chapter);
    const docRef = this.col(userId).doc(id);
    const snap = await docRef.get();
    const existing = snap.exists ? (snap.data() as ReviewItem) : null;
    const item = applySchedule(existing, ref, scoreToQuality(score), score);
    await docRef.set(item, { merge: true });
    return item;
  }

  async grade(userId: string, itemId: string, quality: number): Promise<ReviewItem | null> {
    const docRef = this.col(userId).doc(itemId);
    const snap = await docRef.get();
    if (!snap.exists) return null;
    const existing = snap.data() as ReviewItem;
    const item = applySchedule(existing, { exam: existing.exam, subject: existing.subject, chapter: existing.chapter }, quality, existing.lastScore);
    await docRef.set(item, { merge: true });
    return item;
  }

  async listDue(userId: string, nowISO: string, limit = 50): Promise<ReviewItem[]> {
    // Single-field range on dueAt -> auto-indexed, no composite index needed.
    const q = await this.col(userId).where('dueAt', '<=', nowISO).orderBy('dueAt').limit(limit).get();
    return q.docs.map(d => d.data() as ReviewItem);
  }

  async listAll(userId: string, limit = 200): Promise<ReviewItem[]> {
    const q = await this.col(userId).orderBy('dueAt').limit(limit).get();
    return q.docs.map(d => d.data() as ReviewItem);
  }

  async countDue(userId: string, nowISO: string): Promise<number> {
    const q = await this.col(userId).where('dueAt', '<=', nowISO).count().get();
    return q.data().count;
  }
}
