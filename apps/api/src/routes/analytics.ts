/**
 * Analytics routes.
 *
 *   POST /v1/analytics/events    — batched event ingest (any authed user)
 *   GET  /v1/analytics/overview  — admin dashboard data (admin only)
 *
 * Overview reuses adminStore.getFullStats() for DAU/MAU/revenue (already
 * computed) and layers feature-usage + a 30-day series + an upgrade funnel
 * from the cheap daily rollups.
 */

import { Hono } from 'hono';
import type { Context } from 'hono';
import { HTTPException } from 'hono/http-exception';
import { z } from 'zod';
import { requireAuth } from '../auth.js';
import type { Logger } from '../logger.js';
import type { UserStore } from '../lib/userStore.js';
import type { AdminStore } from '../lib/adminStore.js';
import type { AnalyticsStore } from '../lib/analyticsStore.js';
import type { Env } from '../env.js';
import { isHardcodedSuperAdmin } from '../lib/adminEmails.js';
import type { Firestore } from 'firebase-admin/firestore';

export interface AnalyticsRoutesDeps {
  analytics: AnalyticsStore;
  adminStore: AdminStore;
  users: UserStore;
  env: Env;
  logger: Logger;
  db: Firestore | null;
}

const eventsSchema = z.object({
  events: z.array(z.object({
    type: z.string().max(40),
    props: z.record(z.string(), z.string()).optional(),
  })).max(50),
});

export function makeAnalyticsRoutes(deps: AnalyticsRoutesDeps): Hono {
  const app = new Hono();

  async function requireAdmin(c: Context) {
    const principal = requireAuth(c);
    const user = await deps.users.get(principal.userId);
    const email = principal.email ?? user?.email ?? '';
    const ok = isHardcodedSuperAdmin(email)
      || email.toLowerCase() === deps.env.SUPER_ADMIN_EMAIL.toLowerCase()
      || user?.role === 'admin';
    if (!ok) throw new HTTPException(403, { message: 'Admin access required' });
  }

  // Event ingest — any authed user. Fire-and-forget on the client.
  app.post('/events', async (c) => {
    const principal = requireAuth(c);
    const body = await c.req.json().catch(() => null);
    const parsed = eventsSchema.safeParse(body);
    if (!parsed.success) return c.json({ ok: false }, 200); // never error the client tracker
    await deps.analytics.recordEvents(principal.userId, parsed.data.events).catch(() => { /* best-effort */ });
    return c.json({ ok: true });
  });

  // Admin analytics overview.
  app.get('/overview', async (c) => {
    await requireAdmin(c);
    // Two ways to pick the window:
    //  - `days` preset (7 / 28 / 90 / 365), ending today; OR
    //  - a custom `from`/`to` date range (YYYY-MM-DD), like YouTube Studio.
    const isDate = (s: string | undefined): s is string => !!s && /^\d{4}-\d{2}-\d{2}$/.test(s);
    const from = c.req.query('from');
    const to = c.req.query('to');
    let days: number;
    let endDate: string | undefined;
    if (isDate(from) && isDate(to)) {
      const span = Math.floor((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000) + 1;
      days = Math.min(Math.max(span, 1), 366);
      endDate = to;
    } else {
      days = Math.min(Math.max(Number(c.req.query('days')) || 30, 1), 366);
      endDate = undefined;
    }

    const [stats, series] = await Promise.all([
      deps.adminStore.getFullStats(),
      deps.analytics.getDailySeries(days, endDate),
    ]);

    // Feature-usage totals across the range.
    const featureTotals: Record<string, number> = {};
    const examTotals: Record<string, number> = {};
    const langTotals: Record<string, number> = {};
    for (const day of series) {
      for (const [k, v] of Object.entries(day.events)) {
        featureTotals[k] = (featureTotals[k] ?? 0) + v;
      }
      for (const [k, v] of Object.entries(day.dims?.exam ?? {})) {
        examTotals[k] = (examTotals[k] ?? 0) + v;
      }
      for (const [k, v] of Object.entries(day.dims?.lang ?? {})) {
        langTotals[k] = (langTotals[k] ?? 0) + v;
      }
    }

    // Today vs Yesterday snapshots (last two days of the series).
    const todaySnap = series[series.length - 1] ?? { date: '', total: 0, events: {}, dims: {} };
    const yesterdaySnap = series[series.length - 2] ?? { date: '', total: 0, events: {}, dims: {} };
    const compare = {
      today: { date: todaySnap.date, total: todaySnap.total, events: todaySnap.events },
      yesterday: { date: yesterdaySnap.date, total: yesterdaySnap.total, events: yesterdaySnap.events },
    };

    // Upgrade funnel from events; payments count from billingOrders (range).
    const upgradeViews = featureTotals['upgrade_view'] ?? 0;
    const upgradeClicks = featureTotals['upgrade_click'] ?? 0;
    let payments = 0;
    if (deps.db) {
      try {
        // Count payments within the SELECTED window (series first → last day),
        // not always "today minus N", so a custom past range is accurate.
        const winStart = series[0]?.date ?? '';
        const winEnd = series[series.length - 1]?.date ?? '';
        const lowerISO = winStart ? `${winStart}T00:00:00.000Z` : '';
        const upperISO = winEnd ? `${winEnd}T23:59:59.999Z` : '';
        const snap = await deps.db.collection('billingOrders')
          .where('status', '==', 'captured')
          .limit(2000).get();
        payments = snap.docs.filter(d => {
          const created = (d.data().createdAt ?? d.data().capturedAt ?? '') as string;
          return (!lowerISO || created >= lowerISO) && (!upperISO || created <= upperISO);
        }).length;
      } catch { /* ignore */ }
    }

    return c.json({
      overview: {
        totalUsers: stats.totalUsers,
        dau: stats.dau,
        mau: stats.mau,
        newUsersToday: stats.newUsersToday,
        newUsersThisWeek: stats.newUsersThisWeek,
        revenue30d: stats.revenue30d,
        revenueTotal: stats.revenueTotal,
        activeSessions: stats.activeSessions,
        stickiness: stats.mau > 0 ? Math.round((stats.dau / stats.mau) * 100) : 0, // DAU/MAU %
      },
      series,            // [{date,total,events:{...},dims:{...}}]
      featureTotals,     // {event_type: count}
      examTotals,        // {exam_slug: engagement count}
      langTotals,        // {en|hi: count}
      compare,           // {today:{...}, yesterday:{...}}
      funnel: { upgradeViews, upgradeClicks, payments },
      rangeDays: days,
    });
  });

  return app;
}
