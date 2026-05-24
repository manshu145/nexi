import type { Firestore } from 'firebase-admin/firestore';
import {
  asISODateTime,
  type ISODateTime,
  type Referral,
  type ReferralId,
  type ReferralStatus,
  type UserId,
} from '@nexigrate/shared';

/**
 * Referral persistence (Phase 16).
 *
 * Two collections:
 *   referrals/{id}                  one row per (referrer -> referred) link
 *   referral_codes/{code}           reverse-lookup doc: { code, userId }
 *
 * The reverse-lookup doc lets the attribution endpoint resolve a code to
 * its owning user with a single `.get()` instead of a Firestore query
 * (which would need a composite index and an extra round-trip on cold
 * Cloud Run instances). Codes are stable per user, so the doc is written
 * once on first call to `getOrAssignCode`.
 */

export interface ReferralStore {
  /**
   * Get the user's stable referral code, creating the reverse-lookup doc
   * on first call. Idempotent: subsequent calls return the existing code.
   */
  getOrAssignCode(userId: UserId, code: string): Promise<string>;

  /**
   * Reverse-lookup a code to the user who owns it, or null if the code
   * isn't registered. Used by the attribution endpoint.
   */
  resolveCode(code: string): Promise<UserId | null>;

  /** Idempotent: re-attributing the same `referredUserId` is a no-op. */
  attribute(input: {
    id: ReferralId;
    referrerUserId: UserId;
    referredUserId: UserId;
    code: string;
    now: ISODateTime;
  }): Promise<{ referral: Referral; firstTime: boolean }>;

  /** All referrals where `userId` is the referrer. */
  listForReferrer(userId: UserId): Promise<Referral[]>;

  /** The single referral row where `userId` is the referred. */
  getForReferred(userId: UserId): Promise<Referral | null>;

  /**
   * Mark a referral retained (referred user has been active >=7 days). The
   * caller is responsible for awarding the bonus credits via the ledger
   * before/after this call; the store just records the status transition.
   * Idempotent on `status === 'retained'`.
   */
  markRetained(id: ReferralId, retainedAt: ISODateTime): Promise<Referral | null>;

  /** Promote 'pending' -> 'rewarded' once the referrer's signup credits land. */
  markRewarded(id: ReferralId, now: ISODateTime): Promise<Referral | null>;
}

const REF_COLL = 'referrals';
const CODE_COLL = 'referral_codes';

// ---------- in-memory ------------------------------------------------------

export class InMemoryReferralStore implements ReferralStore {
  private referrals = new Map<ReferralId, Referral>();
  private byReferred = new Map<UserId, ReferralId>();
  private codes = new Map<string, UserId>();

  async getOrAssignCode(userId: UserId, code: string): Promise<string> {
    const existing = this.codes.get(code);
    if (existing && existing !== userId) {
      // Code collision -- callers should pre-generate a per-user code
      // (see `deriveReferralCode`) so this should never happen, but we
      // surface a stable error rather than silently overwriting.
      throw new Error(`referral code collision: ${code}`);
    }
    this.codes.set(code, userId);
    return code;
  }

  async resolveCode(code: string): Promise<UserId | null> {
    return this.codes.get(code) ?? null;
  }

  async attribute(input: {
    id: ReferralId;
    referrerUserId: UserId;
    referredUserId: UserId;
    code: string;
    now: ISODateTime;
  }): Promise<{ referral: Referral; firstTime: boolean }> {
    const existingId = this.byReferred.get(input.referredUserId);
    if (existingId) {
      const existing = this.referrals.get(existingId);
      if (existing) return { referral: existing, firstTime: false };
    }
    const referral: Referral = {
      id: input.id,
      referrerUserId: input.referrerUserId,
      referredUserId: input.referredUserId,
      code: input.code,
      status: 'pending',
      signedUpAt: input.now,
      verifiedAt: null,
      retainedAt: null,
      createdAt: input.now,
      updatedAt: input.now,
    };
    this.referrals.set(input.id, referral);
    this.byReferred.set(input.referredUserId, input.id);
    return { referral, firstTime: true };
  }

  async listForReferrer(userId: UserId): Promise<Referral[]> {
    const out: Referral[] = [];
    for (const r of this.referrals.values()) {
      if (r.referrerUserId === userId) out.push(r);
    }
    out.sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
    return out;
  }

  async getForReferred(userId: UserId): Promise<Referral | null> {
    const id = this.byReferred.get(userId);
    if (!id) return null;
    return this.referrals.get(id) ?? null;
  }

  async markRetained(id: ReferralId, retainedAt: ISODateTime): Promise<Referral | null> {
    const cur = this.referrals.get(id);
    if (!cur) return null;
    if (cur.status === 'retained') return cur;
    const updated: Referral = {
      ...cur,
      status: 'retained',
      retainedAt,
      updatedAt: retainedAt,
    };
    this.referrals.set(id, updated);
    return updated;
  }

  async markRewarded(id: ReferralId, now: ISODateTime): Promise<Referral | null> {
    const cur = this.referrals.get(id);
    if (!cur) return null;
    if (cur.status === 'rewarded' || cur.status === 'retained') return cur;
    const updated: Referral = {
      ...cur,
      status: 'rewarded',
      verifiedAt: cur.verifiedAt ?? now,
      updatedAt: now,
    };
    this.referrals.set(id, updated);
    return updated;
  }
}

// ---------- firestore ------------------------------------------------------

export class FirestoreReferralStore implements ReferralStore {
  constructor(private readonly db: Firestore) {}

  async getOrAssignCode(userId: UserId, code: string): Promise<string> {
    const ref = this.db.collection(CODE_COLL).doc(code);
    const snap = await ref.get();
    if (snap.exists) {
      const data = snap.data() as { userId: UserId };
      if (data.userId !== userId) {
        throw new Error(`referral code collision: ${code}`);
      }
      return code;
    }
    await ref.set({ code, userId, createdAt: new Date().toISOString() });
    return code;
  }

  async resolveCode(code: string): Promise<UserId | null> {
    const snap = await this.db.collection(CODE_COLL).doc(code).get();
    if (!snap.exists) return null;
    return (snap.data() as { userId: UserId }).userId;
  }

  async attribute(input: {
    id: ReferralId;
    referrerUserId: UserId;
    referredUserId: UserId;
    code: string;
    now: ISODateTime;
  }): Promise<{ referral: Referral; firstTime: boolean }> {
    // Idempotent on the (referredUserId) key. We use the referredUserId
    // as the doc id so a re-attribution attempt is a deterministic
    // collision rather than a silent dupe.
    const ref = this.db.collection(REF_COLL).doc(input.referredUserId);
    return this.db.runTransaction(async (tx) => {
      const snap = await tx.get(ref);
      if (snap.exists) {
        return { referral: snap.data() as Referral, firstTime: false };
      }
      const referral: Referral = {
        id: input.id,
        referrerUserId: input.referrerUserId,
        referredUserId: input.referredUserId,
        code: input.code,
        status: 'pending',
        signedUpAt: input.now,
        verifiedAt: null,
        retainedAt: null,
        createdAt: input.now,
        updatedAt: input.now,
      };
      tx.set(ref, referral);
      return { referral, firstTime: true };
    });
  }

  async listForReferrer(userId: UserId): Promise<Referral[]> {
    const snap = await this.db
      .collection(REF_COLL)
      .where('referrerUserId', '==', userId)
      .limit(500)
      .get();
    const rows = snap.docs.map((d) => d.data() as Referral);
    rows.sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
    return rows;
  }

  async getForReferred(userId: UserId): Promise<Referral | null> {
    const snap = await this.db.collection(REF_COLL).doc(userId).get();
    return snap.exists ? (snap.data() as Referral) : null;
  }

  async markRetained(id: ReferralId, retainedAt: ISODateTime): Promise<Referral | null> {
    return this.transitionStatus(id, 'retained', retainedAt);
  }

  async markRewarded(id: ReferralId, now: ISODateTime): Promise<Referral | null> {
    return this.transitionStatus(id, 'rewarded', now);
  }

  private async transitionStatus(
    id: ReferralId,
    target: ReferralStatus,
    at: ISODateTime,
  ): Promise<Referral | null> {
    // Find the referral by id (which is also the referredUserId).
    const ref = this.db.collection(REF_COLL).doc(id);
    return this.db.runTransaction(async (tx) => {
      const snap = await tx.get(ref);
      if (!snap.exists) return null;
      const cur = snap.data() as Referral;
      // 'retained' is terminal; 'rewarded' won't downgrade either.
      if (cur.status === 'retained') return cur;
      if (target === 'rewarded' && cur.status === 'rewarded') return cur;
      const updated: Referral = {
        ...cur,
        status: target,
        ...(target === 'rewarded' ? { verifiedAt: cur.verifiedAt ?? at } : {}),
        ...(target === 'retained' ? { retainedAt: at } : {}),
        updatedAt: at,
      };
      tx.set(ref, updated);
      return updated;
    });
  }
}

/**
 * Derive a stable, human-typeable referral code from a user id. Codes are
 * 8 characters from a 32-char alphabet that drops easily-confused glyphs
 * (no 0/O, no 1/I/L). Same uid always maps to the same code.
 */
export function deriveReferralCode(userId: UserId): string {
  const ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  // Cheap deterministic hash. We don't need cryptographic strength here --
  // the codes are public-ish (anyone can guess one anyway) and the
  // attribution check requires a Firebase auth token, so brute force is
  // rate-limited by upstream auth + per-IP rate limiter.
  let h = 5381;
  for (let i = 0; i < userId.length; i++) {
    h = (h * 33) ^ userId.charCodeAt(i);
  }
  // Mix with a second pass so different uids of similar prefixes diverge.
  let h2 = 2166136261;
  for (let i = userId.length - 1; i >= 0; i--) {
    h2 ^= userId.charCodeAt(i);
    h2 = Math.imul(h2, 16777619);
  }
  let v = ((h ^ h2) >>> 0).toString(2).padStart(32, '0');
  // Map 5-bit chunks to alphabet indices (chunks length: 32/5 = 6.4, we
  // expand to 8 chars by also using the low bits of the original hash).
  const out: string[] = [];
  for (let i = 0; i < 6; i++) {
    const slice = v.slice(i * 5, i * 5 + 5);
    out.push(ALPHABET[parseInt(slice, 2) % ALPHABET.length]!);
  }
  // Pad to 8 with two more from h2 for extra entropy.
  out.push(ALPHABET[(h2 >>> 0) % ALPHABET.length]!);
  out.push(ALPHABET[((h2 >>> 5) >>> 0) % ALPHABET.length]!);
  return out.join('');
}
