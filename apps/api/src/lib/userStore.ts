import { Firestore } from 'firebase-admin/firestore';
import {
  asISODateTime,
  type ExamSlug,
  type ISODateTime,
  type StreakBadge,
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
 *
 * Phase 8 adds the multi-step onboarding survey. The `StudentProfile`
 * schema in @nexigrate/shared has had these fields for a while; we just
 * never persisted them. For now they live denormalised on the user doc
 * (alongside the auth identity) -- splitting into a `students/{uid}`
 * collection is a separate refactor when we have more student-only data.
 */

export interface UserStoreInit {
  email: string;
  name: string;
  photoPath: string | null;
  primaryProvider: 'google' | 'phone';
}

/**
 * The complete onboarding-survey payload as persisted on the user doc.
 * Mirrors `OnboardingRequest` in @nexigrate/shared exactly minus the
 * fields that already live on `User` (name, phone) -- those are merged
 * in separately below.
 */
export interface OnboardingPayload {
  targetExam: ExamSlug;
  classLevel: StoredUser['classLevel'];
  board: StoredUser['board'];
  schoolName: string | null;
  district: string | null;
  state: string | null;
  dateOfBirth: string | null;
  examDate: string | null;
  studyHoursPerDay: number | null;
  weakSubjects: string[];
  phone: string | null;
  parentEmail: string | null;
  parentPhone: string | null;
  referralCode: string | null;
  /** Optional name override -- mostly a no-op since the auth provider supplies one. */
  name?: string;
}

/** A `User` with the additional per-user app fields stored on the same doc. */
export type StoredUser = User & {
  targetExam?: ExamSlug | null;
  currentStreak?: number;
  bestStreak?: number;
  lastDailyAt?: ISODateTime | null;

  // Phase 8 -- onboarding survey
  classLevel?:
    | 'class-8'
    | 'class-9'
    | 'class-10'
    | 'class-11'
    | 'class-12'
    | 'graduation'
    | 'post-graduation'
    | null;
  board?: 'cbse' | 'icse' | 'state' | 'other' | null;
  schoolName?: string | null;
  district?: string | null;
  state?: string | null;
  dateOfBirth?: string | null;
  examDate?: string | null;
  studyHoursPerDay?: number | null;
  weakSubjects?: string[];
  parentEmail?: string | null;
  parentPhone?: string | null;
  referralCode?: string | null;
  /** ISO datetime when the user finished the multi-step survey. */
  onboardingCompletedAt?: ISODateTime | null;
};

export interface UserStore {
  getOrCreate(uid: UserId, init: UserStoreInit): Promise<StoredUser>;
  get(uid: UserId): Promise<StoredUser | null>;
  /** Set the target exam in isolation (e.g. settings page later). */
  setTargetExam(uid: UserId, exam: ExamSlug): Promise<StoredUser>;
  /**
   * Persist the full onboarding-survey payload. Always sets
   * `onboardingCompletedAt` so the dashboard knows the survey is done.
   * Auto-derives `isMinor` from `dateOfBirth` when present.
   */
  applyOnboarding(uid: UserId, payload: OnboardingPayload): Promise<StoredUser>;
  /**
   * Bump the streak counter on `uid` based on `now`. Idempotent within a
   * single IST day -- repeated calls on the same day return the user
   * unchanged. Resets to 1 if the previous bump was not yesterday.
   */
  bumpStreak(uid: UserId, now: ISODateTime): Promise<StoredUser>;
  /**
   * Append a streak-milestone badge to `streakBadges`. Idempotent on
   * `kind` -- if the user already has the same kind, this is a no-op.
   */
  addStreakBadge(uid: UserId, badge: StreakBadge): Promise<StoredUser>;
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

/**
 * Compute whether a user is a minor (<18) at `now` based on their
 * birth date in YYYY-MM-DD form. Returns false if `dateOfBirth` is null
 * or unparseable so callers don't accidentally minor-flag adults.
 */
export function computeIsMinor(dateOfBirth: string | null, now: Date = new Date()): boolean {
  if (!dateOfBirth) return false;
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateOfBirth);
  if (!m) return false;
  const [, ys, ms, ds] = m;
  const year = Number(ys);
  const month = Number(ms);
  const day = Number(ds);
  if (!Number.isFinite(year) || !Number.isFinite(month) || !Number.isFinite(day)) return false;
  const eighteenth = new Date(Date.UTC(year + 18, month - 1, day));
  return now.getTime() < eighteenth.getTime();
}

/**
 * Build the field set merged onto the user doc by `applyOnboarding`.
 * Pulled out so both store implementations stay in sync.
 */
function onboardingPatch(
  payload: OnboardingPayload,
  now: ISODateTime,
): Partial<StoredUser> {
  const isMinor = computeIsMinor(payload.dateOfBirth);
  const patch: Partial<StoredUser> = {
    targetExam: payload.targetExam,
    classLevel: payload.classLevel,
    board: payload.board,
    schoolName: payload.schoolName,
    district: payload.district,
    state: payload.state,
    dateOfBirth: payload.dateOfBirth,
    examDate: payload.examDate,
    studyHoursPerDay: payload.studyHoursPerDay,
    weakSubjects: payload.weakSubjects,
    phone: payload.phone,
    parentEmail: payload.parentEmail,
    parentPhone: payload.parentPhone,
    referralCode: payload.referralCode,
    isMinor,
    onboardingCompletedAt: now,
    updatedAt: now,
  };
  if (payload.name && payload.name.trim()) patch.name = payload.name.trim();
  return patch;
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

  async applyOnboarding(uid: UserId, payload: OnboardingPayload): Promise<StoredUser> {
    const u = this.users.get(uid);
    if (!u) throw new Error(`user ${uid} not found`);
    const now = asISODateTime(new Date().toISOString());
    const updated: StoredUser = {
      ...u,
      ...onboardingPatch(payload, now),
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

  async addStreakBadge(uid: UserId, badge: StreakBadge): Promise<StoredUser> {
    const u = this.users.get(uid);
    if (!u) throw new Error(`user ${uid} not found`);
    const existing = u.streakBadges ?? [];
    if (existing.some((b) => b.kind === badge.kind)) return u;
    const updated: StoredUser = {
      ...u,
      streakBadges: [...existing, badge],
      updatedAt: badge.earnedAt,
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

  async applyOnboarding(uid: UserId, payload: OnboardingPayload): Promise<StoredUser> {
    const ref = this.db.collection(COLLECTION).doc(uid);
    const now = asISODateTime(new Date().toISOString());
    await ref.set(onboardingPatch(payload, now), { merge: true });
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

  async addStreakBadge(uid: UserId, badge: StreakBadge): Promise<StoredUser> {
    const ref = this.db.collection(COLLECTION).doc(uid);
    return this.db.runTransaction(async (tx) => {
      const snap = await tx.get(ref);
      if (!snap.exists) throw new Error(`user ${uid} not found`);
      const cur = snap.data() as StoredUser;
      const existing = cur.streakBadges ?? [];
      if (existing.some((b) => b.kind === badge.kind)) return cur;
      const updated: StoredUser = {
        ...cur,
        streakBadges: [...existing, badge],
        updatedAt: badge.earnedAt,
      };
      tx.set(ref, updated, { merge: true });
      return updated;
    });
  }
}
