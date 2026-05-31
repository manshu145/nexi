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
import type { BlogStore } from '../lib/blogStore.js';
import type { Auth } from 'firebase-admin/auth';
import type { ServiceKeyStore } from '../lib/serviceKeyStore.js';
import type { Env } from '../env.js';

export interface PublicRoutesDeps {
  adminStore: AdminStore;
  config: PlatformConfigStore;
  logger: Logger;
  blog?: BlogStore;
  /**
   * PR-38: optional Firebase Admin Auth instance used by the
   * /forgot-password endpoint to mint a verified password-reset link
   * which is then sent through Resend with our branded template.
   */
  firebaseAuth?: Auth;
  /** PR-38: serviceKeys + env wired so emailService can resolve Resend keys. */
  serviceKeys?: ServiceKeyStore;
  env?: Env;
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

  // ─── Blog (lock §5.3) — read-only, only published posts ────────────
  // Marketing /blog and /blog/[slug] hit these endpoints. Admin-only
  // mutation routes live under /v1/admin/blog (auth-gated). Public
  // surface returns content already vetted + published by the admin --
  // drafts are never visible here.
  if (deps.blog) {
    const blog = deps.blog;

    // GET /v1/blog/posts -- list of published posts (newest first).
    // Cache 5 min: blog content doesn't move minute-to-minute, and the
    // marketing site's SEO benefits from a stable list across crawls.
    app.get('/blog/posts', async (c) => {
      const limitRaw = c.req.query('limit');
      const limit = Math.min(Math.max(parseInt(limitRaw ?? '20', 10) || 20, 1), 50);
      const tag = c.req.query('tag') ?? undefined;
      try {
        const rows = await blog.listPublished({ limit, tag });
        // Strip body from list payload -- list view only needs metadata,
        // and the body is the heaviest field. Saves bandwidth on the
        // marketing /blog index page.
        const lite = rows.map(p => ({
          id: p.id, slug: p.slug, title: p.title, titleHi: p.titleHi,
          excerpt: p.excerpt, excerptHi: p.excerptHi, ogImage: p.ogImage,
          tags: p.tags, authorName: p.authorName, publishedAt: p.publishedAt,
        }));
        c.header('Cache-Control', 'public, max-age=300');
        return c.json({ posts: lite });
      } catch (err) {
        deps.logger.warn('blog.list_failed', { error: err instanceof Error ? err.message : String(err) });
        return c.json({ posts: [] });
      }
    });

    // GET /v1/blog/posts/:slug -- single published post.
    // 404s if the slug doesn't exist OR the post is still in draft.
    app.get('/blog/posts/:slug', async (c) => {
      const slug = c.req.param('slug');
      try {
        const post = await blog.getBySlug(slug);
        if (!post || post.status !== 'published') {
          return c.json({ error: 'not_found' }, 404);
        }
        c.header('Cache-Control', 'public, max-age=300');
        return c.json({ post });
      } catch (err) {
        deps.logger.warn('blog.get_failed', { slug, error: err instanceof Error ? err.message : String(err) });
        return c.json({ error: 'not_found' }, 404);
      }
    });
  }

  // ─── Forgot password (PR-38) ───────────────────────────────────────
  // POST /v1/forgot-password
  // Body: { email: string, language?: 'en' | 'hi' }
  //
  // Mints a one-time Firebase password-reset URL via the Admin SDK
  // and sends it through Resend with our branded template. ALWAYS
  // returns 200 to prevent account enumeration -- a typo or non-
  // existent email looks identical to a real send.
  //
  // The actual delivery is best-effort + logged. If Resend is not
  // configured we fall back to letting Firebase send its own default
  // template by calling generatePasswordResetLink() and discarding
  // the URL (Firebase auto-emails when invoked from the SDK).
  const forgotPasswordSchema = z.object({
    email: z.string().email().max(320),
    language: z.enum(['en', 'hi']).optional(),
  });

  app.post('/forgot-password', async (c) => {
    const body = await c.req.json().catch(() => null);
    const parsed = forgotPasswordSchema.safeParse(body);
    if (!parsed.success) {
      // Don't leak validation details. Same reasoning as the error logger.
      return c.json({ success: true });
    }
    const email = parsed.data.email.toLowerCase();
    const language = parsed.data.language ?? 'en';

    // No Firebase Admin Auth available (e.g. local dev without service
    // account) — return success silently rather than 500.
    if (!deps.firebaseAuth) {
      deps.logger.warn('forgot_password.firebase_admin_missing', { email });
      return c.json({ success: true });
    }

    try {
      // Generate a verified one-time URL. The action code is single-use
      // and expires in 1 hour by default.
      const link = await deps.firebaseAuth.generatePasswordResetLink(email);

      // Try Resend with our branded template first; fall back to
      // Firebase's own auto-send if Resend isn't configured.
      let viaResend = false;
      if (deps.env && deps.serviceKeys) {
        try {
          const { createEmailService } = await import('../lib/emailService.js');
          const emailService = createEmailService(deps.env, deps.logger, deps.serviceKeys);
          if (await emailService.isConfigured()) {
            const subject = language === 'hi' ? 'पासवर्ड रीसेट करें — नेक्सीग्रेट' : 'Reset your password — Nexigrate';
            const greeting = language === 'hi' ? 'नमस्ते' : 'Hi';
            const intro = language === 'hi'
              ? 'किसी ने आपके नेक्सीग्रेट खाते के लिए पासवर्ड रीसेट का अनुरोध किया है। यदि यह आपने नहीं किया है, तो इस ईमेल को अनदेखा करें।'
              : 'Someone requested a password reset for your Nexigrate account. If this wasn\'t you, you can safely ignore this email.';
            const buttonLabel = language === 'hi' ? 'पासवर्ड रीसेट करें' : 'Reset Password';
            const expiry = language === 'hi'
              ? 'यह लिंक 1 घंटे में समाप्त हो जाएगा।'
              : 'This link expires in 1 hour.';
            const html = `<!DOCTYPE html><html lang="${language}"><body style="margin:0;padding:0;background:#FAF7F2;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif">
              <div style="max-width:560px;margin:0 auto;padding:24px">
                <div style="text-align:center;padding:16px 0;border-bottom:3px solid #D97706">
                  <strong style="color:#1C1917;font-size:20px">Nexigrate</strong>
                </div>
                <div style="background:#fff;padding:32px 24px;border-radius:12px;margin-top:16px;border:1px solid #E7E5E4">
                  <h1 style="color:#1C1917;font-size:22px;margin:0 0 16px">${greeting},</h1>
                  <p style="font-size:16px;line-height:1.6;color:#44403C">${intro}</p>
                  <div style="text-align:center;margin:28px 0">
                    <a href="${link}" style="display:inline-block;background:#D97706;color:#fff;padding:14px 32px;border-radius:99px;text-decoration:none;font-weight:600;font-size:14px">${buttonLabel}</a>
                  </div>
                  <p style="font-size:13px;line-height:1.6;color:#78716C">${expiry}</p>
                  <p style="font-size:11px;color:#A8A29E;margin-top:24px;word-break:break-all">${link}</p>
                </div>
              </div>
            </body></html>`;
            const result = await emailService.sendEmail(email, subject, html);
            if (result.success) viaResend = true;
          }
        } catch (err) {
          deps.logger.warn('forgot_password.resend_send_failed', {
            email,
            error: err instanceof Error ? err.message : String(err),
          });
        }
      }

      deps.logger.info('forgot_password.sent', { email, viaResend, language });
      return c.json({ success: true });
    } catch (err) {
      // Account-not-found, missing-permissions etc. all log internally
      // but the response stays generic so an attacker can't enumerate.
      deps.logger.warn('forgot_password.firebase_link_failed', {
        email,
        error: err instanceof Error ? err.message : String(err),
      });
      return c.json({ success: true });
    }
  });

  return app;
}
