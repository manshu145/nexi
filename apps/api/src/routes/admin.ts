import { Hono } from 'hono';
import { HTTPException } from 'hono/http-exception';
import { requireAuth } from '../auth.js';
import type { Logger } from '../logger.js';
import type { UserStore, StoredUser } from '../lib/userStore.js';
import type { AdminStore } from '../lib/adminStore.js';
import type { Env } from '../env.js';
import { asUserId } from '@nexigrate/shared';

import type { CouponStore } from '../lib/couponStore.js';
import { PLANS } from '@nexigrate/shared';

export interface AdminRoutesDeps { users: UserStore; adminStore: AdminStore; env: Env; logger: Logger; coupons: CouponStore; }

export function makeAdminRoutes(deps: AdminRoutesDeps): Hono {
  const app = new Hono();

  // Admin check middleware on all routes
  app.use('*', async (c, next) => {
    const principal = requireAuth(c);
    const user = await deps.users.get(principal.userId);
    if (!user || (user.role !== 'admin' && user.email !== deps.env.SUPER_ADMIN_EMAIL)) {
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
    // Deduplicate by email (Fix #4)
    const seen = new Map<string, typeof users[0]>();
    for (const u of users) {
      const key = u.email?.toLowerCase();
      if (!key || !seen.has(key)) { seen.set(key || u.id, u); }
    }
    users = Array.from(seen.values());
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
  app.get('/users/:uid/activity', async (c) => {
    const uid = c.req.param('uid');
    const activity = await deps.adminStore.getUserActivity(uid);
    return c.json({ activity });
  });

  // PATCH /v1/admin/users/:uid — update user (role, plan, credits)
  app.patch('/users/:uid', async (c) => {
    const uid = asUserId(c.req.param('uid'));
    const body = await c.req.json().catch(() => null) as Record<string, unknown> | null;
    if (!body) throw new HTTPException(400, { message: 'Body required' });
    const allowed: Record<string, unknown> = {};
    if (body.role) allowed.role = body.role;
    if (body.plan) allowed.plan = body.plan;
    if (body.credits !== undefined) allowed.credits = body.credits;
    await deps.users.update(uid, allowed as Parameters<UserStore['update']>[1]);
    deps.logger.info('admin.user_updated', { uid, changes: Object.keys(allowed) });
    return c.json({ success: true });
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
  // GET /v1/admin/plans — all plans with subscriber counts
  app.get('/plans', async (c) => {
    const users = await deps.users.listAll?.() ?? [];
    const planCounts: Record<string, number> = { free: 0, scholar: 0, aspirant: 0, achiever: 0 };
    for (const u of users) planCounts[u.plan] = (planCounts[u.plan] ?? 0) + 1;
    const plans = Object.values(PLANS).map(p => ({ ...p, subscribers: planCounts[p.id] ?? 0 }));
    return c.json({ plans });
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

  return app;
}
