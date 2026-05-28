import { Hono } from 'hono';
import { HTTPException } from 'hono/http-exception';
import { requireAuth } from '../auth.js';
import type { Logger } from '../logger.js';
import type { UserStore } from '../lib/userStore.js';
import { InMemoryReferralStore, FirestoreReferralStore, type ReferralStore } from '../lib/referralStore.js';
import type { Firestore } from 'firebase-admin/firestore';
import type { CreditLedger } from '../lib/creditLedger.js';
import type { PlatformConfigStore } from '../lib/platformConfigStore.js';
import { asUserId } from '@nexigrate/shared';

export interface CreditsRoutesDeps {
  users: UserStore;
  logger: Logger;
  db?: Firestore | null;
  referrals?: ReferralStore;
  ledger: CreditLedger;
  /** Source of truth for current earn/spend amounts (admin-editable). */
  config: PlatformConfigStore;
}

export function makeCreditsRoutes(deps: CreditsRoutesDeps): Hono {
  const app = new Hono();
  const referrals = deps.referrals ?? (deps.db ? new FirestoreReferralStore(deps.db) : new InMemoryReferralStore());

  // ─── Balance + history ────────────────────────────────────────────────────

  // GET /v1/credits/balance — current balance, plan, and the LIVE rate
  // tables (read from platformConfig, not from compile-time constants) so
  // the /credits page renders the same numbers the server will award.
  app.get('/balance', async (c) => {
    const principal = requireAuth(c);
    const [user, balance, earnRates, spendRates] = await Promise.all([
      deps.users.get(principal.userId),
      deps.ledger.getBalance(principal.userId),
      deps.config.getEarnAmounts(),
      deps.config.getSpendAmounts(),
    ]);
    return c.json({
      credits: balance,
      plan: user?.plan ?? 'free',
      earnRates,
      spendRates,
    });
  });

  // GET /v1/credits/events — paginated ledger history for the current user.
  // Most recent first; backed by the append-only `creditEvents` collection.
  app.get('/events', async (c) => {
    const principal = requireAuth(c);
    const limit = Math.min(Math.max(parseInt(c.req.query('limit') ?? '50', 10) || 50, 1), 200);
    const before = c.req.query('before') || undefined;
    const events = await deps.ledger.listEvents(principal.userId, { limit, before });
    return c.json({ events, limit });
  });

  // ─── Referral Endpoints ───────────────────────────────────────────────────

  // GET /v1/credits/referral — get user's referral code + stats
  app.get('/referral', async (c) => {
    const principal = requireAuth(c);
    // Ensure user has a code (creates if not exists).
    await referrals.createReferralCode(principal.userId);
    const stats = await referrals.getStats(principal.userId);
    return c.json(stats);
  });

  // POST /v1/credits/referral/apply — invitee applies a code during onboarding.
  // Awards the invitee bonus (referral_bonus = 100) via the ledger.
  app.post('/referral/apply', async (c) => {
    const principal = requireAuth(c);
    const body = await c.req.json().catch(() => null) as { referralCode?: string } | null;
    const code = body?.referralCode?.trim();
    if (!code) throw new HTTPException(400, { message: 'referralCode is required' });

    const referrerId = await referrals.applyReferral(principal.userId, code);
    if (!referrerId) {
      return c.json({ success: false, message: 'Invalid or already-used referral code' });
    }

    // Idempotent on (invitee, referrerId): a retry of /apply for the same
    // pairing collapses to one ledger row. Amount is read from the live
    // platformConfig so admin edits via /admin/credit-rewards take effect
    // on the next call without a redeploy.
    const result = await deps.ledger.award({
      userId: principal.userId,
      source: 'referral_bonus',
      amount: await deps.config.getEarnAmount('referral_bonus'),
      sourceRef: referrerId,
      idempotencyKey: `referral_bonus:${principal.userId}:${referrerId}`,
    });

    deps.logger.info('referral.applied', {
      newUser: principal.userId,
      referrerId,
      code,
      ledgerKind: result.kind,
    });
    return c.json({
      success: true,
      bonusCredits: result.kind === 'awarded' ? result.event.amount : 0,
    });
  });

  // POST /v1/credits/referral/complete — invitee finished onboarding;
  // pay the referrer their bonus (referral_signup = 50).
  app.post('/referral/complete', async (c) => {
    const principal = requireAuth(c);
    const result = await referrals.completeReferral(principal.userId);
    if (!result) {
      return c.json({ completed: false });
    }

    const award = await deps.ledger.award({
      userId: asUserId(result.referrerId),
      source: 'referral_signup',
      amount: await deps.config.getEarnAmount('referral_signup'),
      sourceRef: principal.userId,
      idempotencyKey: `referral_signup:${result.referrerId}:${principal.userId}`,
    });

    deps.logger.info('referral.completed', {
      referrer: result.referrerId,
      referred: principal.userId,
      creditsAwarded: award.kind === 'awarded' ? award.event.amount : 0,
    });

    return c.json({ completed: true, referrerId: result.referrerId });
  });

  return app;
}
