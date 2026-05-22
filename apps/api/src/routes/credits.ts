import { Hono } from 'hono';
import { HTTPException } from 'hono/http-exception';
import {
  asISODateTime,
  awardCreditsRequestSchema,
  spendCreditsRequestSchema,
  type CreditEvent,
  type CreditEventId,
  type ISODateTime,
  type UserId,
} from '@nexigrate/shared';
import { award, computeBalance, spend } from '@nexigrate/credits';
import { requireAdmin, requireAuth } from '../auth.js';
import type { Logger } from '../logger.js';

/**
 * Credit-engine HTTP routes.
 *
 * Phase 2.1 wires the routes to a temporary in-memory ledger so we can
 * exercise the engine end-to-end without Firestore. Phase 2.2 will swap the
 * in-memory store for Firestore transactions, behind the same `LedgerStore`
 * interface so the route handlers do not change.
 *
 *   GET  /v1/credits/balance         caller's own balance
 *   GET  /v1/credits/balance/:userId admin only
 *   POST /v1/credits/award           admin only (admin_grant or test fixtures)
 *   POST /v1/credits/spend           server-to-server only in practice
 *   GET  /v1/credits/events          caller's recent events
 */
export interface LedgerStore {
  /** Read all events for a user (oldest first). */
  read(userId: UserId): Promise<ReadonlyArray<CreditEvent>>;
  /** Append a single event. Implementations MUST enforce idempotency. */
  append(event: CreditEvent): Promise<void>;
}

export interface CreditsRoutesDeps {
  ledger: LedgerStore;
  logger: Logger;
  newId: () => CreditEventId;
  now: () => ISODateTime;
}

export function makeCreditsRoutes(deps: CreditsRoutesDeps): Hono {
  const app = new Hono();
  const engineDeps = { newId: deps.newId, now: deps.now };

  app.get('/balance', async (c) => {
    const principal = requireAuth(c);
    const events = await deps.ledger.read(principal.userId);
    const balance = computeBalance(events, principal.userId, deps.now());
    return c.json(balance);
  });

  app.get('/balance/:userId', async (c) => {
    requireAdmin(c);
    const userId = c.req.param('userId') as UserId;
    const events = await deps.ledger.read(userId);
    const balance = computeBalance(events, userId, deps.now());
    return c.json(balance);
  });

  app.get('/events', async (c) => {
    const principal = requireAuth(c);
    const events = await deps.ledger.read(principal.userId);
    return c.json({ events });
  });

  app.post('/award', async (c) => {
    requireAdmin(c);
    const body = await c.req.json().catch(() => null);
    const parsed = awardCreditsRequestSchema.safeParse(body);
    if (!parsed.success) {
      throw new HTTPException(400, { message: parsed.error.issues[0]?.message ?? 'invalid body' });
    }
    const userId = parsed.data.userId as UserId;
    const events = await deps.ledger.read(userId);
    const result = award(
      {
        userId,
        source: parsed.data.source,
        amount: parsed.data.amountOverride,
        sourceRef: parsed.data.sourceRef,
        idempotencyKey: parsed.data.idempotencyKey,
      },
      events,
      engineDeps,
    );
    if (result.kind === 'awarded') {
      await deps.ledger.append(result.event);
      deps.logger.info('credits.award', {
        userId,
        source: parsed.data.source,
        amount: result.event.amount,
        eventId: result.event.id,
      });
    }
    return c.json(result);
  });

  app.post('/spend', async (c) => {
    requireAdmin(c);
    const body = await c.req.json().catch(() => null);
    const parsed = spendCreditsRequestSchema.safeParse(body);
    if (!parsed.success) {
      throw new HTTPException(400, { message: parsed.error.issues[0]?.message ?? 'invalid body' });
    }
    const userId = parsed.data.userId as UserId;
    const events = await deps.ledger.read(userId);
    const result = spend(
      {
        userId,
        reason: parsed.data.reason,
        amount: parsed.data.amountOverride,
        sourceRef: parsed.data.sourceRef,
        idempotencyKey: parsed.data.idempotencyKey,
      },
      events,
      engineDeps,
    );
    if (result.kind === 'spent') {
      await deps.ledger.append(result.event);
      deps.logger.info('credits.spend', {
        userId,
        reason: parsed.data.reason,
        amount: result.event.amount,
        eventId: result.event.id,
      });
    }
    return c.json(result);
  });

  return app;
}

/**
 * In-memory ledger store for local development and tests.
 * Phase 2.2 will replace this with a Firestore-backed implementation.
 */
export class InMemoryLedgerStore implements LedgerStore {
  private events: Map<UserId, CreditEvent[]> = new Map();

  async read(userId: UserId): Promise<ReadonlyArray<CreditEvent>> {
    return this.events.get(userId) ?? [];
  }

  async append(event: CreditEvent): Promise<void> {
    const existing = this.events.get(event.userId) ?? [];
    existing.push(event);
    this.events.set(event.userId, existing);
  }
}

/** Factory used by server.ts when wiring up dependencies. */
export function defaultEngineDeps(): { newId: () => CreditEventId; now: () => ISODateTime } {
  return {
    newId: () => `evt_${cryptoRandom()}` as CreditEventId,
    now: () => asISODateTime(new Date().toISOString()),
  };
}

function cryptoRandom(): string {
  // Node 22 has globalThis.crypto.randomUUID().
  return globalThis.crypto.randomUUID().replace(/-/g, '').slice(0, 16);
}
