import type { CreditEarnSource, CreditSpendReason } from '../types/credit.js';

/**
 * Single source of truth for the credit economy.
 *
 * Every code path that awards or spends credits MUST read from these tables
 * (via the `@nexigrate/credits` engine), never hard-code values inline.
 *
 * Changing a value here is a product decision and should be paired with a
 * changelog entry and ideally a feature-flag rollout via Firebase Remote
 * Config.
 */

/** Earn amounts in whole credits. */
export const CREDIT_EARN_AMOUNTS: Readonly<Record<CreditEarnSource, number>> = {
  signup_verified: 200,
  daily_login: 10,
  mcq_pass: 50,
  mcq_fail_attempted: 5,
  streak_7d: 150,
  referral_signup: 100,
  referral_retained_7d: 200,
  admin_grant: 0, // amount is supplied per-grant; this default is a sentinel
  subscription_grant: 0, // supplied per-tier; sentinel
};

/** Spend amounts in whole credits (always positive; ledger sign is applied by the engine). */
export const CREDIT_SPEND_AMOUNTS: Readonly<Record<CreditSpendReason, number>> = {
  read_chapter: 5,
  focus_session_1h: 10,
  mock_test: 20,
  ai_tutor_question: 5,
  concept_video: 5,
  long_answer_grading: 30,
  admin_revoke: 0, // supplied per-revoke
};

/**
 * Bucket expiry for earn events. `null` means "never expires".
 *
 * Day-counts here are converted to ms by the engine. We use day granularity
 * because that's the user-facing unit ("expires in 14 days").
 */
export const CREDIT_BUCKET_EXPIRY_DAYS: Readonly<Record<CreditEarnSource, number | null>> = {
  signup_verified: 14,
  daily_login: 30,
  mcq_pass: 30,
  mcq_fail_attempted: 30,
  streak_7d: 60,
  referral_signup: 60,
  referral_retained_7d: 60,
  admin_grant: null,
  subscription_grant: 35,
};

/** Threshold used by the "expiring soon" UX hint on the dashboard. */
export const EXPIRING_SOON_WINDOW_DAYS = 7;

/** Cap on a single admin grant or spend, to bound blast radius of a typo. */
export const SINGLE_TXN_LIMIT = 10_000;
