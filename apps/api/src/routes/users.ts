import { Hono } from 'hono';
import { HTTPException } from 'hono/http-exception';
import { z } from 'zod';
import { asExamSlug, isExamSlug } from '@nexigrate/shared';
import { requireAuth } from '../auth.js';
import type { Logger } from '../logger.js';
import type { UserStore } from '../lib/userStore.js';

export interface UsersRoutesDeps { users: UserStore; logger: Logger; }

const patchSchema = z.object({ name: z.string().min(1).optional(), phone: z.string().optional(), dob: z.string().optional(), classLevel: z.string().optional(), board: z.string().optional(), school: z.string().optional(), aim: z.string().optional() });
const onboardingSchema = z.object({ language: z.enum(['en','hi']).optional(), targetExam: z.string().refine(isExamSlug, { message: 'unknown exam slug' }).optional(), name: z.string().min(1).optional(), phone: z.string().optional(), dob: z.string().optional(), classLevel: z.string().optional(), board: z.string().optional(), school: z.string().optional(), aim: z.string().optional() });

export function makeUsersRoutes(deps: UsersRoutesDeps): Hono {
  const app = new Hono();

  app.get('/me', async (c) => {
    const principal = requireAuth(c);
    const email = c.req.header('x-user-email') ?? '';
    const name = c.req.header('x-user-name') ?? principal.email.split('@')[0] ?? 'Student';
    const photo = c.req.header('x-user-photo') ?? null;
    const provider = (c.req.header('x-user-provider') as 'google'|'phone') || 'google';
    const user = await deps.users.getOrCreate(principal.userId, { email, name, photoURL: photo, primaryProvider: provider });
    const { streak, credits } = await deps.users.bumpStreak(principal.userId);
    const freshUser = await deps.users.get(principal.userId);
    return c.json({ user: freshUser, dailyStreak: { streak, creditsEarned: credits } });
  });

  app.patch('/me', async (c) => {
    const principal = requireAuth(c);
    const body = await c.req.json().catch(() => null);
    const parsed = patchSchema.safeParse(body);
    if (!parsed.success) throw new HTTPException(400, { message: parsed.error.issues[0]?.message ?? 'invalid body' });
    const user = await deps.users.update(principal.userId, parsed.data as any);
    deps.logger.info('users.profile_updated', { userId: principal.userId });
    return c.json({ user });
  });

  app.post('/me/onboarding', async (c) => {
    const principal = requireAuth(c);
    const body = await c.req.json().catch(() => null);
    const parsed = onboardingSchema.safeParse(body);
    if (!parsed.success) throw new HTTPException(400, { message: parsed.error.issues[0]?.message ?? 'invalid body' });
    const d: Record<string, unknown> = {};
    if (parsed.data.language) d.language = parsed.data.language;
    if (parsed.data.targetExam) d.targetExam = asExamSlug(parsed.data.targetExam);
    if (parsed.data.name) d.name = parsed.data.name;
    if (parsed.data.phone) d.phone = parsed.data.phone;
    if (parsed.data.dob) d.dob = parsed.data.dob;
    if (parsed.data.classLevel) d.classLevel = parsed.data.classLevel;
    if (parsed.data.board) d.board = parsed.data.board;
    if (parsed.data.school) d.school = parsed.data.school;
    if (parsed.data.aim) d.aim = parsed.data.aim;
    const user = await deps.users.update(principal.userId, d as any);
    deps.logger.info('users.onboarding', { userId: principal.userId, ...d });
    return c.json({ user });
  });

  return app;
}
