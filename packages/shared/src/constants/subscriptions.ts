/**
 * Plan configuration for Nexigrate subscription system.
 *
 * Credits and Plans are TWO separate systems:
 * - Credits = earned currency (login, quiz, referral). Spent on chapters/AI for FREE users only.
 * - Plan = monthly subscription. While plan is ACTIVE, credits are NEVER deducted for any feature.
 * - When plan expires → user goes back to free → credits start deducting again.
 * - Paid users still EARN credits normally (they accumulate for future use after plan expires).
 */

export interface PlanFeatures {
  dailyMCQ: number;          // -1 = unlimited
  mockTests: number;         // -1 = unlimited
  aiTutor: boolean;
  currentAffairs: boolean;
  essayGrading: boolean;
  chaptersPerDay: number;    // -1 = unlimited
  creditDeduction: boolean;  // true = credits ARE deducted for features
}

export interface PlanConfig {
  id: string;
  name: string;
  nameHi: string;
  price: number;             // monthly price in INR (0 for free)
  yearlyPrice: number;       // yearly price in INR (0 for free) — locked at 30% off vs 12×monthly
  isActive: boolean;         // can users subscribe to this plan right now?
  comingSoon: boolean;       // show "Coming Soon" badge
  features: PlanFeatures;
}

export type PlanId = 'free' | 'scholar' | 'aspirant' | 'achiever';
export type BillingPeriod = 'monthly' | 'yearly';

/** Yearly discount expressed as a fraction. 0.30 = 30% off vs 12× monthly. */
export const YEARLY_DISCOUNT = 0.30;

/** Days granted per billing period. */
export const PERIOD_DAYS: Record<BillingPeriod, number> = {
  monthly: 30,
  yearly: 365,
};

export const PLANS: Readonly<Record<PlanId, PlanConfig>> = {
  free: {
    id: 'free',
    name: 'Free',
    nameHi: 'मुफ़्त',
    price: 0,
    yearlyPrice: 0,
    isActive: true,
    comingSoon: false,
    features: {
      dailyMCQ: 5,
      mockTests: 1,
      aiTutor: false,
      currentAffairs: true,
      essayGrading: false,
      chaptersPerDay: 2,
      creditDeduction: true,
    },
  },
  scholar: {
    id: 'scholar',
    name: 'Scholar',
    nameHi: 'विद्वान',
    price: 99,
    yearlyPrice: 830,
    isActive: true,
    comingSoon: false,
    features: {
      dailyMCQ: 30,
      mockTests: 5,
      aiTutor: true,
      currentAffairs: true,
      essayGrading: false,
      chaptersPerDay: 10,
      creditDeduction: false,
    },
  },
  aspirant: {
    id: 'aspirant',
    name: 'Aspirant',
    nameHi: 'अभ्यर्थी',
    price: 299,
    yearlyPrice: 2510,
    isActive: true,
    comingSoon: false,
    features: {
      dailyMCQ: -1,
      mockTests: -1,
      aiTutor: true,
      currentAffairs: true,
      essayGrading: true,
      chaptersPerDay: -1,
      creditDeduction: false,
    },
  },
  achiever: {
    id: 'achiever',
    name: 'Achiever',
    nameHi: 'उपलब्धिकर्ता',
    price: 599,
    yearlyPrice: 5030,
    isActive: true,
    comingSoon: false,
    features: {
      dailyMCQ: -1,
      mockTests: -1,
      aiTutor: true,
      currentAffairs: true,
      essayGrading: true,
      chaptersPerDay: -1,
      creditDeduction: false,
    },
  },
} as const;

/** Check if a user's plan is currently active (not expired) */
export function isPlanActive(plan: string, planExpiresAt: string | null): boolean {
  if (plan === 'free') return true; // free is always "active"
  if (!planExpiresAt) return false;
  return new Date(planExpiresAt).getTime() > Date.now();
}

/** Check if credit deduction applies for a user */
export function shouldDeductCredits(plan: string, planExpiresAt: string | null): boolean {
  if (plan === 'free') return true;
  // Paid plan but expired → deduct
  if (!isPlanActive(plan, planExpiresAt)) return true;
  // Active paid plan → no deduction
  return false;
}

/** Price for a given plan + period in INR (rupees). Returns 0 for free or invalid combos. */
export function priceFor(planId: PlanId, period: BillingPeriod): number {
  const plan = PLANS[planId];
  if (!plan) return 0;
  return period === 'yearly' ? plan.yearlyPrice : plan.price;
}

/** Number of days a plan grants for a given period. */
export function daysFor(period: BillingPeriod): number {
  return PERIOD_DAYS[period];
}

/**
 * Calculate the new plan expiry timestamp.
 * If the user already has an ACTIVE plan, extend from current expiry (don't lose paid days).
 * If expired or new, start from now.
 */
export function computeNewExpiry(
  currentPlan: string,
  currentExpiresAt: string | null,
  period: BillingPeriod,
  now: Date = new Date(),
): string {
  const days = PERIOD_DAYS[period];
  // Only extend from current expiry if user has an ACTIVE PAID plan with
  // a valid future expiry date. Free plan has no expiry to extend from —
  // upgrading from free always starts from now. This prevents the bug where
  // isPlanActive('free', null) returns true → new Date(null).getTime() = 0
  // → expiry computes to 1970 (immediately expired).
  const shouldExtend =
    currentPlan !== 'free' &&
    currentExpiresAt !== null &&
    isPlanActive(currentPlan, currentExpiresAt);
  const baseMs = shouldExtend
    ? new Date(currentExpiresAt!).getTime()
    : now.getTime();
  return new Date(baseMs + days * 24 * 60 * 60 * 1000).toISOString();
}

// Keep backward compat — re-export old types
export type { PlanId as SubscriptionPlanId };
