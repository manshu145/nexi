import type { ISODateTime, SubscriptionId, UserId } from './brand.js';
import type { PlanId } from '../constants/subscriptions.js';

/**
 * Subscription tiers and Razorpay subscription state.
 */
export type SubscriptionPlan =
  | 'scholar'
  | 'aspirant'
  | 'achiever';

export type SubscriptionStatus =
  | 'active'
  | 'trialing'
  | 'past_due'
  | 'cancelled'
  | 'lapsed';

export type SubscriptionInterval = 'monthly' | 'yearly';

export interface Subscription {
  id: SubscriptionId;
  userId: UserId;
  plan: SubscriptionPlan;
  interval: SubscriptionInterval;
  status: SubscriptionStatus;
  razorpaySubscriptionId: string;
  razorpayCustomerId: string | null;
  currentPeriodEnd: ISODateTime;
  cancelAtPeriodEnd: boolean;
  amountInr: number;
  createdAt: ISODateTime;
  updatedAt: ISODateTime;
}

/** Coupon for plan discounts */
export interface Coupon {
  code: string;
  discountType: 'percent' | 'flat';
  discountValue: number;          // percent (10 = 10%) or flat (50 = ₹50 off)
  maxUses: number;                // 0 = unlimited
  usedCount: number;
  expiresAt: string | null;       // ISO datetime or null for no expiry
  isActive: boolean;
  applicablePlans: PlanId[];
  createdAt: string;
}

/** Billing order stored in Firestore */
export interface BillingOrder {
  orderId: string;
  uid: string;
  planId: PlanId;
  amount: number;                 // in paise
  originalAmount: number;         // before discount, in paise
  couponCode: string | null;
  status: 'pending' | 'completed' | 'failed';
  paymentId: string | null;
  createdAt: string;
  completedAt: string | null;
}
