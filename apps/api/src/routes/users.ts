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
  /* Phase B: expanded onboarding fields */
  preferredLanguage: z.string().optional(),
  surname: z.string().optional(),
  dateOfBirth: z.string().optional(),
  classLevel: z.string().optional(),
  board: z.string().optional(),
  schoolName: z.string().optional(),
  district: z.string().optional(),
  state: z.string().optional(),
  aim: z.string().optional(),
  preparingExams: z.array(z.string()).optional(),
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
    // Phase B: save expanded profile fields on the user doc.
    const profilePatch: Record<string, unknown> = { onboardingVersion: 2 };
    if (parsed.data.preferredLanguage) profilePatch.preferredLanguage = parsed.data.preferredLanguage;
    if (parsed.data.surname) profilePatch.surname = parsed.data.surname;
    if (parsed.data.dateOfBirth) profilePatch.dateOfBirth = parsed.data.dateOfBirth;
    if (parsed.data.classLevel) profilePatch.classLevel = parsed.data.classLevel;
    if (parsed.data.board) profilePatch.board = parsed.data.board;
    if (parsed.data.schoolName) profilePatch.schoolName = parsed.data.schoolName;
    if (parsed.data.district) profilePatch.district = parsed.data.district;
    if (parsed.data.state) profilePatch.state = parsed.data.state;
    if (parsed.data.aim) profilePatch.aim = parsed.data.aim;
    if (parsed.data.preparingExams) profilePatch.preparingExams = parsed.data.preparingExams;
    await deps.users.updateProfile(principal.userId, profilePatch);
    deps.logger.info('users.onboarding', {
      userId: principal.userId,
      targetExam: parsed.data.targetExam,
      version: 2,
    });
    return c.json({ user: { ...user, ...profilePatch } });
  });

  return app;
}
