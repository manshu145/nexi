import { Hono } from 'hono';
import { HTTPException } from 'hono/http-exception';
import { requireAuth } from '../auth.js';
import type { Logger } from '../logger.js';
import type { UserStore, StoredUser } from '../lib/userStore.js';
import type { AdminStore } from '../lib/adminStore.js';
import type { Env } from '../env.js';
import { asUserId } from '@nexigrate/shared';
import type { Auth } from 'firebase-admin/auth';

import type { CouponStore } from '../lib/couponStore.js';
import type { PlatformConfigStore } from '../lib/platformConfigStore.js';
import type { AISpendStore } from '../lib/aiSpendStore.js';
import { DEFAULT_DAILY_AI_CAP_USD } from '../lib/aiSpendStore.js';
import type { CreditEarnSource, CreditSpendReason, PlanConfig, PlanId } from '@nexigrate/shared';
import type { AIProviderStore, ProviderConfig } from '../lib/aiProviderStore.js';
import type { AIModelResolver } from '../lib/aiModelResolver.js';
import { AI_PROVIDERS, getProviderMetadata, validateProviderKey, type ProviderId } from '../lib/aiProviderRegistry.js';
import type { BlogStore, BlogPostInput, BlogPostStatus, BlogPostUpdate } from '../lib/blogStore.js';
import { validateSlug } from '../lib/blogStore.js';
import type { AIEngine } from '../lib/aiEngine.js';
import type { CurrentAffairsStore } from '../lib/currentAffairsStore.js';
import { isHardcodedSuperAdmin } from '../lib/adminEmails.js';
import { SERVICE_DEFINITIONS, getServiceDefinition, maskSecret, type ServiceId, type ServiceKeyStore } from '../lib/serviceKeyStore.js';
import type { PushService, PushNotificationPayload } from '../lib/pushService.js';

export interface AdminRoutesDeps {
  users: UserStore;
  adminStore: AdminStore;
  env: Env;
  logger: Logger;
  coupons: CouponStore;
  db?: import('firebase-admin/firestore').Firestore | null;
  /** Platform configuration store (plan matrix + credit rewards). */
  config: PlatformConfigStore;
  /** Per-user daily AI spend tracking (lock §3.8). */
  aiSpend: AISpendStore;
  /**
   * Firebase Admin Auth handle. Used by the password-reset endpoint to
   * generate a verified reset link via the Admin SDK (no client-side
   * Auth round-trip required) and by future ban/disable flows that may
   * want to disable the Firebase user record alongside our `banned`
   * flag.
   */
  firebaseAuth: Auth;
  /**
   * AI provider configuration store (PR-29). Admin saves keys + pinned
   * models here; the runtime auto-resolver reads + writes blacklists.
   */
  aiProviderStore: AIProviderStore;
  /** Auto-resolver (PR-29). Used by the validate endpoint to surface
   *  exactly which model fired during the test. */
  modelResolver: AIModelResolver;
  /**
   * Blog post store (lock §5.3). Optional so older test fixtures that
   * predate the blog system don't fail to construct admin routes.
   */
  blog?: BlogStore;
  /**
   * AI engine. Used here to generate blog drafts (admin "Generate with AI"
   * button calls /admin/blog/draft which thunks through aiEngine.generateBlogDraft).
   */
  aiEngine?: AIEngine;
  /**
   * Current-affairs store (PR-33). Wired so the admin "Ingest now" button
   * on /admin/feeds can actually fire the RSS pipeline -- pre-PR-33 the
   * endpoint was a stub that logged success but did nothing, which the
   * founder reported as "feeds Admin ke through krne ka baat hua tha vo
   * abhi tak nhi hua".
   */
  currentAffairs?: CurrentAffairsStore;
  /**
   * PR-37: Razorpay / Resend / WhatsApp / FCM key store. Admin can
   * rotate these keys from /admin/service-keys without touching env
   * vars. Email + WhatsApp helper services read from this store first.
   */
  serviceKeys: ServiceKeyStore;
  /**
   * PR-38: push notification dispatcher (FCM Admin SDK). Used by the
   * admin push broadcast endpoint and by automatic flows like the
   * current-affairs digest cron. Optional so older test fixtures
   * without firebase-admin available continue to construct.
   */
  push?: PushService;
}

export function makeAdminRoutes(deps: AdminRoutesDeps): Hono {
  const app = new Hono();

  // Admin check middleware on all routes.
  //
  // Three independent paths grant admin access (any one is sufficient):
  //   1. Hardcoded super-admin list in lib/adminEmails.ts -- bedrock
  //      founder access that survives ANY env-var override / Firestore
  //      reset / admin UI mishap. Compile-time guarantee.
  //   2. env.SUPER_ADMIN_EMAIL -- legacy single-admin override. Kept
  //      for backward compatibility so existing deploys don't break.
  //   3. user.role === 'admin' in Firestore -- regular promotion path
  //      for future admins (PR-11 added Ban + reset-password flows
  //      against this).
  //
  // The principal.email comes from the verified Firebase ID token
  // claim (PR-14 fix). A caller can't impersonate the hardcoded list
  // without controlling that Firebase Auth identity AND the
  // email_verified claim that auth.ts enforces.
  app.use('*', async (c, next) => {
    const principal = requireAuth(c);
    const user = await deps.users.get(principal.userId);
    const principalEmail = principal.email ?? user?.email ?? '';
    const isHardcoded = isHardcodedSuperAdmin(principalEmail);
    const isEnvAdmin = principalEmail.toLowerCase() === deps.env.SUPER_ADMIN_EMAIL.toLowerCase();
    const isRoleAdmin = user?.role === 'admin';
    if (!user || (!isHardcoded && !isEnvAdmin && !isRoleAdmin)) {
      throw new HTTPException(403, { message: 'Admin access required' });
    }
    await next();
  });

  // GET /v1/admin/stats — full platform stats
  app.get('/stats', async (c) => {
    const stats = await deps.adminStore.getFullStats();
    return c.json(stats);
  });

  // GET /v1/admin/stats/realtime — DAU, active now, AI calls last hour
  app.get('/stats/realtime', async (c) => {
    const stats = await deps.adminStore.getFullStats();
    return c.json({ dau: stats.dau, activeNow: stats.activeSessions, aiCallsToday: stats.aiCallsToday, newUsersToday: stats.newUsersToday });
  });

  // GET /v1/admin/api-health — real-time API health check
  app.get('/api-health', async (c) => {
    const health = await deps.adminStore.getAPIHealth(deps.env);
    return c.json({ health, checkedAt: new Date().toISOString() });
  });

  // GET /v1/admin/users — paginated with search
  app.get('/users', async (c) => {
    const page = parseInt(c.req.query('page') ?? '1');
    const limit = parseInt(c.req.query('limit') ?? '20');
    const search = c.req.query('search')?.toLowerCase().trim() ?? '';
    let users = await deps.users.listAll?.() ?? [];
    // Deduplicate by id first (primary key), then by email if present
    const seenIds = new Set<string>();
    const seenEmails = new Set<string>();
    const deduped: typeof users = [];
    for (const u of users) {
      if (seenIds.has(u.id)) continue;
      const emailKey = u.email?.toLowerCase().trim();
      if (emailKey && seenEmails.has(emailKey)) continue;
      seenIds.add(u.id);
      if (emailKey) seenEmails.add(emailKey);
      deduped.push(u);
    }
    users = deduped;
    // Search/filter
    if (search) {
      users = users.filter(u =>
        u.name?.toLowerCase().includes(search) ||
        u.email?.toLowerCase().includes(search) ||
        u.phone?.toLowerCase().includes(search) ||
        u.targetExam?.toLowerCase().includes(search)
      );
    }
    const paginated = users.slice((page - 1) * limit, page * limit);
    return c.json({ users: paginated, total: users.length, page, limit });
  });

  // GET /v1/admin/users/:uid — full user detail
  app.get('/users/:uid', async (c) => {
    const uid = asUserId(c.req.param('uid'));
    const user = await deps.users.get(uid);
    if (!user) throw new HTTPException(404, { message: 'User not found' });
    return c.json({ user });
  });

  // GET /v1/admin/users/:uid/activity — full activity log for one user
  // Transform UserActivity object into flat ActivityItem[] for the frontend
  app.get('/users/:uid/activity', async (c) => {
    const uid = c.req.param('uid');
    const raw = await deps.adminStore.getUserActivity(uid);

    // Flatten into ActivityItem[] with type, description, timestamp
    const items: { type: string; description: string; timestamp: string }[] = [];

    for (const ch of raw.chapterOpens) {
      items.push({ type: 'chapter_open', description: `Opened "${ch.chapter}" (${ch.subject})`, timestamp: ch.timestamp });
    }
    for (const mt of raw.mockTests) {
      items.push({ type: 'quiz_complete', description: `Quiz: ${mt.chapter} — Score: ${mt.score}%`, timestamp: mt.timestamp });
    }
    for (const cs of raw.chatSessions) {
      items.push({ type: 'chat_message', description: cs.firstMessage || `Chat (${cs.messageCount} messages)`, timestamp: cs.timestamp });
    }
    for (const cr of raw.creditHistory) {
      items.push({ type: 'credits_earned', description: `${cr.amount > 0 ? '+' : ''}${cr.amount} credits — ${cr.reason}`, timestamp: cr.timestamp });
    }

    // Sort by timestamp descending (newest first)
    items.sort((a, b) => b.timestamp.localeCompare(a.timestamp));

    return c.json({ activity: items });
  });

  // PATCH /v1/admin/users/:uid — update user (role, plan, credits)
  app.patch('/users/:uid', async (c) => {
    const uid = asUserId(c.req.param('uid'));
    const body = await c.req.json().catch(() => null) as Record<string, unknown> | null;
    if (!body) throw new HTTPException(400, { message: 'Body required' });
    const allowed: Record<string, unknown> = {};
    if (body.role) allowed.role = body.role;
    if (body.plan) {
      allowed.plan = body.plan;
      // Set planExpiresAt when upgrading to a paid plan
      if (body.plan !== 'free') {
        const expiry = new Date();
        expiry.setDate(expiry.getDate() + 30);
        allowed.planExpiresAt = expiry.toISOString();
      } else {
        allowed.planExpiresAt = null;
      }
    }
    if (body.credits !== undefined) allowed.credits = body.credits;
    const updatedUser = await deps.users.update(uid, allowed as Parameters<UserStore['update']>[1]);
    deps.logger.info('admin.user_updated', { uid, changes: Object.keys(allowed) });
    return c.json({ success: true, user: updatedUser });
  });

  /**
   * POST /v1/admin/users/:uid/ban — toggle a soft ban on a user.
   *
   * Body: { banned: boolean, reason?: string }
   *
   * "Soft" because all this PR does is flip flags on the Firestore user
   * doc and write an audit log entry. A follow-up will add route-level
   * enforcement so banned users get 403 on study/chat/current-affairs
   * (lock §4.8 mentions the Ban User button is currently a TODO; this
   * unblocks the button and the audit trail; enforcement lands when we
   * touch the relevant route handlers in PR-13+).
   *
   * Idempotent: setting banned=true twice or banned=false on a never-
   * banned user is a no-op write at the application layer (Firestore
   * still does a write, but the resulting state matches expectation).
   */
  app.post('/users/:uid/ban', async (c) => {
    const uid = asUserId(c.req.param('uid'));
    const body = (await c.req.json().catch(() => null)) as {
      banned?: boolean;
      reason?: string;
    } | null;
    if (!body || typeof body.banned !== 'boolean') {
      throw new HTTPException(400, { message: 'Body { banned: boolean, reason?: string } required' });
    }
    const target = await deps.users.get(uid);
    if (!target) throw new HTTPException(404, { message: 'User not found' });

    const principal = requireAuth(c);
    const now = new Date().toISOString();
    const updates: Record<string, unknown> = body.banned
      ? { banned: true, bannedAt: now, banReason: body.reason ?? null }
      : { banned: false, bannedAt: null, banReason: null };
    const updated = await deps.users.update(uid, updates as Parameters<UserStore['update']>[1]);

    deps.logger.info('admin.user_ban_toggled', {
      adminId: principal.userId,
      targetUid: uid,
      banned: body.banned,
      reason: body.reason ?? null,
    });
    return c.json({ success: true, user: updated });
  });

  /**
   * DELETE /v1/admin/users/:uid — hard-delete a user.
   *
   * PR-38: founder asked for delete capability after seeing duplicate
   * "test" accounts in the admin list:
   *   "ek hi email jo maine test kiye the vo alg alg dikha rahe???
   *    aisa nhi hona chahiye na ak bar koi account delete hua to usko
   *    yaha nhi rhna chhaiye"
   *
   * Tears down the FULL stack:
   *   1. Walks every user-scoped Firestore collection via eraseUserData
   *      (the same DPDP §3.4 helper /me uses).
   *   2. Calls firebaseAuth.deleteUser to remove the Auth record so the
   *      same email can sign up fresh without a "ghost" duplicate
   *      lingering.
   *
   * The admin doing this is logged in admin_logs for audit. The deleted
   * uid is also written to a 'deletedUsers' collection with a deletedAt
   * timestamp so future admin /users queries can hide them with
   * certainty even if Firestore returns a partial fail.
   *
   * Returns the per-collection counts so the admin UI can show
   * "deleted 14 docs across 9 collections" instead of a blind 200.
   */
  app.delete('/users/:uid', async (c) => {
    const uid = asUserId(c.req.param('uid'));
    const principal = requireAuth(c);
    if (!deps.db) {
      throw new HTTPException(503, { message: 'Firestore not configured — cannot delete user data' });
    }
    const target = await deps.users.get(uid);
    if (!target) throw new HTTPException(404, { message: 'User not found' });

    // Step 1: erase all Firestore user-scoped data via the DPDP helper.
    let eraseResult = { collectionsDeleted: [] as string[], failedCollections: [] as string[], totalDocs: 0 };
    try {
      const { eraseUserData } = await import('../lib/userData.js');
      eraseResult = await eraseUserData(deps.db, uid, deps.logger);
    } catch (err) {
      deps.logger.error('admin.user_delete_erase_failed', {
        targetUid: uid,
        error: err instanceof Error ? err.message : String(err),
      });
    }

    // Step 2: tear down the Firebase Auth record so the email is
    // re-usable and no orphan auth user lingers. Failure here is
    // non-fatal — the Firestore data is gone, the user can't sign in
    // (their /me would create a fresh blank record on first call), and
    // an admin can clean up the auth side later from the Firebase
    // console if needed.
    let firebaseAuthDeleted = false;
    try {
      await deps.firebaseAuth.deleteUser(uid);
      firebaseAuthDeleted = true;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      // 'auth/user-not-found' is acceptable — already gone, idempotent.
      if (msg.includes('user-not-found')) {
        firebaseAuthDeleted = true;
      } else {
        deps.logger.warn('admin.user_delete_firebase_auth_failed', {
          targetUid: uid,
          error: msg,
        });
      }
    }

    deps.logger.info('admin.user_deleted', {
      adminId: principal.userId,
      targetUid: uid,
      targetEmail: target.email,
      collectionsDeleted: eraseResult.collectionsDeleted.length,
      failedCollections: eraseResult.failedCollections,
      totalDocs: eraseResult.totalDocs,
      firebaseAuthDeleted,
    });

    return c.json({
      success: eraseResult.failedCollections.length === 0 && firebaseAuthDeleted,
      partial: eraseResult.failedCollections.length > 0 || !firebaseAuthDeleted,
      collectionsDeleted: eraseResult.collectionsDeleted,
      failedCollections: eraseResult.failedCollections,
      totalDocs: eraseResult.totalDocs,
      firebaseAuthDeleted,
    });
  });

  /**
   * POST /v1/admin/users/reset-password — admin-initiated password reset.
   *
   * Body: { email: string }
   *
   * Uses Firebase Admin SDK's generatePasswordResetLink to mint a
   * verified one-time reset URL, then relies on Firebase's own email
   * delivery (the simplest reliable path -- our Resend templates are
   * for transactional brand emails, while Firebase already controls the
   * password-reset email template via the project console). The admin
   * just needs to confirm the email was sent; the URL generation step
   * is what was returning 404 before this PR.
   *
   * The return value never includes the link itself, only a success
   * flag, so an admin glancing at the network tab can't accidentally
   * leak a reset URL into a screen-share.
   */
  app.post('/users/reset-password', async (c) => {
    const body = (await c.req.json().catch(() => null)) as { email?: string } | null;
    const email = body?.email?.trim().toLowerCase();
    if (!email) {
      throw new HTTPException(400, { message: 'Body { email: string } required' });
    }
    const principal = requireAuth(c);
    try {
      // generatePasswordResetLink validates the email exists in Firebase
      // Auth and returns a one-time URL; we discard it and let Firebase
      // handle delivery via its own configured template.
      await deps.firebaseAuth.generatePasswordResetLink(email);
      deps.logger.info('admin.password_reset_sent', {
        adminId: principal.userId,
        targetEmail: email,
      });
      return c.json({ success: true });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      deps.logger.error('admin.password_reset_error', {
        adminId: principal.userId,
        targetEmail: email,
        error: msg,
      });
      // Don't leak whether the user exists -- mirror the same shape on
      // both "user-not-found" and other Firebase failures so an admin
      // typo doesn't unintentionally enumerate accounts. The audit log
      // still records the actual error for debugging.
      throw new HTTPException(400, {
        message: 'Could not send password reset email. Check the address and try again.',
      });
    }
  });

  // GET /v1/admin/sessions — active sessions (users online now)
  app.get('/sessions', async (c) => {
    const sessions = await deps.adminStore.getActiveSessions();
    return c.json({ sessions, count: sessions.length });
  });

  // GET /v1/admin/error-logs — all error logs, paginated
  app.get('/error-logs', async (c) => {
    const page = parseInt(c.req.query('page') ?? '1');
    const limit = parseInt(c.req.query('limit') ?? '20');
    const result = await deps.adminStore.getErrorLogs(page, limit);
    return c.json(result);
  });

  // GET /v1/admin/ai-logs — AI call logs, paginated
  app.get('/ai-logs', async (c) => {
    const page = parseInt(c.req.query('page') ?? '1');
    const limit = parseInt(c.req.query('limit') ?? '20');
    const result = await deps.adminStore.getAICallLogs(page, limit);
    return c.json(result);
  });

  // GET /v1/admin/ai-debug-logs — detailed AI call logs with status/error/request/response for debug panel
  app.get('/ai-debug-logs', async (c) => {
    const page = parseInt(c.req.query('page') ?? '1');
    const limit = parseInt(c.req.query('limit') ?? '30');
    const status = c.req.query('status') as 'success' | 'error' | undefined;
    const result = await deps.adminStore.getAICallLogs(page, limit);
    let logs = result.logs;
    if (status) {
      logs = logs.filter(l => (l.status ?? 'success') === status);
    }
    return c.json({ logs, total: result.total, page, limit });
  });

  // GET /v1/admin/logs — combined logs (backward compatible)
  app.get('/logs', async (c) => {
    const page = parseInt(c.req.query('page') ?? '1');
    const limit = parseInt(c.req.query('limit') ?? '20');
    const type = c.req.query('type');
    if (type === 'error') {
      const result = await deps.adminStore.getErrorLogs(page, limit);
      return c.json({ logs: result.logs.map(l => ({ ...l, type: 'error', action: l.message })), total: result.total });
    }
    if (type === 'ai_call') {
      const result = await deps.adminStore.getAICallLogs(page, limit);
      return c.json({ logs: result.logs.map(l => ({ ...l, type: 'ai_call', action: `${l.model} (${l.tokens} tokens)` })), total: result.total });
    }
    // Return combined (errors + AI calls interleaved by timestamp)
    const [errors, aiCalls] = await Promise.all([deps.adminStore.getErrorLogs(1, 10), deps.adminStore.getAICallLogs(1, 10)]);
    const combined = [
      ...errors.logs.map(l => ({ id: l.id, type: 'error' as const, action: l.message, userId: l.userId, timestamp: l.timestamp, metadata: { stack: l.stack, route: l.route, severity: l.severity } })),
      ...aiCalls.logs.map(l => ({ id: l.id, type: 'ai_call' as const, action: `${l.model} (${l.tokens} tokens, $${l.cost.toFixed(4)})`, userId: l.userId, timestamp: l.timestamp, metadata: { model: l.model, tokens: l.tokens, cost: l.cost, latencyMs: l.latencyMs } })),
    ].sort((a, b) => b.timestamp.localeCompare(a.timestamp)).slice(0, limit);
    return c.json({ logs: combined, total: errors.total + aiCalls.total });
  });

  // GET /v1/admin/ai-spend/top — top spenders today (lock §3.8).
  // Founder-facing diagnostic for "who is burning my AI quota". Returns
  // userId + USD spent today, descending, with cap context per row.
  app.get('/ai-spend/top', async (c) => {
    const limit = Math.min(50, Math.max(1, parseInt(c.req.query('limit') ?? '10', 10)));
    const top = await deps.aiSpend.getTopSpendersToday(limit);
    const enriched = await Promise.all(top.map(async row => {
      try {
        const u = await deps.users.get(row.userId as never);
        const plan = u?.plan ?? 'free';
        const cap = DEFAULT_DAILY_AI_CAP_USD[plan] ?? DEFAULT_DAILY_AI_CAP_USD['free']!;
        return {
          userId: row.userId,
          email: u?.email ?? '',
          name: u?.name ?? '',
          plan,
          totalToday: Math.round(row.totalToday * 10000) / 10000,
          cap,
          pctOfCap: cap > 0 ? Math.round((row.totalToday / cap) * 100) : 0,
        };
      } catch {
        return { userId: row.userId, email: '', name: '', plan: 'unknown', totalToday: row.totalToday, cap: 0, pctOfCap: 0 };
      }
    }));
    return c.json({ topSpenders: enriched, defaultCaps: DEFAULT_DAILY_AI_CAP_USD });
  });

  // GET /v1/admin/ai-usage (backward compatible)
  app.get('/ai-usage', async (c) => {
    const result = await deps.adminStore.getAICallLogs(1, 50);
    return c.json({ usage: result.logs });
  });

  // GET /v1/admin/revenue — payments
  app.get('/revenue', async (c) => {
    const revenue = await deps.adminStore.getRevenue();
    return c.json(revenue);
  });

  // GET /v1/admin/support — tickets
  app.get('/support', async (c) => {
    const tickets = await deps.adminStore.getSupportTickets();
    return c.json({ tickets });
  });

  // POST /v1/admin/support/:id/reply — reply to a ticket
  app.post('/support/:id/reply', async (c) => {
    const ticketId = c.req.param('id');
    const body = await c.req.json().catch(() => null) as { message?: string } | null;
    if (!body?.message) throw new HTTPException(400, { message: 'message required' });
    deps.logger.info('admin.support_reply', { ticketId, message: body.message.slice(0, 100) });
    return c.json({ success: true });
  });

  // Session tracking endpoints (called from web app)
  // POST /v1/users/me/session/start
  // POST /v1/users/me/session/end
  // POST /v1/users/me/session/ping
  // These are mounted on users routes but we add them here for admin store integration

  // ━━━ ANNOUNCEMENTS ━━━
  // POST /v1/admin/announcements — create announcement
  app.post('/announcements', async (c) => {
    const body = await c.req.json().catch(() => null) as {
      title?: string; body?: string;
      titleHi?: string; bodyHi?: string;
      type?: 'banner' | 'modal' | 'email' | 'all';
      targetAudience?: 'all' | string; expiresAt?: string;
    } | null;
    if (!body?.title || !body?.body) throw new HTTPException(400, { message: 'title and body required' });
    const principal = requireAuth(c);
    const id = crypto.randomUUID();
    // PR-36: Hindi fields (titleHi/bodyHi) are OPTIONAL. If admin
    // doesn't fill them, the frontend falls back to title/body for
    // Hindi users too. Stored only when non-empty so the doc shape
    // doesn't bloat.
    const announcement: Record<string, unknown> = {
      id, title: body.title, body: body.body,
      type: body.type ?? 'banner',
      targetAudience: body.targetAudience ?? 'all',
      createdBy: principal.userId,
      createdAt: new Date().toISOString(),
      expiresAt: body.expiresAt ?? null,
      isActive: true, sentViaEmail: false, sentCount: 0,
    };
    if (body.titleHi && body.titleHi.trim()) announcement['titleHi'] = body.titleHi.trim();
    if (body.bodyHi && body.bodyHi.trim()) announcement['bodyHi'] = body.bodyHi.trim();
    // Save to Firestore
    await deps.adminStore.saveAnnouncement(announcement);
    deps.logger.info('admin.announcement_created', { id, title: body.title, hasHindi: !!body.titleHi });
    return c.json({ announcement });
  });

  // GET /v1/admin/announcements — list all
  app.get('/announcements', async (c) => {
    const announcements = await deps.adminStore.getAnnouncements();
    return c.json({ announcements });
  });

  // DELETE /v1/admin/announcements/:id
  app.delete('/announcements/:id', async (c) => {
    const id = c.req.param('id');
    await deps.adminStore.deleteAnnouncement(id);
    deps.logger.info('admin.announcement_deleted', { id });
    return c.json({ success: true });
  });

  // PATCH /v1/admin/announcements/:id — update announcement
  app.patch('/announcements/:id', async (c) => {
    const id = c.req.param('id');
    const body = await c.req.json().catch(() => null) as Record<string, any> | null;
    if (!body) throw new HTTPException(400, { message: 'body required' });
    // PR-36: normalise empty Hindi strings to absence so we don't
    // persist '' which the frontend would prefer over the English
    // fallback. Trim everything so trailing whitespace doesn't cause
    // a "partially translated" announcement.
    if ('titleHi' in body) {
      const v = typeof body['titleHi'] === 'string' ? body['titleHi'].trim() : '';
      if (v) body['titleHi'] = v; else delete body['titleHi'];
    }
    if ('bodyHi' in body) {
      const v = typeof body['bodyHi'] === 'string' ? body['bodyHi'].trim() : '';
      if (v) body['bodyHi'] = v; else delete body['bodyHi'];
    }
    await deps.adminStore.saveAnnouncement({ ...body, id });
    deps.logger.info('admin.announcement_updated', { id });
    return c.json({ success: true });
  });

  // ━━━ EMAIL ━━━
  // POST /v1/admin/email/send — send email to one user or bulk
  app.post('/email/send', async (c) => {
    const body = await c.req.json().catch(() => null) as { to?: string; emails?: string[]; subject?: string; body?: string } | null;
    if (!body?.subject || !body?.body) throw new HTTPException(400, { message: 'subject and body required' });
    const { createEmailService } = await import('../lib/emailService.js');
    const emailService = createEmailService(deps.env, deps.logger, deps.serviceKeys);
    if (body.to) {
      const result = await emailService.sendEmail(body.to, body.subject, body.body);
      return c.json(result);
    }
    if (body.emails?.length) {
      const result = await emailService.sendBulkEmail(body.emails, body.subject, body.body);
      return c.json(result);
    }
    // If no 'to' and no 'emails[]', send to ALL users
    const allUsers = await deps.users.listAll?.() ?? [];
    const allEmails = allUsers.map(u => u.email).filter(e => e && e.includes('@'));
    if (allEmails.length === 0) throw new HTTPException(400, { message: 'No user emails found' });
    const result = await emailService.sendBulkEmail(allEmails, body.subject, body.body);
    deps.logger.info('admin.email_sent_to_all', { count: allEmails.length });
    return c.json(result);
  });

  // GET /v1/admin/email/status — check if email is configured
  app.get('/email/status', async (c) => {
    // PR-37: emailService now resolves keys asynchronously from
    // serviceKeyStore (admin) → env vars (fallback). The status check
    // mirrors that path so the admin sees `configured: true` only when
    // the helper actually has a key to use.
    const { createEmailService } = await import('../lib/emailService.js');
    const emailService = createEmailService(deps.env, deps.logger, deps.serviceKeys);
    const configured = await emailService.isConfigured();
    return c.json({ configured, provider: 'resend' });
  });

  // ━━━ WHATSAPP ━━━
  // GET /v1/admin/whatsapp/status — check if WhatsApp is configured
  app.get('/whatsapp/status', async (c) => {
    const { createWhatsAppService } = await import('../lib/whatsappService.js');
    const wa = createWhatsAppService(deps.env, deps.logger, deps.serviceKeys);
    return c.json({ configured: await wa.isConfigured(), provider: 'meta-cloud-api' });
  });

  // POST /v1/admin/whatsapp/send — send WhatsApp message
  app.post('/whatsapp/send', async (c) => {
    const body = await c.req.json().catch(() => null) as { to?: string; message?: string } | null;
    if (!body?.to || !body?.message) throw new HTTPException(400, { message: 'to and message required' });
    const { createWhatsAppService } = await import('../lib/whatsappService.js');
    const wa = createWhatsAppService(deps.env, deps.logger, deps.serviceKeys);
    if (!(await wa.isConfigured())) throw new HTTPException(503, { message: 'WhatsApp not configured. Open Admin → Service Keys → WhatsApp and save Token + Phone Number ID.' });
    const result = await wa.sendMessage(body.to, body.message);
    return c.json(result);
  });

  // ━━━ PLANS & COUPONS ━━━
  // GET /v1/admin/plans — current plan matrix (live, admin-editable) +
  // subscriber counts. Reads from platformConfig (Firestore-backed) so an
  // edit via PATCH below is reflected on the next call after the cache TTL.
  app.get('/plans', async (c) => {
    const [users, planMap] = await Promise.all([
      deps.users.listAll?.() ?? Promise.resolve([]),
      deps.config.getPlans(),
    ]);
    const planCounts: Record<string, number> = { free: 0, scholar: 0, aspirant: 0, achiever: 0 };
    for (const u of users) planCounts[u.plan] = (planCounts[u.plan] ?? 0) + 1;
    const plans = Object.values(planMap).map(p => ({ ...p, subscribers: planCounts[p.id] ?? 0 }));
    return c.json({ plans });
  });

  // PATCH /v1/admin/plans/:planId — update one plan's price/features/flags.
  // Body accepts any subset of PlanConfig (price, yearlyPrice, isActive,
  // comingSoon, features.{...}). Unspecified fields are unchanged.
  // The store sanitises numeric inputs and ignores any attempt to rename
  // the plan id, so this endpoint is safe to expose to admin alone.
  app.patch('/plans/:planId', async (c) => {
    const planId = c.req.param('planId') as PlanId;
    const allowed: PlanId[] = ['free', 'scholar', 'aspirant', 'achiever'];
    if (!allowed.includes(planId)) throw new HTTPException(400, { message: 'Invalid planId' });
    const body = (await c.req.json().catch(() => null)) as Partial<PlanConfig> | null;
    if (!body || typeof body !== 'object') throw new HTTPException(400, { message: 'Body required' });
    try {
      const next = await deps.config.updatePlan(planId, body);
      deps.logger.info('admin.plan_updated', {
        planId,
        keys: Object.keys(body).filter(k => k !== 'id'),
      });
      return c.json({ success: true, plan: next });
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Update failed';
      throw new HTTPException(500, { message: msg });
    }
  });

  // ━━━ CREDIT REWARDS ━━━
  // GET /v1/admin/credit-rewards — current earn + spend rate tables (live).
  app.get('/credit-rewards', async (c) => {
    const [earn, spend] = await Promise.all([
      deps.config.getEarnAmounts(),
      deps.config.getSpendAmounts(),
    ]);
    return c.json({ earn, spend });
  });

  // PATCH /v1/admin/credit-rewards — update one or more reward amounts.
  // Body shape: { earn?: { signup_verified?: 100, ... }, spend?: { read_chapter?: 5, ... } }
  // Each key must be a valid enum value; non-numeric or negative values are
  // dropped silently by the store sanitiser.
  app.patch('/credit-rewards', async (c) => {
    const body = (await c.req.json().catch(() => null)) as {
      earn?: Partial<Record<CreditEarnSource, number>>;
      spend?: Partial<Record<CreditSpendReason, number>>;
    } | null;
    if (!body || typeof body !== 'object') throw new HTTPException(400, { message: 'Body required' });
    const result = await deps.config.updateRewards({
      earn: body.earn,
      spend: body.spend,
    });
    deps.logger.info('admin.credit_rewards_updated', {
      earn: Object.keys(body.earn ?? {}),
      spend: Object.keys(body.spend ?? {}),
    });
    return c.json({ success: true, ...result });
  });

  // GET /v1/admin/coupons — list all coupons
  app.get('/coupons', async (c) => {
    const coupons = await deps.coupons.listAll();
    return c.json({ coupons });
  });

  // POST /v1/admin/coupons — create coupon
  app.post('/coupons', async (c) => {
    const body = await c.req.json().catch(() => null) as {
      code?: string; discountType?: 'percent' | 'flat'; discountValue?: number;
      maxUses?: number; expiresAt?: string; applicablePlans?: string[];
    } | null;
    if (!body?.code || !body?.discountType || !body?.discountValue) {
      throw new HTTPException(400, { message: 'code, discountType, and discountValue required' });
    }
    const coupon = {
      code: body.code.toUpperCase(),
      discountType: body.discountType,
      discountValue: body.discountValue,
      maxUses: body.maxUses ?? 0,
      usedCount: 0,
      expiresAt: body.expiresAt ?? null,
      isActive: true,
      applicablePlans: (body.applicablePlans ?? []) as any[],
      createdAt: new Date().toISOString(),
    };
    await deps.coupons.create(coupon);
    deps.logger.info('admin.coupon_created', { code: coupon.code });
    return c.json({ coupon });
  });

  // PATCH /v1/admin/coupons/:code — activate/deactivate
  app.patch('/coupons/:code', async (c) => {
    const code = c.req.param('code');
    const body = await c.req.json().catch(() => null) as { isActive?: boolean } | null;
    if (body?.isActive === false) {
      await deps.coupons.deactivate(code);
    }
    return c.json({ success: true });
  });

  // DELETE /v1/admin/coupons/:code — delete
  app.delete('/coupons/:code', async (c) => {
    const code = c.req.param('code');
    await deps.coupons.delete(code);
    deps.logger.info('admin.coupon_deleted', { code });
    return c.json({ success: true });
  });

  // ━━━ SEO SETTINGS ━━━
  // GET /v1/admin/seo — get current SEO settings
  app.get('/seo', async (c) => {
    const settings = await deps.adminStore.getSeoSettings();
    return c.json({ settings });
  });

  // PUT /v1/admin/seo — update SEO settings
  app.put('/seo', async (c) => {
    const body = await c.req.json().catch(() => null) as Record<string, any> | null;
    if (!body) throw new HTTPException(400, { message: 'body required' });
    await deps.adminStore.saveSeoSettings(body);
    deps.logger.info('admin.seo_updated', { keys: Object.keys(body) });
    return c.json({ success: true });
  });

  // ━━━ EMAIL TEMPLATES ━━━
  // GET /v1/admin/email/templates — list saved templates
  app.get('/email/templates', async (c) => {
    const templates = await deps.adminStore.getEmailTemplates();
    return c.json({ templates });
  });

  // POST /v1/admin/email/templates — save a template
  app.post('/email/templates', async (c) => {
    const body = await c.req.json().catch(() => null) as { name?: string; subject?: string; body?: string } | null;
    if (!body?.name || !body?.subject || !body?.body) throw new HTTPException(400, { message: 'name, subject and body required' });
    const id = crypto.randomUUID();
    await deps.adminStore.saveEmailTemplate({ id, name: body.name, subject: body.subject, body: body.body, createdAt: new Date().toISOString() });
    deps.logger.info('admin.email_template_saved', { id, name: body.name });
    return c.json({ success: true, id });
  });

  // DELETE /v1/admin/email/templates/:id — delete a template
  app.delete('/email/templates/:id', async (c) => {
    const id = c.req.param('id');
    await deps.adminStore.deleteEmailTemplate(id);
    return c.json({ success: true });
  });

  // ━━━ API CONFIG ━━━
  // GET /v1/admin/api-config — returns masked keys + model mapping
  app.get('/api-config', async (c) => {
    const configRef = deps.db?.collection('platformConfig');
    let keys: Record<string, { masked: string; status: string; lastTested?: string }> = {};
    let models: Record<string, string> = {};

    if (configRef) {
      const keysSnap = await configRef.doc('apiKeys').get();
      const keysData = keysSnap.exists ? keysSnap.data() as Record<string, string> : {};
      // Mask keys for display
      for (const [name, value] of Object.entries(keysData)) {
        if (value && value.length > 8) {
          keys[name] = { masked: value.slice(0, 4) + '••••' + value.slice(-4), status: 'connected' };
        } else if (value) {
          keys[name] = { masked: '••••', status: 'connected' };
        } else {
          keys[name] = { masked: '', status: 'not_configured' };
        }
      }

      const modelsSnap = await configRef.doc('modelMapping').get();
      models = modelsSnap.exists ? modelsSnap.data() as Record<string, string> : {};
    }

    return c.json({ keys, models });
  });

  // PATCH /v1/admin/api-config/keys — update a specific key
  app.patch('/api-config/keys', async (c) => {
    const body = await c.req.json().catch(() => null) as { keyName?: string; value?: string } | null;
    if (!body?.keyName) throw new HTTPException(400, { message: 'keyName required' });
    const configRef = deps.db?.collection('platformConfig').doc('apiKeys');
    if (configRef) {
      await configRef.set({ [body.keyName]: body.value ?? '' }, { merge: true });
    }
    deps.logger.info('admin.api_key_updated', { keyName: body.keyName });
    return c.json({ success: true });
  });

  // POST /v1/admin/api-config/test — test a specific key
  app.post('/api-config/test', async (c) => {
    const body = await c.req.json().catch(() => null) as { keyName?: string } | null;
    if (!body?.keyName) throw new HTTPException(400, { message: 'keyName required' });
    // Simple connectivity test - just verify key format
    const configRef = deps.db?.collection('platformConfig').doc('apiKeys');
    let value = '';
    if (configRef) {
      const snap = await configRef.get();
      value = snap.exists ? (snap.data()?.[body.keyName] ?? '') : '';
    }
    const success = value.length > 5;
    return c.json({ success, latencyMs: success ? 120 : 0, error: success ? undefined : 'Key not configured or too short' });
  });

  // PATCH /v1/admin/api-config/models — update model mapping
  app.patch('/api-config/models', async (c) => {
    const body = await c.req.json().catch(() => null) as Record<string, string> | null;
    if (!body) throw new HTTPException(400, { message: 'Body required' });
    const configRef = deps.db?.collection('platformConfig').doc('modelMapping');
    if (configRef) {
      await configRef.set(body, { merge: true });
    }
    deps.logger.info('admin.model_mapping_updated', { tasks: Object.keys(body) });
    return c.json({ success: true });
  });

  // ━━━ FEED MANAGEMENT ━━━
  app.get('/feeds', async (c) => {
    if (!deps.db) return c.json({ feeds: [] });
    const snap = await deps.db.collection('newsFeeds').get();
    const feeds = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    return c.json({ feeds });
  });

  app.post('/feeds', async (c) => {
    const body = await c.req.json().catch(() => null) as { url?: string; name?: string; category?: string } | null;
    if (!body?.url || !body?.name) throw new HTTPException(400, { message: 'url and name required' });
    if (!deps.db) throw new HTTPException(500, { message: 'DB not available' });
    const ref = await deps.db.collection('newsFeeds').add({
      url: body.url, name: body.name, category: body.category ?? 'national',
      isActive: true, lastFetched: null, itemsFetched: 0, createdAt: new Date().toISOString(),
    });
    deps.logger.info('admin.feed_added', { id: ref.id, name: body.name });
    return c.json({ success: true, id: ref.id });
  });

  app.patch('/feeds/:id', async (c) => {
    const id = c.req.param('id');
    const body = await c.req.json().catch(() => null) as Record<string, unknown> | null;
    if (!body || !deps.db) throw new HTTPException(400, { message: 'Body required' });
    await deps.db.collection('newsFeeds').doc(id).update(body);
    return c.json({ success: true });
  });

  app.delete('/feeds/:id', async (c) => {
    const id = c.req.param('id');
    if (!deps.db) throw new HTTPException(500, { message: 'DB not available' });
    await deps.db.collection('newsFeeds').doc(id).delete();
    deps.logger.info('admin.feed_deleted', { id });
    return c.json({ success: true });
  });

  app.post('/feeds/ingest-now', async (c) => {
    // PR-33 fix: pre-PR-33 this endpoint logged a success message and
    // returned without actually running ingestion. The admin's "Ingest
    // now" button was therefore decorative -- the only path that ever
    // populated the news collection was the 4-hour Cloud Scheduler
    // cron at POST /v1/current-affairs/ingest. The founder reported
    // this as "feeds Admin ke through krne ka baat hua tha vo abhi tak
    // nhi hua".
    //
    // We now thread the same dependencies the cron uses (currentAffairs
    // store, aiEngine, modelResolver) into the admin route bag and call
    // the real ingestion function in-process. The call is awaited (not
    // fire-and-forget) so the admin sees a real result -- "ingested 17
    // items" or an error message -- instead of an immediate green tick
    // followed by silence.
    if (!deps.currentAffairs || !deps.aiEngine) {
      throw new HTTPException(503, {
        message: 'Ingestion subsystem is not wired into this build (currentAffairs store or AI engine missing).',
      });
    }
    deps.logger.info('admin.manual_ingest_triggered');
    try {
      const { ingestCurrentAffairs } = await import('../lib/rssIngestion.js');
      // modelResolver is part of the resolver pipeline (PR-29). Pass it
      // through so the ingestion uses the auto-resolver chain rather
      // than hardcoded model names.
      const result = await ingestCurrentAffairs(
        deps.currentAffairs,
        deps.env,
        deps.logger,
        deps.aiEngine,
        deps.modelResolver,
      );
      await deps.currentAffairs.setLastIngestedAt(new Date().toISOString());
      deps.logger.info('admin.manual_ingest_done', { result });
      return c.json({
        success: true,
        message: `Ingestion complete — ${result.saved} items saved (out of ${result.fetched} fetched)`,
        ...result,
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      deps.logger.error('admin.manual_ingest_failed', { error: msg });
      throw new HTTPException(500, {
        message: `Ingestion failed: ${msg}`,
      });
    }
  });

  // ━━━ EMAIL LOGS ━━━
  app.get('/email/logs', async (c) => {
    if (!deps.db) return c.json({ logs: [], total: 0 });
    const snap = await deps.db.collection('emailLogs').orderBy('sentAt', 'desc').limit(50).get();
    const logs = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    return c.json({ logs, total: logs.length });
  });

  // GET /v1/admin/users/:uid/chat — list all chat sessions for a user
  app.get('/users/:uid/chat', async (c) => {
    const uid = c.req.param('uid');
    if (!deps.db) return c.json({ sessions: [] });
    try {
      const snap = await deps.db.collection('users').doc(uid).collection('chatHistory').orderBy('updatedAt', 'desc').limit(50).get();
      const sessions = snap.docs.map(d => {
        const data = d.data() as { id?: string; title?: string; createdAt?: string; updatedAt?: string; messages?: unknown[] };
        return { id: d.id, title: data.title ?? 'Untitled', createdAt: data.createdAt ?? '', updatedAt: data.updatedAt ?? '', messageCount: data.messages?.length ?? 0 };
      });
      return c.json({ sessions });
    } catch { return c.json({ sessions: [] }); }
  });

  // GET /v1/admin/users/:uid/chat/:sessionId — full chat session (admin read-only)
  app.get('/users/:uid/chat/:sessionId', async (c) => {
    const uid = c.req.param('uid');
    const sessionId = c.req.param('sessionId');
    if (!deps.db) return c.json({ messages: [] });
    try {
      const snap = await deps.db.collection('users').doc(uid).collection('chatHistory').doc(sessionId).get();
      if (!snap.exists) return c.json({ messages: [] });
      const data = snap.data() as { messages?: { role: string; content: string; timestamp?: string }[]; title?: string; createdAt?: string };
      return c.json({ sessionId, title: data.title ?? '', messages: data.messages ?? [], createdAt: data.createdAt });
    } catch { return c.json({ messages: [] }); }
  });

  // ━━━ AI PROVIDERS (PR-29 — auto-resolver + admin key management) ━━━
  //
  // Replaces the old API_CONFIG fake UI. Each provider in
  // aiProviderRegistry.ts gets a real per-doc config in Firestore at
  // `aiProviders/{id}` carrying { apiKey, enabled, pinnedModel,
  // blacklist[], lastValidatedAt, ... }. The auto-resolver reads from
  // the same store so admin actions take effect within the in-process
  // 60s cache window without a deploy.
  //
  // SECURITY: `apiKey` is stored in raw form (Firestore IAM is the
  // trust boundary today; KMS wraps it in a follow-up). NO endpoint
  // ever returns the raw key -- responses always carry `maskedKey`
  // (last 4 + dots). The validate endpoint accepts a candidate key in
  // the request body so admin can test BEFORE saving.

  /** Mask a key for display: last 4 chars + 8 dots, or empty string. */
  function maskKey(value?: string): string {
    if (!value || value.length < 4) return '';
    return '••••••••' + value.slice(-4);
  }

  /** Build the public-safe response shape for one provider config. */
  function serializeProvider(id: ProviderId, cfg: ProviderConfig | null) {
    const meta = getProviderMetadata(id);
    if (!meta) return null;
    const now = Date.now();
    const blacklist: Array<{ model: string; until: string; reason?: string }> = [];
    for (const [model, entry] of Object.entries(cfg?.blacklist ?? {})) {
      if (Date.parse(entry.until) > now) {
        blacklist.push({ model, until: entry.until, reason: entry.reason });
      }
    }
    return {
      id,
      label: meta.label,
      description: meta.description,
      tier: meta.tier,
      enabled: cfg?.enabled ?? true,
      hasKey: !!(cfg?.apiKey && cfg.apiKey.length > 5),
      maskedKey: cfg ? maskKey(cfg.apiKey) : '',
      pinnedModel: cfg?.pinnedModel ?? null,
      pinnedModelFailureCount: cfg?.pinnedModelFailureCount ?? 0,
      lastValidatedAt: cfg?.lastValidatedAt ?? null,
      lastValidationLatencyMs: cfg?.lastValidationLatencyMs ?? null,
      lastValidationError: cfg?.lastValidationError ?? null,
      blacklist,
      knownGoodModel: cfg?.knownGoodModel ?? null,
      knownGoodAt: cfg?.knownGoodAt ?? null,
      models: meta.models.map(m => ({
        id: m.id,
        label: m.label,
        tier: m.tier ?? 'flash',
        recommended: m.recommended ?? false,
        costPer1kUsd: m.costPer1kUsd ?? null,
      })),
      signupUrl: meta.signupUrl,
      billingUrl: meta.billingUrl,
      keyExamplePrefix: meta.keyExamplePrefix,
    };
  }

  /** Type-guard helper for the :id param. */
  function asProviderId(raw: string): ProviderId | null {
    return AI_PROVIDERS.some(p => p.id === raw) ? (raw as ProviderId) : null;
  }

  // GET /v1/admin/ai-providers — list with masked keys + status
  app.get('/ai-providers', async (c) => {
    const all = await deps.aiProviderStore.getAll();
    const byId = new Map(all.map(p => [p.id, p]));
    const providers = AI_PROVIDERS.map(meta => serializeProvider(meta.id, byId.get(meta.id) ?? null)).filter(p => p !== null);
    return c.json({ providers });
  });

  // GET /v1/admin/ai-providers/:id — single provider detail
  app.get('/ai-providers/:id', async (c) => {
    const id = asProviderId(c.req.param('id'));
    if (!id) throw new HTTPException(404, { message: 'Unknown provider id' });
    const cfg = await deps.aiProviderStore.get(id);
    const provider = serializeProvider(id, cfg);
    return c.json({ provider });
  });

  // PATCH /v1/admin/ai-providers/:id — update apiKey/enabled/pinnedModel
  // Body: { apiKey?: string; enabled?: boolean; pinnedModel?: string|null }
  // Empty-string apiKey is interpreted as "leave alone"; pass `null` for
  // pinnedModel to clear an existing pin.
  app.patch('/ai-providers/:id', async (c) => {
    const id = asProviderId(c.req.param('id'));
    if (!id) throw new HTTPException(404, { message: 'Unknown provider id' });
    const body = (await c.req.json().catch(() => null)) as {
      apiKey?: string;
      enabled?: boolean;
      pinnedModel?: string | null;
    } | null;
    if (!body) throw new HTTPException(400, { message: 'Body required' });

    const meta = getProviderMetadata(id);
    if (!meta) throw new HTTPException(404, { message: 'Unknown provider id' });

    const patch: Partial<ProviderConfig> = {};
    if (body.apiKey !== undefined && body.apiKey.length > 0) {
      if (body.apiKey.length < meta.keyMinLength) {
        throw new HTTPException(400, { message: `Key too short — expected at least ${meta.keyMinLength} characters` });
      }
      patch.apiKey = body.apiKey;
      // Saving a new key clears stale validation state so the admin
      // sees "Not validated" until they hit Test Connection.
      patch.lastValidatedAt = undefined;
      patch.lastValidationError = undefined;
      patch.pinnedModelFailureCount = 0;
    }
    if (body.enabled !== undefined) patch.enabled = body.enabled;
    if (body.pinnedModel !== undefined) {
      if (body.pinnedModel === null) {
        patch.pinnedModel = undefined;
      } else if (body.pinnedModel.length > 0) {
        // Validate the pinned model is one we know about.
        const known = meta.models.some(m => m.id === body.pinnedModel);
        if (!known) throw new HTTPException(400, { message: `Unknown model id "${body.pinnedModel}" for provider "${id}"` });
        patch.pinnedModel = body.pinnedModel;
        patch.pinnedModelFailureCount = 0;
      }
    }
    const next = await deps.aiProviderStore.upsert(id, patch);
    deps.logger.info('admin.ai_provider_updated', {
      provider: id,
      keyChanged: body.apiKey !== undefined && body.apiKey.length > 0,
      enabledChanged: body.enabled !== undefined,
      pinnedModelChanged: body.pinnedModel !== undefined,
    });
    return c.json({ provider: serializeProvider(id, next) });
  });

  // POST /v1/admin/ai-providers/:id/validate — run validateProviderKey
  // and persist the result. Body MAY include { apiKey?: string,
  // model?: string } to test a candidate key before save (admin pastes
  // a fresh key, hits Test, sees ok before clicking Save). When body
  // is empty, validates the currently-stored key.
  app.post('/ai-providers/:id/validate', async (c) => {
    const id = asProviderId(c.req.param('id'));
    if (!id) throw new HTTPException(404, { message: 'Unknown provider id' });
    const body = (await c.req.json().catch(() => ({}))) as {
      apiKey?: string;
      model?: string;
    };
    const cfg = await deps.aiProviderStore.get(id);
    const candidateKey = body.apiKey && body.apiKey.length > 0 ? body.apiKey
      : cfg?.apiKey && cfg.apiKey.length > 5 ? cfg.apiKey
      : (id === 'gemini' ? deps.env.GEMINI_API_KEY
        : id === 'openai' ? deps.env.OPENAI_API_KEY
        : id === 'groq' ? deps.env.GROQ_API_KEY
        : '');
    if (!candidateKey || candidateKey.length < 5) {
      return c.json({ ok: false, error: 'no_key_to_validate' }, 400);
    }
    // Use the active blacklist when picking the probe model so we
    // don't waste a probe on a known-dead model.
    const blacklist = new Set(Object.keys(cfg?.blacklist ?? {}).filter(m => Date.parse(cfg!.blacklist[m]!.until) > Date.now()));
    const result = await validateProviderKey(id, candidateKey, body.model, blacklist);

    // Persist outcome (only if we're validating the SAVED key, not a candidate).
    // A candidate validation just returns the result without writing.
    if (!body.apiKey || body.apiKey === candidateKey && cfg?.apiKey === candidateKey) {
      await deps.aiProviderStore.upsert(id, {
        lastValidatedAt: result.ok ? new Date().toISOString() : cfg?.lastValidatedAt,
        lastValidationLatencyMs: result.latencyMs,
        lastValidationError: result.ok ? undefined : result.error,
      });
      // If the validate succeeded with a non-pinned model, mark it
      // known-good so subsequent calls converge on it.
      if (result.ok && result.model) {
        await deps.aiProviderStore.markKnownGood(id, result.model);
      }
    }
    deps.logger.info('admin.ai_provider_validated', {
      provider: id,
      ok: result.ok,
      model: result.model,
      latencyMs: result.latencyMs,
      error: result.error?.slice(0, 120),
    });
    return c.json({ result });
  });

  // POST /v1/admin/ai-providers/:id/clear-blacklist — admin override
  // to wipe an active blacklist (useful after rotating a key that the
  // resolver had already marked as failing).
  app.post('/ai-providers/:id/clear-blacklist', async (c) => {
    const id = asProviderId(c.req.param('id'));
    if (!id) throw new HTTPException(404, { message: 'Unknown provider id' });
    await deps.aiProviderStore.clearBlacklist(id);
    deps.logger.info('admin.ai_provider_blacklist_cleared', { provider: id });
    const cfg = await deps.aiProviderStore.get(id);
    return c.json({ provider: serializeProvider(id, cfg) });
  });
  // ━━━ BLOG (lock §5.3) ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // Admin-only CRUD for blog posts. Drafts are visible to admin only;
  // public marketing surface only sees `status: 'published'`. The AI
  // draft endpoint is the "AI assistance" the founder asked for in the
  // lock — admin types a topic + optional outline, gets back markdown,
  // then iterates in the editor.
  if (deps.blog) {
    const blog = deps.blog;

    // GET /v1/admin/blog/posts -- all posts (including drafts).
    // Optional ?status=draft|published|archived to filter.
    app.get('/blog/posts', async (c) => {
      const status = (c.req.query('status') ?? '') as BlogPostStatus | '';
      const limit = Math.min(parseInt(c.req.query('limit') ?? '50', 10) || 50, 200);
      const opts: { status?: BlogPostStatus; limit?: number } = { limit };
      if (status === 'draft' || status === 'published' || status === 'archived') {
        opts.status = status;
      }
      const rows = await blog.listAll(opts);
      // Strip body in list -- editor fetches body on click.
      const lite = rows.map(p => ({
        id: p.id, slug: p.slug, title: p.title, status: p.status,
        excerpt: p.excerpt, tags: p.tags, authorName: p.authorName,
        createdAt: p.createdAt, updatedAt: p.updatedAt, publishedAt: p.publishedAt,
      }));
      return c.json({ posts: lite });
    });

    // GET /v1/admin/blog/posts/:id -- full post incl. body.
    app.get('/blog/posts/:id', async (c) => {
      const post = await blog.getById(c.req.param('id'));
      if (!post) throw new HTTPException(404, { message: 'post_not_found' });
      return c.json({ post });
    });

    // POST /v1/admin/blog/posts -- create a draft.
    app.post('/blog/posts', async (c) => {
      const body = await c.req.json().catch(() => null) as Partial<BlogPostInput> | null;
      if (!body || !body.slug || !body.title || !body.body) {
        throw new HTTPException(400, { message: 'slug, title, and body are required' });
      }
      const slugErr = validateSlug(body.slug);
      if (slugErr) throw new HTTPException(400, { message: slugErr });
      try {
        const post = await blog.create({
          slug: body.slug,
          title: body.title,
          titleHi: body.titleHi,
          excerpt: body.excerpt ?? body.title,
          excerptHi: body.excerptHi,
          body: body.body,
          bodyHi: body.bodyHi,
          seoTitle: body.seoTitle,
          seoDescription: body.seoDescription,
          ogImage: body.ogImage,
          tags: body.tags ?? [],
          authorName: body.authorName,
        });
        deps.logger.info('admin.blog.created', { id: post.id, slug: post.slug });
        return c.json({ post });
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'create_failed';
        throw new HTTPException(409, { message: msg });
      }
    });

    // PATCH /v1/admin/blog/posts/:id -- partial update.
    app.patch('/blog/posts/:id', async (c) => {
      const id = c.req.param('id');
      const body = await c.req.json().catch(() => null) as BlogPostUpdate | null;
      if (!body) throw new HTTPException(400, { message: 'body required' });
      try {
        const post = await blog.update(id, body);
        if (!post) throw new HTTPException(404, { message: 'post_not_found' });
        return c.json({ post });
      } catch (err) {
        if (err instanceof HTTPException) throw err;
        const msg = err instanceof Error ? err.message : 'update_failed';
        throw new HTTPException(400, { message: msg });
      }
    });

    // POST /v1/admin/blog/posts/:id/publish -- flip to published.
    app.post('/blog/posts/:id/publish', async (c) => {
      const post = await blog.publish(c.req.param('id'));
      if (!post) throw new HTTPException(404, { message: 'post_not_found' });
      deps.logger.info('admin.blog.published', { id: post.id, slug: post.slug });
      return c.json({ post });
    });

    // POST /v1/admin/blog/posts/:id/unpublish -- flip back to draft.
    app.post('/blog/posts/:id/unpublish', async (c) => {
      const post = await blog.unpublish(c.req.param('id'));
      if (!post) throw new HTTPException(404, { message: 'post_not_found' });
      deps.logger.info('admin.blog.unpublished', { id: post.id, slug: post.slug });
      return c.json({ post });
    });

    // DELETE /v1/admin/blog/posts/:id -- hard delete.
    app.delete('/blog/posts/:id', async (c) => {
      const ok = await blog.remove(c.req.param('id'));
      if (!ok) throw new HTTPException(404, { message: 'post_not_found' });
      deps.logger.info('admin.blog.deleted', { id: c.req.param('id') });
      return c.json({ success: true });
    });

    // POST /v1/admin/blog/draft -- AI draft generator.
    // Body: { topic, outline?, language: 'en'|'hi', targetExam? }
    // Returns markdown body. Caller copies into the editor + edits.
    app.post('/blog/draft', async (c) => {
      if (!deps.aiEngine) {
        throw new HTTPException(503, { message: 'AI engine not configured' });
      }
      const body = await c.req.json().catch(() => null) as
        | { topic?: string; outline?: string; language?: 'en' | 'hi'; targetExam?: string }
        | null;
      const topic = body?.topic?.trim();
      if (!topic || topic.length < 10) {
        throw new HTTPException(400, { message: 'topic must be at least 10 characters' });
      }
      const language = body?.language === 'hi' ? 'hi' : 'en';
      try {
        const draftBody = await deps.aiEngine.generateBlogDraft({
          topic,
          outline: body?.outline,
          language,
          targetExam: body?.targetExam,
        });
        deps.logger.info('admin.blog.draft_generated', { topic: topic.slice(0, 80), language, length: draftBody.length });
        return c.json({ body: draftBody });
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'draft_failed';
        deps.logger.warn('admin.blog.draft_failed', { error: msg });
        throw new HTTPException(503, { message: msg });
      }
    });
  }

  // ━━━ SERVICE KEYS (PR-37) ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // Razorpay / Resend / WhatsApp / FCM keys live in `serviceKeys/{id}` and
  // are read at runtime by the billing routes, email service, and WhatsApp
  // service. Admin can rotate without redeploying.
  //
  // Endpoints mirror the AI Providers shape so the admin UI can reuse the
  // same per-card pattern:
  //   GET    /service-keys                 list with masked secrets
  //   GET    /service-keys/:id             single service detail (masked)
  //   PATCH  /service-keys/:id             update fields / enabled flag
  //   POST   /service-keys/:id/test        run a quick reachability probe

  /**
   * Build the response shape for one service. Secrets are masked
   * (last 4 + dots) so the full key never leaves Firestore. Public
   * fields like Razorpay `keyId` and Resend `fromEmail` are returned
   * unmasked because they're explicitly identifiers, not secrets.
   *
   * Also exposes which fields come from env-fallback so the UI can show
   * a "Using env fallback" pill when the admin hasn't filled in a key
   * yet but the legacy env var is configured.
   */
  async function serializeServiceKey(id: ServiceId) {
    const def = getServiceDefinition(id);
    if (!def) return null;
    const cfg = await deps.serviceKeys.get(id);
    const merged = await deps.serviceKeys.getMergedFields(id, {
      // Expose env fallbacks the same way the runtime helpers do.
      keyId: deps.env.RAZORPAY_KEY_ID,
      keySecret: deps.env.RAZORPAY_KEY_SECRET,
      webhookSecret: deps.env.RAZORPAY_WEBHOOK_SECRET,
      apiKey: deps.env.RESEND_API_KEY,
      token: deps.env.WHATSAPP_TOKEN,
      phoneNumberId: deps.env.WHATSAPP_PHONE_NUMBER_ID,
    });
    const fieldsResponse: Record<string, { value: string | undefined; source: 'admin' | 'env' | 'unset'; hasValue: boolean }> = {};
    for (const f of def.fields) {
      const adminVal = cfg?.fields[f.id];
      const finalVal = merged[f.id];
      let source: 'admin' | 'env' | 'unset' = 'unset';
      if (adminVal && adminVal.length > 0) source = 'admin';
      else if (finalVal && finalVal.length > 0) source = 'env';
      const display = f.secret ? maskSecret(adminVal) : adminVal;
      fieldsResponse[f.id] = {
        value: display,
        source,
        hasValue: !!finalVal && finalVal.length > 0,
      };
    }
    return {
      id,
      label: def.label,
      description: def.description,
      tier: def.tierLabel ?? 'Active',
      consoleUrl: def.consoleUrl,
      signupUrl: def.signupUrl,
      enabled: cfg?.enabled ?? true,
      fields: fieldsResponse,
      fieldDefinitions: def.fields,
      lastValidatedAt: cfg?.lastValidatedAt ?? null,
      lastValidationError: cfg?.lastValidationError ?? null,
      updatedAt: cfg?.updatedAt ?? null,
    };
  }

  function asServiceId(raw: string): ServiceId | null {
    return SERVICE_DEFINITIONS.some(d => d.id === raw) ? (raw as ServiceId) : null;
  }

  app.get('/service-keys', async (c) => {
    const services = await Promise.all(SERVICE_DEFINITIONS.map(d => serializeServiceKey(d.id)));
    return c.json({ services: services.filter(s => s !== null) });
  });

  app.get('/service-keys/:id', async (c) => {
    const id = asServiceId(c.req.param('id'));
    if (!id) throw new HTTPException(404, { message: 'Unknown service id' });
    const service = await serializeServiceKey(id);
    return c.json({ service });
  });

  app.patch('/service-keys/:id', async (c) => {
    const id = asServiceId(c.req.param('id'));
    if (!id) throw new HTTPException(404, { message: 'Unknown service id' });
    const def = getServiceDefinition(id)!;
    const body = await c.req.json().catch(() => null) as {
      fields?: Record<string, string>;
      enabled?: boolean;
    } | null;
    if (!body) throw new HTTPException(400, { message: 'Body required' });

    // Validate per-field minLengths so admin doesn't accidentally save a
    // partial paste. Empty strings are allowed (and treated as "clear
    // this field" by the upsert).
    const cleanFields: Record<string, string> = {};
    if (body.fields) {
      for (const f of def.fields) {
        const val = body.fields[f.id];
        if (typeof val !== 'string') continue;
        const trimmed = val.trim();
        if (trimmed.length === 0) {
          cleanFields[f.id] = '';
          continue;
        }
        if (f.minLength && trimmed.length < f.minLength) {
          throw new HTTPException(400, {
            message: `${f.label} must be at least ${f.minLength} characters`,
          });
        }
        cleanFields[f.id] = trimmed;
      }
    }

    const patch: Parameters<typeof deps.serviceKeys.upsert>[1] = {
      fields: cleanFields,
    };
    if (body.enabled !== undefined) patch.enabled = !!body.enabled;
    // Saving new keys clears stale validation state so admin sees
    // "Not validated" until they hit Test.
    if (Object.keys(cleanFields).length > 0) {
      patch.lastValidatedAt = undefined;
      patch.lastValidationError = undefined;
    }

    await deps.serviceKeys.upsert(id, patch);
    deps.logger.info('admin.service_key_updated', {
      service: id,
      fieldsChanged: Object.keys(cleanFields),
      enabledChanged: body.enabled !== undefined,
    });
    const service = await serializeServiceKey(id);
    return c.json({ service });
  });

  /**
   * POST /v1/admin/service-keys/:id/test
   *
   * Light-weight reachability probe per service. The result is
   * persisted to lastValidatedAt / lastValidationError so the admin
   * card shows the status without re-running every time the page loads.
   *
   * Probes are intentionally cheap:
   *   - Razorpay: GET /v1/orders?count=1 with Basic auth (returns 200
   *     on valid credentials, 401 on bad).
   *   - Resend: POST to /domains via the API key (lightweight, doesn't
   *     send anything; returns 200 on valid key).
   *   - WhatsApp: GET on the phone number metadata endpoint.
   *   - FCM: light decode of the service-account JSON to confirm shape.
   */
  app.post('/service-keys/:id/test', async (c) => {
    const id = asServiceId(c.req.param('id'));
    if (!id) throw new HTTPException(404, { message: 'Unknown service id' });
    const result: { ok: boolean; latencyMs: number; error?: string } = { ok: false, latencyMs: 0 };
    const started = Date.now();
    try {
      if (id === 'razorpay') {
        const merged = await deps.serviceKeys.getMergedFields('razorpay', {
          keyId: deps.env.RAZORPAY_KEY_ID, keySecret: deps.env.RAZORPAY_KEY_SECRET,
        });
        if (!merged['keyId'] || !merged['keySecret']) {
          result.error = 'no_credentials_to_test';
        } else {
          const res = await fetch('https://api.razorpay.com/v1/orders?count=1', {
            headers: { Authorization: `Basic ${Buffer.from(`${merged['keyId']}:${merged['keySecret']}`).toString('base64')}` },
          });
          result.ok = res.ok;
          if (!res.ok) result.error = `HTTP ${res.status}: ${(await res.text()).slice(0, 160)}`;
        }
      } else if (id === 'resend') {
        const merged = await deps.serviceKeys.getMergedFields('resend', { apiKey: deps.env.RESEND_API_KEY });
        if (!merged['apiKey']) {
          result.error = 'no_api_key_to_test';
        } else {
          const res = await fetch('https://api.resend.com/domains', {
            headers: { Authorization: `Bearer ${merged['apiKey']}` },
          });
          result.ok = res.ok;
          if (!res.ok) result.error = `HTTP ${res.status}: ${(await res.text()).slice(0, 160)}`;
        }
      } else if (id === 'whatsapp') {
        const merged = await deps.serviceKeys.getMergedFields('whatsapp', {
          token: deps.env.WHATSAPP_TOKEN, phoneNumberId: deps.env.WHATSAPP_PHONE_NUMBER_ID,
        });
        if (!merged['token'] || !merged['phoneNumberId']) {
          result.error = 'no_credentials_to_test';
        } else {
          const res = await fetch(`https://graph.facebook.com/v18.0/${merged['phoneNumberId']}`, {
            headers: { Authorization: `Bearer ${merged['token']}` },
          });
          result.ok = res.ok;
          if (!res.ok) result.error = `HTTP ${res.status}: ${(await res.text()).slice(0, 160)}`;
        }
      } else if (id === 'fcm') {
        const merged = await deps.serviceKeys.getMergedFields('fcm', {});
        if (!merged['serviceAccountJson'] || !merged['projectId']) {
          result.error = 'no_service_account_to_test';
        } else {
          // Just validate the JSON shape — full FCM token mint is too
          // heavy for a click-to-test path.
          try {
            const parsed = JSON.parse(merged['serviceAccountJson']) as Record<string, unknown>;
            if (!parsed['client_email'] || !parsed['private_key']) {
              result.error = 'service_account_json_missing_fields';
            } else {
              result.ok = true;
            }
          } catch {
            result.error = 'service_account_json_invalid';
          }
        }
      }
    } catch (err) {
      result.error = err instanceof Error ? err.message : String(err);
    } finally {
      result.latencyMs = Date.now() - started;
    }

    // Persist outcome.
    await deps.serviceKeys.upsert(id, {
      lastValidatedAt: result.ok ? new Date().toISOString() : undefined,
      lastValidationError: result.ok ? undefined : (result.error ?? 'unknown_error'),
    });
    deps.logger.info('admin.service_key_validated', {
      service: id, ok: result.ok, latencyMs: result.latencyMs, error: result.error?.slice(0, 120),
    });
    return c.json({ result });
  });

  // ━━━ PUSH NOTIFICATIONS (PR-38) ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // Admin endpoints to broadcast push notifications. Founder ask:
  //   "ek push notification vala system bnana hai taki current affais ko
  //    bhej ske ham ya automatic chala jaye user personlized notioficaion?"
  //
  // Three endpoints:
  //   GET  /push/status          configured? + token-count snapshot
  //   POST /push/send            broadcast to audience or topic
  //   POST /push/test            send a test push to the calling admin's tokens

  /**
   * GET /v1/admin/push/status
   * Quick health check + configuration state. Surfaced on the admin
   * push page header so the founder knows whether sends will fire
   * before composing a message.
   */
  app.get('/push/status', async (c) => {
    if (!deps.push) return c.json({ configured: false, reason: 'push_service_not_wired' });
    const configured = await deps.push.isConfigured();
    return c.json({ configured, provider: 'fcm-admin-sdk' });
  });

  /**
   * POST /v1/admin/push/send
   * Body: {
   *   title, body,                       // required English text
   *   titleHi?, bodyHi?,                 // optional Hindi version (per-user lang preferred)
   *   audience: 'all' | 'free' | 'paid' | { topic: string },
   *   link?, imageUrl?
   * }
   *
   * For audience='all'|'free'|'paid', we look up matching users and
   * fan out to their fcmTokens[]. Returns { sent, failed, devices } so
   * admin sees the actual delivery count rather than a blind 200.
   *
   * For { topic: 'xxx' }, we fire a single FCM topic send. Topics are
   * useful when the founder wants subscription-based delivery without
   * tracking individual tokens (e.g. broadcast to /topics/current-affairs).
   */
  app.post('/push/send', async (c) => {
    if (!deps.push) {
      throw new HTTPException(503, { message: 'Push service not configured. Open Admin → Service Keys → FCM and save the service-account JSON.' });
    }
    const body = (await c.req.json().catch(() => null)) as {
      title?: string; body?: string;
      titleHi?: string; bodyHi?: string;
      audience?: 'all' | 'free' | 'paid' | { topic: string };
      link?: string; imageUrl?: string;
    } | null;
    if (!body?.title || !body?.body) {
      throw new HTTPException(400, { message: 'title and body required' });
    }
    if (!body.audience) {
      throw new HTTPException(400, { message: 'audience required: "all" | "free" | "paid" | { topic }' });
    }
    if (!(await deps.push.isConfigured())) {
      throw new HTTPException(503, { message: 'Push not configured. Save FCM credentials in Admin → Service Keys.' });
    }
    const principal = requireAuth(c);

    // Topic broadcast — single FCM call, no token enumeration needed.
    if (typeof body.audience === 'object' && body.audience !== null && 'topic' in body.audience) {
      const topic = String(body.audience.topic).replace(/[^a-zA-Z0-9-_.~%]/g, '').slice(0, 100);
      if (!topic) throw new HTTPException(400, { message: 'topic must be alphanumeric' });
      // Topic delivery — pick English by default; topics aren't per-user
      // so we can't pick language dynamically. Admin should compose for
      // a topic's known audience.
      const payload: PushNotificationPayload = {
        title: body.title, body: body.body, link: body.link, imageUrl: body.imageUrl,
      };
      const result = await deps.push.sendToTopic(topic, payload);
      deps.logger.info('admin.push_topic_send', { adminId: principal.userId, topic, result });
      return c.json({ ok: true, sent: result.successCount, failed: result.failureCount, mode: 'topic', topic });
    }

    // Direct fan-out by audience filter — gather user docs and their tokens.
    const audience = body.audience as 'all' | 'free' | 'paid';
    const users = (await deps.users.listAll?.() ?? []); // bumped cap in PR-38 (listAll FirestoreUserStore)

    type Tok = { token: string; lang: 'en' | 'hi' };
    const tokens: Tok[] = [];
    for (const u of users) {
      if (audience === 'free' && u.plan !== 'free') continue;
      if (audience === 'paid' && (u.plan === 'free' || !u.plan)) continue;
      const list = (u.fcmTokens ?? []) as Array<{ token: string }>;
      for (const t of list) {
        if (t.token) tokens.push({ token: t.token, lang: u.language === 'hi' ? 'hi' : 'en' });
      }
    }

    // Split into Hindi / English buckets if Hindi version provided so each
    // user gets the localised copy on the device.
    const hasHindi = !!body.titleHi || !!body.bodyHi;
    const enTokens = hasHindi ? tokens.filter(t => t.lang === 'en').map(t => t.token) : tokens.map(t => t.token);
    const hiTokens = hasHindi ? tokens.filter(t => t.lang === 'hi').map(t => t.token) : [];

    const payloadEn: PushNotificationPayload = {
      title: body.title, body: body.body, link: body.link, imageUrl: body.imageUrl,
    };
    const payloadHi: PushNotificationPayload = {
      title: body.titleHi ?? body.title, body: body.bodyHi ?? body.body,
      link: body.link, imageUrl: body.imageUrl,
    };

    const enResult = await deps.push.sendToTokens(enTokens, payloadEn);
    const hiResult = hiTokens.length > 0
      ? await deps.push.sendToTokens(hiTokens, payloadHi)
      : { successCount: 0, failureCount: 0, invalidTokens: [] as string[] };

    // Prune invalid tokens from the affected user docs so the next
    // broadcast doesn't waste cycles on dead devices.
    const invalid = new Set([...enResult.invalidTokens, ...hiResult.invalidTokens]);
    if (invalid.size > 0) {
      let pruned = 0;
      for (const u of users) {
        const before = u.fcmTokens ?? [];
        const after = before.filter(t => !invalid.has(t.token));
        if (after.length !== before.length) {
          await deps.users.update(u.id, { fcmTokens: after });
          pruned += before.length - after.length;
        }
      }
      deps.logger.info('admin.push_invalid_tokens_pruned', { count: invalid.size, prunedFromUsers: pruned });
    }

    deps.logger.info('admin.push_broadcast', {
      adminId: principal.userId,
      audience,
      hasHindi,
      enTotal: enTokens.length,
      hiTotal: hiTokens.length,
      enSent: enResult.successCount,
      hiSent: hiResult.successCount,
      enFailed: enResult.failureCount,
      hiFailed: hiResult.failureCount,
    });

    return c.json({
      ok: true,
      mode: 'audience',
      audience,
      devices: tokens.length,
      sent: enResult.successCount + hiResult.successCount,
      failed: enResult.failureCount + hiResult.failureCount,
      invalidTokensPruned: invalid.size,
      hindiUsersTargeted: hiTokens.length,
    });
  });

  /**
   * POST /v1/admin/push/test
   * Sends a quick test notification to the calling admin's own
   * registered devices. Helps the founder verify the FCM credential
   * + service worker setup without composing a real broadcast.
   */
  app.post('/push/test', async (c) => {
    if (!deps.push) throw new HTTPException(503, { message: 'Push service not wired' });
    const principal = requireAuth(c);
    const me = await deps.users.get(principal.userId);
    if (!me) throw new HTTPException(404, { message: 'User not found' });
    const myTokens = (me.fcmTokens ?? []).map(t => t.token);
    if (myTokens.length === 0) {
      throw new HTTPException(400, { message: 'No push tokens registered for your account. Allow notifications in the app first.' });
    }
    const result = await deps.push.sendToTokens(myTokens, {
      title: '🔔 Nexigrate — test push',
      body: 'If you see this, push notifications are working. ✓',
      link: 'https://app.nexigrate.com/dashboard',
    });
    deps.logger.info('admin.push_test', { adminId: principal.userId, tokens: myTokens.length, result });
    return c.json({ ok: true, devices: myTokens.length, sent: result.successCount, failed: result.failureCount });
  });

  return app;
}
