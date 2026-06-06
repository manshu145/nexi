import { Firestore } from 'firebase-admin/firestore';
import { asISODateTime, type ExamSlug, type ISODateTime, type UserId, type Board, type ClassLevel } from '@nexigrate/shared';

export interface StoredUser {
  id: UserId; firebaseUid: string; email: string; name: string; phone: string | null;
  photoURL: string | null; primaryProvider: 'google' | 'phone'; role: 'student' | 'admin';
  language: 'en' | 'hi'; targetExam: ExamSlug | null; classLevel: ClassLevel | null;
  /**
   * Additional exams the user is enrolled in beyond `targetExam` (Sprint 5
   * multi-exam). Full enrolled set = [targetExam, ...secondaryExams] (deduped).
   * "Switching" active exam rewrites targetExam and moves the previous one
   * here. Plan's `maxExams` caps the total. Undefined for legacy users.
   */
  secondaryExams?: ExamSlug[];
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
  isVerified: boolean;
  /**
   * True iff the user has completed Firebase phone-number verification
   * (either a phone-only signup, or an email/Google signup that was
   * subsequently linked at /verify-phone). Set server-side from the
   * Firebase ID token's `phone_number` claim on every /me call -- the
   * client cannot lie about this.
   *
   * The dashboard guard treats `phoneVerified === true` as the gate;
   * legacy users who have a phone string but were created before this
   * field existed are auto-migrated on their next /me call (the flag is
   * derived from the trusted token claim, so they don't need to re-OTP).
   */
  phoneVerified: boolean;
  /**
   * Soft ban flag set by an admin via POST /v1/admin/users/:id/ban.
   * `false` (or undefined for grandfathered users) means normal access.
   * `true` means the admin UI shows a banned badge; future PRs will add
   * route-level enforcement so banned users can sign in but get 403 on
   * study, chat, and current-affairs routes (with a "your account has
   * been suspended" screen). This PR adds the field and the toggle so
   * the admin button stops being a no-op TODO.
   */
  banned?: boolean;
  /** When the ban was applied. Null if never banned. */
  bannedAt?: ISODateTime | null;
  /** Optional reason recorded by the admin for the audit trail. */
  banReason?: string | null;
  /**
   * PR-38: Push-notification device tokens. Stored as an array on the
   * user doc itself (not a separate collection) so the right-to-erasure
   * walk in lib/userData.ts wipes them automatically when an account
   * is deleted. Each entry carries a token (the FCM identifier the
   * client SDK gave us), platform hint, and timestamps so the cleanup
   * sweeper can age out stale tokens. The array is dedup'd on insert
   * by token value.
   *
   * `undefined` for grandfathered users from before PR-38; treat as `[]`.
   */
  fcmTokens?: Array<{
    token: string;
    platform?: 'web' | 'android' | 'ios';
    createdAt: ISODateTime;
    lastSeenAt: ISODateTime;
  }>;
  createdAt: ISODateTime; updatedAt: ISODateTime;
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
  /**
   * Top users by current streak (lock §5.4). Sorted by currentStreak
   * desc, then bestStreak desc. Excludes streak=0 users. Returns
   * sanitised public fields only -- email/phone never leak.
   */
  getStreakLeaderboard?(limit: number): Promise<Array<{
    userId: UserId; name: string; photoURL: string | null;
    currentStreak: number; bestStreak: number; targetExam: string | null;
  }>>;
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
    // Phone is unverified at signup; the /me handler flips this to true
    // once Firebase Auth has issued a token with a phone_number claim.
    phoneVerified: false,
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

  async getStreakLeaderboard(limit: number) {
    const all = Array.from(this.users.values()).filter(u => u.currentStreak > 0);
    all.sort((a, b) => {
      if (a.currentStreak !== b.currentStreak) return b.currentStreak - a.currentStreak;
      return b.bestStreak - a.bestStreak;
    });
    return all.slice(0, limit).map(u => ({
      userId: u.id,
      name: u.name,
      photoURL: u.photoURL,
      currentStreak: u.currentStreak,
      bestStreak: u.bestStreak,
      targetExam: u.targetExam,
    }));
  }
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
  async listAll() {
    // CRITICAL: do NOT use .orderBy('createdAt') here. Firestore's orderBy
    // SILENTLY DROPS any document that lacks the ordered field — so users
    // created before `createdAt` existed (phone-only / migrated / some test
    // users) were invisible to EVERY listAll consumer: the admin users list,
    // the push subscriber count, AND the push broadcast. That's why a device
    // that registered fine (the /push/test path reads me.fcmTokens directly
    // and worked: "1 of 1") showed up as "0 subscribers · 0 devices" in the
    // broadcast/status path (which enumerates via listAll).
    //
    // Fetch WITHOUT orderBy (document-id order) so no doc is ever dropped,
    // then sort freshest-first in memory (missing createdAt sorts last).
    const snap = await this.db.collection('users').limit(5000).get();
    // Always derive `id` from the Firestore doc id. Some legacy/migrated
    // docs don't carry an `id` FIELD inside the document body; mapping
    // d.data() alone left those users with id === undefined, which then
    // blew up the push-broadcast prune loop (deps.users.update(u.id, ...)
    // → "Value for argument documentPath is not a valid resource path.
    // Path must be a non-empty string."). Spreading d.id last guarantees
    // every row has a usable id for downstream writes.
    const rows = snap.docs.map(d => ({ ...(d.data() as StoredUser), id: d.id as UserId }));
    // Coerce to String before comparing: some legacy/test docs store
    // createdAt as a Firestore Timestamp or number, not an ISO string.
    // Calling .localeCompare on a non-string THREW here — which 500'd
    // /admin/push/send (the broadcast) while /push/status swallowed it in a
    // try/catch and just showed 0. String() makes the sort crash-proof.
    rows.sort((a, b) => String(b.createdAt ?? '').localeCompare(String(a.createdAt ?? '')));
    return rows;
  }

  async getStreakLeaderboard(limit: number) {
    // Composite-index-free read: filter by `currentStreak > 0` (single
    // range query) + orderBy currentStreak desc. Firestore handles this
    // with the auto-built single-field descending index. Sort by
    // bestStreak as a tiebreaker in JS since multi-field range+order
    // would require a composite index.
    const snap = await this.db.collection('users')
      .where('currentStreak', '>', 0)
      .orderBy('currentStreak', 'desc')
      .limit(Math.min(200, Math.max(limit, limit * 2))) // overfetch a little for tiebreak
      .get();
    const rows = snap.docs.map(d => d.data() as StoredUser);
    rows.sort((a, b) => {
      if (a.currentStreak !== b.currentStreak) return b.currentStreak - a.currentStreak;
      return b.bestStreak - a.bestStreak;
    });
    return rows.slice(0, limit).map(u => ({
      userId: u.id,
      name: u.name,
      photoURL: u.photoURL,
      currentStreak: u.currentStreak,
      bestStreak: u.bestStreak,
      targetExam: u.targetExam,
    }));
  }
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
