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
import { asISODateTime, asUserId, isExamSlug, shouldDeductCredits } from '@nexigrate/shared';
import type { ExamSlug, UserId } from '@nexigrate/shared';
import { requireAuth } from '../auth.js';
import { effectiveLevel } from '../lib/levelProgression.js';
import { buildSyllabusPromptContext } from '../lib/syllabusStore.js';
import type { Logger } from '../logger.js';
import type { UserStore } from '../lib/userStore.js';
import type { AIEngine, GeneratedMCQ } from '../lib/aiEngine.js';
import type { MockTestStore, MockTestAttempt } from '../lib/mockTestStore.js';
import type { CreditLedger } from '../lib/creditLedger.js';
import type { PlatformConfigStore } from '../lib/platformConfigStore.js';
import type { FeatureUsageStore } from '../lib/featureUsageStore.js';
import { PlanGate, FeatureKey } from '../lib/planGate.js';

export interface MockTestRoutesDeps {
  users: UserStore;
  aiEngine: AIEngine;
  mockTests: MockTestStore;
  ledger: CreditLedger;
  config: PlatformConfigStore;
  logger: Logger;
  /** Per-user usage counter for the daily mock-test cap (paid plans). Optional for tests. */
  usage?: FeatureUsageStore;
}

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
  /**
   * Client-generated attempt id. Letting the client own the id makes the
   * start flow resilient to a dropped response: even if the network drops
   * while we're generating, the client already knows the id and can poll
   * GET /:id to recover the test once generation finishes server-side.
   */
  attemptId: z.string().regex(/^mt_[a-zA-Z0-9_]{6,40}$/).optional(),
});

const submitSchema = z.object({
  answers: z.array(z.object({
    questionId: z.string(),
    chosen: z.enum(['A', 'B', 'C', 'D']).nullable(),
  })).max(200),
});

/**
 * Default config — a 50-question, 60-minute mock test split into difficulty
 * sections (20 easy + 20 medium + 10 hard), with negative marking, matching
 * real competitive-exam patterns. Callers can still override via the request.
 */
const DEFAULT_QUESTION_COUNT = 50;
const DEFAULT_DURATION_MINUTES = 60;
/** Marks deducted per wrong (non-skipped) answer. */
const NEGATIVE_MARK_PER_WRONG = 0.25;
/** Section sizes for the default 50-question mock test. */
const MOCK_SECTIONS = { easy: 20, medium: 20, hard: 10 } as const;

export function makeMockTestRoutes(deps: MockTestRoutesDeps): Hono {
  const app = new Hono();
  // Central gate for the daily mock-test cap (active paid plans). Needs
  // usage; falls back to no cap (fail-open) when missing.
  const planGate = deps.usage
    ? new PlanGate({ config: deps.config, usage: deps.usage, ledger: deps.ledger, logger: deps.logger })
    : null;

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
    const attemptId = parsed.data.attemptId ?? `mt_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

    // Idempotent re-entry: if this attemptId already exists (e.g. the client
    // retried after a dropped response, or double-tapped), don't charge or
    // regenerate — just report the current state so the client can navigate
    // to /:id and poll.
    const existing = await deps.mockTests.get(attemptId);
    if (existing) {
      if (existing.userId !== principal.userId) {
        throw new HTTPException(403, { message: 'forbidden' });
      }
      return c.json({
        attemptId,
        status: existing.status,
        examSlug: existing.examSlug,
        language: existing.language,
        durationMinutes: existing.durationMinutes,
        total: existing.total,
        creditCost: existing.creditCost,
        negativeMarkPerWrong: existing.negativeMarkPerWrong ?? NEGATIVE_MARK_PER_WRONG,
      });
    }

    // Plan gate (Part 4 audit fix). Free/expired users PAY `mock_test`
    // credits up front (idempotent + refunded on AI failure). ACTIVE PAID
    // users are NOT charged — they're metered by the daily `mockTests` cap
    // instead. This fixes the bug where paid users were charged credits for
    // every mock test, and enforces the previously-ignored daily limit.
    // Either limit returns an upgrade-prompting response.
    const gateUser = await deps.users.get(principal.userId);
    const deduct = shouldDeductCredits(gateUser?.plan ?? 'free', gateUser?.planExpiresAt ?? null);
    const gateLang = (gateUser?.language ?? language ?? 'en') as 'en' | 'hi';
    let charged = false;
    let mockCommit: () => Promise<void> = async () => {};

    if (deduct) {
      // 1a. Free/expired → charge credits. Idempotency key ties this to the
      //     attemptId so a double-tap returns the same charge, not two.
      try {
        const result = await deps.ledger.spend({
          userId: principal.userId,
          reason: 'mock_test',
          amount: cost,
          idempotencyKey: `mock_test_start:${attemptId}`,
          sourceRef: attemptId,
        });
        if (result.kind === 'insufficient') {
          return c.json({
            error: 'insufficient_credits',
            feature: 'MOCK_TEST',
            upgrade: true,
            balance: result.balance,
            message: `Not enough credits to start a mock test (need ${cost}, have ${result.balance}). Upgrade for more mock tests, or earn credits.`,
          }, 402);
        }
        charged = result.kind === 'spent';
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        deps.logger.warn('mock_test.credit_charge_failed', { userId: principal.userId, examSlug, error: msg });
        throw new HTTPException(500, { message: 'Could not charge credits. Please try again.' });
      }
    } else if (planGate) {
      // 1b. Active paid → daily fair-use cap (no credit deduction).
      const gate = await planGate.enforcePaidCap(gateUser, FeatureKey.MOCK_TEST, gateLang);
      if (!gate.ok) return c.json(gate.body, gate.status);
      mockCommit = gate.commit;
    }

    // 2. Persist a 'generating' placeholder BEFORE generation. This is the
    //    key resilience win: the attempt now exists keyed by the client's
    //    id, so even if the network drops mid-generation the client can
    //    poll GET /:id and recover the test once we finish (Cloud Run keeps
    //    the handler running after a client disconnect).
    const createdAt = new Date().toISOString();
    const placeholder: MockTestAttempt = {
      id: attemptId,
      userId: principal.userId,
      examSlug: examSlug as ExamSlug,
      language,
      questions: [],
      answers: {},
      status: 'generating',
      startedAt: asISODateTime(createdAt),
      durationMinutes,
      submittedAt: null,
      score: null,
      total: 0,
      percentage: null,
      subjectBreakdown: null,
      creditCost: cost,
      negativeMarkPerWrong: NEGATIVE_MARK_PER_WRONG,
      generationError: null,
    };
    await deps.mockTests.create(placeholder);

    // ── Personalization & repeat-prevention (PR adaptive-learning) ─────────
    // Pull the student's level + recent mock history so this test is (a)
    // calibrated to their level, (b) biased toward their weak subjects, and
    // (c) free of questions they've already seen in earlier attempts.
    const user = await deps.users.get(principal.userId);
    const level = effectiveLevel(user);
    const pastAttempts = await deps.mockTests.listByUser(principal.userId, 10).catch(() => []);
    const seenStems = new Set<string>();
    const avoidQuestions: string[] = [];
    const subjAgg: Record<string, { correct: number; total: number }> = {};
    for (const a of pastAttempts) {
      for (const q of a.questions ?? []) {
        const stem = normalizeStem(q.question);
        if (stem && !seenStems.has(stem)) {
          seenStems.add(stem);
          if (avoidQuestions.length < 40) avoidQuestions.push(q.question);
        }
      }
      // Aggregate per-subject accuracy to find weak areas.
      const bd = a.subjectBreakdown;
      if (bd) {
        for (const [subj, s] of Object.entries(bd)) {
          if (!subjAgg[subj]) subjAgg[subj] = { correct: 0, total: 0 };
          subjAgg[subj].correct += s.correct;
          subjAgg[subj].total += s.total;
        }
      }
    }
    const weakSubjects = Object.entries(subjAgg)
      .filter(([, s]) => s.total >= 3 && s.correct / s.total < 0.5)
      .sort((a, b) => a[1].correct / a[1].total - b[1].correct / b[1].total)
      .slice(0, 3)
      .map(([subj]) => subj);
    const syllabusContext = buildSyllabusPromptContext(examSlug);

    // 3. Generate questions. Runs inside the handler (Cloud Run keeps it
    //    alive past a client disconnect), and on completion the attempt
    //    flips to 'in_progress' with the timer starting NOW (so a slow
    //    generation never eats into the candidate's time).
    let questions: GeneratedMCQ[];
    try {
      // Difficulty mix scales with the student's level: beginners get more
      // easy questions, advanced aspirants get more hard ones.
      const sections = adaptiveSections(questionCount, level);
      const genOpts = { ...sections, userLevel: level, weakSubjects, avoidQuestions, syllabusContext };
      questions = await deps.aiEngine.generateMockTest(examSlug, language, genOpts);
      await deps.aiEngine.recordAICost(principal.userId, 0.05);
      if (!questions || questions.length === 0) {
        throw new Error('AI returned 0 questions');
      }

      // Repeat-prevention safety net: drop any generated question the student
      // has already seen (exact/near-exact stem). If that leaves us short by
      // more than ~15%, generate one top-up batch (excluding both the seen
      // set and this batch) and merge. Then re-id and trim to target.
      const fresh = questions.filter((q) => !seenStems.has(normalizeStem(q.question)));
      if (fresh.length < Math.floor(questionCount * 0.85)) {
        const deficit = questionCount - fresh.length;
        const extraAvoid = [...avoidQuestions, ...fresh.map((q) => q.question)];
        try {
          const topUp = await deps.aiEngine.generateMockTest(examSlug, language, {
            ...adaptiveSections(deficit, level),
            userLevel: level,
            weakSubjects,
            avoidQuestions: extraAvoid,
            syllabusContext,
          });
          for (const q of topUp) {
            const stem = normalizeStem(q.question);
            if (!seenStems.has(stem) && !fresh.some((f) => normalizeStem(f.question) === stem)) {
              fresh.push(q);
            }
          }
        } catch { /* best-effort top-up; fall through with what we have */ }
      }
      // Use the de-duplicated set when it's healthy; otherwise keep the
      // original (never hand the user a near-empty test).
      const chosen = fresh.length >= Math.floor(questionCount * 0.6) ? fresh : questions;
      questions = chosen.slice(0, questionCount).map((q, i) => ({ ...q, id: `m-q${i + 1}` }));
      deps.logger.info('mock_test.personalized', {
        userId: principal.userId, examSlug, level,
        weakSubjects, grounded: !!syllabusContext,
        generated: chosen.length, seenAvoided: seenStems.size, served: questions.length,
      });
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err);
      // Refund — never leave a paying user out of pocket for an outage.
      // Only if we actually charged credits (paid users weren't charged).
      if (charged) {
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
      }
      // Mark the attempt failed so a polling client sees a clean error
      // instead of an indefinite 'generating' spinner.
      try {
        await deps.mockTests.update(attemptId, {
          status: 'generation_failed',
          generationError: 'Our AI provider was slow or unavailable. Your credits were refunded — please try again.',
        });
      } catch { /* best-effort */ }
      deps.logger.error('mock_test.generation_failed', {
        userId: principal.userId, examSlug, language, error: errMsg,
      });
      throw new HTTPException(503, {
        message: 'Could not generate the mock test right now. Your credits have been refunded — please try again.',
      });
    }

    // 4. Flip to in_progress with the full question set; reset startedAt so
    //    the timer begins when the test is actually ready.
    const readyAt = new Date().toISOString();
    const attempt = await deps.mockTests.update(attemptId, {
      questions,
      answers: Object.fromEntries(questions.map(q => [q.id, null])),
      status: 'in_progress',
      startedAt: asISODateTime(readyAt),
      total: questions.length,
    });

    deps.logger.info('mock_test.started', {
      userId: principal.userId, attemptId, examSlug, language,
      questionCount: questions.length, durationMinutes, cost,
    });

    // Count this mock test against the daily cap (paid plans; no-op for
    // free/expired users, who were metered by credits above).
    await mockCommit();

    return c.json({
      attemptId,
      status: attempt.status,
      examSlug,
      language,
      durationMinutes,
      total: questions.length,
      startedAt: attempt.startedAt,
      questions: stripAnswers(questions),
      creditCost: cost,
      negativeMarkPerWrong: NEGATIVE_MARK_PER_WRONG,
    });
  });

  /**
   * GET /v1/mock-tests/history
   *
   * User's last 20 attempts (metadata only). Registered BEFORE the
   * `/:id` route on purpose — otherwise "history" gets captured as an
   * `:id` param and 404s with "mock test attempt not found" (the exact
   * bug founders hit on the Past-attempts list).
   */
  app.get('/history', async (c) => {
    const principal = requireAuth(c);
    const attempts = await deps.mockTests.listByUser(principal.userId, 20);
    const items = attempts
      // Hide failed/never-generated placeholders from the history list.
      .filter(a => a.status !== 'generation_failed' && a.status !== 'generating')
      .map(a => ({
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
      generationError: attempt.generationError ?? null,
      total: attempt.total,
      score: attempt.score,
      percentage: attempt.percentage,
      subjectBreakdown: attempt.subjectBreakdown,
      wrongCount: attempt.wrongCount ?? null,
      netMarks: attempt.netMarks ?? null,
      negativeMarkPerWrong: attempt.negativeMarkPerWrong ?? 0,
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
    let wrong = 0;
    const subjectBreakdown: Record<string, { correct: number; total: number }> = {};
    for (const q of attempt.questions) {
      const subj = q.subject ?? 'general';
      if (!subjectBreakdown[subj]) subjectBreakdown[subj] = { correct: 0, total: 0 };
      subjectBreakdown[subj].total++;
      const chosen = answersMap[q.id];
      if (chosen === q.correctOption) {
        correct++;
        subjectBreakdown[subj].correct++;
      } else if (chosen !== null && chosen !== undefined) {
        wrong++; // answered but incorrect → negative marking applies
      }
    }
    const total = attempt.questions.length;
    const percentage = total > 0 ? Math.round((correct / total) * 100) : 0;
    const negPerWrong = attempt.negativeMarkPerWrong ?? 0;
    // Net marks after negative marking, floored at 0 (exams never report
    // a negative total to the candidate). Rounded to 2 dp.
    const netMarks = Math.max(0, Math.round((correct - wrong * negPerWrong) * 100) / 100);
    const now = new Date().toISOString();

    const updated = await deps.mockTests.update(id, {
      answers: answersMap,
      status: 'submitted',
      submittedAt: asISODateTime(now),
      score: correct,
      percentage,
      subjectBreakdown,
      wrongCount: wrong,
      netMarks,
    });

    deps.logger.info('mock_test.submitted', {
      userId: principal.userId, attemptId: id, examSlug: attempt.examSlug,
      score: correct, total, percentage, wrong, netMarks,
    });

    return c.json({
      id: updated.id,
      score: correct,
      total,
      percentage,
      subjectBreakdown,
      wrongCount: wrong,
      netMarks,
      negativeMarkPerWrong: negPerWrong,
      submittedAt: updated.submittedAt,
      // Full payload so the result page can render explanations without a second round-trip.
      questions: updated.questions,
      answers: answersMap,
    });
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

/**
 * Difficulty split that scales with the student's working level. Beginners
 * see more easy questions to build confidence; advanced aspirants get a
 * harder mix that mirrors the real exam cut-off pressure. The intermediate
 * profile matches the historical default (MOCK_SECTIONS ratio: 40/40/20).
 */
function adaptiveSections(
  total: number,
  level: 'beginner' | 'intermediate' | 'advanced',
): { easy: number; medium: number; hard: number } {
  const ratios: Record<typeof level, { e: number; m: number }> = {
    beginner: { e: 0.5, m: 0.35 },
    // 40/40/20 — same shape as the locked MOCK_SECTIONS default.
    intermediate: { e: MOCK_SECTIONS.easy / 50, m: MOCK_SECTIONS.medium / 50 },
    advanced: { e: 0.25, m: 0.4 },
  };
  const r = ratios[level];
  const easy = Math.round(total * r.e);
  const medium = Math.round(total * r.m);
  const hard = Math.max(0, total - easy - medium);
  return { easy, medium, hard };
}

/**
 * Normalize a question stem for repeat-detection: drop punctuation/markup,
 * collapse whitespace, lowercase. Unicode-aware so it works for Hindi
 * (Devanagari) too. Capped so very long stems still hash stably.
 */
function normalizeStem(text: string): string {
  if (!text) return '';
  return text
    .normalize('NFKC')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim()
    .toLowerCase()
    .slice(0, 160);
}
