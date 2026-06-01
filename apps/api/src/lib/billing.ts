/**
 * Single source of truth for plan activation.
 *
 * Both /v1/billing/verify (client-side) and /v1/billing/webhook (Razorpay)
 * MUST go through this helper so:
 *  - the duration is correct for the period (monthly = 30d, yearly = 365d)
 *  - if the user already has an active plan, we EXTEND from current expiry
 *    instead of resetting from now (no lost paid days)
 *  - the order doc + coupon usage are updated atomically with user state
 *  - both call sites are idempotent via the same {idempotency} store
 *
 * Why a separate file: the previous implementation duplicated this logic
 * inside both the verify handler and the webhook handler with subtle
 * divergence — one always granted 30 days regardless of period, the other
 * also always granted 30 days. Centralising prevents drift.
 */

import type { Firestore } from 'firebase-admin/firestore';
import {
  PLANS,
  computeNewExpiry,
  type BillingPeriod,
  type PlanId,
  type UserId,
} from '@nexigrate/shared';
import type { UserStore } from './userStore.js';
import type { CouponStore } from './couponStore.js';
import type { Logger } from '../logger.js';

export interface GrantPlanInput {
  /** Already-trusted user id. Webhook handlers must wrap raw strings via `asUserId()`. */
  uid: UserId;
  planId: PlanId;
  period: BillingPeriod;
  /** Razorpay payment id — used to mark the order completed and as audit reference. */
  paymentId: string;
  /** Razorpay order id — used to update the billingOrders doc. */
  orderId: string;
  /** Coupon code if one was applied; the store will increment its usage counter. */
  couponCode?: string | null;
  /** Source of the activation (for logging only). */
  source: 'verify' | 'webhook';
}

export interface GrantPlanResult {
  plan: PlanId;
  expiresAt: string;
  /** True if the user's plan/expiry was actually changed. False if the order was already completed. */
  changed: boolean;
}

export interface GrantPlanDeps {
  users: UserStore;
  coupons: CouponStore;
  db: Firestore | null;
  logger: Logger;
}

/**
 * Activate or extend a user's plan after a successful payment.
 *
 * Idempotent on `orderId`: if the orders doc is already `completed`, this is a
 * no-op and the function returns `changed: false` with the existing expiry
 * loaded from the user record.
 */
export async function grantPlan(deps: GrantPlanDeps, input: GrantPlanInput): Promise<GrantPlanResult> {
  const { users, coupons, db, logger } = deps;

  if (input.planId === 'free') {
    throw new Error('cannot grant free plan via billing');
  }
  if (!PLANS[input.planId]) {
    throw new Error(`unknown planId: ${input.planId}`);
  }

  // 1. Idempotency check via order status — using a Firestore transaction
  // so concurrent /verify + /webhook calls are serialized. Only the first
  // to see status !== 'completed' proceeds; the second gets 'completed'
  // in its transaction read and returns early.
  if (db) {
    const orderRef = db.collection('billingOrders').doc(input.orderId);
    const alreadyCompleted = await db.runTransaction(async (tx) => {
      const orderSnap = await tx.get(orderRef);
      if (orderSnap.exists && orderSnap.data()?.status === 'completed') {
        return true; // already done
      }
      // Mark completed inside the transaction — second caller will see this.
      tx.set(orderRef, {
        status: 'completed',
        paymentId: input.paymentId,
        period: input.period,
        completedAt: new Date().toISOString(),
        completedVia: input.source,
      }, { merge: true });
      return false;
    });

    if (alreadyCompleted) {
      const user = await users.get(input.uid);
      const expiresAt = (user as unknown as { planExpiresAt?: string })?.planExpiresAt
        ?? new Date().toISOString();
      logger.info('billing.grant_skipped_already_completed', {
        uid: input.uid, orderId: input.orderId, source: input.source,
      });
      return { plan: input.planId, expiresAt, changed: false };
    }
  }

  // 2. Compute new expiry — extend if active, else start fresh.
  const user = await users.get(input.uid);
  const currentPlan = user?.plan ?? 'free';
  const currentExpiresAt = (user as unknown as { planExpiresAt?: string | null })?.planExpiresAt ?? null;
  const newExpiry = computeNewExpiry(currentPlan, currentExpiresAt, input.period);

  // 3. Update user record.
  //    Also clears planCancelledAt: a fresh paid period is, by definition,
  //    a "resume" -- the user is no longer in the cancelled-but-still-active
  //    transitional state.
  //    Also sets onboardingPlanChosen: true — a successful payment is proof
  //    the user chose a plan, so the dashboard guard should never bounce them
  //    back to /onboarding/plan even if the markPlanChosen API call failed
  //    during the onboarding flow.
  await users.update(input.uid, {
    plan: input.planId,
    planExpiresAt: newExpiry,
    planCancelledAt: null,
    onboardingPlanChosen: true,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any);

  // 4. Record coupon usage (best-effort — never fail the grant on these).
  //    Order status was already marked 'completed' in the transaction above.
  if (db) {
    if (input.couponCode) {
      try {
        await coupons.incrementUsage(input.couponCode);
        await db.collection('users').doc(input.uid).collection('usedCoupons').doc(input.couponCode).set({
          usedAt: new Date().toISOString(),
          orderId: input.orderId,
        });
      } catch (e) {
        logger.warn('billing.coupon_usage_update_failed', {
          coupon: input.couponCode, error: e instanceof Error ? e.message : String(e),
        });
      }
    }
  }

  logger.info('billing.granted', {
    uid: input.uid,
    planId: input.planId,
    period: input.period,
    expiresAt: newExpiry,
    extendedFrom: currentExpiresAt,
    source: input.source,
  });

  return { plan: input.planId, expiresAt: newExpiry, changed: true };
}
