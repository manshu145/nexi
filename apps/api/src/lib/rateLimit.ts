import type { Context, MiddlewareHandler } from 'hono';
import { HTTPException } from 'hono/http-exception';
import type { Logger } from '../logger.js';

/**
 * In-process token-bucket rate limiter.
 *
 * Keys requests by client IP (extracted from common reverse-proxy headers
 * because we sit behind Cloudflare and Cloud Run). Each bucket starts full
 * (`burst` tokens) and refills at `refillRatePerSecond`. When a request
 * arrives we deduct one token; if the bucket is empty we throw a 429 with
 * a `Retry-After` header in seconds.
 *
 * Why in-process instead of Redis: at our current scale (1-3 Cloud Run
 * instances, beta cohort), an in-process bucket is good enough. Each
 * instance enforces its own bucket, so a real attacker can effectively get
 * `instances * burst` requests through, which is still tiny. The cost: a
 * Map of <IP, bucket> that we GC every minute to stop it leaking.
 *
 * Why per-IP and not per-user: rate limiting runs before auth so we don't
 * have a user id yet, and before we want to spend any work on validating
 * a Firebase token. A misbehaving user is bounded by their IP. NAT'd
 * networks (schools, colleges) share the bucket, so we tune the limits to
 * be generous enough that a normal classroom doesn't trip them.
 */

export interface RateLimitOptions {
  /** Max tokens (the burst). 30 means a single client can fire 30 requests
   *  back-to-back before being limited. */
  burst: number;
  /** Tokens added per second. 2 = 120 req / minute sustained. */
  refillRatePerSecond: number;
  logger: Logger;
  /** Paths whose requests are NOT rate limited (e.g. health checks,
   *  Razorpay webhooks which can burst on payment reconciliation). */
  skip?: (path: string) => boolean;
}

interface Bucket {
  tokens: number;
  lastRefillAt: number;
}

const HEADERS = ['cf-connecting-ip', 'x-forwarded-for', 'x-real-ip'] as const;

function clientIp(c: Context): string {
  for (const header of HEADERS) {
    const v = c.req.header(header);
    if (!v) continue;
    // x-forwarded-for is a comma-separated chain; the first entry is the
    // original client.
    const first = v.split(',')[0]?.trim();
    if (first) return first;
  }
  return 'unknown';
}

export function makeRateLimitMiddleware(opts: RateLimitOptions): MiddlewareHandler {
  const buckets = new Map<string, Bucket>();

  // Periodically GC buckets that are full and idle so the map doesn't leak.
  // .unref so this timer doesn't keep the process alive in tests.
  const gc = setInterval(() => {
    const cutoff = Date.now() - 5 * 60_000;
    for (const [k, b] of buckets) {
      if (b.lastRefillAt < cutoff && b.tokens >= opts.burst) {
        buckets.delete(k);
      }
    }
  }, 60_000);
  if (typeof gc.unref === 'function') gc.unref();

  return async (c, next) => {
    if (opts.skip && opts.skip(c.req.path)) {
      await next();
      return;
    }

    const ip = clientIp(c);
    const key = `ip:${ip}`;
    const now = Date.now();
    let bucket = buckets.get(key);
    if (!bucket) {
      bucket = { tokens: opts.burst, lastRefillAt: now };
      buckets.set(key, bucket);
    }

    // Refill based on elapsed time.
    const elapsedSec = Math.max(0, (now - bucket.lastRefillAt) / 1000);
    bucket.tokens = Math.min(
      opts.burst,
      bucket.tokens + elapsedSec * opts.refillRatePerSecond,
    );
    bucket.lastRefillAt = now;

    if (bucket.tokens < 1) {
      const waitSec = Math.ceil((1 - bucket.tokens) / opts.refillRatePerSecond);
      c.header('Retry-After', String(waitSec));
      c.header('X-RateLimit-Limit', String(opts.burst));
      c.header('X-RateLimit-Remaining', '0');
      opts.logger.warn('rate_limit.exceeded', {
        key,
        path: c.req.path,
        method: c.req.method,
      });
      throw new HTTPException(429, { message: 'Too many requests. Slow down.' });
    }

    bucket.tokens -= 1;
    c.header('X-RateLimit-Limit', String(opts.burst));
    c.header('X-RateLimit-Remaining', String(Math.floor(bucket.tokens)));

    await next();
  };
}
