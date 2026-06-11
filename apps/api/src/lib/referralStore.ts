import { Firestore } from 'firebase-admin/firestore';
import type { UserId } from '@nexigrate/shared';
import type { Logger } from '../logger.js';

/**
 * Referral system store.
 *
 * Handles referral code generation, application, and completion.
 * Referral flow:
 * 1. User generates a referral code (8-char alphanumeric)
 * 2. New user signs up with referral code → pending referral created
 * 3. New user completes onboarding → referral completed, credits awarded
 */

export interface ReferralRecord {
  id: string;
  referrerId: UserId;
  referredUid: UserId;
  referralCode: string;
  status: 'pending' | 'completed';
  createdAt: string;
  completedAt: string | null;
}

export interface ReferralStats {
  code: string;
  referralUrl: string;
  totalReferrals: number;
  pendingReferrals: number;
  completedReferrals: number;
  totalEarned: number;
}

export interface ReferralStore {
  createReferralCode(uid: UserId): Promise<string>;
  getReferralCode(uid: UserId): Promise<string | null>;
  applyReferral(newUserUid: UserId, referralCode: string): Promise<UserId | null>;
  completeReferral(newUserUid: UserId): Promise<{ referrerId: UserId } | null>;
  getStats(uid: UserId): Promise<ReferralStats>;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function generateCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no I/O/0/1 to avoid confusion
  let code = '';
  for (let i = 0; i < 8; i++) {
    code += chars[Math.floor(Math.random() * chars.length)];
  }
  return code;
}

// ─── In-Memory Implementation ─────────────────────────────────────────────────

export class InMemoryReferralStore implements ReferralStore {
  private codes = new Map<UserId, string>(); // uid → code
  private codeToUid = new Map<string, UserId>(); // code → uid
  private referrals: ReferralRecord[] = [];

  async createReferralCode(uid: UserId): Promise<string> {
    const existing = this.codes.get(uid);
    if (existing) return existing;
    const code = generateCode();
    this.codes.set(uid, code);
    this.codeToUid.set(code, uid);
    return code;
  }

  async getReferralCode(uid: UserId): Promise<string | null> {
    return this.codes.get(uid) ?? null;
  }

  async applyReferral(newUserUid: UserId, referralCode: string): Promise<UserId | null> {
    const referrerId = this.codeToUid.get(referralCode.toUpperCase());
    if (!referrerId) return null;
    if (referrerId === newUserUid) return null; // can't refer yourself

    // Check if already applied
    const exists = this.referrals.find(r => r.referredUid === newUserUid);
    if (exists) return null;

    const record: ReferralRecord = {
      id: crypto.randomUUID(),
      referrerId,
      referredUid: newUserUid,
      referralCode: referralCode.toUpperCase(),
      status: 'pending',
      createdAt: new Date().toISOString(),
      completedAt: null,
    };
    this.referrals.push(record);
    return referrerId;
  }

  async completeReferral(newUserUid: UserId): Promise<{ referrerId: UserId } | null> {
    const record = this.referrals.find(r => r.referredUid === newUserUid && r.status === 'pending');
    if (!record) return null;
    record.status = 'completed';
    record.completedAt = new Date().toISOString();
    return { referrerId: record.referrerId };
  }

  async getStats(uid: UserId): Promise<ReferralStats> {
    const code = this.codes.get(uid) ?? '';
    const myReferrals = this.referrals.filter(r => r.referrerId === uid);
    const completed = myReferrals.filter(r => r.status === 'completed').length;
    return {
      code,
      referralUrl: code ? `https://app.nexigrate.com/signin?ref=${code}` : '',
      totalReferrals: myReferrals.length,
      pendingReferrals: myReferrals.filter(r => r.status === 'pending').length,
      completedReferrals: completed,
      totalEarned: completed * 50, // referral_signup credits per completed referral (matches Firestore store)
    };
  }
}

// ─── Firestore Implementation ─────────────────────────────────────────────────

export class FirestoreReferralStore implements ReferralStore {
  constructor(private readonly db: Firestore) {}

  async createReferralCode(uid: UserId): Promise<string> {
    const userRef = this.db.collection('users').doc(uid);
    const snap = await userRef.get();
    const existing = snap.data()?.referralCode;
    if (existing) return existing;

    const code = generateCode();
    await userRef.set({ referralCode: code }, { merge: true });
    // Also index for lookup
    await this.db.collection('referralCodes').doc(code).set({ uid, createdAt: new Date().toISOString() });
    return code;
  }

  async getReferralCode(uid: UserId): Promise<string | null> {
    const snap = await this.db.collection('users').doc(uid).get();
    return snap.data()?.referralCode ?? null;
  }

  async applyReferral(newUserUid: UserId, referralCode: string): Promise<UserId | null> {
    const code = referralCode.toUpperCase();
    const codeSnap = await this.db.collection('referralCodes').doc(code).get();
    if (!codeSnap.exists) return null;

    const referrerId = codeSnap.data()?.uid as UserId;
    if (!referrerId || referrerId === newUserUid) return null;

    // Check if already applied
    const existing = await this.db.collection('referrals')
      .where('referredUid', '==', newUserUid).limit(1).get();
    if (!existing.empty) return null;

    const record: ReferralRecord = {
      id: crypto.randomUUID(),
      referrerId,
      referredUid: newUserUid,
      referralCode: code,
      status: 'pending',
      createdAt: new Date().toISOString(),
      completedAt: null,
    };
    await this.db.collection('referrals').doc(record.id).set(record);

    // Save referredBy on new user
    await this.db.collection('users').doc(newUserUid).set({ referredBy: referrerId }, { merge: true });

    return referrerId;
  }

  async completeReferral(newUserUid: UserId): Promise<{ referrerId: UserId } | null> {
    const snap = await this.db.collection('referrals')
      .where('referredUid', '==', newUserUid)
      .where('status', '==', 'pending')
      .limit(1).get();

    if (snap.empty) return null;

    const doc = snap.docs[0]!;
    const record = doc.data() as ReferralRecord;
    await doc.ref.update({ status: 'completed', completedAt: new Date().toISOString() });
    return { referrerId: record.referrerId };
  }

  async getStats(uid: UserId): Promise<ReferralStats> {
    const code = await this.getReferralCode(uid) ?? '';
    const snap = await this.db.collection('referrals')
      .where('referrerId', '==', uid).get();
    const referrals = snap.docs.map(d => d.data() as ReferralRecord);
    const completed = referrals.filter(r => r.status === 'completed').length;
    return {
      code,
      referralUrl: code ? `https://app.nexigrate.com/signin?ref=${code}` : '',
      totalReferrals: referrals.length,
      pendingReferrals: referrals.filter(r => r.status === 'pending').length,
      completedReferrals: completed,
      totalEarned: completed * 50,
    };
  }
}
