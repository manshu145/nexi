import { Hono } from 'hono';
import { HTTPException } from 'hono/http-exception';
import { requireAuth } from '../auth.js';
import type { Logger } from '../logger.js';
import type { UserStore } from '../lib/userStore.js';
import type { CouponStore } from '../lib/couponStore.js';
import type { Env } from '../env.js';
import type { Firestore } from 'firebase-admin/firestore';
import { createHmac } from 'node:crypto';
import { PLANS, isPlanActive, type PlanId } from '@nexigrate/shared';

export interface BillingRoutesDeps {
  users: UserStore;
  env: Env;
  logger: Logger;
  db: Firestore | null;
  coupons: CouponStore;
}

export function makeBillingRoutes(deps: BillingRoutesDeps): Hono {
  const app = new Hono();

  // GET /v1/billing/plans — returns all plans with features + isActive flags
  app.get('/plans', (c) => {
    requireAuth(c);
    const plans = Object.values(PLANS).map(p => ({
      ...p,
      // For disabled plans, add explicit comingSoon message
      ...(p.comingSoon ? { description: 'Coming soon — launching next month!' } : {}),
    }));
    return c.json({ plans });
  });

  // POST /v1/billing/order — create Razorpay order
  app.post('/order', async (c) => {
    const principal = requireAuth(c);
    const body = await c.req.json().catch(() => null) as { planId?: string; couponCode?: string } | null;
    if (!body?.planId) throw new HTTPException(400, { message: 'planId required' });

    const planId = body.planId as PlanId;
    const plan = PLANS[planId];
    if (!plan) throw new HTTPException(400, { message: 'Invalid plan' });
    if (!plan.isActive) throw new HTTPException(400, { message: 'This plan is not available yet. Coming soon!' });
    if (planId === 'free') throw new HTTPException(400, { message: 'Cannot purchase free plan' });

    // RAZORPAY_KEY_ID is a public key (not secret). Default to test key if not set.
    const razorpayKeyId = deps.env.RAZORPAY_KEY_ID || 'rzp_test_SsPfzbJUMaK7Ow';
    if (!deps.env.RAZORPAY_KEY_SECRET) {
      throw new HTTPException(503, { message: 'Payment system not configured. RAZORPAY_KEY_SECRET missing.' });
    }

    const baseAmount = plan.price * 100; // paise (monthly only for now)
    let finalAmount = baseAmount;
    let couponCode: string | null = null;

    // Validate coupon if provided
    if (body.couponCode?.trim()) {
      couponCode = body.couponCode.trim().toUpperCase();
      const validation = await deps.coupons.validate(couponCode, planId, principal.userId, baseAmount);
      if (!validation.valid) {
        throw new HTTPException(400, { message: validation.error ?? 'Invalid coupon' });
      }
      finalAmount = validation.finalAmount;
    }

    try {
      const receipt = `order_${principal.userId.slice(0, 12)}_${Date.now().toString(36)}`;
      const res = await fetch('https://api.razorpay.com/v1/orders', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Basic ${Buffer.from(`${razorpayKeyId}:${deps.env.RAZORPAY_KEY_SECRET}`).toString('base64')}`,
        },
        body: JSON.stringify({
          amount: finalAmount,
          currency: 'INR',
          receipt,
          notes: { uid: principal.userId, planId, couponCode: couponCode || '' },
        }),
      });

      if (!res.ok) {
        const err = await res.text().catch(() => '');
        throw new Error(`Razorpay ${res.status}: ${err.slice(0, 200)}`);
      }

      const order = await res.json() as { id: string; amount: number; currency: string };

      // Save order to Firestore
      if (deps.db) {
        await deps.db.collection('billingOrders').doc(order.id).set({
          orderId: order.id,
          uid: principal.userId,
          planId,
          amount: finalAmount,
          originalAmount: baseAmount,
          couponCode,
          status: 'pending',
          paymentId: null,
          createdAt: new Date().toISOString(),
          completedAt: null,
        });
      }

      deps.logger.info('billing.order_created', { userId: principal.userId, planId, orderId: order.id, amount: finalAmount, couponCode });
      return c.json({ orderId: order.id, amount: finalAmount, currency: order.currency, keyId: razorpayKeyId });
    } catch (err) {
      if (err instanceof HTTPException) throw err;
      deps.logger.error('billing.order_error', { error: err instanceof Error ? err.message : String(err) });
      throw new HTTPException(503, { message: err instanceof Error ? err.message : 'Failed to create payment order' });
    }
  });

  // POST /v1/billing/validate-coupon — validate coupon without creating order
  app.post('/validate-coupon', async (c) => {
    const principal = requireAuth(c);
    const body = await c.req.json().catch(() => null) as { couponCode?: string; planId?: string } | null;
    if (!body?.couponCode || !body?.planId) throw new HTTPException(400, { message: 'couponCode and planId required' });

    const planId = body.planId as PlanId;
    const plan = PLANS[planId];
    if (!plan) throw new HTTPException(400, { message: 'Invalid plan' });

    const baseAmount = plan.price * 100;
    const validation = await deps.coupons.validate(body.couponCode.trim(), planId, principal.userId, baseAmount);
    return c.json(validation);
  });

  // POST /v1/billing/verify — verify payment after Razorpay checkout
  app.post('/verify', async (c) => {
    const principal = requireAuth(c);
    const body = await c.req.json().catch(() => null) as {
      razorpay_order_id?: string;
      razorpay_payment_id?: string;
      razorpay_signature?: string;
    } | null;

    if (!body?.razorpay_order_id || !body?.razorpay_payment_id || !body?.razorpay_signature) {
      throw new HTTPException(400, { message: 'Missing payment verification fields' });
    }

    if (!deps.env.RAZORPAY_KEY_SECRET) throw new HTTPException(503, { message: 'Payment system not configured' });

    // Verify signature
    const expectedSig = createHmac('sha256', deps.env.RAZORPAY_KEY_SECRET)
      .update(`${body.razorpay_order_id}|${body.razorpay_payment_id}`)
      .digest('hex');

    if (expectedSig !== body.razorpay_signature) {
      deps.logger.warn('billing.verify_failed', { userId: principal.userId, reason: 'signature mismatch' });
      throw new HTTPException(400, { message: 'Payment verification failed' });
    }

    // Fetch order from Firestore to get planId and couponCode
    let planId: PlanId = 'scholar';
    let couponCode: string | null = null;

    if (deps.db) {
      const orderSnap = await deps.db.collection('billingOrders').doc(body.razorpay_order_id).get();
      if (orderSnap.exists) {
        const orderData = orderSnap.data()!;
        planId = (orderData.planId as PlanId) || 'scholar';
        couponCode = orderData.couponCode || null;
      }
    }

    // Upgrade user plan — 30 days from now
    const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
    await deps.users.update(principal.userId, { plan: planId, planExpiresAt: expiresAt } as any);

    // Update order status
    if (deps.db) {
      await deps.db.collection('billingOrders').doc(body.razorpay_order_id).set({
        status: 'completed',
        paymentId: body.razorpay_payment_id,
        completedAt: new Date().toISOString(),
      }, { merge: true });

      // Mark coupon as used by this user
      if (couponCode) {
        await deps.coupons.incrementUsage(couponCode);
        await deps.db.collection('users').doc(principal.userId).collection('usedCoupons').doc(couponCode).set({
          usedAt: new Date().toISOString(),
        });
      }
    }

    deps.logger.info('billing.verified', { userId: principal.userId, planId, expiresAt, couponCode });
    return c.json({ success: true, plan: planId, expiresAt });
  });

  // POST /v1/billing/webhook — Razorpay webhook (NO auth — uses webhook signature)
  app.post('/webhook', async (c) => {
    const webhookSecret = deps.env.RAZORPAY_WEBHOOK_SECRET;
    if (!webhookSecret) return c.json({ ok: true }); // silently ignore if not configured

    const signature = c.req.header('x-razorpay-signature') ?? '';
    const rawBody = await c.req.text();

    const expectedSig = createHmac('sha256', webhookSecret).update(rawBody).digest('hex');
    if (expectedSig !== signature) {
      deps.logger.warn('billing.webhook_signature_mismatch');
      return c.json({ ok: false }, 400);
    }

    try {
      const payload = JSON.parse(rawBody) as { event?: string; payload?: { payment?: { entity?: { order_id?: string; id?: string; status?: string } } } };
      const event = payload.event;
      const payment = payload.payload?.payment?.entity;

      if (event === 'payment.captured' && payment?.order_id) {
        // Fallback activation — same logic as verify
        if (deps.db) {
          const orderSnap = await deps.db.collection('billingOrders').doc(payment.order_id).get();
          if (orderSnap.exists) {
            const orderData = orderSnap.data()!;
            if (orderData.status === 'pending') {
              const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
              await deps.users.update(orderData.uid, { plan: orderData.planId, planExpiresAt: expiresAt } as any);
              await deps.db.collection('billingOrders').doc(payment.order_id).set({
                status: 'completed', paymentId: payment.id, completedAt: new Date().toISOString(),
              }, { merge: true });
              if (orderData.couponCode) await deps.coupons.incrementUsage(orderData.couponCode);
              deps.logger.info('billing.webhook_activated', { uid: orderData.uid, planId: orderData.planId, orderId: payment.order_id });
            }
          }
        }
      } else if (event === 'payment.failed' && payment?.order_id) {
        if (deps.db) {
          await deps.db.collection('billingOrders').doc(payment.order_id).set({ status: 'failed' }, { merge: true });
        }
        deps.logger.info('billing.webhook_failed', { orderId: payment.order_id });
      }
    } catch (err) {
      deps.logger.error('billing.webhook_error', { error: err instanceof Error ? err.message : String(err) });
    }

    return c.json({ ok: true });
  });

  // GET /v1/billing/subscription — current plan info
  app.get('/subscription', async (c) => {
    const principal = requireAuth(c);
    const user = await deps.users.get(principal.userId);
    const plan = user?.plan ?? 'free';
    const planExpiresAt = (user as any)?.planExpiresAt ?? null;
    const isActive = isPlanActive(plan, planExpiresAt);
    const daysRemaining = planExpiresAt ? Math.max(0, Math.ceil((new Date(planExpiresAt).getTime() - Date.now()) / (24 * 60 * 60 * 1000))) : 0;

    return c.json({ plan, planExpiresAt, isActive, daysRemaining, credits: user?.credits ?? 0 });
  });

  // GET /v1/billing/history — last 10 completed payments for current user
  app.get('/history', async (c) => {
    const principal = requireAuth(c);
    if (!deps.db) return c.json({ payments: [] });

    try {
      const snap = await deps.db.collection('billingOrders')
        .where('uid', '==', principal.userId)
        .where('status', '==', 'completed')
        .orderBy('completedAt', 'desc')
        .limit(10)
        .get();
      const payments = snap.docs.map(d => d.data());
      return c.json({ payments });
    } catch {
      return c.json({ payments: [] });
    }
  });

  return app;
}
