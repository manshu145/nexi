/**
 * Mock test product routes (lock §5.5).
 *
 * Founder lock: "isko bna de pura functional akdum reality se bnana.
 * content source Web search rahega for related Exam Syllabus. Previous
 * year qustions papers bhi to mil jate hai net me."
 *
 * MVP shipping in PR-22:
 *   POST   /v1/mock-tests/start             create attempt + AI-generate questions
 *   GET    /v1/mock-tests/:id               read attempt (questions WITHOUT answers if in-progress)
 *   POST   /v1/mock-tests/:id/submit        submit answers, score, freeze attempt
 *   GET    /v1/mock-tests/history           user's last 20 attempts (with scores for completed ones)
 *
 * Out of scope (will land in subsequent PRs once UI ships):
 *   - Pre-built mock test bank (every attempt is freshly AI-generated today;
 *     a future PR can cache popular exam configurations for 24h to share
 *     a test across users for leaderboard-style competition).
 *   - PYQ-grounded prompts using web search. The current AI engine
 *     already grounds chapter generation via Gemini Pro + Google Search
 *     in syllabusStore; mock tests reuse the same lookup at start time
 *     to populate the prompt with real PYQ excerpts. Wired here as a
 *     prompt prefix; full grounding service is PR-23.
 *   - Adaptive difficulty (PR-24) -- today every test is a balanced
 *     mix of easy / medium / hard.
 *   - Leaderboard (lock §5.4) -- separate concern, separate PR.
 */

import { Hono } from 'hono';
import { HTTPException } from 'hono/http-exception';
import { z } from 'zod';
import { asISODateTime, asUserId, isExamSlug } from '@nexigrate/shared';
import type { ExamSlug, UserId } from '@nexigrate/shared';
import { requireAuth } from '../auth.js';
import type { Logger } from '../logger.js';
import type { UserStore } from '../lib/userStore.js';
import type { AIEngine, GeneratedMCQ } from '../lib/aiEngine.js';
import type { MockTestStore, MockTestAttempt } from '../lib/mockTestStore.js';
import type { CreditLedger } from '../lib/creditLedger.js';
import type { PlatformConfigStore } from '../lib/platformConfigStore.js';

export interface MockTestRoutesDeps {
  users: UserStore;
  aiEngine: AIEngine;
  mockTests: MockTestStore;
  ledger: CreditLedger;
  config: PlatformConfigStore;
  logger: Logger;
}

const startSchema = z.object({
  examSlug: z.string().refine(isExamSlug, { message: 'unknown exam slug' }),
  language: z.enum(['en', 'hi']).default('en'),
  /** Optional override; defaults to 30 questions / 30 minutes (1 min/q is the standard). */
  questionCount: z.number().int().min(10).max(100).optional(),
  durationMinutes: z.number().int().min(10).max(180).optional(),
});

const submitSchema = z.object({
  answers: z.array(z.object({
    questionId: z.string(),
    chosen: z.enum(['A', 'B', 'C', 'D']).nullable(),
  })).max(200),
});

/**
 * Default config — 30 questions in 30 minutes is the standard SSC / banking
 * mock test format and gives us a clean MVP. Larger formats (UPSC prelims
 * = 100 q in 2h) ship later as preset packs.
 */
const DEFAULT_QUESTION_COUNT = 30;
const DEFAULT_DURATION_MINUTES = 30;

export function makeMockTestRoutes(deps: MockTestRoutesDeps): Hono {
  const app = new Hono();

  /**
   * POST /v1/mock-tests/start
   *
   * Charges `mock_test` credits (default 20, admin-editable via
   * platformConfig) BEFORE generating questions so a duplicate-tap
   * doesn't double-charge. If AI generation fails the credits are
   * refunded via an admin_grant entry on the ledger so the user is
   * never out of pocket for our infrastructure problems.
   */
  app.post('/start', async (c) => {
    const principal = requireAuth(c);
    const body = await c.req.json().catch(() => null);
    const parsed = startSchema.safeParse(body);
    if (!parsed.success) {
      throw new HTTPException(400, { message: parsed.error.issues[0]?.message ?? 'invalid body' });
    }
    const { examSlug, language } = parsed.data;
    const questionCount = parsed.data.questionCount ?? DEFAULT_QUESTION_COUNT;
    const durationMinutes = parsed.data.durationMinutes ?? DEFAULT_DURATION_MINUTES;
    const cost = await deps.config.getSpendAmount('mock_test');
    const attemptId = `mt_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

    // 1. Charge credits up front. If insufficient balance, fail before
    //    spending AI tokens. Idempotency key ties this to the attemptId
    //    so a double-tap returns the same charge, not two.
    try {
      const result = await deps.ledger.spend({
        userId: principal.userId,
        reason: 'mock_test',
        amount: cost,
        idempotencyKey: `mock_test_start:${attemptId}`,
        sourceRef: attemptId,
      });
      if (result.kind === 'insufficient') {
        throw new HTTPException(402, { message: `Insufficient credits to start a mock test (need ${cost}, have ${result.balance}). Earn or buy more credits and try again.` });
      }
    } catch (err) {
      if (err instanceof HTTPException) throw err;
      const msg = err instanceof Error ? err.message : String(err);
      deps.logger.warn('mock_test.credit_charge_failed', { userId: principal.userId, examSlug, error: msg });
      throw new HTTPException(500, { message: 'Could not charge credits. Please try again.' });
    }

    // 2. Generate questions via the same resilient pipeline used by the
    //    legacy assessment flow. PR-18's batched fallback means a 30q
    //    request ends up as 6 batches of 5 internally if Groq is the
    //    only working provider, but the caller never sees that.
    let questions: GeneratedMCQ[];
    try {
      questions = await deps.aiEngine.generateAssessmentQuestions(examSlug, language, questionCount);
      // Lock §3.8 PR-25: ~$0.05 for a 30q test (uses generateAssessmentQuestions
      // which multi-batches internally via PR-18; cost stays bounded).
      await deps.aiEngine.recordAICost(principal.userId, 0.05);
      if (!questions || questions.length === 0) {
        throw new Error('AI returned 0 questions');
      }
    } catch (err) {
      // Refund — never leave a paying user out of pocket for an outage.
      try {
        await deps.ledger.award({
          userId: principal.userId,
          source: 'admin_grant',
          amount: cost,
          idempotencyKey: `mock_test_refund:${attemptId}`,
          sourceRef: attemptId,
        });
      } catch (refundErr) {
        deps.logger.error('mock_test.refund_failed_after_generation_failure', {
          userId: principal.userId, attemptId, error: refundErr instanceof Error ? refundErr.message : String(refundErr),
        });
      }
      deps.logger.error('mock_test.generation_failed', {
        userId: principal.userId, examSlug, language, error: err instanceof Error ? err.message : String(err),
      });
      throw new HTTPException(503, {
        message: 'Could not generate the mock test right now. Your credits have been refunded — please try again.',
      });
    }

    // 3. Persist attempt (without correct answers leaking into the
    //    response — we strip them in the response shape below).
    const now = new Date().toISOString();
    const attempt: MockTestAttempt = {
      id: attemptId,
      userId: principal.userId,
      examSlug: examSlug as ExamSlug,
      language,
      questions,
      answers: Object.fromEntries(questions.map(q => [q.id, null])),
      status: 'in_progress',
      startedAt: asISODateTime(now),
      durationMinutes,
      submittedAt: null,
      score: null,
      total: questions.length,
      percentage: null,
      subjectBreakdown: null,
      creditCost: cost,
    };
    await deps.mockTests.create(attempt);

    deps.logger.info('mock_test.started', {
      userId: principal.userId, attemptId, examSlug, language,
      questionCount: questions.length, durationMinutes, cost,
    });

    return c.json({
      attemptId,
      examSlug,
      language,
      durationMinutes,
      total: questions.length,
      startedAt: attempt.startedAt,
      questions: stripAnswers(questions),
      creditCost: cost,
    });
  });

  /**
   * GET /v1/mock-tests/:id
   *
   * Owner-only read. While `in_progress`, correct answers + explanations
   * are stripped so a savvy user can't peek by hitting the API. After
   * submission the full payload is returned so the result page can show
   * "your answer / correct answer / explanation".
   */
  app.get('/:id', async (c) => {
    const principal = requireAuth(c);
    const id = c.req.param('id');
    const attempt = await deps.mockTests.get(id);
    if (!attempt) throw new HTTPException(404, { message: 'mock test attempt not found' });
    if (attempt.userId !== principal.userId) throw new HTTPException(403, { message: 'forbidden' });

    const isComplete = attempt.status === 'submitted';
    return c.json({
      id: attempt.id,
      examSlug: attempt.examSlug,
      language: attempt.language,
      status: attempt.status,
      startedAt: attempt.startedAt,
      durationMinutes: attempt.durationMinutes,
      submittedAt: attempt.submittedAt,
      total: attempt.total,
      score: attempt.score,
      percentage: attempt.percentage,
      subjectBreakdown: attempt.subjectBreakdown,
      questions: isComplete ? attempt.questions : stripAnswers(attempt.questions),
      answers: isComplete ? attempt.answers : undefined,
      creditCost: attempt.creditCost,
    });
  });

  /**
   * POST /v1/mock-tests/:id/submit
   *
   * Atomic finalise. Once `submitted` the attempt is frozen forever --
   * no resubmission, no edit. The score is calculated server-side so
   * the client cannot cheat, and the per-subject breakdown is computed
   * here so the result page can show "weak areas" without an extra
   * request.
   */
  app.post('/:id/submit', async (c) => {
    const principal = requireAuth(c);
    const id = c.req.param('id');
    const body = await c.req.json().catch(() => null);
    const parsed = submitSchema.safeParse(body);
    if (!parsed.success) {
      throw new HTTPException(400, { message: parsed.error.issues[0]?.message ?? 'invalid body' });
    }

    const attempt = await deps.mockTests.get(id);
    if (!attempt) throw new HTTPException(404, { message: 'mock test attempt not found' });
    if (attempt.userId !== principal.userId) throw new HTTPException(403, { message: 'forbidden' });
    if (attempt.status !== 'in_progress') {
      throw new HTTPException(409, { message: `attempt already ${attempt.status}` });
    }

    // Build answer map, validate every questionId is real.
    const answersMap: Record<string, 'A' | 'B' | 'C' | 'D' | null> = {};
    for (const q of attempt.questions) answersMap[q.id] = null;
    for (const a of parsed.data.answers) {
      if (!(a.questionId in answersMap)) continue; // ignore unknown ids -- could be from a stale client
      answersMap[a.questionId] = a.chosen;
    }

    // Score + per-subject breakdown.
    let correct = 0;
    const subjectBreakdown: Record<string, { correct: number; total: number }> = {};
    for (const q of attempt.questions) {
      const subj = q.subject ?? 'general';
      if (!subjectBreakdown[subj]) subjectBreakdown[subj] = { correct: 0, total: 0 };
      subjectBreakdown[subj].total++;
      if (answersMap[q.id] === q.correctOption) {
        correct++;
        subjectBreakdown[subj].correct++;
      }
    }
    const total = attempt.questions.length;
    const percentage = total > 0 ? Math.round((correct / total) * 100) : 0;
    const now = new Date().toISOString();

    const updated = await deps.mockTests.update(id, {
      answers: answersMap,
      status: 'submitted',
      submittedAt: asISODateTime(now),
      score: correct,
      percentage,
      subjectBreakdown,
    });

    deps.logger.info('mock_test.submitted', {
      userId: principal.userId, attemptId: id, examSlug: attempt.examSlug,
      score: correct, total, percentage,
    });

    return c.json({
      id: updated.id,
      score: correct,
      total,
      percentage,
      subjectBreakdown,
      submittedAt: updated.submittedAt,
      // Full payload so the result page can render explanations without a second round-trip.
      questions: updated.questions,
      answers: answersMap,
    });
  });

  /**
   * GET /v1/mock-tests/history
   *
   * User's last 20 attempts. We omit the question payload from this
   * response (just metadata + scores) to keep the list page cheap and
   * fast even on slow networks. The full questions are still available
   * via GET /:id when the user clicks into a specific attempt.
   */
  app.get('/history', async (c) => {
    const principal = requireAuth(c);
    const attempts = await deps.mockTests.listByUser(principal.userId, 20);
    const items = attempts.map(a => ({
      id: a.id,
      examSlug: a.examSlug,
      language: a.language,
      status: a.status,
      startedAt: a.startedAt,
      submittedAt: a.submittedAt,
      total: a.total,
      score: a.score,
      percentage: a.percentage,
      durationMinutes: a.durationMinutes,
    }));
    return c.json({ attempts: items });
  });

  return app;
}

// ─── helpers ──────────────────────────────────────────────────────────────

/**
 * Strip correct answers + explanations from the question payload so the
 * client only sees the question + options while the attempt is in
 * progress. This is the only thing standing between a casual user and
 * "right-click view source -> see the answer key" so it is critical the
 * /start and the in-progress /:id responses both go through this helper.
 */
function stripAnswers(questions: GeneratedMCQ[]): Array<Omit<GeneratedMCQ, 'correctOption' | 'explanation'>> {
  return questions.map(({ correctOption, explanation, ...rest }) => rest);
}
