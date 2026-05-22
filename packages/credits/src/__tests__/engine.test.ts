import { describe, expect, it } from 'vitest';
import {
  asISODateTime,
  asUserId,
  type CreditEvent,
  type CreditEventId,
  type ISODateTime,
  type UserId,
} from '@nexigrate/shared';
import {
  award,
  computeBalance,
  computeBuckets,
  CreditAmountError,
  InvalidLedgerError,
  spend,
  type EngineDeps,
} from '../index.js';

// ---------- test fixtures ----------

const userA = asUserId('user_a');
const userB = asUserId('user_b');

/** Build a deterministic deps shim so test assertions are stable. */
function makeDeps(startIso: string): EngineDeps & {
  setNow: (iso: string) => void;
  ids: number;
} {
  let nowIso = startIso;
  let counter = 0;
  return {
    newId: () => `evt_${++counter}` as CreditEventId,
    now: () => asISODateTime(nowIso),
    setNow: (iso: string) => {
      nowIso = iso;
    },
    get ids() {
      return counter;
    },
  };
}

const day = (iso: string): ISODateTime => asISODateTime(iso);

// ---------- award ----------

describe('award()', () => {
  it('creates an earn event with the configured amount and 14-day expiry for signup_verified', () => {
    const deps = makeDeps('2026-01-01T00:00:00.000Z');

    const result = award(
      {
        userId: userA,
        source: 'signup_verified',
        idempotencyKey: 'signup:user_a',
      },
      [],
      deps,
    );

    expect(result.kind).toBe('awarded');
    if (result.kind !== 'awarded') return;
    expect(result.event.amount).toBe(200);
    expect(result.event.event).toEqual({ kind: 'earn', source: 'signup_verified' });
    expect(result.event.expiresAt).toBe('2026-01-15T00:00:00.000Z');
    expect(result.newBalance).toBe(200);
  });

  it('returns kind=duplicate for the same idempotency key without re-awarding', () => {
    const deps = makeDeps('2026-01-01T00:00:00.000Z');

    const first = award(
      { userId: userA, source: 'mcq_pass', idempotencyKey: 'mcq:1' },
      [],
      deps,
    );
    expect(first.kind).toBe('awarded');
    if (first.kind !== 'awarded') return;

    const second = award(
      { userId: userA, source: 'mcq_pass', idempotencyKey: 'mcq:1' },
      [first.event],
      deps,
    );
    expect(second.kind).toBe('duplicate');
    if (second.kind !== 'duplicate') return;
    expect(second.event.id).toBe(first.event.id);
    expect(second.balance).toBe(50);
  });

  it('respects the amount override for admin_grant', () => {
    const deps = makeDeps('2026-01-01T00:00:00.000Z');
    const result = award(
      {
        userId: userA,
        source: 'admin_grant',
        amount: 1000,
        idempotencyKey: 'grant:apology-1',
      },
      [],
      deps,
    );
    expect(result.kind).toBe('awarded');
    if (result.kind !== 'awarded') return;
    expect(result.event.amount).toBe(1000);
    expect(result.event.expiresAt).toBeNull(); // admin_grant has null expiry
  });

  it('throws CreditAmountError when admin_grant has no amount override', () => {
    const deps = makeDeps('2026-01-01T00:00:00.000Z');
    expect(() =>
      award(
        { userId: userA, source: 'admin_grant', idempotencyKey: 'grant:1' },
        [],
        deps,
      ),
    ).toThrow(CreditAmountError);
  });

  it('throws CreditAmountError when amount exceeds the single-txn cap', () => {
    const deps = makeDeps('2026-01-01T00:00:00.000Z');
    expect(() =>
      award(
        {
          userId: userA,
          source: 'admin_grant',
          amount: 100_000,
          idempotencyKey: 'grant:huge',
        },
        [],
        deps,
      ),
    ).toThrow(CreditAmountError);
  });
});

// ---------- spend ----------

describe('spend()', () => {
  it('debits from the only bucket FIFO and reports new balance', () => {
    const deps = makeDeps('2026-01-01T00:00:00.000Z');
    const earn = award(
      { userId: userA, source: 'signup_verified', idempotencyKey: 'signup' },
      [],
      deps,
    );
    expect(earn.kind).toBe('awarded');
    if (earn.kind !== 'awarded') return;

    deps.setNow('2026-01-02T00:00:00.000Z');
    const result = spend(
      {
        userId: userA,
        reason: 'mock_test',
        idempotencyKey: 'spend:mock-1',
      },
      [earn.event],
      deps,
    );

    expect(result.kind).toBe('spent');
    if (result.kind !== 'spent') return;
    expect(result.event.amount).toBe(-20);
    expect(result.newBalance).toBe(180);
  });

  it('rejects when the balance is insufficient', () => {
    const deps = makeDeps('2026-01-01T00:00:00.000Z');
    const earn = award(
      { userId: userA, source: 'mcq_pass', idempotencyKey: 'mcq:1' }, // +50
      [],
      deps,
    );
    if (earn.kind !== 'awarded') throw new Error('setup failed');

    deps.setNow('2026-01-02T00:00:00.000Z');
    const result = spend(
      {
        userId: userA,
        reason: 'admin_revoke',
        amount: 100,
        idempotencyKey: 'revoke:abuse',
      },
      [earn.event],
      deps,
    );

    expect(result.kind).toBe('insufficient');
    if (result.kind !== 'insufficient') return;
    expect(result.balance).toBe(50);
    expect(result.required).toBe(100);
  });

  it('returns duplicate without double-debiting on retry', () => {
    const deps = makeDeps('2026-01-01T00:00:00.000Z');
    const earn = award(
      { userId: userA, source: 'signup_verified', idempotencyKey: 'signup' },
      [],
      deps,
    );
    if (earn.kind !== 'awarded') throw new Error('setup failed');

    const ledger: CreditEvent[] = [earn.event];

    const first = spend(
      { userId: userA, reason: 'mock_test', idempotencyKey: 'spend:1' },
      ledger,
      deps,
    );
    if (first.kind !== 'spent') throw new Error('setup failed');
    ledger.push(first.event);

    const retry = spend(
      { userId: userA, reason: 'mock_test', idempotencyKey: 'spend:1' },
      ledger,
      deps,
    );
    expect(retry.kind).toBe('duplicate');
    if (retry.kind !== 'duplicate') return;
    expect(retry.event.id).toBe(first.event.id);
    expect(retry.balance).toBe(180);
  });

  it('does not let user A spend from user B\'s buckets', () => {
    const deps = makeDeps('2026-01-01T00:00:00.000Z');
    const earnB = award(
      { userId: userB, source: 'signup_verified', idempotencyKey: 'b:signup' },
      [],
      deps,
    );
    if (earnB.kind !== 'awarded') throw new Error('setup failed');

    const result = spend(
      {
        userId: userA,
        reason: 'mock_test',
        idempotencyKey: 'a:spend:1',
      },
      [earnB.event],
      deps,
    );
    expect(result.kind).toBe('insufficient');
    if (result.kind !== 'insufficient') return;
    expect(result.balance).toBe(0);
  });
});

// ---------- bucket FIFO and expiry ----------

describe('FIFO and expiry behavior', () => {
  it('drains the oldest bucket first across multiple buckets', () => {
    const deps = makeDeps('2026-01-01T00:00:00.000Z');
    const e1 = award(
      { userId: userA, source: 'mcq_pass', idempotencyKey: 'm:1' }, // +50, exp 31 days
      [],
      deps,
    );
    if (e1.kind !== 'awarded') throw new Error('setup');

    deps.setNow('2026-01-02T00:00:00.000Z');
    const e2 = award(
      { userId: userA, source: 'mcq_pass', idempotencyKey: 'm:2' }, // +50, exp 31 days
      [e1.event],
      deps,
    );
    if (e2.kind !== 'awarded') throw new Error('setup');

    // Spend 60 -- should drain bucket 1 (50) then take 10 from bucket 2.
    deps.setNow('2026-01-03T00:00:00.000Z');
    const sp = spend(
      {
        userId: userA,
        reason: 'admin_revoke',
        amount: 60,
        idempotencyKey: 'r:1',
      },
      [e1.event, e2.event],
      deps,
    );
    if (sp.kind !== 'spent') throw new Error('expected spent');

    const buckets = computeBuckets(
      [e1.event, e2.event, sp.event],
      userA,
      day('2026-01-03T00:00:00.000Z'),
    );
    expect(buckets).toHaveLength(2);
    expect(buckets[0]!.eventId).toBe(e1.event.id);
    expect(buckets[0]!.remaining).toBe(0);
    expect(buckets[1]!.eventId).toBe(e2.event.id);
    expect(buckets[1]!.remaining).toBe(40);
  });

  it('expired buckets do not contribute to balance and are reported as remaining=0', () => {
    const deps = makeDeps('2026-01-01T00:00:00.000Z');
    const earn = award(
      { userId: userA, source: 'signup_verified', idempotencyKey: 's' }, // +200, expires 2026-01-15
      [],
      deps,
    );
    if (earn.kind !== 'awarded') throw new Error('setup');

    // 30 days later -- well past expiry.
    const later = day('2026-02-01T00:00:00.000Z');
    const balance = computeBalance([earn.event], userA, later);
    expect(balance.total).toBe(0);

    const buckets = computeBuckets([earn.event], userA, later);
    expect(buckets[0]!.remaining).toBe(0);
  });

  it('expiringSoon counts only buckets within the 7-day window', () => {
    const deps = makeDeps('2026-01-01T00:00:00.000Z');
    const e1 = award(
      { userId: userA, source: 'signup_verified', idempotencyKey: 's' }, // +200, exp 2026-01-15
      [],
      deps,
    );
    if (e1.kind !== 'awarded') throw new Error('setup');

    deps.setNow('2026-01-02T00:00:00.000Z');
    const e2 = award(
      { userId: userA, source: 'mcq_pass', idempotencyKey: 'm' }, // +50, exp 2026-02-01
      [e1.event],
      deps,
    );
    if (e2.kind !== 'awarded') throw new Error('setup');

    // On 2026-01-10, the signup bucket expires on 2026-01-15 (5 days away,
    // within the 7-day window). The mcq bucket expires on 2026-02-01
    // (22 days away, outside the window).
    const balance = computeBalance(
      [e1.event, e2.event],
      userA,
      day('2026-01-10T00:00:00.000Z'),
    );
    expect(balance.total).toBe(250);
    expect(balance.expiringSoon).toBe(200);
  });

  it('a spend before expiry consumes the soon-to-expire bucket and survives expiry', () => {
    const deps = makeDeps('2026-01-01T00:00:00.000Z');
    const earn1 = award(
      { userId: userA, source: 'signup_verified', idempotencyKey: 's' }, // +200, expires 2026-01-15
      [],
      deps,
    );
    if (earn1.kind !== 'awarded') throw new Error('setup');

    deps.setNow('2026-01-10T00:00:00.000Z');
    const earn2 = award(
      { userId: userA, source: 'mcq_pass', idempotencyKey: 'm' }, // +50, exp 2026-02-09
      [earn1.event],
      deps,
    );
    if (earn2.kind !== 'awarded') throw new Error('setup');

    // Spend 200 on Jan 10 -- entirely from the signup bucket (FIFO, oldest first)
    const sp = spend(
      {
        userId: userA,
        reason: 'admin_revoke',
        amount: 200,
        idempotencyKey: 'rev',
      },
      [earn1.event, earn2.event],
      deps,
    );
    if (sp.kind !== 'spent') throw new Error('setup');

    // After signup bucket expiry, the 50 from mcq should still be there.
    const balance = computeBalance(
      [earn1.event, earn2.event, sp.event],
      userA,
      day('2026-02-01T00:00:00.000Z'),
    );
    expect(balance.total).toBe(50);
  });
});

// ---------- ledger integrity ----------

describe('ledger integrity', () => {
  it('throws InvalidLedgerError for an over-spending ledger', () => {
    const deps = makeDeps('2026-01-01T00:00:00.000Z');
    const earn = award(
      { userId: userA, source: 'mcq_pass', idempotencyKey: 'm' }, // +50
      [],
      deps,
    );
    if (earn.kind !== 'awarded') throw new Error('setup');

    // Synthesize a malformed spend that draws 100.
    const bogusSpend: CreditEvent = {
      id: 'evt_bogus' as CreditEventId,
      userId: userA,
      amount: -100,
      event: { kind: 'spend', reason: 'mock_test' },
      idempotencyKey: 'bogus',
      sourceRef: null,
      occurredAt: day('2026-01-02T00:00:00.000Z'),
      createdAt: day('2026-01-02T00:00:00.000Z'),
      expiresAt: null,
    };

    expect(() =>
      computeBuckets([earn.event, bogusSpend], userA, day('2026-01-02T00:00:00.000Z')),
    ).toThrow(InvalidLedgerError);
  });

  it('throws InvalidLedgerError on an earn event with non-positive amount', () => {
    const bogusEarn: CreditEvent = {
      id: 'evt_bogus' as CreditEventId,
      userId: userA,
      amount: 0,
      event: { kind: 'earn', source: 'admin_grant' },
      idempotencyKey: 'bogus',
      sourceRef: null,
      occurredAt: day('2026-01-01T00:00:00.000Z'),
      createdAt: day('2026-01-01T00:00:00.000Z'),
      expiresAt: null,
    };

    expect(() =>
      computeBuckets([bogusEarn], userA, day('2026-01-01T00:00:00.000Z')),
    ).toThrow(InvalidLedgerError);
  });
});
