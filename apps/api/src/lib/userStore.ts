import { Firestore } from 'firebase-admin/firestore';
import { asISODateTime, type ExamSlug, type ISODateTime, type UserId, type Board, type ClassLevel } from '@nexigrate/shared';

export interface StoredUser {
  id: UserId; firebaseUid: string; email: string; name: string; phone: string | null;
  photoURL: string | null; primaryProvider: 'google' | 'phone'; role: 'student' | 'admin';
  language: 'en' | 'hi'; targetExam: ExamSlug | null; classLevel: ClassLevel | null;
  board: Board | null; school: string | null; dob: string | null; aim: string | null;
  onboardingScore: number | null; onboardingLevel: 'beginner' | 'intermediate' | 'advanced' | null;
  credits: number; plan: 'free' | 'scholar' | 'aspirant' | 'achiever'; planExpiresAt: ISODateTime | null;
  /**
   * ISO datetime at which the user clicked "Cancel Plan" in profile.
   *
   * Cancellation is non-destructive: the user keeps `plan` access until
   * `planExpiresAt`, no refund is issued, and the API simply stops nudging
   * them to renew. If the user buys again before `planExpiresAt`, the
   * billing flow clears this field (resume).
   *
   * null = active subscription (no cancel intent recorded).
   */
  planCancelledAt: ISODateTime | null;
  /**
   * Tri-state flag for the "plan step is mandatory" onboarding gate
   * introduced in PR-05.
   *  - `true`  : user has explicitly chosen a plan in /onboarding/plan
   *              (Free, or by going to /upgrade for a paid tier).
   *  - `false` : new user has reached at least the assessment but has NOT
   *              yet seen /onboarding/plan -- dashboard guard MUST send
   *              them there.
   *  - `undefined` : grandfathered user from before PR-05; we treat the
   *              field as already-chosen so they are not redirected back
   *              into onboarding mid-product.
   */
  onboardingPlanChosen?: boolean;
  currentStreak: number; bestStreak: number; lastDailyAt: ISODateTime | null;
  isVerified: boolean; createdAt: ISODateTime; updatedAt: ISODateTime;
}

export interface UserStoreInit { email: string; name: string; photoURL: string | null; primaryProvider: 'google' | 'phone'; }

export interface UserStore {
  getOrCreate(uid: UserId, init: UserStoreInit): Promise<StoredUser>;
  get(uid: UserId): Promise<StoredUser | null>;
  update(uid: UserId, data: Partial<StoredUser>): Promise<StoredUser>;
  /**
   * Recompute and persist the daily streak based on `lastDailyAt`.
   *
   * As of PR-03 this method NO LONGER awards credits; it just keeps the
   * streak fields in sync and tells the caller which streak milestones
   * (if any) were just crossed so the caller can run those awards through
   * the credit ledger (which gives us idempotency, expiry buckets, and a
   * proper history trail). Returns:
   *   - `streak`: the user's currentStreak after the bump
   *   - `wasBumped`: false on the second-and-later /me call of an IST day
   *   - `crossedSeven` / `crossedThirty`: true on the single bump that
   *     promotes the streak to 7 or 30, so a stair-step bonus fires once.
   */
  bumpStreak(uid: UserId): Promise<{
    streak: number;
    wasBumped: boolean;
    crossedSeven: boolean;
    crossedThirty: boolean;
  }>;
  listAll?(): Promise<StoredUser[]>;
}

function newUser(uid: UserId, init: UserStoreInit, now: string): StoredUser {
  return {
    id: uid, firebaseUid: uid, email: init.email, name: init.name, phone: null,
    photoURL: init.photoURL, primaryProvider: init.primaryProvider, role: 'student',
    language: 'en', targetExam: null, classLevel: null, board: null, school: null,
    dob: null, aim: null, onboardingScore: null, onboardingLevel: null,
    // Cached balance starts at zero -- the credit ledger is the source of
    // truth and the `users.ts /me` handler awards `signup_verified` (+100)
    // through the ledger on first contact, which updates this cache via
    // FieldValue.increment.
    credits: 0, plan: 'free', planExpiresAt: null, planCancelledAt: null,
    // New users haven't seen the post-assessment plan-selection step yet;
    // the dashboard guard sends them to /onboarding/plan on first access.
    onboardingPlanChosen: false,
    currentStreak: 0, bestStreak: 0, lastDailyAt: null, isVerified: false,
    createdAt: asISODateTime(now), updatedAt: asISODateTime(now),
  };
}

function istDateKey(iso: string): string {
  const t = new Date(iso).getTime() + 5.5 * 60 * 60 * 1000;
  const d = new Date(t);
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth()+1).padStart(2,'0')}-${String(d.getUTCDate()).padStart(2,'0')}`;
}

function dayDelta(a: string, b: string): number {
  return Math.round((new Date(`${b}T00:00:00Z`).getTime() - new Date(`${a}T00:00:00Z`).getTime()) / 86400000);
}

function computeStreak(prev: { currentStreak: number; bestStreak: number; lastDailyAt: ISODateTime | null }) {
  const now = new Date().toISOString();
  const today = istDateKey(now);
  const last = prev.lastDailyAt ? istDateKey(prev.lastDailyAt) : null;
  if (last === today) return { currentStreak: prev.currentStreak, bestStreak: prev.bestStreak, alreadyBumped: true };
  let current = 1;
  if (last && dayDelta(last, today) === 1) current = prev.currentStreak + 1;
  return { currentStreak: current, bestStreak: Math.max(prev.bestStreak, current), alreadyBumped: false };
}

export class InMemoryUserStore implements UserStore {
  private users = new Map<UserId, StoredUser>();
  async getOrCreate(uid: UserId, init: UserStoreInit) { const e = this.users.get(uid); if (e) return e; const u = newUser(uid, init, new Date().toISOString()); this.users.set(uid, u); return u; }
  async get(uid: UserId) { return this.users.get(uid) ?? null; }
  async update(uid: UserId, data: Partial<StoredUser>) { const u = this.users.get(uid); if (!u) throw new Error(`user ${uid} not found`); const updated = { ...u, ...data, updatedAt: asISODateTime(new Date().toISOString()) }; this.users.set(uid, updated); return updated; }
  async listAll() { return Array.from(this.users.values()); }
  async bumpStreak(uid: UserId) {
    const u = this.users.get(uid); if (!u) throw new Error(`user ${uid} not found`);
    const { currentStreak, bestStreak, alreadyBumped } = computeStreak(u);
    if (alreadyBumped) {
      return { streak: u.currentStreak, wasBumped: false, crossedSeven: false, crossedThirty: false };
    }
    const updated: StoredUser = {
      ...u,
      currentStreak,
      bestStreak,
      lastDailyAt: asISODateTime(new Date().toISOString()),
      updatedAt: asISODateTime(new Date().toISOString()),
    };
    this.users.set(uid, updated);
    return {
      streak: currentStreak,
      wasBumped: true,
      crossedSeven: currentStreak === 7,
      crossedThirty: currentStreak === 30,
    };
  }
}

const COL = 'users';
export class FirestoreUserStore implements UserStore {
  constructor(private readonly db: Firestore) {}
  async getOrCreate(uid: UserId, init: UserStoreInit) {
    const ref = this.db.collection(COL).doc(uid);
    const snap = await ref.get();
    if (snap.exists) {
      // Existing user: return as-is. Credit grants (including the
      // signup_verified +100) flow through the ledger from the /me handler;
      // they are idempotent on (userId, source) so calling /me ten times
      // never grants more than once.
      return snap.data() as StoredUser;
    }

    // Before creating: check for duplicate by email (merge if found)
    if (init.email) {
      try {
        const dupeSnap = await this.db.collection(COL).where('email', '==', init.email).limit(1).get();
        if (!dupeSnap.empty) {
          const dupeDoc = dupeSnap.docs[0]!;
          const dupeData = dupeDoc.data() as StoredUser;
          // Merge: copy existing user data to new UID doc, delete old
          const merged: StoredUser = { ...dupeData, id: uid, firebaseUid: uid, updatedAt: asISODateTime(new Date().toISOString()) };
          await ref.set(merged);
          // Delete the old duplicate document
          if (dupeDoc.id !== uid) {
            await this.db.collection(COL).doc(dupeDoc.id).delete().catch(() => {});
          }
          return merged;
        }
      } catch { /* dedup check failed — continue with creation */ }
    }

    const u = newUser(uid, init, new Date().toISOString());
    await ref.set(u);
    return u;
  }
  async get(uid: UserId) {
    const snap = await this.db.collection(COL).doc(uid).get();
    if (!snap.exists) return null;
    const user = snap.data() as StoredUser;
    // Safety: if credits is undefined/null, return as 0
    if (user.credits === undefined || user.credits === null) {
      user.credits = 0;
    }
    return user;
  }
  async update(uid: UserId, data: Partial<StoredUser>) { const ref = this.db.collection(COL).doc(uid); await ref.set({ ...data, updatedAt: new Date().toISOString() }, { merge: true }); return (await ref.get()).data() as StoredUser; }
  async listAll() { const snap = await this.db.collection('users').limit(100).get(); return snap.docs.map(d => d.data() as StoredUser); }
  async bumpStreak(uid: UserId) {
    const ref = this.db.collection(COL).doc(uid);
    return this.db.runTransaction(async (tx) => {
      const snap = await tx.get(ref); if (!snap.exists) throw new Error(`user ${uid} not found`);
      const cur = snap.data() as StoredUser;
      const { currentStreak, bestStreak, alreadyBumped } = computeStreak(cur);
      if (alreadyBumped) {
        return { streak: cur.currentStreak, wasBumped: false, crossedSeven: false, crossedThirty: false };
      }
      const now = asISODateTime(new Date().toISOString());
      // Streak fields only -- no direct credit mutation. Credits flow
      // through the ledger from the route handler.
      tx.set(ref, { currentStreak, bestStreak, lastDailyAt: now, updatedAt: now }, { merge: true });
      return {
        streak: currentStreak,
        wasBumped: true,
        crossedSeven: currentStreak === 7,
        crossedThirty: currentStreak === 30,
      };
    });
  }
}
