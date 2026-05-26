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
  yearlyPrice: number;       // yearly price in INR (0 for free)
  isActive: boolean;         // can users subscribe to this plan right now?
  comingSoon: boolean;       // show "Coming Soon" badge
  features: PlanFeatures;
}

export type PlanId = 'free' | 'scholar' | 'aspirant' | 'achiever';

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
      mockTests: 0,
      aiTutor: false,
      currentAffairs: false,
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
    yearlyPrice: 999,
    isActive: true,
    comingSoon: false,
    features: {
      dailyMCQ: -1,
      mockTests: -1,
      aiTutor: true,
      currentAffairs: true,
      essayGrading: false,
      chaptersPerDay: -1,
      creditDeduction: false,
    },
  },
  aspirant: {
    id: 'aspirant',
    name: 'Aspirant',
    nameHi: 'अभ्यर्थी',
    price: 299,
    yearlyPrice: 2999,
    isActive: false,
    comingSoon: true,
    features: {
      dailyMCQ: -1,
      mockTests: -1,
      aiTutor: true,
      currentAffairs: true,
      essayGrading: false,
      chaptersPerDay: -1,
      creditDeduction: false,
    },
  },
  achiever: {
    id: 'achiever',
    name: 'Achiever',
    nameHi: 'उपलब्धिकर्ता',
    price: 599,
    yearlyPrice: 5999,
    isActive: false,
    comingSoon: true,
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

// Keep backward compat — re-export old types
export type { PlanId as SubscriptionPlanId };
