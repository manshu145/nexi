import type { CreditEventId, ISODateTime, UserId } from './brand.js';

/**
 * Credit economy types.
 *
 * The credit ledger is append-only. Every action that touches a user's
 * balance produces a `CreditEvent`. Balance is computed (and cached) by
 * folding the ledger.
 *
 * Invariants enforced by the engine in `@nexigrate/credits`:
 *   - Every event has an idempotency key. Replays are no-ops.
 *   - Earn events award credits to a "bucket" with an expiry date. Expired
 *     buckets stop counting toward balance. Spend events draw down the
 *     oldest non-expired bucket first (FIFO).
 *   - The balance can never go negative. A spend that would underflow is
 *     rejected with `InsufficientCreditsError`.
 */

export type CreditEarnSource =
  | 'signup_verified'         // +100, expires in 14 days
  | 'daily_login'             // +10
  | 'mcq_pass'                // +15
  | 'mcq_fail_attempted'      // +5
  | 'streak_7d'               // +25
  | 'streak_30d'              // +100
  | 'referral_signup'         // +50 (paid to the referrer)
  | 'referral_retained_7d'    // +200 (paid to the referrer)
  | 'referral_bonus'          // +25 (paid to the referred user on signup)
  | 'admin_grant'             // discretionary, e.g. apology credits
  | 'subscription_grant';     // monthly grant from active subscription

export type CreditSpendReason =
  | 'read_chapter'            // -5
  | 'focus_session_1h'        // -10
  | 'mock_test'               // -20
  | 'ai_tutor_question'       // -5
  | 'concept_video'           // -5
  | 'long_answer_grading'     // -30 (Phase 18)
  | 'admin_revoke';           // discretionary

export type CreditEventKind =
  | { kind: 'earn'; source: CreditEarnSource }
  | { kind: 'spend'; reason: CreditSpendReason }
  | { kind: 'expire' };       // emitted by the nightly sweeper

export interface CreditEvent {
  id: CreditEventId;
  userId: UserId;
  /** Positive for earn, negative for spend, negative for expiration. */
  amount: number;
  event: CreditEventKind;
  /**
   * Idempotency key. Combination of (userId, source, sourceRef) MUST be
   * unique. The engine rejects duplicate writes silently to make retries
   * safe.
   */
  idempotencyKey: string;
  /** Optional reference -- e.g. the MCQ attempt id, mock test id, etc. */
  sourceRef: string | null;
  /** When the underlying action happened (might differ from `createdAt`). */
  occurredAt: ISODateTime;
  /** When the event was written to the ledger. */
  createdAt: ISODateTime;
  /**
   * For earn events: the bucket expires at this time. Spends drawn from this
   * bucket reduce its remaining balance. For non-earn events: null.
   */
  expiresAt: ISODateTime | null;
}

export interface CreditBucket {
  /** The earn event id this bucket belongs to. */
  eventId: CreditEventId;
  source: CreditEarnSource;
  awardedAt: ISODateTime;
  expiresAt: ISODateTime | null;
  /** How many credits remain in this bucket (after spends + expiration). */
  remaining: number;
  /** Original earn amount, never changes after creation. */
  initialAmount: number;
}

export interface CreditBalance {
  userId: UserId;
  /** Sum of `remaining` across all non-expired buckets. */
  total: number;
  /** Sum of `remaining` across buckets expiring in the next 7 days. */
  expiringSoon: number;
  /** Most recent ledger event id, for optimistic concurrency. */
  lastEventId: CreditEventId | null;
  /** When the balance was last computed. */
  computedAt: ISODateTime;
}
