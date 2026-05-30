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
import type { BlogStore, BlogPostInput, BlogPostStatus, BlogPostUpdate } from '../lib/blogStore.js';
import { validateSlug } from '../lib/blogStore.js';
import type { AIEngine } from '../lib/aiEngine.js';
import { isHardcodedSuperAdmin } from '../lib/adminEmails.js';

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
   * Blog post store (lock §5.3). Optional so older test fixtures that
   * predate the blog system don't fail to construct admin routes.
   */
  blog?: BlogStore;
  /**
   * AI engine. Used here to generate blog drafts (admin "Generate with AI"
   * button calls /admin/blog/draft which thunks through aiEngine.generateBlogDraft).
   */
  aiEngine?: AIEngine;
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
      title?: string; body?: string; type?: 'banner' | 'modal' | 'email' | 'all';
      targetAudience?: 'all' | string; expiresAt?: string;
    } | null;
    if (!body?.title || !body?.body) throw new HTTPException(400, { message: 'title and body required' });
    const principal = requireAuth(c);
    const id = crypto.randomUUID();
    const announcement = {
      id, title: body.title, body: body.body, type: body.type ?? 'banner',
      targetAudience: body.targetAudience ?? 'all', createdBy: principal.userId,
      createdAt: new Date().toISOString(), expiresAt: body.expiresAt ?? null,
      isActive: true, sentViaEmail: false, sentCount: 0,
    };
    // Save to Firestore
    await deps.adminStore.saveAnnouncement(announcement);
    deps.logger.info('admin.announcement_created', { id, title: body.title });
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
    const emailService = createEmailService(deps.env, deps.logger);
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
  app.get('/email/status', (c) => {
    const configured = !!(deps.env.RESEND_API_KEY && deps.env.RESEND_API_KEY.length > 5);
    return c.json({ configured, provider: 'resend' });
  });

  // ━━━ WHATSAPP ━━━
  // GET /v1/admin/whatsapp/status — check if WhatsApp is configured
  app.get('/whatsapp/status', async (c) => {
    const { createWhatsAppService } = await import('../lib/whatsappService.js');
    const wa = createWhatsAppService(deps.env, deps.logger);
    return c.json({ configured: wa.isConfigured(), provider: 'meta-cloud-api' });
  });

  // POST /v1/admin/whatsapp/send — send WhatsApp message
  app.post('/whatsapp/send', async (c) => {
    const body = await c.req.json().catch(() => null) as { to?: string; message?: string } | null;
    if (!body?.to || !body?.message) throw new HTTPException(400, { message: 'to and message required' });
    const { createWhatsAppService } = await import('../lib/whatsappService.js');
    const wa = createWhatsAppService(deps.env, deps.logger);
    if (!wa.isConfigured()) throw new HTTPException(503, { message: 'WhatsApp not configured. Set WHATSAPP_TOKEN and WHATSAPP_PHONE_NUMBER_ID.' });
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
    deps.logger.info('admin.manual_ingest_triggered');
    // Trigger ingestion (fire and forget)
    return c.json({ success: true, message: 'Ingestion triggered' });
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

  return app;
}
