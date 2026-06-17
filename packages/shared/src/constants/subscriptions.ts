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
  dailyMCQ: number;          // daily PRACTICE SETS (each set = one ~10-question quiz). -1 = unlimited
  mockTests: number;         // mock tests per DAY; -1 = unlimited
  aiTutor: boolean;
  currentAffairs: boolean;
  essayGrading: boolean;
  chaptersPerDay: number;    // -1 = unlimited
  creditDeduction: boolean;  // true = credits ARE deducted for features
  // ── Freemium quota fields (PR — plan restructure) ──────────────────
  // Per-day quotas for the AI-expensive features. -1 = unlimited (fair-use
  // soft cap still applies via the daily USD spend backstop). 0 = blocked.
  // Optional so older platformConfig docs / fixtures don't break on merge.
  aiTutorPerDay?: number;    // AI chat messages per day; -1 = unlimited
  essaysPerDay?: number;     // essay gradings per day; -1 = unlimited
  imagesPerDay?: number;     // AI image generations per day; -1 = unlimited
  // ── Multi-exam (Sprint 5) ──────────────────────────────────────────
  // How many exams a user on this plan can be enrolled in at once.
  // 1 = single exam (free), -1 = unlimited. Admin-configurable via the
  // /admin/plans matrix. Optional so older platformConfig docs default
  // safely to the compile-time value below.
  maxExams?: number;
  // ── Boolean access flags (PR — plan restructure / Part 4 audit) ─────
  // Features with no numeric quota — just on/off per plan. Admin-editable
  // via /admin/plans. Optional so older platformConfig docs fall back to
  // the compile-time defaults below.
  pyqAccess?: boolean;       // open full Previous-Year-Question papers (not just the list)
  revisionAccess?: boolean;  // spaced-repetition revision queue
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
      dailyMCQ: 10,
      mockTests: 1,            // per day
      aiTutor: true,           // included; Free pays per message via credits (aiTutorPerDay = 0 = no flat allowance)
      currentAffairs: true,
      essayGrading: true,      // 1/day (see essaysPerDay)
      chaptersPerDay: 2,
      creditDeduction: true,
      aiTutorPerDay: 0,        // free uses credits for chat, no flat daily allowance
      essaysPerDay: 1,
      imagesPerDay: 1,
      maxExams: 1,             // free: single exam
      pyqAccess: false,        // free: can browse PYQ list, but opening a full paper needs upgrade
      revisionAccess: true,    // free: basic spaced-repetition revision included
    },
  },
  scholar: {
    id: 'scholar',
    name: 'Starter',
    nameHi: 'स्टार्टर',
    price: 79,
    yearlyPrice: 599,
    isActive: true,
    comingSoon: false,
    features: {
      dailyMCQ: 30,
      mockTests: 5,            // per day
      aiTutor: true,
      currentAffairs: true,
      essayGrading: true,
      chaptersPerDay: 8,
      creditDeduction: false,
      aiTutorPerDay: 30,
      essaysPerDay: 3,
      imagesPerDay: 6,
      maxExams: 2,             // starter: up to 2 exams
      pyqAccess: true,         // full PYQ archive
      revisionAccess: true,
    },
  },
  aspirant: {
    id: 'aspirant',
    name: 'Pro',
    nameHi: 'प्रो',
    price: 249,
    yearlyPrice: 1899,
    isActive: true,
    comingSoon: false,
    features: {
      dailyMCQ: 100,
      mockTests: 15,           // per day
      aiTutor: true,
      currentAffairs: true,
      essayGrading: true,
      chaptersPerDay: 25,
      creditDeduction: false,
      aiTutorPerDay: 100,
      essaysPerDay: 10,
      imagesPerDay: 15,
      maxExams: 3,             // pro: up to 3 exams
      pyqAccess: true,         // full PYQ archive
      revisionAccess: true,
    },
  },
  achiever: {
    id: 'achiever',
    name: 'Elite',
    nameHi: 'एलीट',
    price: 599,
    yearlyPrice: 4499,
    isActive: true,
    comingSoon: false,
    features: {
      dailyMCQ: -1,            // unlimited (fair-use)
      mockTests: 40,           // per day
      aiTutor: true,
      currentAffairs: true,
      essayGrading: true,
      chaptersPerDay: -1,      // unlimited (fair-use)
      creditDeduction: false,
      aiTutorPerDay: 300,
      essaysPerDay: -1,        // unlimited (fair-use)
      imagesPerDay: 50,
      maxExams: -1,            // elite: unlimited exams
      pyqAccess: true,         // full PYQ archive
      revisionAccess: true,
    },
  },
} as const;

/**
 * Student-facing display name for a plan id. Internal ids stay
 * scholar/aspirant/achiever (DB + billing safe), but the UI shows the
 * marketing names. Use this anywhere you render `user.plan` to a student.
 */
export const PLAN_DISPLAY_NAME: Record<PlanId, string> = {
  free: 'Free',
  scholar: 'Starter',
  aspirant: 'Pro',
  achiever: 'Elite',
};

/** Safe lookup — returns the display name for any plan id (falls back to the
 *  capitalised id for unknown values). */
export function planDisplayName(planId: string | null | undefined): string {
  if (!planId) return 'Free';
  return PLAN_DISPLAY_NAME[planId as PlanId] ?? (planId.charAt(0).toUpperCase() + planId.slice(1));
}

/** Check if a user's plan is currently active (not expired) */
export function isPlanActive(plan: string, planExpiresAt: string | null): boolean {
  if (plan === 'free') return true; // free is always "active"
  if (!planExpiresAt) return false;
  return new Date(planExpiresAt).getTime() > Date.now();
}

/**
 * How many exams a plan allows. Reads the (admin-configurable) feature value
 * with a safe fallback to the compile-time default, and treats an expired
 * paid plan as the free limit. -1 means unlimited.
 */
export function maxExamsFor(features: PlanFeatures | null | undefined): number {
  const v = features?.maxExams;
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  return 1;
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
