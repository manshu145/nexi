import type { SubscriptionPlan } from '../types/subscription.js';

export interface SubscriptionPlanConfig {
  plan: SubscriptionPlan;
  label: string;
  description: string;
  monthlyInr: number;
  yearlyInr: number;
  /** Razorpay plan id placeholder; populated from env at runtime. */
  razorpayMonthlyPlanIdEnv: string;
  razorpayYearlyPlanIdEnv: string;
}

export const SUBSCRIPTION_PLANS: Readonly<Record<SubscriptionPlan, SubscriptionPlanConfig>> = {
  scholar: {
    plan: 'scholar',
    label: 'Scholar',
    description: 'Class 5-10 boards. Unlimited credits, ad-free.',
    monthlyInr: 99,
    yearlyInr: 999,
    razorpayMonthlyPlanIdEnv: 'RAZORPAY_PLAN_SCHOLAR_MONTHLY',
    razorpayYearlyPlanIdEnv: 'RAZORPAY_PLAN_SCHOLAR_YEARLY',
  },
  aspirant: {
    plan: 'aspirant',
    label: 'Aspirant',
    description: 'Class 11-12, JEE, NEET. + Mock tests, PYQ vault, AI tutor.',
    monthlyInr: 299,
    yearlyInr: 2999,
    razorpayMonthlyPlanIdEnv: 'RAZORPAY_PLAN_ASPIRANT_MONTHLY',
    razorpayYearlyPlanIdEnv: 'RAZORPAY_PLAN_ASPIRANT_YEARLY',
  },
  achiever: {
    plan: 'achiever',
    label: 'Achiever',
    description: 'UPSC, SSC, State PSC. + Daily current affairs, essay grading, expert AMAs.',
    monthlyInr: 599,
    yearlyInr: 5999,
    razorpayMonthlyPlanIdEnv: 'RAZORPAY_PLAN_ACHIEVER_MONTHLY',
    razorpayYearlyPlanIdEnv: 'RAZORPAY_PLAN_ACHIEVER_YEARLY',
  },
};
