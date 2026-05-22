import {
  CREDIT_BUCKET_EXPIRY_DAYS,
  CREDIT_EARN_AMOUNTS,
  CREDIT_SPEND_AMOUNTS,
  EXPIRING_SOON_WINDOW_DAYS,
  SINGLE_TXN_LIMIT,
  asISODateTime,
  type CreditBalance,
  type CreditBucket,
  type CreditEarnSource,
  type CreditEvent,
  type CreditEventId,
  type CreditSpendReason,
  type ISODateTime,
  type UserId,
} from '@nexigrate/shared';
import { CreditAmountError, InvalidLedgerError } from './errors.js';

/**
 * The credit engine.
 *
 * It is intentionally a set of *pure* functions over an in-memory ledger
 * snapshot. The persistence layer (Firestore in our API service, or any other
 * backend a future caller chooses) is responsible for:
 *   1. Loading the user's ledger.
 *   2. Calling the engine to compute the next event(s).
 *   3. Writing those events transactionally and updating the cached balance.
 *
 * Keeping the engine pure means we can test every credit-economy decision in
 * milliseconds with zero infrastructure, and reuse it from a Cloud Function,
 * an admin script, or a future offline mobile client.
 *
 * Invariants enforced here:
 *   - Append-only ledger. We never mutate or delete events.
 *   - Idempotency by `idempotencyKey`. A duplicate write is a no-op that
 *     returns the previously-recorded event.
 *   - Spends draw from oldest non-expired bucket first (FIFO). A spend that
 *     would underflow the balance is rejected with kind: 'insufficient'.
 *   - Per-transaction cap of `SINGLE_TXN_LIMIT` to bound blast radius of typos.
 */

// ---------- input/output types ----------

export interface EngineDeps {
  /** Generate a unique id for a new event. */
  newId: () => CreditEventId;
  /** Current wall clock as ISO datetime. */
  now: () => ISODateTime;
}

export interface AwardInput {
  userId: UserId;
  source: CreditEarnSource;
  /** Override the amount from constants. Required for `admin_grant` and `subscription_grant`. */
  amount?: number;
  sourceRef?: string | null;
  idempotencyKey: string;
  /** When the underlying action happened. Defaults to deps.now(). */
  occurredAt?: ISODateTime;
  /** Override expiry. Defaults to constants table. */
  expiresAt?: ISODateTime | null;
}

export interface SpendInput {
  userId: UserId;
  reason: CreditSpendReason;
  /** Override the amount from constants. Required for `admin_revoke`. */
  amount?: number;
  sourceRef?: string | null;
  idempotencyKey: string;
  occurredAt?: ISODateTime;
}

export type AwardResult =
  | { kind: 'awarded'; event: CreditEvent; newBalance: number }
  | { kind: 'duplicate'; event: CreditEvent; balance: number };

export type SpendResult =
  | { kind: 'spent'; event: CreditEvent; newBalance: number }
  | { kind: 'duplicate'; event: CreditEvent; balance: number }
  | { kind: 'insufficient'; balance: number; required: number };

// ---------- public functions ----------

/**
 * Compute the bucket view of a ledger.
 *
 * Returns a list of buckets created by earn events, with each bucket's
 * `remaining` reduced by spends drawn from it. Order: chronological by
 * `awardedAt`, oldest first.
 */
export function computeBuckets(
  events: ReadonlyArray<CreditEvent>,
  userId: UserId,
  now: ISODateTime,
): CreditBucket[] {
  const sorted = [...events]
    .filter((e) => e.userId === userId)
    .sort(byOccurredAt);

  const buckets: CreditBucket[] = [];
  /** earnEventId -> index in `buckets` */
  const indexByEvent = new Map<CreditEventId, number>();

  for (const ev of sorted) {
    if (ev.event.kind === 'earn') {
      if (ev.amount <= 0) {
        throw new InvalidLedgerError(`earn event ${ev.id} has non-positive amount ${ev.amount}`);
      }
      indexByEvent.set(ev.id, buckets.length);
      buckets.push({
        eventId: ev.id,
        source: ev.event.source,
        awardedAt: ev.occurredAt,
        expiresAt: ev.expiresAt,
        remaining: ev.amount,
        initialAmount: ev.amount,
      });
      continue;
    }

    if (ev.event.kind === 'spend') {
      if (ev.amount >= 0) {
        throw new InvalidLedgerError(`spend event ${ev.id} has non-negative amount ${ev.amount}`);
      }
      let toDraw = -ev.amount;
      // Draw FIFO from buckets that are non-expired AT the spend time.
      const candidateIdx = buckets
        .map((_, i) => i)
        .filter((i) => buckets[i]!.remaining > 0 && bucketLiveAt(buckets[i]!, ev.occurredAt));

      for (const i of candidateIdx) {
        if (toDraw === 0) break;
        const b = buckets[i]!;
        const draw = Math.min(b.remaining, toDraw);
        b.remaining -= draw;
        toDraw -= draw;
      }
      if (toDraw > 0) {
        throw new InvalidLedgerError(
          `spend event ${ev.id} draws ${-ev.amount} but only ${(-ev.amount) - toDraw} available`,
        );
      }
      continue;
    }

    if (ev.event.kind === 'expire') {
      // Expire events drain a specific bucket completely. They reference the
      // earn event via `sourceRef`. If `sourceRef` is null we no-op (e.g. an
      // expire batch may be emitted purely for audit).
      if (ev.sourceRef) {
        const idx = indexByEvent.get(ev.sourceRef as CreditEventId);
        if (idx !== undefined) {
          const b = buckets[idx]!;
          // Trust the event's amount is the negative of remaining at expiry time.
          b.remaining = Math.max(0, b.remaining + ev.amount);
        }
      }
      continue;
    }
  }

  // Zero out implicitly-expired buckets so the caller's "remaining" view is
  // consistent. The total balance computation also filters by liveness.
  for (const b of buckets) {
    if (!bucketLiveAt(b, now)) b.remaining = 0;
  }

  return buckets;
}

/**
 * Compute the user's current balance.
 *
 * `total` only counts buckets that are non-expired at `now`. `expiringSoon`
 * sums buckets that expire in the next `EXPIRING_SOON_WINDOW_DAYS` days.
 */
export function computeBalance(
  events: ReadonlyArray<CreditEvent>,
  userId: UserId,
  now: ISODateTime,
): CreditBalance {
  const buckets = computeBuckets(events, userId, now);
  const userEvents = events.filter((e) => e.userId === userId).sort(byOccurredAt);
  const lastEventId = userEvents.length > 0 ? userEvents[userEvents.length - 1]!.id : null;

  const nowMs = Date.parse(now);
  const soonMs = nowMs + EXPIRING_SOON_WINDOW_DAYS * 24 * 60 * 60 * 1000;

  let total = 0;
  let expiringSoon = 0;
  for (const b of buckets) {
    if (b.remaining <= 0) continue;
    total += b.remaining;
    if (b.expiresAt != null) {
      const expMs = Date.parse(b.expiresAt);
      if (expMs <= soonMs) expiringSoon += b.remaining;
    }
  }

  return { userId, total, expiringSoon, lastEventId, computedAt: now };
}

/**
 * Award credits to a user.
 *
 * Pure: returns the new event and balance. Does not write anywhere.
 */
export function award(
  input: AwardInput,
  events: ReadonlyArray<CreditEvent>,
  deps: EngineDeps,
): AwardResult {
  // Idempotency check.
  const dup = events.find(
    (e) => e.userId === input.userId && e.idempotencyKey === input.idempotencyKey,
  );
  if (dup) {
    return {
      kind: 'duplicate',
      event: dup,
      balance: computeBalance(events, input.userId, deps.now()).total,
    };
  }

  const amount = input.amount ?? CREDIT_EARN_AMOUNTS[input.source];
  if (amount <= 0) {
    throw new CreditAmountError(
      `cannot award non-positive amount ${amount} for source '${input.source}' (did you forget an amount override?)`,
    );
  }
  if (amount > SINGLE_TXN_LIMIT) {
    throw new CreditAmountError(
      `award amount ${amount} exceeds single-transaction limit ${SINGLE_TXN_LIMIT}`,
    );
  }

  const occurredAt = input.occurredAt ?? deps.now();
  const expiresAt = input.expiresAt ?? defaultExpiry(input.source, occurredAt);
  const eventId = deps.newId();

  const event: CreditEvent = {
    id: eventId,
    userId: input.userId,
    amount,
    event: { kind: 'earn', source: input.source },
    idempotencyKey: input.idempotencyKey,
    sourceRef: input.sourceRef ?? null,
    occurredAt,
    createdAt: deps.now(),
    expiresAt,
  };

  const next = [...events, event];
  return {
    kind: 'awarded',
    event,
    newBalance: computeBalance(next, input.userId, deps.now()).total,
  };
}

/**
 * Spend credits.
 *
 * Returns kind: 'spent' on success, 'duplicate' if the idempotency key has
 * been seen, or 'insufficient' if the user's balance is too low.
 */
export function spend(
  input: SpendInput,
  events: ReadonlyArray<CreditEvent>,
  deps: EngineDeps,
): SpendResult {
  // Idempotency check.
  const dup = events.find(
    (e) => e.userId === input.userId && e.idempotencyKey === input.idempotencyKey,
  );
  if (dup) {
    return {
      kind: 'duplicate',
      event: dup,
      balance: computeBalance(events, input.userId, deps.now()).total,
    };
  }

  const amount = input.amount ?? CREDIT_SPEND_AMOUNTS[input.reason];
  if (amount <= 0) {
    throw new CreditAmountError(
      `cannot spend non-positive amount ${amount} for reason '${input.reason}' (did you forget an amount override?)`,
    );
  }
  if (amount > SINGLE_TXN_LIMIT) {
    throw new CreditAmountError(
      `spend amount ${amount} exceeds single-transaction limit ${SINGLE_TXN_LIMIT}`,
    );
  }

  const balance = computeBalance(events, input.userId, deps.now()).total;
  if (balance < amount) {
    return { kind: 'insufficient', balance, required: amount };
  }

  const occurredAt = input.occurredAt ?? deps.now();
  const eventId = deps.newId();

  const event: CreditEvent = {
    id: eventId,
    userId: input.userId,
    amount: -amount, // stored negative in the ledger
    event: { kind: 'spend', reason: input.reason },
    idempotencyKey: input.idempotencyKey,
    sourceRef: input.sourceRef ?? null,
    occurredAt,
    createdAt: deps.now(),
    expiresAt: null,
  };

  const next = [...events, event];
  return {
    kind: 'spent',
    event,
    newBalance: computeBalance(next, input.userId, deps.now()).total,
  };
}

// ---------- internals ----------

function bucketLiveAt(b: CreditBucket, t: ISODateTime): boolean {
  if (b.expiresAt == null) return true;
  return Date.parse(b.expiresAt) > Date.parse(t);
}

function byOccurredAt(a: CreditEvent, b: CreditEvent): number {
  // Tie-break by createdAt, then id, so ordering is fully deterministic.
  if (a.occurredAt !== b.occurredAt) return a.occurredAt < b.occurredAt ? -1 : 1;
  if (a.createdAt !== b.createdAt) return a.createdAt < b.createdAt ? -1 : 1;
  if (a.id !== b.id) return a.id < b.id ? -1 : 1;
  return 0;
}

function defaultExpiry(source: CreditEarnSource, awardedAt: ISODateTime): ISODateTime | null {
  const days = CREDIT_BUCKET_EXPIRY_DAYS[source];
  if (days == null) return null;
  const t = Date.parse(awardedAt);
  if (Number.isNaN(t)) {
    throw new InvalidLedgerError(`invalid awardedAt timestamp: ${awardedAt}`);
  }
  return asISODateTime(new Date(t + days * 24 * 60 * 60 * 1000).toISOString());
}
