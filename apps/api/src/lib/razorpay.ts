import { createHmac, timingSafeEqual } from 'node:crypto';
import type { Env } from '../env.js';

/**
 * Thin Razorpay client.
 *
 * We intentionally use the REST API + Node's built-in `crypto` instead of
 * the official `razorpay` npm package -- avoiding a new runtime dependency
 * keeps the lockfile stable and lets us deploy without re-running `pnpm
 * install` in CI. The surface we need is small:
 *
 *   1. createOrder()         -- POST /v1/orders, returns the new order id
 *   2. verifyPaymentSignature() -- HMAC check on (order_id|payment_id)
 *   3. verifyWebhookSignature() -- HMAC check on raw webhook body
 *
 * All HTTP calls authenticate with HTTP Basic auth using KEY_ID + KEY_SECRET.
 * Razorpay docs: https://razorpay.com/docs/api/orders/create/
 */

const RAZORPAY_BASE_URL = 'https://api.razorpay.com/v1';

export interface CreateOrderInput {
  /** Amount in paise (₹1 = 100 paise). */
  amount: number;
  /** ISO-4217 code, currently always 'INR'. */
  currency: 'INR';
  /** Internal receipt id (max 40 chars). Used to correlate with our DB. */
  receipt: string;
  /** Free-form key/value notes that ride along the order, returned in webhooks. */
  notes?: Record<string, string>;
}

export interface RazorpayOrder {
  id: string;
  entity: 'order';
  amount: number;
  amount_paid: number;
  amount_due: number;
  currency: string;
  receipt: string;
  status: 'created' | 'attempted' | 'paid';
  notes: Record<string, string>;
  created_at: number;
}

/**
 * Returns true iff RAZORPAY_KEY_ID + RAZORPAY_KEY_SECRET are configured.
 * Routes use this to gate access; dev/test envs without keys return 503.
 */
export function isRazorpayConfigured(env: Env): boolean {
  return env.RAZORPAY_KEY_ID.length > 0 && env.RAZORPAY_KEY_SECRET.length > 0;
}

function basicAuthHeader(env: Env): string {
  const raw = `${env.RAZORPAY_KEY_ID}:${env.RAZORPAY_KEY_SECRET}`;
  return `Basic ${Buffer.from(raw, 'utf8').toString('base64')}`;
}

export async function createOrder(env: Env, input: CreateOrderInput): Promise<RazorpayOrder> {
  if (!isRazorpayConfigured(env)) {
    throw new Error('Razorpay is not configured (RAZORPAY_KEY_ID / RAZORPAY_KEY_SECRET missing).');
  }
  const res = await fetch(`${RAZORPAY_BASE_URL}/orders`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: basicAuthHeader(env),
    },
    body: JSON.stringify(input),
  });
  if (!res.ok) {
    const bodyText = await res.text().catch(() => '<unreadable>');
    throw new Error(`Razorpay createOrder failed (${res.status}): ${bodyText}`);
  }
  return (await res.json()) as RazorpayOrder;
}

/**
 * Verify the `razorpay_signature` returned by checkout.js after successful
 * payment. Signature = HMAC_SHA256(order_id + '|' + payment_id, KEY_SECRET).
 *
 * Constant-time compare to defeat timing-based forgery.
 */
export function verifyPaymentSignature(
  env: Env,
  orderId: string,
  paymentId: string,
  signature: string,
): boolean {
  if (!env.RAZORPAY_KEY_SECRET) return false;
  const payload = `${orderId}|${paymentId}`;
  const expected = createHmac('sha256', env.RAZORPAY_KEY_SECRET)
    .update(payload)
    .digest('hex');
  return safeEqualHex(signature, expected);
}

/**
 * Verify a Razorpay webhook body using `RAZORPAY_WEBHOOK_SECRET`.
 * The signature header is `x-razorpay-signature`.
 */
export function verifyWebhookSignature(
  env: Env,
  rawBody: string,
  signature: string,
): boolean {
  if (!env.RAZORPAY_WEBHOOK_SECRET) return false;
  const expected = createHmac('sha256', env.RAZORPAY_WEBHOOK_SECRET)
    .update(rawBody)
    .digest('hex');
  return safeEqualHex(signature, expected);
}

function safeEqualHex(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  try {
    return timingSafeEqual(Buffer.from(a, 'hex'), Buffer.from(b, 'hex'));
  } catch {
    return false;
  }
}
