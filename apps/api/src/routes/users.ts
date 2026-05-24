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
 *   POST /v1/users/me/language         -- save language preference
 *   POST /v1/users/me/profile          -- update full profile
 *   GET  /v1/users/me/study-plan       -- get personalized study plan
 */
export interface UsersRoutesDeps {
  users: UserStore;
  logger: Logger;
}

const onboardingSchema = z.object({
  targetExam: z.string().refine(isExamSlug, { message: 'unknown exam slug' }),
});

const languageSchema = z.object({
  language: z.enum(['en', 'hi']),
});

const profileSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  dob: z.string().optional(),
  aim: z.string().max(500).optional(),
  classLevel: z.string().optional(),
  board: z.string().optional(),
  city: z.string().optional(),
  language: z.enum(['en', 'hi']).optional(),
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
    deps.logger.info('users.onboarding', {
      userId: principal.userId,
      targetExam: parsed.data.targetExam,
    });
    return c.json({ user });
  });

  // Save language preference
  app.post('/me/language', async (c) => {
    const principal = requireAuth(c);
    const body = await c.req.json().catch(() => null);
    const parsed = languageSchema.safeParse(body);
    if (!parsed.success) {
      throw new HTTPException(400, { message: 'invalid language (en or hi)' });
    }
    const user = await deps.users.updateLanguage(principal.userId, parsed.data.language);
    deps.logger.info('users.language', {
      userId: principal.userId,
      language: parsed.data.language,
    });
    return c.json({ user });
  });

  // Update full profile
  app.post('/me/profile', async (c) => {
    const principal = requireAuth(c);
    const body = await c.req.json().catch(() => null);
    const parsed = profileSchema.safeParse(body);
    if (!parsed.success) {
      throw new HTTPException(400, {
        message: parsed.error.issues[0]?.message ?? 'invalid body',
      });
    }
    // Only include defined fields
    const data: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(parsed.data)) {
      if (value !== undefined) data[key] = value;
    }
    const user = await deps.users.updateProfile(principal.userId, data);
    deps.logger.info('users.profile', { userId: principal.userId });
    return c.json({ user });
  });

  // Get personalized study plan based on skill level
  app.get('/me/study-plan', async (c) => {
    const principal = requireAuth(c);
    const user = await deps.users.get(principal.userId);
    if (!user) throw new HTTPException(404, { message: 'user not found' });

    const profile = user as unknown as Record<string, unknown>;
    const skillLevel = (profile['skillLevel'] as string) ?? 'intermediate';
    const weakSubjects = (profile['weakSubjects'] as string[]) ?? [];
    const strongSubjects = (profile['strongSubjects'] as string[]) ?? [];

    const studyPlan =
      weakSubjects.length > 0
        ? weakSubjects.map((s) => `Focus on ${s} — start with basics and build up`)
        : ['Great foundation! Move to advanced problem-solving'];

    return c.json({
      skillLevel,
      weakSubjects,
      strongSubjects,
      studyPlan,
      recommendations:
        skillLevel === 'beginner'
          ? ['Start with chapter summaries', 'Practice easy MCQs daily', 'Use Nexipedia for concept clarity']
          : skillLevel === 'intermediate'
            ? ['Take mock tests weekly', 'Focus on weak subjects', 'Practice time management']
            : ['Solve previous year papers', 'Focus on advanced problems', 'Revise weak areas regularly'],
    });
  });

  return app;
}
