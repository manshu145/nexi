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

/**
 * Earn amounts in whole credits. Locked by founder decision in PR-03.
 * Future edits should land via the planned admin Plans/Rewards editor
 * (PR-04). Keep these values in sync with the marketing site copy and the
 * /credits page so the same number a user sees is the same number they get.
 */
export const CREDIT_EARN_AMOUNTS: Readonly<Record<CreditEarnSource, number>> = {
  signup_verified: 100,
  daily_login: 5,
  chapter_complete: 20,
  mcq_pass: 10,
  mcq_fail_attempted: 5,
  streak_7d: 5,
  streak_30d: 10,
  referral_signup: 50,         // paid to the referrer when invitee signs up
  referral_retained_7d: 0,     // disabled for launch; revisit with retention data
  referral_bonus: 100,         // bonus credits for the referred user on signup
  admin_grant: 0,              // amount supplied per-grant; this default is a sentinel
  subscription_grant: 0,       // supplied per-tier; sentinel
};

/** Spend amounts in whole credits (always positive; ledger sign is applied by the engine). */
export const CREDIT_SPEND_AMOUNTS: Readonly<Record<CreditSpendReason, number>> = {
  read_chapter: 5,
  focus_session_1h: 10,
  mock_test: 20,
  ai_tutor_question: 2,
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
  signup_verified: 90,         // generous initial runway so new users don't lose them while onboarding
  daily_login: 60,
  chapter_complete: 90,
  mcq_pass: 90,
  mcq_fail_attempted: 60,
  streak_7d: 90,
  streak_30d: 180,
  referral_signup: 90,
  referral_retained_7d: 90,
  referral_bonus: 90,
  admin_grant: null,           // never expires by default
  subscription_grant: 35,      // expires shortly after the next billing cycle
};

/** Threshold used by the "expiring soon" UX hint on the dashboard. */
export const EXPIRING_SOON_WINDOW_DAYS = 7;

/** Cap on a single admin grant or spend, to bound blast radius of a typo. */
export const SINGLE_TXN_LIMIT = 10_000;
