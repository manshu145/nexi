import type { ISODateTime, SubscriptionId, UserId } from './brand.js';

/**
 * Subscription tiers and Razorpay subscription state.
 *
 * Free users can fully use the app via the credits engine. Subscriptions are
 * an optional shortcut: pay a flat monthly fee for unlimited credits, no
 * daily-MCQ obligation, and a few premium features (current affairs daily
 * digest at higher tiers, expert AMAs at the top tier).
 *
 * Pricing in INR. Annual plans are 40% off the monthly rate.
 */
export type SubscriptionPlan =
  | 'scholar'    // Class 5-10 boards: ₹99/mo, ₹999/yr
  | 'aspirant'   // Class 11-12 + JEE/NEET: ₹299/mo, ₹2,999/yr
  | 'achiever';  // UPSC, SSC, State PSCs: ₹599/mo, ₹5,999/yr

export type SubscriptionStatus =
  | 'active'
  | 'trialing'
  | 'past_due'   // Razorpay reports a missed renewal
  | 'cancelled'  // user cancelled, will lapse at period end
  | 'lapsed';    // period ended without renewal

export type SubscriptionInterval = 'monthly' | 'yearly';

export interface Subscription {
  id: SubscriptionId;
  userId: UserId;
  plan: SubscriptionPlan;
  interval: SubscriptionInterval;
  status: SubscriptionStatus;
  /** Razorpay subscription id, e.g. `sub_xxx`. */
  razorpaySubscriptionId: string;
  /** Razorpay customer id, populated after first payment. */
  razorpayCustomerId: string | null;
  /** ISO datetime when the current paid period ends. */
  currentPeriodEnd: ISODateTime;
  /** Did the user cancel? Will lapse at currentPeriodEnd. */
  cancelAtPeriodEnd: boolean;
  amountInr: number;
  createdAt: ISODateTime;
  updatedAt: ISODateTime;
}
