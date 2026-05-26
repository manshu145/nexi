import { Hono } from 'hono';
import { HTTPException } from 'hono/http-exception';
import { requireAuth } from '../auth.js';
import type { Logger } from '../logger.js';
import type { UserStore } from '../lib/userStore.js';
import { InMemoryReferralStore, FirestoreReferralStore, type ReferralStore } from '../lib/referralStore.js';
import type { Firestore } from 'firebase-admin/firestore';

export interface CreditsRoutesDeps { users: UserStore; logger: Logger; db?: Firestore | null; referrals?: ReferralStore; }

const CREDIT_REWARDS: Record<string, number> = { daily_login: 10, mcq_complete: 5, streak_7: 25, streak_30: 100 };

export function makeCreditsRoutes(deps: CreditsRoutesDeps): Hono {
  const app = new Hono();
  const referrals = deps.referrals ?? (deps.db ? new FirestoreReferralStore(deps.db) : new InMemoryReferralStore());

  // GET /v1/credits/balance
  app.get('/balance', async (c) => {
    const principal = requireAuth(c);
    const user = await deps.users.get(principal.userId);
    return c.json({ credits: user?.credits ?? 0, plan: user?.plan ?? 'free' });
  });

  // POST /v1/credits/earn
  app.post('/earn', async (c) => {
    const principal = requireAuth(c);
    const body = await c.req.json().catch(() => null) as { type?: string } | null;
    const type = body?.type;
    if (!type || !CREDIT_REWARDS[type]) throw new HTTPException(400, { message: `Invalid type. Valid: ${Object.keys(CREDIT_REWARDS).join(', ')}` });

    const user = await deps.users.get(principal.userId);
    if (!user) throw new HTTPException(404, { message: 'User not found' });

    // daily_login check: only once per day
    if (type === 'daily_login') {
      const today = new Date().toISOString().split('T')[0]!;
      const lastDaily = user.lastDailyAt?.split('T')[0];
      if (lastDaily === today) return c.json({ credited: 0, balance: user.credits, message: 'Already claimed today' });
    }

    const reward = CREDIT_REWARDS[type]!;
    const newBalance = (user.credits ?? 0) + reward;
    await deps.users.update(principal.userId, { credits: newBalance, ...(type === 'daily_login' ? { lastDailyAt: new Date().toISOString() } : {}) } as any);

    deps.logger.info('credits.earned', { userId: principal.userId, type, reward, balance: newBalance });
    return c.json({ credited: reward, balance: newBalance });
  });

  // ─── Referral Endpoints ──────────────────────────────────────────────────

  // GET /v1/credits/referral — get user's referral code + stats
  app.get('/referral', async (c) => {
    const principal = requireAuth(c);
    // Ensure user has a code (creates if not exists)
    await referrals.createReferralCode(principal.userId);
    const stats = await referrals.getStats(principal.userId);
    return c.json(stats);
  });

  // POST /v1/credits/referral/apply — apply a referral code during onboarding
  app.post('/referral/apply', async (c) => {
    const principal = requireAuth(c);
    const body = await c.req.json().catch(() => null) as { referralCode?: string } | null;
    const code = body?.referralCode?.trim();
    if (!code) throw new HTTPException(400, { message: 'referralCode is required' });

    const referrerId = await referrals.applyReferral(principal.userId, code);
    if (!referrerId) {
      return c.json({ success: false, message: 'Invalid or already-used referral code' });
    }

    // Give referred user bonus credits (+25)
    const user = await deps.users.get(principal.userId);
    if (user) {
      await deps.users.update(principal.userId, { credits: (user.credits ?? 0) + 25 } as any);
    }

    deps.logger.info('referral.applied', { newUser: principal.userId, referrerId, code });
    return c.json({ success: true, bonusCredits: 25 });
  });

  // POST /v1/credits/referral/complete — called when referred user completes onboarding
  app.post('/referral/complete', async (c) => {
    const principal = requireAuth(c);
    const result = await referrals.completeReferral(principal.userId);
    if (!result) {
      return c.json({ completed: false });
    }

    // Award referrer +50 credits
    const referrer = await deps.users.get(result.referrerId);
    if (referrer) {
      await deps.users.update(result.referrerId, { credits: (referrer.credits ?? 0) + 50 } as any);
      deps.logger.info('referral.completed', { referrer: result.referrerId, referred: principal.userId, creditsAwarded: 50 });
    }

    return c.json({ completed: true, referrerId: result.referrerId });
  });

  return app;
}
