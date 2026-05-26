import { Hono } from 'hono';
import { HTTPException } from 'hono/http-exception';
import { requireAuth } from '../auth.js';
import type { Logger } from '../logger.js';
import type { UserStore, StoredUser } from '../lib/userStore.js';
import type { AdminStore } from '../lib/adminStore.js';
import type { Env } from '../env.js';
import { asUserId } from '@nexigrate/shared';

export interface AdminRoutesDeps { users: UserStore; adminStore: AdminStore; env: Env; logger: Logger; }

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

  // GET /v1/admin/users — paginated
  app.get('/users', async (c) => {
    const page = parseInt(c.req.query('page') ?? '1');
    const limit = parseInt(c.req.query('limit') ?? '20');
    const users = await deps.users.listAll?.() ?? [];
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
    // This should ideally come from a payments store — for now return from stats
    return c.json({ payments: [], total: 0 });
  });

  // GET /v1/admin/support — tickets
  app.get('/support', (c) => { return c.json({ tickets: [] }); });

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

  return app;
}
