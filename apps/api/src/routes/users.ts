import { Hono } from 'hono';
import { HTTPException } from 'hono/http-exception';
import { z } from 'zod';
import { asExamSlug, isExamSlug } from '@nexigrate/shared';
import { requireAuth } from '../auth.js';
import type { Logger } from '../logger.js';
import type { UserStore } from '../lib/userStore.js';

/**
 *   GET  /v1/users/me                 -- returns or auto-creates the user doc
 *                                        from Firebase token claims forwarded
 *                                        by the client as headers
 *   POST /v1/users/me/onboarding      -- set target exam (and other onboarding fields)
 */
export interface UsersRoutesDeps {
  users: UserStore;
  logger: Logger;
}

const onboardingSchema = z.object({
  targetExam: z.string().refine(isExamSlug, { message: 'unknown exam slug' }),
  name: z.string().trim().min(1).max(100).optional(),
  preferredLanguage: z.string().min(2).max(5).optional(),
  classLevel: z.string().nullable().optional(),
  board: z.string().nullable().optional(),
  schoolName: z.string().trim().max(200).nullable().optional(),
  district: z.string().trim().max(100).nullable().optional(),
  state: z.string().trim().max(100).nullable().optional(),
  dateOfBirth: z.string().nullable().optional(),
  aim: z.string().trim().max(300).nullable().optional(),
  preparingExams: z.array(z.string()).max(5).optional(),
  onboardingVersion: z.number().int().optional(),
});

export function makeUsersRoutes(deps: UsersRoutesDeps): Hono {
  const app = new Hono();

  app.get('/me', async (c) => {
    const principal = requireAuth(c);
    const email = c.req.header('x-user-email') ?? '';
    const name = c.req.header('x-user-name') ?? principal.userId;
    const photo = c.req.header('x-user-photo') ?? '';
    const provider = (c.req.header('x-user-provider') as 'google' | 'phone') || 'google';
    const user = await deps.users.getOrCreate(principal.userId, {
      email,
      name,
      photoPath: photo || null,
      primaryProvider: provider,
    });
    return c.json({ user });
  });

  app.post('/me/onboarding', async (c) => {
    const principal = requireAuth(c);
    const body = await c.req.json().catch(() => null);
    const parsed = onboardingSchema.safeParse(body);
    if (!parsed.success) {
      throw new HTTPException(400, {
        message: parsed.error.issues[0]?.message ?? 'invalid body',
      });
    }
    const user = await deps.users.setTargetExam(
      principal.userId,
      asExamSlug(parsed.data.targetExam),
    );
    // Save extended profile fields if provided
    if (parsed.data.preferredLanguage || parsed.data.classLevel || parsed.data.board ||
        parsed.data.aim || parsed.data.name || parsed.data.dateOfBirth ||
        parsed.data.onboardingVersion) {
      const extra: Record<string, unknown> = {};
      if (parsed.data.preferredLanguage) extra.preferredLanguage = parsed.data.preferredLanguage;
      if (parsed.data.classLevel) extra.classLevel = parsed.data.classLevel;
      if (parsed.data.board) extra.board = parsed.data.board;
      if (parsed.data.schoolName) extra.schoolName = parsed.data.schoolName;
      if (parsed.data.district) extra.district = parsed.data.district;
      if (parsed.data.state) extra.state = parsed.data.state;
      if (parsed.data.dateOfBirth) extra.dateOfBirth = parsed.data.dateOfBirth;
      if (parsed.data.aim) extra.aim = parsed.data.aim;
      if (parsed.data.preparingExams) extra.preparingExams = parsed.data.preparingExams;
      if (parsed.data.onboardingVersion) extra.onboardingVersion = parsed.data.onboardingVersion;
      if (parsed.data.name) extra.name = parsed.data.name;
      await deps.users.updateProfile(principal.userId, extra);
    }
    deps.logger.info('users.onboarding', {
      userId: principal.userId,
      targetExam: parsed.data.targetExam,
      language: parsed.data.preferredLanguage ?? 'en',
      onboardingVersion: parsed.data.onboardingVersion ?? 1,
    });
    const updatedUser = await deps.users.getOrCreate(principal.userId, {
      email: '', name: '', photoPath: null, primaryProvider: 'google',
    });
    return c.json({ user: updatedUser });
  });

  return app;
}
