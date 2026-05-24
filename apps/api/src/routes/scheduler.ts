/**
 * Phase E — Content scheduler routes.
 *
 *   POST /v1/admin/scheduler/run       — trigger a generation run (cron or manual)
 *   GET  /v1/admin/scheduler/status    — pipeline health overview
 *   PATCH /v1/admin/scheduler/config   — update scheduler config
 *
 * The scheduler replaces the admin-as-content-creator model.
 * Admin's role is now: monitor health, reject bad content, override if needed.
 */
import { Hono } from 'hono';
import { HTTPException } from 'hono/http-exception';
import type { AdminUserStore } from '../lib/adminUserStore.js';
import type { LLMClient } from '../lib/llm/index.js';
import type { Logger } from '../logger.js';
import {
  DEFAULT_SCHEDULER_CONFIG,
  identifyContentGaps,
  type ContentGap,
  type SchedulerConfig,
  type SchedulerRunResult,
} from '../lib/contentScheduler/scheduler.js';
import {
  autoGenerateChapter,
  autoGenerateMcqBatch,
  type AutoGenerateResult,
} from '../lib/contentScheduler/autoGenerate.js';

export interface SchedulerRouteDeps {
  admins: AdminUserStore;
  generator: LLMClient;
  logger: Logger;
}

// Mutable config — starts with defaults, admin can update.
let schedulerConfig: SchedulerConfig = { ...DEFAULT_SCHEDULER_CONFIG };

// Track last run results for the status endpoint.
let lastRunResult: SchedulerRunResult | null = null;
let lastRunAt: string | null = null;

export function makeSchedulerRoutes(deps: SchedulerRouteDeps): Hono {
  const { admins, generator, logger } = deps;
  const app = new Hono();

  // Guard: require at least admin role
  app.use('*', async (c, next) => {
    const uid = c.get('userId') as string;
    const admin = await admins.get(uid);
    if (!admin || !['super_admin', 'admin'].includes(admin.role)) {
      throw new HTTPException(403, { message: 'admin access required' });
    }
    await next();
  });

  /**
   * POST /scheduler/run — Trigger a content generation run.
   *
   * In production this is called by Cloud Scheduler (cron) daily at 4am IST.
   * Admin can also trigger manually from the admin panel.
   *
   * The run:
   *   1. Identifies content gaps across active exams
   *   2. Generates MCQs + chapters for the highest-priority gaps
   *   3. Auto-approves where verifier score > threshold
   *   4. Queues borderline content for admin review
   */
  app.post('/scheduler/run', async (c) => {
    const start = performance.now();
    logger.info('scheduler.run.start', { config: schedulerConfig });

    // For Phase E MVP: simulate the run with gap identification.
    // Real implementation calls into the existing mcqGen + chapterGen pipelines.
    // The infrastructure is wired — just needs the store access which
    // we'll connect when merging Phases D+E together.

    const results: AutoGenerateResult[] = [];
    const errors: string[] = [];

    // Simulate a few content gaps for demonstration
    const sampleGaps: ContentGap[] = [
      { exam: 'jee-main', subject: 'physics', chapter: 'kinematics', type: 'mcq', priority: 1, reason: 'High demand topic' },
      { exam: 'neet-ug', subject: 'biology', chapter: 'cell-biology', type: 'mcq', priority: 1, reason: 'Core syllabus gap' },
      { exam: 'upsc-cse', subject: 'polity', chapter: 'fundamental-rights', type: 'chapter', priority: 2, reason: 'No chapter exists' },
    ];

    let mcqsGenerated = 0;
    let mcqsAutoApproved = 0;
    let mcqsQueuedForReview = 0;
    let chaptersGenerated = 0;
    let chaptersAutoApproved = 0;
    let chaptersQueuedForReview = 0;

    for (const gap of sampleGaps.slice(0, schedulerConfig.maxMcqsPerRun)) {
      if (gap.type === 'mcq') {
        const result = await autoGenerateMcqBatch(gap, schedulerConfig, generator, logger);
        results.push(result);
        mcqsGenerated++;
        if (result.status === 'auto_approved') mcqsAutoApproved++;
        else if (result.status === 'queued_for_review') mcqsQueuedForReview++;
        else errors.push(result.error ?? 'unknown');
      } else {
        const result = await autoGenerateChapter(gap, schedulerConfig, generator, logger);
        results.push(result);
        chaptersGenerated++;
        if (result.status === 'auto_approved') chaptersAutoApproved++;
        else if (result.status === 'queued_for_review') chaptersQueuedForReview++;
        else errors.push(result.error ?? 'unknown');
      }
    }

    const durationMs = Math.round(performance.now() - start);

    lastRunResult = {
      mcqsGenerated,
      mcqsAutoApproved,
      mcqsQueuedForReview,
      chaptersGenerated,
      chaptersAutoApproved,
      chaptersQueuedForReview,
      errors,
      durationMs,
    };
    lastRunAt = new Date().toISOString();

    logger.info('scheduler.run.complete', { ...lastRunResult });

    return c.json({
      ok: true,
      run: lastRunResult,
      runAt: lastRunAt,
    });
  });

  /**
   * GET /scheduler/status — Pipeline health overview.
   *
   * Shows last run results, config, and content generation stats.
   */
  app.get('/scheduler/status', async (c) => {
    return c.json({
      config: schedulerConfig,
      lastRun: lastRunResult,
      lastRunAt,
      isHealthy: !lastRunResult || lastRunResult.errors.length === 0,
      nextRunEstimate: getNextRunEstimate(),
    });
  });

  /**
   * PATCH /scheduler/config — Update scheduler settings.
   */
  app.patch('/scheduler/config', async (c) => {
    const body = await c.req.json<Partial<SchedulerConfig>>().catch(() => ({}));
    if (body.maxMcqsPerRun !== undefined) schedulerConfig.maxMcqsPerRun = body.maxMcqsPerRun;
    if (body.maxChaptersPerRun !== undefined) schedulerConfig.maxChaptersPerRun = body.maxChaptersPerRun;
    if (body.autoApproveThreshold !== undefined) schedulerConfig.autoApproveThreshold = body.autoApproveThreshold;
    if (body.targetExams !== undefined) schedulerConfig.targetExams = body.targetExams;

    logger.info('scheduler.config.updated', { config: schedulerConfig });
    return c.json({ config: schedulerConfig });
  });

  return app;
}

function getNextRunEstimate(): string {
  // Estimate next 4am IST
  const now = new Date();
  const istOffset = 5.5 * 60 * 60 * 1000;
  const istNow = new Date(now.getTime() + istOffset);
  const next4am = new Date(istNow);
  next4am.setHours(4, 0, 0, 0);
  if (istNow.getHours() >= 4) next4am.setDate(next4am.getDate() + 1);
  return new Date(next4am.getTime() - istOffset).toISOString();
}
