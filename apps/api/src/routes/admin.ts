import { Hono } from 'hono';
import { HTTPException } from 'hono/http-exception';
import { requireAuth } from '../auth.js';
import type { Logger } from '../logger.js';
import type { UserStore, StoredUser } from '../lib/userStore.js';
import type { Env } from '../env.js';
import { asUserId } from '@nexigrate/shared';

export interface AdminRoutesDeps { users: UserStore; env: Env; logger: Logger; }

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

  // GET /v1/admin/stats
  app.get('/stats', async (c) => {
    // Basic stats from user count
    const users = await deps.users.listAll?.() ?? [];
    const totalUsers = users.length;
    const today = new Date().toISOString().split('T')[0]!;
    const dau = users.filter((u: StoredUser) => u.lastDailyAt?.startsWith(today)).length;
    return c.json({ totalUsers, dau, mau: totalUsers, revenue30d: 0, aiCallsToday: 0, aiCostToday: 0 });
  });

  // GET /v1/admin/users — paginated
  app.get('/users', async (c) => {
    const page = parseInt(c.req.query('page') ?? '1');
    const limit = parseInt(c.req.query('limit') ?? '20');
    const users = await deps.users.listAll?.() ?? [];
    const paginated = users.slice((page - 1) * limit, page * limit);
    return c.json({ users: paginated, total: users.length, page, limit });
  });

  // GET /v1/admin/users/:uid
  app.get('/users/:uid', async (c) => {
    const uid = asUserId(c.req.param('uid'));
    const user = await deps.users.get(uid);
    if (!user) throw new HTTPException(404, { message: 'User not found' });
    return c.json({ user });
  });

  // PATCH /v1/admin/users/:uid
  app.patch('/users/:uid', async (c) => {
    const uid = asUserId(c.req.param('uid'));
    const body = await c.req.json().catch(() => null) as Record<string, unknown> | null;
    if (!body) throw new HTTPException(400, { message: 'Body required' });
    // Only allow role and plan updates
    const allowed: Record<string, unknown> = {};
    if (body.role) allowed.role = body.role;
    if (body.plan) allowed.plan = body.plan;
    if (body.credits !== undefined) allowed.credits = body.credits;
    await deps.users.update(uid, allowed as Parameters<UserStore['update']>[1]);
    deps.logger.info('admin.user_updated', { uid, changes: Object.keys(allowed) });
    return c.json({ success: true });
  });

  // GET /v1/admin/logs (placeholder — return empty for now)
  app.get('/logs', (c) => { requireAuth(c); return c.json({ logs: [], total: 0 }); });

  // GET /v1/admin/ai-usage (placeholder)
  app.get('/ai-usage', (c) => { requireAuth(c); return c.json({ usage: [] }); });

  // GET /v1/admin/revenue (placeholder)
  app.get('/revenue', (c) => { requireAuth(c); return c.json({ payments: [], total: 0 }); });

  // GET /v1/admin/support (placeholder)
  app.get('/support', (c) => { requireAuth(c); return c.json({ tickets: [] }); });

  return app;
}
