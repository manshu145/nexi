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

  return app;
}
