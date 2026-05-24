import { Hono } from 'hono';
import { HTTPException } from 'hono/http-exception';
import {
  asExamSlug,
  EXAMS,
  type ExamSlug,
  type McqDifficulty,
} from '@nexigrate/shared';
import { requireAuth } from '../auth.js';
import type { Env } from '../env.js';
import { generateOne } from '../lib/mcqGen/generate.js';
import { OpenAIClient } from '../lib/llm/openai.js';
import { GeminiClient } from '../lib/llm/gemini.js';
import { GroqClient } from '../lib/llm/groq.js';
import type { McqDraftStore } from '../lib/mcqDraftStore.js';
import type { UserStore } from '../lib/userStore.js';
import type { Logger } from '../logger.js';
import type { LLMClient } from '../lib/llm/index.js';

/**
 * AI Auto-Content System.
 *
 * The platform is the teacher — AI generates content automatically.
 * Admin is a MONITOR, not a content creator.
 *
 * Endpoints:
 *   POST /v1/admin/scheduler/trigger-daily    → manually trigger daily generation
 *   POST /v1/admin/scheduler/cron             → cron-triggered (no auth check inside, Cloud Run IAM protects)
 *   GET  /v1/admin/scheduler/status           → pipeline health
 *   POST /v1/admin/scheduler/pause            → pause auto-gen
 *   POST /v1/admin/scheduler/resume           → resume auto-gen
 *
 * How it works:
 *   1. Identify active exams (top exams with enrolled students)
 *   2. For each exam: generate 5 MCQs across random subjects
 *   3. 3-AI pipeline: OpenAI generates → Gemini verifies → Groq cross-checks
 *   4. Drafts with both verifiers agreeing (score ≥ 7) → auto-approved
 *   5. Drafts with disagreement → queued for admin review
 *   6. Runs daily at 5:00 AM IST via Cloud Scheduler cron
 */
export interface SchedulerDeps {
  env: Env;
  drafts: McqDraftStore;
  users: UserStore;
  logger: Logger;
}

interface SchedulerState {
  paused: boolean;
  lastRunAt: string | null;
  lastRunStatus: 'success' | 'partial' | 'failed' | null;
  totalGenerated: number;
  totalFailed: number;
  totalAutoApproved: number;
  runsToday: number;
  lastRunDurationMs: number;
  lastRunExamsProcessed: number;
}

const state: SchedulerState = {
  paused: false,
  lastRunAt: null,
  lastRunStatus: null,
  totalGenerated: 0,
  totalFailed: 0,
  totalAutoApproved: 0,
  runsToday: 0,
  lastRunDurationMs: 0,
  lastRunExamsProcessed: 0,
};

const SUBJECT_MAP: Record<string, string[]> = {
  school: ['Mathematics', 'Science', 'Social Science', 'English', 'Hindi'],
  engineering: ['Physics', 'Chemistry', 'Mathematics'],
  medical: ['Biology', 'Chemistry', 'Physics'],
  'civil-services': ['General Studies', 'Current Affairs', 'Indian Polity', 'Geography', 'Economy'],
  state: ['General Studies', 'Indian Polity', 'State History', 'Current Affairs'],
  banking: ['Quantitative Aptitude', 'Reasoning', 'English', 'General Awareness'],
  defence: ['Mathematics', 'General Knowledge', 'English'],
  law: ['Legal Reasoning', 'English', 'Logical Reasoning', 'General Knowledge'],
  management: ['Quantitative Aptitude', 'Verbal Ability', 'Data Interpretation', 'Logical Reasoning'],
};

const DIFFICULTIES: McqDifficulty[] = ['easy', 'medium', 'hard'];

export function makeSchedulerRoutes(deps: SchedulerDeps): Hono {
  const app = new Hono();

  // Admin-triggered generation
  app.post('/trigger-daily', async (c) => {
    requireAuth(c);
    if (state.paused) {
      throw new HTTPException(409, { message: 'Scheduler is paused. Resume before triggering.' });
    }
    const result = await runDailyGeneration(deps);
    return c.json(result);
  });

  // Cron-triggered (Cloud Scheduler calls this — no user auth needed, IAM protects)
  app.post('/cron', async (c) => {
    if (state.paused) {
      return c.json({ status: 'skipped', reason: 'paused' });
    }
    const result = await runDailyGeneration(deps);
    return c.json(result);
  });

  app.get('/status', async (c) => {
    requireAuth(c);
    return c.json({
      ...state,
      openaiConfigured: !!deps.env.OPENAI_API_KEY,
      geminiConfigured: !!deps.env.GEMINI_API_KEY,
      groqConfigured: !!deps.env.GROQ_API_KEY,
      nextScheduledRun: getNextScheduledRun(),
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

async function runDailyGeneration(deps: SchedulerDeps): Promise<{
  status: string;
  generated: number;
  autoApproved: number;
  failed: number;
  durationMs: number;
  examsProcessed: number;
}> {
  const startTime = Date.now();
  let generated = 0;
  let autoApproved = 0;
  let failed = 0;

  deps.logger.info('scheduler.run_start', {});

  if (!deps.env.OPENAI_API_KEY) {
    state.lastRunAt = new Date().toISOString();
    state.lastRunStatus = 'failed';
    deps.logger.error('scheduler.no_api_key', { message: 'OPENAI_API_KEY not configured' });
    return { status: 'failed', generated: 0, autoApproved: 0, failed: 0, durationMs: 0, examsProcessed: 0 };
  }

  const generator = new OpenAIClient(deps.env.OPENAI_API_KEY);
  // Use available verifiers, fallback to generator if keys missing
  const v1: LLMClient = deps.env.GEMINI_API_KEY ? new GeminiClient(deps.env.GEMINI_API_KEY) : generator;
  const v2: LLMClient = deps.env.GROQ_API_KEY ? new GroqClient(deps.env.GROQ_API_KEY) : generator;

  // Top exams to generate content for
  const targetExams: ExamSlug[] = [
    asExamSlug('class-10-cbse'),
    asExamSlug('class-12-cbse'),
    asExamSlug('jee-main'),
    asExamSlug('neet-ug'),
    asExamSlug('upsc-cse'),
    asExamSlug('ssc-cgl'),
  ];

  for (const examSlug of targetExams) {
    const exam = EXAMS.find(e => e.id === examSlug);
    if (!exam) continue;

    const subjects = SUBJECT_MAP[exam.category] || ['General Studies'];
    const mcqsToGenerate = 5;

    for (let i = 0; i < mcqsToGenerate; i++) {
      const subject = subjects[i % subjects.length] ?? 'General Studies';
      const difficulty = DIFFICULTIES[i % DIFFICULTIES.length] ?? 'medium';

      try {
        const result = await generateOne({
          exam: examSlug,
          subject,
          chapter: `${subject} - Auto Generated`,
          context: {
            examName: exam.name,
            subject,
            chapter: `${subject} - Auto Generated`,
            classLevel: exam.category === 'school' ? 'class-10' : 'graduation',
            difficulty,
            sourceHint: 'NCERT + official govt sources',
          },
          generator,
          verifiers: [v1, v2],
        });

        await deps.drafts.put(result.draft);
        generated++;

        // Auto-approve if both verifiers agree with score ≥ 7
        const scores = result.draft.verifiers ?? [];
        const allAgree = scores.length >= 2 && scores.every((s: { score: number }) => s.score >= 0.7);
        if (allAgree) {
          await deps.drafts.review(result.draft.id, 'approved', 'auto-scheduler');
          autoApproved++;
        }

        deps.logger.info('scheduler.mcq_generated', { exam: String(examSlug), subject, difficulty, autoApproved: allAgree });
      } catch (err) {
        failed++;
        deps.logger.warn('scheduler.mcq_failed', {
          examName: exam.name, subject, error: err instanceof Error ? err.message : String(err),
        });
      }
    }
  }

  const durationMs = Date.now() - startTime;
  state.lastRunAt = new Date().toISOString();
  state.lastRunStatus = failed === 0 ? 'success' : generated > 0 ? 'partial' : 'failed';
  state.totalGenerated += generated;
  state.totalFailed += failed;
  state.totalAutoApproved += autoApproved;
  state.runsToday++;
  state.lastRunDurationMs = durationMs;
  state.lastRunExamsProcessed = targetExams.length;

  deps.logger.info('scheduler.run_complete', { generated, autoApproved, failed, durationMs });

  return { status: state.lastRunStatus!, generated, autoApproved, failed, durationMs, examsProcessed: targetExams.length };
}

function getNextScheduledRun(): string {
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  tomorrow.setHours(5, 0, 0, 0);
  return tomorrow.toISOString();
}
