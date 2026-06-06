/**
 * Exam calendar routes.
 *
 *   GET   /v1/exams/dates             — all exams' upcoming dates
 *   GET   /v1/exams/dates/:examSlug   — one exam's dates
 *   PATCH /v1/exams/dates/:examSlug   — admin-only: update an exam's events
 *
 * Read endpoints are available to any authed user (dashboard countdown +
 * /exam-calendar page). The PATCH replicates the admin guard used by the
 * /v1/admin router so only founders/admins can edit dates.
 */

import { Hono } from 'hono';
import { HTTPException } from 'hono/http-exception';
import { z } from 'zod';
import { requireAuth } from '../auth.js';
import type { Logger } from '../logger.js';
import type { UserStore } from '../lib/userStore.js';
import type { Env } from '../env.js';
import type { ExamDatesStore, ExamEvent } from '../lib/examDatesStore.js';
import { isHardcodedSuperAdmin } from '../lib/adminEmails.js';

export interface ExamRoutesDeps {
  examDates: ExamDatesStore;
  users: UserStore;
  env: Env;
  logger: Logger;
}

const eventSchema = z.object({
  name: z.string().min(1).max(120),
  date: z.string().nullable(),
  estimatedMonth: z.string().max(60).default(''),
  isConfirmed: z.boolean().default(false),
  sourceUrl: z.string().max(300).default(''),
  registrationStart: z.string().nullable().default(null),
  registrationEnd: z.string().nullable().default(null),
});

const patchSchema = z.object({
  examName: z.string().min(1).max(120),
  events: z.array(eventSchema).max(20),
});

export function makeExamRoutes(deps: ExamRoutesDeps): Hono {
  const app = new Hono();

  // GET /v1/exams/dates — all exam calendars.
  app.get('/dates', async (c) => {
    requireAuth(c);
    const all = await deps.examDates.getAll();
    return c.json({ exams: all });
  });

  // GET /v1/exams/dates/:examSlug — single exam calendar.
  app.get('/dates/:examSlug', async (c) => {
    requireAuth(c);
    const examSlug = c.req.param('examSlug');
    const dates = await deps.examDates.get(examSlug);
    if (!dates) return c.json({ examSlug, examName: examSlug, events: [], lastUpdated: null });
    return c.json(dates);
  });

  // PATCH /v1/exams/dates/:examSlug — admin only.
  app.patch('/dates/:examSlug', async (c) => {
    const principal = requireAuth(c);
    const user = await deps.users.get(principal.userId);
    const email = principal.email ?? user?.email ?? '';
    const isAdmin = isHardcodedSuperAdmin(email)
      || email.toLowerCase() === deps.env.SUPER_ADMIN_EMAIL.toLowerCase()
      || user?.role === 'admin';
    if (!isAdmin) throw new HTTPException(403, { message: 'Admin access required' });

    const examSlug = c.req.param('examSlug');
    const body = await c.req.json().catch(() => null);
    const parsed = patchSchema.safeParse(body);
    if (!parsed.success) throw new HTTPException(400, { message: parsed.error.issues[0]?.message ?? 'invalid body' });

    const events: ExamEvent[] = parsed.data.events.map(e => ({
      name: e.name,
      date: e.date,
      estimatedMonth: e.estimatedMonth,
      isConfirmed: e.isConfirmed,
      sourceUrl: e.sourceUrl,
      registrationStart: e.registrationStart,
      registrationEnd: e.registrationEnd,
    }));
    const saved = await deps.examDates.upsert(examSlug, parsed.data.examName, events);
    deps.logger.info('exams.dates_updated', { examSlug, events: events.length, by: principal.userId });
    return c.json(saved);
  });

  return app;
}
