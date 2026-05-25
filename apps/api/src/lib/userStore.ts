import { Firestore } from 'firebase-admin/firestore';
import {
  asISODateTime,
  type ExamSlug,
  type ISODateTime,
  type UserId,
  type Board,
  type ClassLevel,
} from '@nexigrate/shared';

/**
 * StoredUser — the complete user document stored in Firestore.
 * Combines auth identity + onboarding + app state.
 */
export interface StoredUser {
  id: UserId;
  firebaseUid: string;
  email: string;
  name: string;
  phone: string | null;
  photoURL: string | null;
  primaryProvider: 'google' | 'phone';
  role: 'student' | 'admin';

  // Onboarding
  language: 'en' | 'hi';
  targetExam: ExamSlug | null;
  classLevel: ClassLevel | null;
  board: Board | null;
  school: string | null;
  dob: string | null;
  aim: string | null;

  // Assessment
  onboardingScore: number | null;
  onboardingLevel: 'beginner' | 'intermediate' | 'advanced' | null;

  // Credits & plan
  credits: number;
  plan: 'free' | 'scholar' | 'aspirant' | 'achiever';
  planExpiresAt: ISODateTime | null;

  // Streaks
  currentStreak: number;
  bestStreak: number;
  lastDailyAt: ISODateTime | null;

  // Meta
  isVerified: boolean;
  createdAt: ISODateTime;
  updatedAt: ISODateTime;
}

export interface UserStoreInit {
  email: string;
  name: string;
  photoURL: string | null;
  primaryProvider: 'google' | 'phone';
}

export interface UserStore {
  getOrCreate(uid: UserId, init: UserStoreInit): Promise<StoredUser>;
  get(uid: UserId): Promise<StoredUser | null>;
  update(uid: UserId, data: Partial<StoredUser>): Promise<StoredUser>;
  bumpStreak(uid: UserId): Promise<{ streak: number; credits: number }>;
}

// ---------- helpers ----------------------------------------------------------

function newUser(uid: UserId, init: UserStoreInit, now: string): StoredUser {
  return {
    id: uid,
    firebaseUid: uid,
    email: init.email,
    name: init.name,
    phone: null,
    photoURL: init.photoURL,
    primaryProvider: init.primaryProvider,
    role: 'student',
    language: 'en',
    targetExam: null,
    classLevel: null,
    board: null,
    school: null,
    dob: null,
    aim: null,
    onboardingScore: null,
    onboardingLevel: null,
    credits: 100, // sign-up bonus
    plan: 'free',
    planExpiresAt: null,
    currentStreak: 0,
    bestStreak: 0,
    lastDailyAt: null,
    isVerified: false,
    createdAt: asISODateTime(now),
    updatedAt: asISODateTime(now),
  };
}

/** Convert an ISO datetime to a YYYY-MM-DD key in IST (UTC+5:30). */
function istDateKey(iso: string): string {
  const t = new Date(iso).getTime() + 5.5 * 60 * 60 * 1000;
  const d = new Date(t);
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, '0');
  const day = String(d.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function dayDelta(a: string, b: string): number {
  const ms = (s: string) => new Date(`${s}T00:00:00.000Z`).getTime();
  return Math.round((ms(b) - ms(a)) / 86400000);
}

function computeStreak(prev: {
  currentStreak: number;
  bestStreak: number;
  lastDailyAt: ISODateTime | null;
}): { currentStreak: number; bestStreak: number; alreadyBumped: boolean } {
  const now = new Date().toISOString();
  const today = istDateKey(now);
  const last = prev.lastDailyAt ? istDateKey(prev.lastDailyAt) : null;

  if (last === today) {
    return { currentStreak: prev.currentStreak, bestStreak: prev.bestStreak, alreadyBumped: true };
  }

  let current: number;
  if (last === null) {
    current = 1;
  } else if (dayDelta(last, today) === 1) {
    current = prev.currentStreak + 1;
  } else {
    current = 1;
  }
  const best = Math.max(prev.bestStreak, current);
  return { currentStreak: current, bestStreak: best, alreadyBumped: false };
}

// ---------- in-memory --------------------------------------------------------

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

  async update(uid: UserId, data: Partial<StoredUser>): Promise<StoredUser> {
    const u = this.users.get(uid);
    if (!u) throw new Error(`user ${uid} not found`);
    const updated: StoredUser = { ...u, ...data, updatedAt: asISODateTime(new Date().toISOString()) };
    this.users.set(uid, updated);
    return updated;
  }

  async bumpStreak(uid: UserId): Promise<{ streak: number; credits: number }> {
    const u = this.users.get(uid);
    if (!u) throw new Error(`user ${uid} not found`);
    const { currentStreak, bestStreak, alreadyBumped } = computeStreak(u);
    if (alreadyBumped) return { streak: u.currentStreak, credits: 0 };

    let creditsEarned = 10; // daily login
    if (currentStreak === 7) creditsEarned += 25;
    if (currentStreak === 30) creditsEarned += 100;

    const updated: StoredUser = {
      ...u,
      currentStreak,
      bestStreak,
      lastDailyAt: asISODateTime(new Date().toISOString()),
      credits: u.credits + creditsEarned,
      updatedAt: asISODateTime(new Date().toISOString()),
    };
    this.users.set(uid, updated);
    return { streak: currentStreak, credits: creditsEarned };
  }
}

// ---------- firestore --------------------------------------------------------

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

  async update(uid: UserId, data: Partial<StoredUser>): Promise<StoredUser> {
    const ref = this.db.collection(COLLECTION).doc(uid);
    const updateData = { ...data, updatedAt: new Date().toISOString() };
    await ref.set(updateData, { merge: true });
    const snap = await ref.get();
    return snap.data() as StoredUser;
  }

  async bumpStreak(uid: UserId): Promise<{ streak: number; credits: number }> {
    const ref = this.db.collection(COLLECTION).doc(uid);
    return this.db.runTransaction(async (tx) => {
      const snap = await tx.get(ref);
      if (!snap.exists) throw new Error(`user ${uid} not found`);
      const cur = snap.data() as StoredUser;
      const { currentStreak, bestStreak, alreadyBumped } = computeStreak(cur);
      if (alreadyBumped) return { streak: cur.currentStreak, credits: 0 };

      let creditsEarned = 10;
      if (currentStreak === 7) creditsEarned += 25;
      if (currentStreak === 30) creditsEarned += 100;

      const now = asISODateTime(new Date().toISOString());
      tx.set(
        ref,
        {
          currentStreak,
          bestStreak,
          lastDailyAt: now,
          credits: cur.credits + creditsEarned,
          updatedAt: now,
        },
        { merge: true },
      );
      return { streak: currentStreak, credits: creditsEarned };
    });
  }
}
