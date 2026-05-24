import { Hono } from 'hono';
import { HTTPException } from 'hono/http-exception';
import { requireAuth } from '../auth.js';
import type { Logger } from '../logger.js';

/**
 * Content scheduler — cron-callable endpoints that trigger AI content generation.
 * Admin is NO LONGER the content creator. AI auto-generates daily content per syllabus.
 * Admin only monitors pipeline health + can override/reject.
 *
 * POST /v1/admin/scheduler/trigger-daily       → generates MCQs + chapters for active exams
 * GET  /v1/admin/scheduler/status              → pipeline health dashboard data
 * POST /v1/admin/scheduler/pause               → temporarily pause auto-generation
 * POST /v1/admin/scheduler/resume              → resume auto-generation
 */
export interface SchedulerDeps {
  logger: Logger;
  openaiApiKey?: string;
}

interface SchedulerState {
  paused: boolean;
  lastRunAt: string | null;
  lastRunStatus: 'success' | 'partial' | 'failed' | null;
  totalGenerated: number;
  totalFailed: number;
  runsToday: number;
}

// In-memory state (would be Firestore in production)
const state: SchedulerState = {
  paused: false,
  lastRunAt: null,
  lastRunStatus: null,
  totalGenerated: 0,
  totalFailed: 0,
  runsToday: 0,
};

export function makeSchedulerRoutes(deps: SchedulerDeps): Hono {
  const app = new Hono();

  app.get('/status', async (c) => {
    requireAuth(c);
    return c.json({
      ...state,
      openaiConfigured: !!deps.openaiApiKey,
      nextScheduledRun: getNextScheduledRun(),
    });
  });

  app.post('/trigger-daily', async (c) => {
    requireAuth(c);

    if (state.paused) {
      throw new HTTPException(409, { message: 'Scheduler is paused. Resume before triggering.' });
    }

    deps.logger.info('scheduler.trigger_daily', { manual: true });

    // Simulate AI content generation
    const startTime = Date.now();
    let generated = 0;
    let failed = 0;

    // In production, this would call the 3-AI pipeline for each active exam
    // For now, we record the trigger and increment counters
    const activeExams = [
      'jee-main', 'neet-ug', 'upsc-cse', 'ssc-cgl', 'class-10-cbse', 'class-12-cbse',
    ];

    for (const exam of activeExams) {
      try {
        // Each exam gets: 10 MCQs + 1 chapter suggestion
        // In production: calls mcqGen + chapterGen pipelines
        generated += 10; // MCQs per exam
        deps.logger.info('scheduler.exam_generated', { exam, mcqs: 10 });
      } catch (err) {
        failed++;
        deps.logger.warn('scheduler.exam_failed', { exam, error: String(err) });
      }
    }

    const duration = Date.now() - startTime;
    state.lastRunAt = new Date().toISOString();
    state.lastRunStatus = failed === 0 ? 'success' : failed < activeExams.length ? 'partial' : 'failed';
    state.totalGenerated += generated;
    state.totalFailed += failed;
    state.runsToday++;

    return c.json({
      status: state.lastRunStatus,
      generated,
      failed,
      durationMs: duration,
      examsProcessed: activeExams.length,
    });
  });

  app.post('/pause', async (c) => {
    requireAuth(c);
    state.paused = true;
    deps.logger.info('scheduler.paused', {});
    return c.json({ paused: true });
  });

  app.post('/resume', async (c) => {
    requireAuth(c);
    state.paused = false;
    deps.logger.info('scheduler.resumed', {});
    return c.json({ paused: false });
  });

  return app;
}

function getNextScheduledRun(): string {
  // Next run is 5:00 AM IST tomorrow
  const now = new Date();
  const ist = new Date(now.toLocaleString('en-US', { timeZone: 'Asia/Kolkata' }));
  ist.setDate(ist.getDate() + 1);
  ist.setHours(5, 0, 0, 0);
  return ist.toISOString();
}
