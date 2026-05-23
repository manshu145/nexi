import { Hono } from 'hono';
import { HTTPException } from 'hono/http-exception';
import { z } from 'zod';
import { SUBSCRIPTION_PLANS, type SubscriptionPlan } from '@nexigrate/shared';
import { requireAuth } from '../auth.js';
import type { Env } from '../env.js';
import {
  createOrder,
  isRazorpayConfigured,
  verifyPaymentSignature,
  verifyWebhookSignature,
} from '../lib/razorpay.js';
import type { SubscriptionStore } from '../lib/subscriptionStore.js';
import type { Logger } from '../logger.js';

/**
 * Billing routes (Razorpay test mode in Phase 3).
 *
 *   POST /v1/billing/create-order   -- creates a one-time order
 *   POST /v1/billing/verify         -- verifies signature, activates subscription
 *   POST /v1/billing/webhook        -- Razorpay webhook (paths/-> activated)
 *   GET  /v1/billing/subscription   -- current subscription for the user
 *
 * One-time payment model (vs Razorpay Subscriptions): user pays for 30 or 365
 * days of access; renewal requires a fresh payment. Avoids the extra plan/
 * customer/subscription objects until we've validated demand.
 */
export interface BillingRoutesDeps {
  env: Env;
  subscriptions: SubscriptionStore;
  logger: Logger;
}

const planSlugs = Object.keys(SUBSCRIPTION_PLANS) as SubscriptionPlan[];
const intervalSlugs = ['monthly', 'yearly'] as const;

const createOrderSchema = z.object({
  plan: z.enum(planSlugs as [SubscriptionPlan, ...SubscriptionPlan[]]),
  interval: z.enum(intervalSlugs),
});

const verifySchema = z.object({
  razorpay_order_id: z.string().min(1),
  razorpay_payment_id: z.string().min(1),
  razorpay_signature: z.string().min(1),
  plan: z.enum(planSlugs as [SubscriptionPlan, ...SubscriptionPlan[]]),
  interval: z.enum(intervalSlugs),
});

function priceInPaise(plan: SubscriptionPlan, interval: 'monthly' | 'yearly'): number {
  const cfg = SUBSCRIPTION_PLANS[plan];
  const inr = interval === 'yearly' ? cfg.yearlyInr : cfg.monthlyInr;
  return inr * 100;
}

export function makeBillingRoutes(deps: BillingRoutesDeps): Hono {
  const app = new Hono();
  const { env } = deps;

  app.use('*', async (c, next) => {
    if (!isRazorpayConfigured(env) && c.req.path !== '/billing/subscription') {
      throw new HTTPException(503, {
        message: 'Billing is not configured on this environment.',
      });
    }
    await next();
  });

  app.post('/create-order', async (c) => {
    const principal = requireAuth(c);
    const body = await c.req.json().catch(() => null);
    const parsed = createOrderSchema.safeParse(body);
    if (!parsed.success) {
      throw new HTTPException(400, {
        message: parsed.error.issues[0]?.message ?? 'invalid body',
      });
    }
    const { plan, interval } = parsed.data;
    const amount = priceInPaise(plan, interval);
    // Receipt has a 40-char Razorpay limit.
    const receipt = `nx_${plan}_${Date.now().toString(36)}`.slice(0, 40);
    const order = await createOrder(env, {
      amount,
      currency: 'INR',
      receipt,
      notes: {
        userId: principal.userId,
        plan,
        interval,
      },
    });
    deps.logger.info('billing.order.created', {
      userId: principal.userId,
      orderId: order.id,
      plan,
      interval,
      amountInr: amount / 100,
    });
    return c.json({
      orderId: order.id,
      amount: order.amount,
      currency: order.currency,
      keyId: env.RAZORPAY_KEY_ID,
      plan,
      interval,
    });
  });

  app.post('/verify', async (c) => {
    const principal = requireAuth(c);
    const body = await c.req.json().catch(() => null);
    const parsed = verifySchema.safeParse(body);
    if (!parsed.success) {
      throw new HTTPException(400, {
        message: parsed.error.issues[0]?.message ?? 'invalid body',
      });
    }
    const { razorpay_order_id, razorpay_payment_id, razorpay_signature, plan, interval } =
      parsed.data;
    const ok = verifyPaymentSignature(
      env,
      razorpay_order_id,
      razorpay_payment_id,
      razorpay_signature,
    );
    if (!ok) {
      deps.logger.warn('billing.verify.bad_signature', {
        userId: principal.userId,
        orderId: razorpay_order_id,
      });
      throw new HTTPException(400, { message: 'invalid payment signature' });
    }
    const sub = await deps.subscriptions.activate({
      userId: principal.userId,
      plan,
      interval,
      amountInr: priceInPaise(plan, interval) / 100,
      razorpayOrderId: razorpay_order_id,
      razorpayPaymentId: razorpay_payment_id,
    });
    deps.logger.info('billing.subscription.activated', {
      userId: principal.userId,
      orderId: razorpay_order_id,
      plan,
      interval,
    });
    return c.json({ subscription: sub });
  });

  app.post('/webhook', async (c) => {
    const signature = c.req.header('x-razorpay-signature') ?? '';
    const raw = await c.req.text();
    const ok = verifyWebhookSignature(env, raw, signature);
    if (!ok) {
      deps.logger.warn('billing.webhook.bad_signature', { len: raw.length });
      throw new HTTPException(400, { message: 'invalid webhook signature' });
    }
    deps.logger.info('billing.webhook.received', { len: raw.length });
    // We currently rely on /verify for activation; webhook is a backup.
    // Future: parse `payment.captured` events and idempotently activate.
    return c.json({ ok: true });
  });

  app.get('/subscription', async (c) => {
    const principal = requireAuth(c);
    const sub = await deps.subscriptions.get(principal.userId);
    return c.json({ subscription: sub });
  });

  return app;
}
