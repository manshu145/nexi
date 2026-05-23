import { Firestore } from 'firebase-admin/firestore';
import {
  asISODateTime,
  type ExamSlug,
  type ISODateTime,
  type User,
  type UserId,
} from '@nexigrate/shared';

/**
 * User persistence.
 *
 * The `getOrCreate` method is the side door used by `GET /v1/users/me`:
 * the very first time a freshly-signed-in user hits any v1 endpoint, the
 * user document is created from their Firebase token claims. We avoid
 * a separate "register" endpoint because the only authoritative identity
 * is the Firebase token; everything else is bookkeeping.
 *
 * Phase 4 adds a daily-streak counter on the same document:
 *   currentStreak  -- consecutive IST days with at least one completed
 *                     daily MCQ session
 *   bestStreak     -- all-time max
 *   lastDailyAt    -- ISO datetime of the last bump (used to detect
 *                     same-day idempotence and broken streaks)
 */

export interface UserStoreInit {
  email: string;
  name: string;
  photoPath: string | null;
  primaryProvider: 'google' | 'phone';
}

/** A `User` with the additional per-user app fields stored on the same doc. */
export type StoredUser = User & {
  targetExam?: ExamSlug | null;
  currentStreak?: number;
  bestStreak?: number;
  lastDailyAt?: ISODateTime | null;
};

export interface UserStore {
  getOrCreate(uid: UserId, init: UserStoreInit): Promise<StoredUser>;
  get(uid: UserId): Promise<StoredUser | null>;
  setTargetExam(uid: UserId, exam: ExamSlug): Promise<StoredUser>;
  /**
   * Bump the streak counter on `uid` based on `now`. Idempotent within a
   * single IST day -- repeated calls on the same day return the user
   * unchanged. Resets to 1 if the previous bump was not yesterday.
   */
  bumpStreak(uid: UserId, now: ISODateTime): Promise<StoredUser>;
}

function newUser(uid: UserId, init: UserStoreInit, now: string): StoredUser {
  return {
    id: uid,
    firebaseUid: uid,
    email: init.email,
    phone: null,
    name: init.name,
    photoPath: init.photoPath,
    primaryProvider: init.primaryProvider,
    isAdmin: false,
    isVerified: false,
    isMinor: false,
    locale: 'en-IN',
    createdAt: asISODateTime(now),
    updatedAt: asISODateTime(now),
    deletedAt: null,
    targetExam: null,
    currentStreak: 0,
    bestStreak: 0,
    lastDailyAt: null,
  };
}

// ---------- streak helpers (pure) -----------------------------------------

/** Convert an ISO datetime to a YYYY-MM-DD key in IST (UTC+5:30). */
export function istDateKey(iso: string): string {
  const t = new Date(iso).getTime() + 5.5 * 60 * 60 * 1000;
  const d = new Date(t);
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, '0');
  const day = String(d.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/** Whole-day distance between two YYYY-MM-DD keys (b - a). */
function dayDelta(a: string, b: string): number {
  const ms = (s: string) => new Date(`${s}T00:00:00.000Z`).getTime();
  return Math.round((ms(b) - ms(a)) / 86400000);
}

/**
 * Compute the next streak state. Pure function, easy to unit-test.
 * Returns `null` to signal "no change" (already bumped today).
 */
export function nextStreak(
  prev: { currentStreak?: number; bestStreak?: number; lastDailyAt?: ISODateTime | null },
  now: ISODateTime,
): { currentStreak: number; bestStreak: number; lastDailyAt: ISODateTime } | null {
  const today = istDateKey(now);
  const last = prev.lastDailyAt ? istDateKey(prev.lastDailyAt) : null;
  if (last === today) return null; // idempotent within IST day

  const previousCurrent = prev.currentStreak ?? 0;
  const previousBest = prev.bestStreak ?? 0;
  let current: number;
  if (last === null) {
    current = 1;
  } else if (dayDelta(last, today) === 1) {
    current = previousCurrent + 1;
  } else {
    // gap > 1 day, or going backwards (clock skew) -- restart
    current = 1;
  }
  const best = Math.max(previousBest, current);
  return { currentStreak: current, bestStreak: best, lastDailyAt: now };
}

// ---------- in-memory ------------------------------------------------------

export class InMemoryUserStore implements UserStore {
  private users = new Map<UserId, StoredUser>();

  async getOrCreate(uid: UserId, init: UserStoreInit): Promise<StoredUser> {
    const existing = this.users.get(uid);
    if (existing) return existing;
    const u = newUser(uid, init, new Date().toISOString());
    this.users.set(uid, u);
    return u;
  }

  async get(uid: UserId): Promise<StoredUser | null> {
    return this.users.get(uid) ?? null;
  }

  async setTargetExam(uid: UserId, exam: ExamSlug): Promise<StoredUser> {
    const u = this.users.get(uid);
    if (!u) throw new Error(`user ${uid} not found`);
    const updated: StoredUser = {
      ...u,
      targetExam: exam,
      updatedAt: asISODateTime(new Date().toISOString()),
    };
    this.users.set(uid, updated);
    return updated;
  }

  async bumpStreak(uid: UserId, now: ISODateTime): Promise<StoredUser> {
    const u = this.users.get(uid);
    if (!u) throw new Error(`user ${uid} not found`);
    const next = nextStreak(u, now);
    if (!next) return u;
    const updated: StoredUser = {
      ...u,
      ...next,
      updatedAt: now,
    };
    this.users.set(uid, updated);
    return updated;
  }
}

// ---------- firestore ------------------------------------------------------

const COLLECTION = 'users';

export class FirestoreUserStore implements UserStore {
  constructor(private readonly db: Firestore) {}

  async getOrCreate(uid: UserId, init: UserStoreInit): Promise<StoredUser> {
    const ref = this.db.collection(COLLECTION).doc(uid);
    const snap = await ref.get();
    if (snap.exists) return snap.data() as StoredUser;
    const u = newUser(uid, init, new Date().toISOString());
    await ref.set(u);
    return u;
  }

  async get(uid: UserId): Promise<StoredUser | null> {
    const snap = await this.db.collection(COLLECTION).doc(uid).get();
    if (!snap.exists) return null;
    return snap.data() as StoredUser;
  }

  async setTargetExam(uid: UserId, exam: ExamSlug): Promise<StoredUser> {
    const ref = this.db.collection(COLLECTION).doc(uid);
    await ref.set(
      { targetExam: exam, updatedAt: new Date().toISOString() },
      { merge: true },
    );
    const snap = await ref.get();
    return snap.data() as StoredUser;
  }

  async bumpStreak(uid: UserId, now: ISODateTime): Promise<StoredUser> {
    const ref = this.db.collection(COLLECTION).doc(uid);
    return this.db.runTransaction(async (tx) => {
      const snap = await tx.get(ref);
      if (!snap.exists) throw new Error(`user ${uid} not found`);
      const cur = snap.data() as StoredUser;
      const next = nextStreak(cur, now);
      if (!next) return cur;
      const updated: StoredUser = {
        ...cur,
        ...next,
        updatedAt: now,
      };
      tx.set(ref, updated, { merge: true });
      return updated;
    });
  }
}
