import type { Firestore } from 'firebase-admin/firestore';
import {
  asISODateTime,
  type ISODateTime,
  type Subscription,
  type SubscriptionPlan,
  type SubscriptionInterval,
  type SubscriptionStatus,
  type UserId,
} from '@nexigrate/shared';

/**
 * Subscription persistence.
 *
 * Phase 3 keeps subscriptions as one document per user (the active sub).
 * Histor-of-subscriptions and plan-change events live in `audit_log` later.
 *
 * Two implementations parallel `userStore`:
 *   - InMemorySubscriptionStore: process-local, used in tests/dev
 *   - FirestoreSubscriptionStore: backed by `subscriptions/{userId}` doc
 */

export interface ActivateInput {
  userId: UserId;
  plan: SubscriptionPlan;
  interval: SubscriptionInterval;
  amountInr: number;
  /** Razorpay payment id (one-time payment) or subscription id (recurring). */
  razorpayPaymentId: string;
  razorpayOrderId: string;
}

export interface SubscriptionStore {
  get(userId: UserId): Promise<Subscription | null>;
  /**
   * Idempotent: calling activate() twice with the same razorpayPaymentId
   * is a no-op and returns the existing subscription.
   */
  activate(input: ActivateInput): Promise<Subscription>;
  cancel(userId: UserId): Promise<Subscription | null>;
}

function plusDays(iso: ISODateTime, days: number): ISODateTime {
  const t = new Date(iso).getTime() + days * 24 * 60 * 60 * 1000;
  return asISODateTime(new Date(t).toISOString());
}

function makeSub(input: ActivateInput, now: ISODateTime): Subscription {
  const days = input.interval === 'yearly' ? 365 : 30;
  return {
    id: `sub_${input.userId}_${Date.now()}` as Subscription['id'],
    userId: input.userId,
    plan: input.plan,
    interval: input.interval,
    status: 'active' as SubscriptionStatus,
    razorpaySubscriptionId: input.razorpayPaymentId, // for one-time payments, store the payment id
    razorpayCustomerId: null,
    currentPeriodEnd: plusDays(now, days),
    cancelAtPeriodEnd: false,
    amountInr: input.amountInr,
    createdAt: now,
    updatedAt: now,
  };
}

export class InMemorySubscriptionStore implements SubscriptionStore {
  private byUser = new Map<UserId, Subscription>();
  private byPaymentId = new Map<string, Subscription>();

  async get(userId: UserId): Promise<Subscription | null> {
    return this.byUser.get(userId) ?? null;
  }

  async activate(input: ActivateInput): Promise<Subscription> {
    const existingByPay = this.byPaymentId.get(input.razorpayPaymentId);
    if (existingByPay) return existingByPay;
    const now = asISODateTime(new Date().toISOString());
    const sub = makeSub(input, now);
    this.byUser.set(input.userId, sub);
    this.byPaymentId.set(input.razorpayPaymentId, sub);
    return sub;
  }

  async cancel(userId: UserId): Promise<Subscription | null> {
    const cur = this.byUser.get(userId);
    if (!cur) return null;
    const updated: Subscription = {
      ...cur,
      cancelAtPeriodEnd: true,
      status: 'cancelled',
      updatedAt: asISODateTime(new Date().toISOString()),
    };
    this.byUser.set(userId, updated);
    return updated;
  }
}

const COLLECTION = 'subscriptions';
const PAYMENT_INDEX = 'subscription_payment_index';

export class FirestoreSubscriptionStore implements SubscriptionStore {
  constructor(private readonly db: Firestore) {}

  async get(userId: UserId): Promise<Subscription | null> {
    const snap = await this.db.collection(COLLECTION).doc(userId).get();
    return snap.exists ? (snap.data() as Subscription) : null;
  }

  async activate(input: ActivateInput): Promise<Subscription> {
    const idxRef = this.db.collection(PAYMENT_INDEX).doc(input.razorpayPaymentId);
    const userRef = this.db.collection(COLLECTION).doc(input.userId);
    return this.db.runTransaction(async (tx) => {
      const idxSnap = await tx.get(idxRef);
      if (idxSnap.exists) {
        // Already activated; return the recorded subscription.
        const existing = await tx.get(userRef);
        if (existing.exists) return existing.data() as Subscription;
      }
      const now = asISODateTime(new Date().toISOString());
      const sub = makeSub(input, now);
      tx.set(userRef, sub);
      tx.set(idxRef, { userId: input.userId, createdAt: now });
      return sub;
    });
  }

  async cancel(userId: UserId): Promise<Subscription | null> {
    const ref = this.db.collection(COLLECTION).doc(userId);
    const snap = await ref.get();
    if (!snap.exists) return null;
    const cur = snap.data() as Subscription;
    const updated: Subscription = {
      ...cur,
      cancelAtPeriodEnd: true,
      status: 'cancelled',
      updatedAt: asISODateTime(new Date().toISOString()),
    };
    await ref.set(updated);
    return updated;
  }
}
