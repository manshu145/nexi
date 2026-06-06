import { Hono } from 'hono';
import { HTTPException } from 'hono/http-exception';
import { z } from 'zod';
import { requireAuth } from '../auth.js';
import type { Logger } from '../logger.js';
import type { ReviewStore } from '../lib/reviewStore.js';

export interface ReviewRoutesDeps {
  review: ReviewStore;
  logger: Logger;
}

/**
 * Spaced-repetition review endpoints. The schedule itself is written from the
 * study "chapter complete" flow (SM-2 from the quiz score); these endpoints
 * just surface what's due and let the student grade a manual review.
 */
export function makeReviewRoutes(deps: ReviewRoutesDeps): Hono {
  const app = new Hono();

  // GET /v1/review/due — chapters due for revision today (+ total due count).
  app.get('/due', async (c) => {
    const principal = requireAuth(c);
    const now = new Date().toISOString();
    const limit = Math.min(50, Math.max(1, Number(c.req.query('limit') ?? 20)));
    const items = await deps.review.listDue(principal.userId, now, limit);
    const count = await deps.review.countDue(principal.userId, now);
    return c.json({ items, count });
  });

  // GET /v1/review/stats — lightweight due count for the dashboard badge.
  app.get('/stats', async (c) => {
    const principal = requireAuth(c);
    const dueCount = await deps.review.countDue(principal.userId, new Date().toISOString());
    return c.json({ dueCount });
  });

  // POST /v1/review/:id/grade — grade a manual review (quality 0-5) & reschedule.
  const gradeSchema = z.object({ quality: z.number().int().min(0).max(5) });
  app.post('/:id/grade', async (c) => {
    const principal = requireAuth(c);
    const id = c.req.param('id');
    const parsed = gradeSchema.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) throw new HTTPException(400, { message: 'quality (0-5) required' });
    const item = await deps.review.grade(principal.userId, id, parsed.data.quality);
    if (!item) throw new HTTPException(404, { message: 'review item not found' });
    deps.logger.info('review.graded', { userId: principal.userId, id, quality: parsed.data.quality, dueAt: item.dueAt });
    return c.json({ item });
  });

  return app;
}
