/**
 * Public-facing endpoints that DO NOT require a Firebase ID token.
 *
 * Why a separate router:
 *   The /v1 router applies `authMiddleware` to every route inside it. A few
 *   endpoints fundamentally cannot work that way:
 *
 *   1. /v1/logs/error -- the web app's error boundary catches React render
 *      crashes. By the time it runs, getIdToken() may itself have failed
 *      (think: auth.tsx threw). If we required auth here, every front-end
 *      crash would silently drop on the floor with a 401 we never see.
 *
 *   2. /v1/branding -- the marketing-flavoured boot data (logo, tagline,
 *      welcome bonus preview) is fetched on the loading screen, often
 *      BEFORE we know whether the user is signed in. Forcing auth would
 *      make the splash screen render with stale defaults until the user
 *      logs in.
 *
 * Threats and mitigations:
 *   - /logs/error is a write endpoint. We zod-validate the body shape, cap
 *     the message and stack lengths, and rate-limit per IP at 60 entries
 *     per minute. The store retains the most recent N entries so even a
 *     successful spam attempt can't blow up Firestore costs.
 *   - /branding is a read endpoint that returns only fields the marketing
 *     surface already advertises. Nothing here is sensitive.
 */

import { Hono } from 'hono';
import { z } from 'zod';
import type { Logger } from '../logger.js';
import type { AdminStore } from '../lib/adminStore.js';
import type { PlatformConfigStore } from '../lib/platformConfigStore.js';

export interface PublicRoutesDeps {
  adminStore: AdminStore;
  config: PlatformConfigStore;
  logger: Logger;
}

const errorReportSchema = z.object({
  message: z.string().min(1).max(2000),
  stack: z.string().max(8000).optional(),
  route: z.string().max(500).optional(),
  digest: z.string().max(200).optional(),
  /**
   * userId is optional and TRUSTED ONLY AS A HINT. We don't verify it; if
   * the error happens after sign-in the client passes its UID so the admin
   * dashboard can correlate, but a malicious caller could spoof anything
   * here -- treat the value as un-attested.
   */
  userId: z.string().max(128).optional(),
});

export function makePublicRoutes(deps: PublicRoutesDeps): Hono {
  const app = new Hono();

  // Per-IP rate limit, in-memory (single-instance only -- when we move to
  // Redis as part of the broader rate-limit overhaul, this gets replaced).
  // The limit is generous enough to capture a real burst of crashes from
  // one buggy build, but tight enough that a script can't fill the error
  // log with 100k rows in a minute.
  const errLimiter = new Map<string, { count: number; resetAt: number }>();
  const ERR_LIMIT = 60;
  const ERR_WINDOW_MS = 60_000;

  function clientIp(c: import('hono').Context): string {
    // Cloud Run sits behind a Google front-end that always sets
    // x-forwarded-for. We take the FIRST hop (the actual client) so a
    // multi-proxy chain doesn't let us be tricked into limiting by the
    // proxy's IP.
    const xff = c.req.header('x-forwarded-for');
    if (xff) return xff.split(',')[0]!.trim();
    return c.req.header('x-real-ip') ?? 'unknown';
  }

  // POST /v1/logs/error  -- public (rate-limited).
  app.post('/logs/error', async (c) => {
    const ip = clientIp(c);
    const now = Date.now();
    const entry = errLimiter.get(ip);
    if (entry && entry.resetAt > now) {
      if (entry.count >= ERR_LIMIT) {
        // Don't leak that we're rate limiting -- a noisy crash should still
        // appear to succeed from the client's perspective so the page
        // doesn't show a "couldn't report error" toast on top of the
        // original error. We just silently drop.
        return c.json({ ok: true, dropped: true });
      }
      entry.count++;
    } else {
      errLimiter.set(ip, { count: 1, resetAt: now + ERR_WINDOW_MS });
    }
    if (errLimiter.size > 5_000) {
      for (const [k, v] of errLimiter) if (v.resetAt < now) errLimiter.delete(k);
    }

    const body = await c.req.json().catch(() => null);
    const parsed = errorReportSchema.safeParse(body);
    if (!parsed.success) {
      // Same reasoning -- always 200 from the client's POV.
      return c.json({ ok: true, dropped: 'invalid_body' });
    }

    await deps.adminStore.logError({
      id: crypto.randomUUID(),
      message: parsed.data.message,
      stack: parsed.data.stack,
      route: parsed.data.route,
      userId: parsed.data.userId,
      timestamp: new Date().toISOString(),
      severity: 'warning',
    });
    return c.json({ ok: true });
  });

  // GET /v1/branding  -- public (cacheable).
  // Bundles every "splash screen" fact in one round-trip so the loading
  // surface doesn't fan out to multiple endpoints before the app shell is
  // ready. The number returned for `signupBonusPreview` is the LIVE
  // platformConfig value, so admin edits in /admin/credit-rewards
  // propagate to the marketing copy ("you'll get N welcome credits") on
  // the same cache TTL as the rest of the rewards.
  app.get('/branding', async (c) => {
    let logoUrl = '';
    let favicon = '';
    let tagline = 'Study Smarter, Score Higher';
    let taglineHi = 'स्मार्ट पढ़ो, ज़्यादा स्कोर करो';
    try {
      const seo = (await deps.adminStore.getSeoSettings()) as Record<string, unknown>;
      if (typeof seo['logoUrl'] === 'string') logoUrl = seo['logoUrl'];
      if (typeof seo['favicon'] === 'string') favicon = seo['favicon'];
      if (typeof seo['tagline'] === 'string') tagline = seo['tagline'];
      if (typeof seo['taglineHi'] === 'string') taglineHi = seo['taglineHi'];
    } catch { /* fall through with defaults */ }

    let signupBonusPreview = 100;
    try {
      signupBonusPreview = await deps.config.getEarnAmount('signup_verified');
    } catch { /* keep default */ }

    // Browser revalidates ~every minute; the server only does work if it
    // has actually changed.
    c.header('Cache-Control', 'public, max-age=60');

    return c.json({
      siteName: 'Nexigrate',
      siteNameHi: 'नेक्सीग्रेट',
      logoUrl,
      favicon,
      tagline,
      taglineHi,
      supportEmail: 'hello@nexigrate.com',
      signupBonusPreview,
      // Static for now; PR-04 admin edits live here too if/when we want
      // marketing to advertise different welcome bonuses per campaign.
      currency: 'INR',
    });
  });

  return app;
}
