import type { ISODateTime, ReferralId, UserId } from './brand.js';

/**
 * Referral attribution.
 *
 * Each user has a stable referral code (separately stored on `User` derived
 * fields if/when needed). When a new user signs up with that code, a
 * `Referral` row is written; once the new user verifies their identity, the
 * referrer is awarded `referral_signup` credits. If the new user is still
 * active 7 days later, the referrer is awarded `referral_retained_7d`.
 */

export type ReferralStatus =
  | 'pending'      // referred user signed up but not yet verified
  | 'rewarded'     // referrer got 'referral_signup' credits
  | 'retained'     // referrer also got 'referral_retained_7d' credits
  | 'reverted';    // referred user was banned -> credits clawed back

export interface Referral {
  id: ReferralId;
  /** The user whose code was used. */
  referrerUserId: UserId;
  /** The user who signed up using the code. */
  referredUserId: UserId;
  /** The referral code value at the time of signup. */
  code: string;
  status: ReferralStatus;
  /** When the referred user first signed up. */
  signedUpAt: ISODateTime;
  /** When the referred user verified (drives the first reward). */
  verifiedAt: ISODateTime | null;
  /** When the 7-day-retention reward was paid. */
  retainedAt: ISODateTime | null;
  createdAt: ISODateTime;
  updatedAt: ISODateTime;
}
