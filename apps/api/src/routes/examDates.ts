import { Hono } from 'hono';
import { HTTPException } from 'hono/http-exception';
import { isExamSlug, type ExamSlug } from '@nexigrate/shared';
import { requireAuth } from '../auth.js';
import type { ExamDatesStore } from '../lib/examDatesStore.js';
import type { Logger } from '../logger.js';

/**
 * Phase 12 -- exam dates.
 *
 *   GET /v1/exam-dates?exam=<slug>
 *
 * Read-only, authed (the data is small and useful only to a logged-in
 * student). Admin write endpoint will land with the rest of the admin
 * panel expansion.
 */
export interface ExamDatesRoutesDeps {
  store: ExamDatesStore;
  logger: Logger;
}

export function makeExamDatesRoutes(deps: ExamDatesRoutesDeps): Hono {
  const app = new Hono();

  app.get('/', async (c) => {
    requireAuth(c);
    const examQ = c.req.query('exam');
    if (!examQ || !isExamSlug(examQ)) {
      throw new HTTPException(400, { message: 'exam query param required' });
    }
    const exam = examQ as ExamSlug;
    const dates = await deps.store.list(exam);
    return c.json({ exam, dates });
  });

  return app;
}
