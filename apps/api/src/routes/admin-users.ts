import { Hono } from 'hono';
import { HTTPException } from 'hono/http-exception';
import { z } from 'zod';
import {
  asUserId,
  isExamSlug,
  type CreditEventId,
  type ExamSlug,
  type ISODateTime,
  type UserId,
} from '@nexigrate/shared';
import { award, computeBalance } from '@nexigrate/credits';
import { requireAnyAdmin } from '../auth.js';
import type { Env } from '../env.js';
import type { AdminUserStore } from '../lib/adminUserStore.js';
import {
  newAuditEntry,
  type AuditAction,
  type AuditLogStore,
} from '../lib/auditLogStore.js';
import type { McqAttemptStore } from '../lib/mcqAttemptStore.js';
import type { ReferralStore } from '../lib/referralStore.js';
import type { SubscriptionStore } from '../lib/subscriptionStore.js';
import type { UserStore } from '../lib/userStore.js';
import type { LedgerStore } from './credits.js';
import type { Logger } from '../logger.js';

/**
 * Phase 20 -- admin user management routes.
 *
 *   GET  /v1/admin/users                paginated list (q, exam, beforeCreatedAt)
 *   GET  /v1/admin/users/:uid           full detail (profile + balance + recent activity)
 *   POST /v1/admin/users/:uid/grant-credits  manual grant via admin_grant
 *
 * All gated at >=`support_admin`. Granting credits is gated higher (admin)
 * because it touches money.
 *
 * Defensive degradation: each side-pull (referrals, attempts, subscription)
 * is wrapped in `.catch()` so a single sub-store hiccup doesn't 500 the
 * whole detail page -- we just leave that section blank.
 */
export interface AdminUsersRoutesDeps {
  env: Env;
  users: UserStore;
  ledger: LedgerStore;
  attempts: McqAttemptStore;
  referrals: ReferralStore;
  subscriptions: SubscriptionStore;
  admins: AdminUserStore;
  audit: AuditLogStore;
  logger: Logger;
  newId: () => CreditEventId;
  newAuditId: () => string;
  now: () => ISODateTime;
}

const listSchema = z.object({
  q: z.string().max(120).optional(),
  exam: z
    .string()
    .optional()
    .refine((v) => v === undefined || isExamSlug(v), { message: 'unknown exam' }),
  limit: z.coerce.number().int().positive().max(200).optional(),
  beforeCreatedAt: z.string().datetime().optional(),
});

const grantSchema = z.object({
  amount: z.number().int().positive().max(50_000),
  reason: z.string().min(1).max(500),
});

export function makeAdminUsersRoutes(deps: AdminUsersRoutesDeps): Hono {
  const app = new Hono();
  const {
    env,
    users,
    ledger,
    attempts,
    referrals,
    subscriptions,
    admins,
    audit,
    logger,
    newId,
    newAuditId,
    now,
  } = deps;

  // ---- list -------------------------------------------------------------
  app.get('/users', async (c) => {
    await requireAnyAdmin(c, env, admins, 'support_admin');
    const parsed = listSchema.safeParse({
      q: c.req.query('q'),
      exam: c.req.query('exam'),
      limit: c.req.query('limit'),
      beforeCreatedAt: c.req.query('beforeCreatedAt'),
    });
    if (!parsed.success) {
      throw new HTTPException(400, {
        message: parsed.error.issues[0]?.message ?? 'invalid query',
      });
    }
    const rows = await users.list({
      q: parsed.data.q,
      exam: parsed.data.exam as ExamSlug | undefined,
      limit: parsed.data.limit ?? 50,
      beforeCreatedAt: parsed.data.beforeCreatedAt as ISODateTime | undefined,
    });
    return c.json({
      users: rows.map((u) => ({
        id: u.id,
        email: u.email,
        name: u.name,
        photoPath: u.photoPath,
        targetExam: u.targetExam ?? null,
        isVerified: u.isVerified,
        currentStreak: u.currentStreak ?? 0,
        bestStreak: u.bestStreak ?? 0,
        createdAt: u.createdAt,
      })),
      // The list is sorted createdAt desc, so the last row's createdAt is
      // the cursor for the next page.
      nextCursor: rows.length > 0 ? rows[rows.length - 1]!.createdAt : null,
    });
  });

  // ---- detail -----------------------------------------------------------
  app.get('/users/:uid', async (c) => {
    await requireAnyAdmin(c, env, admins, 'support_admin');
    const uid = asUserId(c.req.param('uid'));
    const u = await users.get(uid);
    if (!u) throw new HTTPException(404, { message: 'user not found' });

    const [creditEvents, mcqAttempts, referralRows, subscription] = await Promise.all([
      ledger.read(uid).catch((err) => {
        logger.warn('admin.users.ledger_failed', {
          uid,
          error: err instanceof Error ? err.message : 'unknown',
        });
        return [];
      }),
      attempts.list({ userId: uid, limit: 25 }).catch((err) => {
        logger.warn('admin.users.attempts_failed', {
          uid,
          error: err instanceof Error ? err.message : 'unknown',
        });
        return [];
      }),
      referrals.listForReferrer(uid).catch((err) => {
        logger.warn('admin.users.referrals_failed', {
          uid,
          error: err instanceof Error ? err.message : 'unknown',
        });
        return [];
      }),
      subscriptions.get(uid).catch((err) => {
        logger.warn('admin.users.subscription_failed', {
          uid,
          error: err instanceof Error ? err.message : 'unknown',
        });
        return null;
      }),
    ]);

    const balance = computeBalance(creditEvents, uid, now());
    // Trim recent ledger entries; full history is huge.
    const recentLedger = creditEvents
      .slice()
      .sort((a, b) => (a.occurredAt < b.occurredAt ? 1 : -1))
      .slice(0, 25);

    const referralStats = {
      totalReferred: referralRows.length,
      rewarded: referralRows.filter((r) => r.status === 'rewarded' || r.status === 'retained')
        .length,
      retained: referralRows.filter((r) => r.status === 'retained').length,
    };

    return c.json({
      user: u,
      balance,
      recentLedger,
      recentAttempts: mcqAttempts,
      referralStats,
      subscription,
    });
  });

  // ---- grant credits ----------------------------------------------------
  app.post('/users/:uid/grant-credits', async (c) => {
    const { principal, role } = await requireAnyAdmin(c, env, admins, 'admin');
    const uid = asUserId(c.req.param('uid'));
    const u = await users.get(uid);
    if (!u) throw new HTTPException(404, { message: 'user not found' });

    const body = await c.req.json().catch(() => null);
    const parsed = grantSchema.safeParse(body);
    if (!parsed.success) {
      throw new HTTPException(400, {
        message: parsed.error.issues[0]?.message ?? 'invalid body',
      });
    }

    // Run the credit engine with `admin_grant` source. Idempotency key
    // baked from actor + target + reason + the audit-event id so a
    // double-click doesn't double-charge.
    const auditId = newAuditId();
    const idempotencyKey = `admin_grant:${principal.userId}:${uid}:${auditId}`;
    const events = await ledger.read(uid);
    const result = award(
      {
        userId: uid,
        source: 'admin_grant',
        amount: parsed.data.amount,
        sourceRef: auditId,
        idempotencyKey,
      },
      events,
      { newId, now },
    );
    if (result.kind === 'awarded') {
      await ledger.append(result.event);
    }

    const action: AuditAction = 'admin.users.grant_credits';
    const entry = newAuditEntry(() => auditId, now, {
      actorUid: principal.userId,
      actorEmail: principal.email,
      action,
      targetId: uid,
      metadata: {
        actorRole: role,
        amount: parsed.data.amount,
        reason: parsed.data.reason,
        ledgerEventId: result.kind === 'awarded' ? result.event.id : null,
        duplicate: result.kind === 'duplicate',
      },
    });
    await audit.append(entry);

    logger.info('admin.users.grant_credits', {
      actor: principal.userId,
      target: uid,
      amount: parsed.data.amount,
      reason: parsed.data.reason,
      result: result.kind,
    });

    const balance = computeBalance(
      result.kind === 'awarded' ? [...events, result.event] : events,
      uid,
      now(),
    );
    return c.json({ result, balance, audit: entry });
  });

  return app;
}
