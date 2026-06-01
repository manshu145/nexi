/**
 * Credit ledger -- Firestore-backed adapter on top of @nexigrate/credits.
 *
 * Why this layer exists:
 *   The pure engine in `@nexigrate/credits` knows only about events,
 *   buckets and idempotency. Persistence is intentionally outside its
 *   scope so it can be unit-tested in milliseconds and reused across
 *   runtimes (Cloud Run, Cloud Functions, future mobile sync). This file
 *   is the one place that knows how those events live in Firestore.
 *
 * Storage shape:
 *   creditEvents/{eventId}                                -- append-only ledger
 *     { id, userId, amount, event, idempotencyKey, sourceRef,
 *       occurredAt, createdAt, expiresAt }
 *
 *   users/{uid}.credits                                   -- cached balance,
 *     a derived view kept in sync inside the same Firestore transaction
 *     that writes the event. Reads stay O(1); reconstructing the true
 *     balance from the ledger is a fallback for migrations and admin
 *     dashboards.
 *
 * Idempotency contract:
 *   Every award/spend MUST receive an idempotency key. We write it to
 *   `creditEvents/{eventId}.idempotencyKey` and ALSO to a lookup doc at
 *   `creditIdempotency/{userId}__{key}` so duplicate detection is a
 *   single transactional get (instead of a where-query inside a txn,
 *   which Firestore disallows).
 *
 * Migration / backwards compat:
 *   Pre-PR-03 users have a `users/{uid}.credits` cache value but zero
 *   ledger events. On the first ledger interaction, getBalance() prefers
 *   the cache so the user does not see a sudden zero. Award/spend write
 *   real events from then on; the cache is updated by every txn so old
 *   and new code paths stay consistent.
 */

import type { Firestore, Transaction } from 'firebase-admin/firestore';
import { FieldValue } from 'firebase-admin/firestore';
import {
  asISODateTime,
  type CreditEarnSource,
  type CreditEvent,
  type CreditEventId,
  type CreditSpendReason,
  type ISODateTime,
  type UserId,
} from '@nexigrate/shared';
import {
  award as engineAward,
  spend as engineSpend,
  computeBalance,
  type AwardInput,
  type AwardResult,
  type EngineDeps,
  type SpendInput,
  type SpendResult,
} from '@nexigrate/credits';
import type { Logger } from '../logger.js';

const COL_EVENTS = 'creditEvents';
const COL_IDEMPOTENCY = 'creditIdempotency';
const COL_USERS = 'users';

function idempotencyDocId(userId: UserId, key: string): string {
  // Collapse to a deterministic, Firestore-safe id. Keys are at most 256
  // chars per the schema; the user id is shorter; concatenation stays well
  // under Firestore's 1500-byte limit.
  return `${userId}__${key}`.replace(/[^a-zA-Z0-9_\-.]/g, '_').slice(0, 1500);
}

function defaultEngineDeps(): EngineDeps {
  return {
    newId: () => crypto.randomUUID() as CreditEventId,
    now: () => asISODateTime(new Date().toISOString()),
  };
}

export interface LedgerListOptions {
  /** Max events to return; default 50, max 200. */
  limit?: number;
  /**
   * Cursor: only return events strictly older than this ISO timestamp.
   * Used by the /credits page for infinite scroll.
   */
  before?: string;
}

export interface LedgerEventDto {
  id: string;
  userId: string;
  amount: number;
  event: CreditEvent['event'];
  sourceRef: string | null;
  occurredAt: string;
  createdAt: string;
  expiresAt: string | null;
}

export interface CreditLedger {
  /**
   * Award credits to a user. Returns kind:'awarded' on success or
   * kind:'duplicate' if the idempotency key has been seen.
   */
  award(input: AwardInput): Promise<AwardResult>;

  /**
   * Spend credits. Returns kind:'spent' on success, kind:'insufficient'
   * if the user cannot afford it (no event written), or kind:'duplicate'
   * on idempotency replay.
   */
  spend(input: SpendInput): Promise<SpendResult>;

  /** Current balance (delegates to the engine). */
  getBalance(userId: UserId): Promise<number>;

  /**
   * Recent events for the /credits history page. Most recent first.
   * Filtered to a single user; safe to expose to clients.
   */
  listEvents(userId: UserId, opts?: LedgerListOptions): Promise<LedgerEventDto[]>;
}

// ---------- Firestore implementation ----------

export class FirestoreCreditLedger implements CreditLedger {
  private readonly engineDeps: EngineDeps;

  constructor(
    private readonly db: Firestore,
    private readonly logger: Logger,
    engineDeps?: EngineDeps,
  ) {
    this.engineDeps = engineDeps ?? defaultEngineDeps();
  }

  async award(input: AwardInput): Promise<AwardResult> {
    return this.runTxn(input.userId, input.idempotencyKey, async (tx, ledger) => {
      const result = engineAward(input, ledger, this.engineDeps);
      if (result.kind === 'awarded') {
        await this.commit(tx, input.userId, result.event, result.newBalance);
      }
      return result;
    });
  }

  async spend(input: SpendInput): Promise<SpendResult> {
    return this.runTxn(input.userId, input.idempotencyKey, async (tx, ledger) => {
      const result = engineSpend(input, ledger, this.engineDeps);
      if (result.kind === 'spent') {
        await this.commit(tx, input.userId, result.event, result.newBalance);
      }
      return result;
    });
  }

  async getBalance(userId: UserId): Promise<number> {
    // Performance optimization: for read-only balance queries, prefer the
    // cached `users/{uid}.credits` field (maintained by FieldValue.increment
    // inside every award/spend transaction). Only fall back to computing
    // from the full ledger if the cache is missing (edge case: pre-PR-03
    // users who never had a ledger event AND their cache is explicitly 0).
    const userDoc = await this.db.collection(COL_USERS).doc(userId).get();
    const cached = userDoc.data()?.credits as number | undefined;
    if (typeof cached === 'number') {
      return Math.max(0, cached);
    }
    // Fallback: compute from ledger (cold start or migration case)
    const ledger = await this.loadLedger(userId);
    if (ledger.length === 0) return 0;
    const now = this.engineDeps.now();
    return computeBalance(ledger, userId, now).total;
  }

  async listEvents(userId: UserId, opts: LedgerListOptions = {}): Promise<LedgerEventDto[]> {
    const limit = Math.min(Math.max(opts.limit ?? 50, 1), 200);
    // Single-field query (userId only) avoids the composite index requirement
    // that Firestore would impose for `where + orderBy` on different fields.
    // We sort + paginate in memory because per-user event volume is bounded
    // (typical heavy user: ~hundreds of events/year, well under Firestore's
    // 1MB-per-page limit). The composite index in firestore.indexes.json
    // gets created in the background; once it's `READY` we can switch this
    // method to a server-side ordered+paginated query, but the change must
    // not block on that build (which can take 5-30 minutes).
    const snap = await this.db
      .collection(COL_EVENTS)
      .where('userId', '==', userId)
      .get();
    const events = snap.docs.map((d) => d.data() as CreditEvent);
    events.sort((a, b) => (a.occurredAt < b.occurredAt ? 1 : a.occurredAt > b.occurredAt ? -1 : 0));
    const filtered = opts.before ? events.filter((e) => e.occurredAt < opts.before!) : events;
    return filtered.slice(0, limit).map((data) => ({
      id: data.id,
      userId: data.userId,
      amount: data.amount,
      event: data.event,
      sourceRef: data.sourceRef,
      occurredAt: data.occurredAt,
      createdAt: data.createdAt,
      expiresAt: data.expiresAt,
    }));
  }

  // ---------- internals ----------

  /**
   * Run a write under a Firestore transaction with idempotency safety.
   * The transaction reads the user's full event log + the idempotency
   * doc, runs the engine, and writes the new event + idempotency marker
   * + cached balance. Firestore retries the closure on contention so all
   * reads must happen inside it.
   */
  private async runTxn<T extends AwardResult | SpendResult>(
    userId: UserId,
    idempotencyKey: string,
    work: (tx: Transaction, ledger: ReadonlyArray<CreditEvent>) => Promise<T>,
  ): Promise<T> {
    return this.db.runTransaction(async (tx) => {
      // 1. Idempotency precheck -- avoids the cost of a full event read on
      //    a known-replay request.
      const idemRef = this.db.collection(COL_IDEMPOTENCY).doc(idempotencyDocId(userId, idempotencyKey));
      const idemSnap = await tx.get(idemRef);
      if (idemSnap.exists) {
        const eventId = idemSnap.data()?.eventId as string | undefined;
        if (eventId) {
          const evSnap = await tx.get(this.db.collection(COL_EVENTS).doc(eventId));
          if (evSnap.exists) {
            const event = evSnap.data() as CreditEvent;
            const balanceFromCache = await this.readCachedBalance(tx, userId);
            return { kind: 'duplicate', event, balance: balanceFromCache } as T;
          }
        }
      }

      // 2. Load the full ledger inside the txn so the engine sees a
      //    consistent snapshot. Single-field query (userId only) -- sorting
      //    happens in memory, which avoids a composite-index requirement
      //    that would block first-deploy traffic until Firestore finishes
      //    building the index. See listEvents() for the same rationale.
      const ledgerSnap = await tx.get(
        this.db.collection(COL_EVENTS).where('userId', '==', userId),
      );
      const ledger = ledgerSnap.docs
        .map((d) => d.data() as CreditEvent)
        .sort((a, b) =>
          a.occurredAt < b.occurredAt ? -1 : a.occurredAt > b.occurredAt ? 1 : 0,
        );

      // 3. Run the engine and let the work fn decide what to write.
      return work(tx, ledger);
    });
  }

  private async readCachedBalance(tx: Transaction, userId: UserId): Promise<number> {
    const userSnap = await tx.get(this.db.collection(COL_USERS).doc(userId));
    return Math.max(0, (userSnap.data()?.credits ?? 0) as number);
  }

  private async commit(
    tx: Transaction,
    userId: UserId,
    event: CreditEvent,
    newBalance: number,
  ): Promise<void> {
    const eventRef = this.db.collection(COL_EVENTS).doc(event.id);
    tx.set(eventRef, event);

    const idemRef = this.db.collection(COL_IDEMPOTENCY).doc(idempotencyDocId(userId, event.idempotencyKey));
    tx.set(idemRef, {
      eventId: event.id,
      userId,
      idempotencyKey: event.idempotencyKey,
      createdAt: event.createdAt,
    });

    // Cache update. We use FieldValue.increment on a delta so two
    // concurrent transactions on different events still produce the right
    // final number (Firestore serialises increments for us). For the
    // initial migration case (no prior cache value), Firestore treats
    // `undefined` as 0 and the increment is correct.
    const userRef = this.db.collection(COL_USERS).doc(userId);
    tx.set(
      userRef,
      {
        credits: FieldValue.increment(event.amount),
        // Also stamp the last balance for observability; this is a hint,
        // not the source of truth (the source of truth is the ledger).
        creditBalanceAt: event.createdAt as string,
      },
      { merge: true },
    );

    this.logger.info('credits.ledger_write', {
      userId,
      eventId: event.id,
      kind: event.event.kind,
      ...(event.event.kind === 'earn' ? { source: event.event.source } : {}),
      ...(event.event.kind === 'spend' ? { reason: event.event.reason } : {}),
      amount: event.amount,
      newBalance,
    });
  }

  private async loadLedger(userId: UserId): Promise<CreditEvent[]> {
    // Single-field query + in-memory sort -- see listEvents() for why.
    const snap = await this.db
      .collection(COL_EVENTS)
      .where('userId', '==', userId)
      .get();
    return snap.docs
      .map((d) => d.data() as CreditEvent)
      .sort((a, b) =>
        a.occurredAt < b.occurredAt ? -1 : a.occurredAt > b.occurredAt ? 1 : 0,
      );
  }
}

// ---------- in-memory implementation (tests, local dev without Firestore) ----------

export class InMemoryCreditLedger implements CreditLedger {
  private events: CreditEvent[] = [];
  private readonly engineDeps: EngineDeps;

  constructor(engineDeps?: EngineDeps) {
    this.engineDeps = engineDeps ?? defaultEngineDeps();
  }

  async award(input: AwardInput): Promise<AwardResult> {
    const result = engineAward(input, this.events, this.engineDeps);
    if (result.kind === 'awarded') this.events.push(result.event);
    return result;
  }

  async spend(input: SpendInput): Promise<SpendResult> {
    const result = engineSpend(input, this.events, this.engineDeps);
    if (result.kind === 'spent') this.events.push(result.event);
    return result;
  }

  async getBalance(userId: UserId): Promise<number> {
    if (this.events.length === 0) return 0;
    return computeBalance(this.events, userId, this.engineDeps.now()).total;
  }

  async listEvents(userId: UserId, opts: LedgerListOptions = {}): Promise<LedgerEventDto[]> {
    const limit = Math.min(Math.max(opts.limit ?? 50, 1), 200);
    return this.events
      .filter((e) => e.userId === userId)
      .sort((a, b) => (a.occurredAt < b.occurredAt ? 1 : -1))
      .filter((e) => (opts.before ? e.occurredAt < opts.before : true))
      .slice(0, limit)
      .map((e) => ({
        id: e.id,
        userId: e.userId,
        amount: e.amount,
        event: e.event,
        sourceRef: e.sourceRef,
        occurredAt: e.occurredAt,
        createdAt: e.createdAt,
        expiresAt: e.expiresAt,
      }));
  }
}

/**
 * Convenience helper: convert "raw user/source/ref" into a stable idempotency
 * key. The shape is `{source}:{userId}:{ref|today}` so the same logical event
 * (e.g. daily login on a given IST day) collapses to one ledger row.
 */
export function makeIdempotencyKey(
  source: CreditEarnSource | 'spend',
  reasonOrRef: CreditSpendReason | string,
  userId: UserId,
  ref: string,
): string {
  return `${source}:${reasonOrRef}:${userId}:${ref}`;
}

// Track unused import suppression so the file's symbol surface stays useful
// for future call sites without a TS noUnusedLocals warning.
export type { CreditEarnSource, CreditSpendReason, ISODateTime } from '@nexigrate/shared';
