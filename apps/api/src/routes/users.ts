import { Hono } from 'hono';
import { HTTPException } from 'hono/http-exception';
import {
  asExamSlug,
  onboardingRequestSchema,
  type OnboardingRequest,
} from '@nexigrate/shared';
import { requireAuth } from '../auth.js';
import type { Logger } from '../logger.js';
import type { UserStore } from '../lib/userStore.js';

/**
 *   GET  /v1/users/me                 -- returns or auto-creates the user doc
 *                                        from Firebase token claims forwarded
 *                                        by the client as headers
 *   POST /v1/users/me/onboarding      -- multi-step survey: target exam,
 *                                        class + board, school info, exam
 *                                        date, study habits, weak subjects,
 *                                        and (if minor) parent contact.
 *                                        Validated by the shared
 *                                        `onboardingRequestSchema` so the web
 *                                        + mobile clients can reuse the same
 *                                        Zod definition.
 */
export interface UsersRoutesDeps {
  users: UserStore;
  logger: Logger;
}

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
    const parsed = onboardingRequestSchema.safeParse(body);
    if (!parsed.success) {
      throw new HTTPException(400, {
        message: parsed.error.issues[0]?.message ?? 'invalid body',
      });
    }
    const data: OnboardingRequest = parsed.data;
    const user = await deps.users.applyOnboarding(principal.userId, {
      targetExam: asExamSlug(data.targetExam),
      classLevel: data.classLevel,
      board: data.board,
      schoolName: data.schoolName,
      district: data.district,
      state: data.state,
      dateOfBirth: data.dateOfBirth,
      examDate: data.examDate,
      studyHoursPerDay: data.studyHoursPerDay,
      weakSubjects: data.weakSubjects,
      phone: data.phone,
      parentEmail: data.parentEmail,
      parentPhone: data.parentPhone,
      referralCode: data.referralCode,
      ...(data.name ? { name: data.name } : {}),
    });
    deps.logger.info('users.onboarding', {
      userId: principal.userId,
      targetExam: data.targetExam,
      classLevel: data.classLevel,
      board: data.board,
      hasExamDate: data.examDate !== null,
      hasParentContact: data.parentEmail !== null || data.parentPhone !== null,
      weakSubjectsCount: data.weakSubjects.length,
    });
    return c.json({ user });
  });

  return app;
}
