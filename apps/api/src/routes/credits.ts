import { Hono } from 'hono';
import { HTTPException } from 'hono/http-exception';
import { requireAuth } from '../auth.js';
import type { Logger } from '../logger.js';
import type { UserStore } from '../lib/userStore.js';

export interface CreditsRoutesDeps { users: UserStore; logger: Logger; }

const CREDIT_REWARDS: Record<string, number> = { daily_login: 10, mcq_complete: 5, streak_7: 25, streak_30: 100 };

export function makeCreditsRoutes(deps: CreditsRoutesDeps): Hono {
  const app = new Hono();

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

  return app;
}
