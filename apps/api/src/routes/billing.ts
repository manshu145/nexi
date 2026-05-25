import { Hono } from 'hono';
import { HTTPException } from 'hono/http-exception';
import { requireAuth } from '../auth.js';
import type { Logger } from '../logger.js';
import type { UserStore } from '../lib/userStore.js';
import type { Env } from '../env.js';
import { createHmac } from 'node:crypto';

export interface BillingRoutesDeps { users: UserStore; env: Env; logger: Logger; }

const PLANS = [
  { id: 'scholar', name: 'Scholar', nameHi: 'विद्वान', price: 99, yearlyPrice: 999, dailyMcq: 25, mockTests: 4, aiTutor: false, currentAffairs: true, essayGrading: false },
  { id: 'aspirant', name: 'Aspirant', nameHi: 'अभ्यर्थी', price: 299, yearlyPrice: 2999, dailyMcq: -1, mockTests: -1, aiTutor: true, currentAffairs: true, essayGrading: false },
  { id: 'achiever', name: 'Achiever', nameHi: 'उपलब्धिकर्ता', price: 599, yearlyPrice: 5999, dailyMcq: -1, mockTests: -1, aiTutor: true, currentAffairs: true, essayGrading: true },
];

export function makeBillingRoutes(deps: BillingRoutesDeps): Hono {
  const app = new Hono();

  // GET /v1/billing/plans
  app.get('/plans', (c) => { requireAuth(c); return c.json({ plans: PLANS }); });

  // POST /v1/billing/order
  app.post('/order', async (c) => {
    const principal = requireAuth(c);
    const body = await c.req.json().catch(() => null) as { planId?: string; period?: 'monthly' | 'yearly' } | null;
    if (!body?.planId || !body?.period) throw new HTTPException(400, { message: 'planId and period required' });

    const plan = PLANS.find(p => p.id === body.planId);
    if (!plan) throw new HTTPException(400, { message: 'Invalid plan' });

    if (!deps.env.RAZORPAY_KEY_ID || !deps.env.RAZORPAY_KEY_SECRET) {
      throw new HTTPException(503, { message: 'Payment system not configured' });
    }

    const amount = (body.period === 'yearly' ? plan.yearlyPrice : plan.price) * 100; // paise
    try {
      const res = await fetch('https://api.razorpay.com/v1/orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Basic ${Buffer.from(`${deps.env.RAZORPAY_KEY_ID}:${deps.env.RAZORPAY_KEY_SECRET}`).toString('base64')}` },
        body: JSON.stringify({ amount, currency: 'INR', receipt: `${principal.userId}-${body.planId}-${Date.now()}` }),
      });
      if (!res.ok) { const err = await res.text().catch(() => ''); throw new Error(`Razorpay ${res.status}: ${err.slice(0, 100)}`); }
      const order = await res.json() as { id: string; amount: number; currency: string };
      deps.logger.info('billing.order_created', { userId: principal.userId, planId: body.planId, orderId: order.id });
      return c.json({ orderId: order.id, amount: order.amount, currency: order.currency, key: deps.env.RAZORPAY_KEY_ID });
    } catch (err) {
      if (err instanceof HTTPException) throw err;
      deps.logger.error('billing.order_error', { error: err instanceof Error ? err.message : String(err) });
      throw new HTTPException(503, { message: 'Failed to create payment order' });
    }
  });

  // POST /v1/billing/verify
  app.post('/verify', async (c) => {
    const principal = requireAuth(c);
    const body = await c.req.json().catch(() => null) as { razorpay_order_id?: string; razorpay_payment_id?: string; razorpay_signature?: string; planId?: string; period?: 'monthly' | 'yearly' } | null;
    if (!body?.razorpay_order_id || !body?.razorpay_payment_id || !body?.razorpay_signature || !body?.planId) {
      throw new HTTPException(400, { message: 'Missing payment verification fields' });
    }

    if (!deps.env.RAZORPAY_KEY_SECRET) throw new HTTPException(503, { message: 'Payment system not configured' });

    // Verify signature
    const expectedSig = createHmac('sha256', deps.env.RAZORPAY_KEY_SECRET).update(`${body.razorpay_order_id}|${body.razorpay_payment_id}`).digest('hex');
    if (expectedSig !== body.razorpay_signature) {
      deps.logger.warn('billing.verify_failed', { userId: principal.userId, reason: 'signature mismatch' });
      throw new HTTPException(400, { message: 'Payment verification failed' });
    }

    // Upgrade user plan
    const plan = PLANS.find(p => p.id === body.planId);
    const daysToAdd = body.period === 'yearly' ? 365 : 30;
    const expiresAt = new Date(Date.now() + daysToAdd * 24 * 60 * 60 * 1000).toISOString();

    await deps.users.update(principal.userId, { plan: body.planId, planExpiresAt: expiresAt } as any);
    deps.logger.info('billing.verified', { userId: principal.userId, planId: body.planId, expiresAt });
    return c.json({ success: true, plan: plan?.name ?? body.planId, expiresAt });
  });

  // GET /v1/billing/subscription
  app.get('/subscription', async (c) => {
    const principal = requireAuth(c);
    const user = await deps.users.get(principal.userId);
    return c.json({ plan: user?.plan ?? 'free', planExpiresAt: (user as any)?.planExpiresAt ?? null, credits: user?.credits ?? 0 });
  });

  return app;
}
