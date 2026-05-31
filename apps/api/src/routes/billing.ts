import { Hono } from 'hono';
import { HTTPException } from 'hono/http-exception';
import { requireAuth } from '../auth.js';
import type { Logger } from '../logger.js';
import type { UserStore } from '../lib/userStore.js';
import type { CouponStore } from '../lib/couponStore.js';
import type { Env } from '../env.js';
import type { Firestore } from 'firebase-admin/firestore';
import { createHmac } from 'node:crypto';
import {
  isPlanActive,
  asUserId,
  type PlanId,
  type BillingPeriod,
} from '@nexigrate/shared';
import { grantPlan } from '../lib/billing.js';
import type { IdempotencyStore } from '../lib/idempotency.js';
import type { PlatformConfigStore } from '../lib/platformConfigStore.js';
import { getRazorpayConfig, type ServiceKeyStore } from '../lib/serviceKeyStore.js';

export interface BillingRoutesDeps {
  users: UserStore;
  env: Env;
  logger: Logger;
  db: Firestore | null;
  coupons: CouponStore;
  idempotency: IdempotencyStore;
  /**
   * Source of truth for the plan matrix (price, features, isActive). The
   * defaults come from `@nexigrate/shared`; admin edits in /admin/plans
   * override them via the platformConfig/plans Firestore doc.
   */
  config: PlatformConfigStore;
  /**
   * PR-37: Razorpay key_id / key_secret / webhook_secret are read from
   * this store first, env vars second. Lets the founder rotate keys
   * from the admin panel without redeploying.
   */
  serviceKeys: ServiceKeyStore;
}

function parsePeriod(input: unknown): BillingPeriod {
  return input === 'yearly' ? 'yearly' : 'monthly';
}

export function makeBillingRoutes(deps: BillingRoutesDeps): Hono {
  const app = new Hono();

  // GET /v1/billing/plans — returns all plans with features + isActive flags.
  // Reads from the admin-editable platformConfig/plans store, which falls
  // back to the locked PR-03 defaults from @nexigrate/shared on a fresh
  // Firestore.
  app.get('/plans', async (c) => {
    requireAuth(c);
    const planMap = await deps.config.getPlans();
    const plans = Object.values(planMap).map(p => ({
      ...p,
      ...(p.comingSoon ? { description: 'Coming soon — launching next month!' } : {}),
    }));
    return c.json({ plans });
  });

  // POST /v1/billing/order — create Razorpay order for a (planId, period) pair.
  // Body: { planId: 'scholar' | 'aspirant' | 'achiever', period: 'monthly' | 'yearly', couponCode?: string }
  app.post('/order', async (c) => {
    const principal = requireAuth(c);
    const body = await c.req.json().catch(() => null) as {
      planId?: string;
      period?: string;
      couponCode?: string;
    } | null;
    if (!body?.planId) throw new HTTPException(400, { message: 'planId required' });

    const planId = body.planId as PlanId;
    const plan = await deps.config.getPlan(planId);
    if (!plan) throw new HTTPException(400, { message: 'Invalid plan' });
    if (!plan.isActive) throw new HTTPException(400, { message: 'This plan is not available yet. Coming soon!' });
    if (planId === 'free') throw new HTTPException(400, { message: 'Cannot purchase free plan' });

    const period = parsePeriod(body.period);
    const baseRupees = await deps.config.priceFor(planId, period);
    if (baseRupees <= 0) throw new HTTPException(400, { message: 'Invalid price for plan/period' });

    // PR-37: Razorpay keys come from serviceKeyStore first, env vars
    // second. Founder can rotate keys from /admin/service-keys without
    // touching env vars or redeploying.
    const rzpCfg = await getRazorpayConfig(deps.serviceKeys, deps.env);
    if (!rzpCfg) {
      throw new HTTPException(503, {
        message: 'Payment system not configured. Open Admin → Service Keys → Razorpay and save Key ID + Key Secret.',
      });
    }
    const razorpayKeyId = rzpCfg.keyId;

    const baseAmount = baseRupees * 100; // paise
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
          'Authorization': `Basic ${Buffer.from(`${razorpayKeyId}:${rzpCfg.keySecret}`).toString('base64')}`,
        },
        body: JSON.stringify({
          amount: finalAmount,
          currency: 'INR',
          receipt,
          notes: { uid: principal.userId, planId, period, couponCode: couponCode || '' },
        }),
      });

      if (!res.ok) {
        const err = await res.text().catch(() => '');
        throw new Error(`Razorpay ${res.status}: ${err.slice(0, 200)}`);
      }

      const order = await res.json() as { id: string; amount: number; currency: string };

      // Save order to Firestore — period is the key new field (verifies + webhooks read it).
      if (deps.db) {
        await deps.db.collection('billingOrders').doc(order.id).set({
          orderId: order.id,
          uid: principal.userId,
          planId,
          period,
          amount: finalAmount,
          originalAmount: baseAmount,
          couponCode,
          status: 'pending',
          paymentId: null,
          createdAt: new Date().toISOString(),
          completedAt: null,
        });
      }

      deps.logger.info('billing.order_created', {
        userId: principal.userId, planId, period, orderId: order.id, amount: finalAmount, couponCode,
      });
      return c.json({ orderId: order.id, amount: finalAmount, currency: order.currency, keyId: razorpayKeyId, period });
    } catch (err) {
      if (err instanceof HTTPException) throw err;
      deps.logger.error('billing.order_error', { error: err instanceof Error ? err.message : String(err) });
      throw new HTTPException(503, { message: err instanceof Error ? err.message : 'Failed to create payment order' });
    }
  });

  // POST /v1/billing/validate-coupon — validate coupon without creating order
  app.post('/validate-coupon', async (c) => {
    const principal = requireAuth(c);
    const body = await c.req.json().catch(() => null) as { couponCode?: string; planId?: string; period?: string } | null;
    if (!body?.couponCode || !body?.planId) throw new HTTPException(400, { message: 'couponCode and planId required' });

    const planId = body.planId as PlanId;
    const plan = await deps.config.getPlan(planId);
    if (!plan) throw new HTTPException(400, { message: 'Invalid plan' });

    const period = parsePeriod(body.period);
    const baseAmount = (await deps.config.priceFor(planId, period)) * 100;
    const validation = await deps.coupons.validate(body.couponCode.trim(), planId, principal.userId, baseAmount);
    return c.json(validation);
  });

  // POST /v1/billing/verify — verify payment after Razorpay checkout (browser handler).
  // Idempotent on `razorpay_payment_id`: a retry returns the cached response.
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

    // PR-37: Razorpay key secret comes from serviceKeyStore first.
    const rzpCfg = await getRazorpayConfig(deps.serviceKeys, deps.env);
    if (!rzpCfg) {
      throw new HTTPException(503, {
        message: 'Payment system not configured. Open Admin → Service Keys → Razorpay and save Key ID + Key Secret.',
      });
    }

    // 1. Idempotency — if we've seen this payment_id before, return the cached response.
    const idemKey = body.razorpay_payment_id;
    const cached = await deps.idempotency.get<{ success: boolean; plan: string; expiresAt: string }>(
      'billing.verify', idemKey,
    );
    if (cached && cached.status === 'completed') {
      deps.logger.info('billing.verify_idempotent_replay', { userId: principal.userId, paymentId: idemKey });
      return c.json(cached.response);
    }

    // 2. Verify Razorpay HMAC signature (proves Razorpay signed this payment).
    const expectedSig = createHmac('sha256', rzpCfg.keySecret)
      .update(`${body.razorpay_order_id}|${body.razorpay_payment_id}`)
      .digest('hex');

    if (expectedSig !== body.razorpay_signature) {
      deps.logger.warn('billing.verify_failed', { userId: principal.userId, reason: 'signature mismatch' });
      throw new HTTPException(400, { message: 'Payment verification failed' });
    }

    // 3. Load order — read planId, period, and couponCode from the trusted server-side doc.
    let planId: PlanId = 'scholar';
    let period: BillingPeriod = 'monthly';
    let couponCode: string | null = null;
    let amountPaise = 0;

    if (deps.db) {
      const orderSnap = await deps.db.collection('billingOrders').doc(body.razorpay_order_id).get();
      if (orderSnap.exists) {
        const orderData = orderSnap.data()!;
        // SECURITY: ensure the order belongs to the authenticated user.
        if (orderData.uid && orderData.uid !== principal.userId) {
          deps.logger.warn('billing.verify_uid_mismatch', {
            userId: principal.userId, orderUid: orderData.uid, orderId: body.razorpay_order_id,
          });
          throw new HTTPException(403, { message: 'Order does not belong to current user' });
        }
        planId = (orderData.planId as PlanId) || 'scholar';
        period = parsePeriod(orderData.period);
        couponCode = orderData.couponCode || null;
        amountPaise = orderData.amount || 0;
      }
    }

    // 4. Activate the plan (extends if active, else starts fresh).
    const result = await grantPlan(
      { users: deps.users, coupons: deps.coupons, db: deps.db, logger: deps.logger },
      {
        uid: principal.userId,
        planId,
        period,
        paymentId: body.razorpay_payment_id,
        orderId: body.razorpay_order_id,
        couponCode,
        source: 'verify',
      },
    );

    const response = { success: true, plan: result.plan, expiresAt: result.expiresAt, period };

    // 5. Cache the response under the payment id so retries are no-ops.
    await deps.idempotency.put('billing.verify', idemKey, response);

    // 6. Send confirmation email — non-blocking, best-effort.
    try {
      const { createEmailService } = await import('../lib/emailService.js');
      const emailService = createEmailService(deps.env, deps.logger, deps.serviceKeys);
      const user = await deps.users.get(principal.userId);
      if (user?.email) {
        await emailService.sendPaymentSuccess(
          user.email,
          user.name ?? 'Student',
          planId,
          result.expiresAt,
          amountPaise / 100,
        );
      }
    } catch { /* email is non-critical */ }

    return c.json(response);
  });

  // GET /v1/billing/subscription — current plan info
  app.get('/subscription', async (c) => {
    const principal = requireAuth(c);
    const user = await deps.users.get(principal.userId);
    const plan = user?.plan ?? 'free';
    const planExpiresAt = (user as unknown as { planExpiresAt?: string | null })?.planExpiresAt ?? null;
    const planCancelledAt = (user as unknown as { planCancelledAt?: string | null })?.planCancelledAt ?? null;
    const isActive = isPlanActive(plan, planExpiresAt);
    const daysRemaining = planExpiresAt ? Math.max(0, Math.ceil((new Date(planExpiresAt).getTime() - Date.now()) / (24 * 60 * 60 * 1000))) : 0;

    return c.json({
      plan,
      planExpiresAt,
      planCancelledAt,
      isActive,
      isCancelled: isActive && !!planCancelledAt,
      daysRemaining,
      credits: user?.credits ?? 0,
    });
  });

  // POST /v1/billing/cancel — cancel the active paid plan.
  //
  // Semantics (locked by founder decision in PR-02 plan):
  //  - No refund is issued, ever.
  //  - The user keeps full access to their current plan until planExpiresAt.
  //  - planCancelledAt is set so the UI can show the cancelled banner and
  //    suppress renewal nudges. The plan field itself is NOT changed --
  //    natural expiry will downgrade the user to 'free' when planExpiresAt
  //    passes (no scheduled job needed; isPlanActive() returns false).
  //  - Cancelling a free plan is a no-op (returns 400 so the UI can hide
  //    the button rather than silently succeed).
  //  - Idempotent: cancelling an already-cancelled plan returns the same
  //    response without re-sending the email.
  app.post('/cancel', async (c) => {
    const principal = requireAuth(c);
    const body = await c.req.json().catch(() => null) as { reason?: string } | null;
    const reason = (body?.reason ?? '').toString().trim().slice(0, 200) || null;

    const user = await deps.users.get(principal.userId);
    if (!user) throw new HTTPException(404, { message: 'User not found' });

    const plan = user.plan ?? 'free';
    const planExpiresAt = (user as unknown as { planExpiresAt?: string | null })?.planExpiresAt ?? null;

    if (plan === 'free' || !isPlanActive(plan, planExpiresAt)) {
      throw new HTTPException(400, { message: 'No active paid plan to cancel' });
    }

    const alreadyCancelled = !!(user as unknown as { planCancelledAt?: string | null }).planCancelledAt;
    if (alreadyCancelled) {
      return c.json({
        success: true,
        alreadyCancelled: true,
        plan,
        planExpiresAt,
        planCancelledAt: (user as unknown as { planCancelledAt: string }).planCancelledAt,
      });
    }

    const cancelledAt = new Date().toISOString();
    await deps.users.update(principal.userId, { planCancelledAt: cancelledAt } as never);

    // Audit trail in Firestore (analytics, churn dashboard) -- best effort.
    if (deps.db) {
      try {
        await deps.db.collection('subscriptionEvents').add({
          uid: principal.userId,
          type: 'cancel',
          plan,
          reason,
          planExpiresAt,
          createdAt: cancelledAt,
        });
      } catch (e) {
        deps.logger.warn('billing.cancel_audit_failed', {
          userId: principal.userId, error: e instanceof Error ? e.message : String(e),
        });
      }
    }

    deps.logger.info('billing.cancelled', {
      userId: principal.userId, plan, planExpiresAt, reason,
    });

    // Confirmation email -- non-blocking, best-effort.
    try {
      const { createEmailService } = await import('../lib/emailService.js');
      const emailService = createEmailService(deps.env, deps.logger, deps.serviceKeys);
      if (user.email) {
        await emailService.sendCancellationConfirmation(
          user.email,
          user.name ?? 'Student',
          plan,
          planExpiresAt ?? cancelledAt,
        );
      }
    } catch { /* email is non-critical */ }

    return c.json({
      success: true,
      alreadyCancelled: false,
      plan,
      planExpiresAt,
      planCancelledAt: cancelledAt,
    });
  });

  // GET /v1/billing/history — last 10 completed payments for current user
  app.get('/history', async (c) => {
    const principal = requireAuth(c);
    if (!deps.db) return c.json({ payments: [] });

    try {
      const snap = await deps.db.collection('billingOrders')
        .where('uid', '==', principal.userId)
        .limit(10)
        .get();
      const payments = snap.docs
        .map(d => d.data())
        .filter(p => p.status === 'completed')
        .sort((a, b) => (b.completedAt ?? '').localeCompare(a.completedAt ?? ''))
        .slice(0, 10);
      return c.json({ payments });
    } catch {
      return c.json({ payments: [] });
    }
  });

  return app;
}

// ---------------------------------------------------------------------------
// Webhook router — mounted SEPARATELY from the auth-gated v1 namespace because
// Razorpay does not (and cannot) send a Bearer token; trust is established
// through the HMAC signature on the raw request body.
// ---------------------------------------------------------------------------

export interface BillingWebhookDeps {
  users: UserStore;
  env: Env;
  logger: Logger;
  db: Firestore | null;
  coupons: CouponStore;
  idempotency: IdempotencyStore;
  /** PR-37: Razorpay webhook secret — admin DB primary, env fallback. */
  serviceKeys: ServiceKeyStore;
}

interface RazorpayPaymentEntity {
  id?: string;
  order_id?: string;
  status?: string;
  amount?: number;
  notes?: Record<string, string>;
}

interface RazorpayWebhookPayload {
  event?: string;
  payload?: {
    payment?: { entity?: RazorpayPaymentEntity };
  };
}

export function makeBillingWebhookRoute(deps: BillingWebhookDeps): Hono {
  const app = new Hono();

  // POST /v1/billing/webhook — Razorpay event handler.
  // Auth: HMAC signature on raw body (NOT a Bearer token).
  // Idempotency: cached on razorpay_payment_id, so duplicate webhook deliveries are safe.
  app.post('/webhook', async (c) => {
    // PR-37: webhook secret comes from serviceKeyStore first; env fallback.
    const rzpCfg = await getRazorpayConfig(deps.serviceKeys, deps.env);
    const webhookSecret = rzpCfg?.webhookSecret;

    // No secret configured → ack 200 so Razorpay stops retrying, but log a warning.
    // We never want to silently fail-open and grant a plan, so missing secret = noop.
    if (!webhookSecret || webhookSecret === 'not_set') {
      deps.logger.warn('billing.webhook_secret_missing');
      return c.json({ ok: true, ignored: 'webhook_secret_not_configured' });
    }

    const signature = c.req.header('x-razorpay-signature') ?? '';
    const rawBody = await c.req.text();

    const expectedSig = createHmac('sha256', webhookSecret).update(rawBody).digest('hex');
    if (expectedSig !== signature) {
      deps.logger.warn('billing.webhook_signature_mismatch');
      return c.json({ ok: false, error: 'invalid_signature' }, 400);
    }

    let payload: RazorpayWebhookPayload;
    try {
      payload = JSON.parse(rawBody) as RazorpayWebhookPayload;
    } catch (err) {
      deps.logger.error('billing.webhook_parse_error', { error: err instanceof Error ? err.message : String(err) });
      return c.json({ ok: false, error: 'invalid_json' }, 400);
    }

    const event = payload.event ?? 'unknown';
    const payment = payload.payload?.payment?.entity;

    try {
      if (event === 'payment.captured' && payment?.order_id && payment.id) {
        // Idempotency: skip if we've already processed this payment id.
        const cached = await deps.idempotency.get('billing.webhook', payment.id);
        if (cached && cached.status === 'completed') {
          deps.logger.info('billing.webhook_idempotent_replay', { paymentId: payment.id });
          return c.json({ ok: true, replayed: true });
        }

        if (!deps.db) {
          deps.logger.warn('billing.webhook_no_db');
          return c.json({ ok: true, ignored: 'no_db' });
        }

        const orderSnap = await deps.db.collection('billingOrders').doc(payment.order_id).get();
        if (!orderSnap.exists) {
          deps.logger.warn('billing.webhook_unknown_order', { orderId: payment.order_id });
          return c.json({ ok: true, ignored: 'unknown_order' });
        }

        const orderData = orderSnap.data() as {
          uid?: string;
          planId?: PlanId;
          period?: string;
          couponCode?: string | null;
          status?: string;
        };

        if (orderData.status === 'completed') {
          // Already activated by /verify — webhook is a redundant safety net.
          await deps.idempotency.put('billing.webhook', payment.id, { ok: true, alreadyCompleted: true });
          return c.json({ ok: true, alreadyCompleted: true });
        }

        if (!orderData.uid || !orderData.planId) {
          deps.logger.error('billing.webhook_malformed_order', { orderId: payment.order_id });
          return c.json({ ok: false, error: 'malformed_order' }, 500);
        }

        const result = await grantPlan(
          { users: deps.users, coupons: deps.coupons, db: deps.db, logger: deps.logger },
          {
            uid: asUserId(orderData.uid),
            planId: orderData.planId,
            period: parsePeriod(orderData.period),
            paymentId: payment.id,
            orderId: payment.order_id,
            couponCode: orderData.couponCode ?? null,
            source: 'webhook',
          },
        );

        await deps.idempotency.put('billing.webhook', payment.id, {
          ok: true,
          plan: result.plan,
          expiresAt: result.expiresAt,
          changed: result.changed,
        });

        return c.json({ ok: true, plan: result.plan, expiresAt: result.expiresAt });
      }

      if (event === 'payment.failed' && payment?.order_id) {
        if (deps.db) {
          await deps.db.collection('billingOrders').doc(payment.order_id).set({
            status: 'failed',
            failedAt: new Date().toISOString(),
          }, { merge: true });
        }
        deps.logger.info('billing.webhook_failed', { orderId: payment.order_id });
        return c.json({ ok: true });
      }

      // Other events (refund.processed, order.paid, etc) — ack but don't act.
      deps.logger.info('billing.webhook_ignored_event', { event });
      return c.json({ ok: true, ignored: event });
    } catch (err) {
      deps.logger.error('billing.webhook_error', {
        event, error: err instanceof Error ? err.message : String(err),
      });
      // Return 500 so Razorpay retries the webhook later.
      return c.json({ ok: false, error: 'processing_error' }, 500);
    }
  });

  return app;
}
