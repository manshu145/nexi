import { Hono } from 'hono';
import { HTTPException } from 'hono/http-exception';
import { z } from 'zod';
import {
  asMcqId,
  isExamSlug,
  type CreditEventId,
  type ExamSlug,
  type ISODateTime,
  type MCQ,
  type McqId,
  type StreakBadge,
  type UserId,
} from '@nexigrate/shared';
import { award, computeBalance } from '@nexigrate/credits';
import { requireAuth } from '../auth.js';
import type { McqStore } from '../lib/mcqStore.js';
import { awardStreakBadges } from '../lib/streakBadges.js';
import type { UserStore } from '../lib/userStore.js';
import type { Logger } from '../logger.js';
import type { LedgerStore } from './credits.js';

/**
 * Daily MCQ flow + Phase 11 chapter test flow.
 *
 *   GET  /v1/mcqs/daily
 *     Returns 10 MCQs for the user's target exam plus a session id derived
 *     from (userId, today). Idempotent across the day -- repeated calls
 *     return the same set.
 *
 *   POST /v1/mcqs/chapter-test/start
 *     Body: { exam, subject, chapterSlug, count? }
 *     Creates a chapter test session and returns up to N MCQs scoped to
 *     the chapter. Session ID format: `chapter:${userId}:${exam}:${slug}:${day}`.
 *     Like daily MCQs, idempotent across the day for the same chapter so
 *     a refresh recovers the same question set.
 *
 *   POST /v1/mcq-sessions/:sessionId/complete
 *     Body: { answers: [{ mcqId, chosen }] }
 *     Records the score, awards credits idempotently:
 *       score >= 7/10  ->  +50  via 'mcq_pass'
 *       any attempt    ->  +5   via 'mcq_fail_attempted'
 *     Daily sessions also bump the daily-streak counter once per IST day,
 *     and award newly-crossed milestone badges. Chapter sessions skip the
 *     streak bump because they're practice mode, not a daily commitment.
 *     Returns: { score, total, explanations, creditsAwarded, balance,
 *                newBadges }
 */
const DAILY_COUNT = 10;
const PASS_THRESHOLD = 7;
/** Per-question seconds for chapter tests. 60s feels brisk but humane. */
const CHAPTER_TEST_SECONDS_PER_Q = 60;
/** Default question count for a chapter test. */
const CHAPTER_TEST_DEFAULT_COUNT = 10;

export interface McqsRoutesDeps {
  mcqs: McqStore;
  ledger: LedgerStore;
  users: UserStore;
  logger: Logger;
  newId: () => CreditEventId;
  now: () => ISODateTime;
  getTargetExam: (userId: UserId) => Promise<ExamSlug>;
}

const completeSchema = z.object({
  answers: z
    .array(
      z.object({
        mcqId: z.string().min(1),
        chosen: z.enum(['A', 'B', 'C', 'D']).nullable(),
      }),
    )
    .min(1)
    .max(50),
});

const chapterTestStartSchema = z.object({
  exam: z.string().min(1),
  subject: z.string().min(1).max(64),
  chapterSlug: z
    .string()
    .min(1)
    .max(96)
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'slug must be kebab-case lowercase'),
  count: z.number().int().min(3).max(20).optional(),
});

function todayKey(now: ISODateTime): string {
  const utc = new Date(now);
  const ist = new Date(utc.getTime() + 5.5 * 60 * 60 * 1000);
  const y = ist.getUTCFullYear();
  const m = String(ist.getUTCMonth() + 1).padStart(2, '0');
  const d = String(ist.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function publicMcq(mcq: MCQ): Omit<MCQ, 'correctOption' | 'explanation'> {
  const { correctOption: _c, explanation: _e, ...rest } = mcq;
  void _c;
  void _e;
  return rest;
}

export function makeMcqsRoutes(deps: McqsRoutesDeps): Hono {
  const app = new Hono();

  app.get('/daily', async (c) => {
    const principal = requireAuth(c);
    const day = todayKey(deps.now());
    const sessionId = `daily:${principal.userId}:${day}`;
    const examParam = c.req.query('exam');
    const exam =
      examParam && isExamSlug(examParam)
        ? (examParam as ExamSlug)
        : await deps.getTargetExam(principal.userId);

    const items = await deps.mcqs.pickDaily(exam, DAILY_COUNT, sessionId);
    return c.json({
      sessionId,
      day,
      exam,
      mcqs: items.map(publicMcq),
    });
  });

  // Phase 11: start a chapter-scoped test. Session is keyed per
  // (user, exam, chapter, IST day) so a refresh resumes the same question
  // set, and a re-start the next day picks a fresh shuffle.
  app.post('/chapter-test/start', async (c) => {
    const principal = requireAuth(c);
    const body = await c.req.json().catch(() => null);
    const parsed = chapterTestStartSchema.safeParse(body);
    if (!parsed.success) {
      throw new HTTPException(400, {
        message: parsed.error.issues[0]?.message ?? 'invalid body',
      });
    }
    if (!isExamSlug(parsed.data.exam)) {
      throw new HTTPException(400, { message: 'unknown exam slug' });
    }
    const exam = parsed.data.exam as ExamSlug;
    const day = todayKey(deps.now());
    const sessionId = `chapter:${principal.userId}:${exam}:${parsed.data.chapterSlug}:${day}`;
    const count = parsed.data.count ?? CHAPTER_TEST_DEFAULT_COUNT;
    const items = await deps.mcqs.pickByChapter(
      exam,
      parsed.data.chapterSlug,
      count,
      sessionId,
    );
    if (items.length === 0) {
      throw new HTTPException(404, {
        message: 'no MCQs published for this chapter yet',
      });
    }
    return c.json({
      sessionId,
      day,
      exam,
      subject: parsed.data.subject,
      chapterSlug: parsed.data.chapterSlug,
      durationSeconds: items.length * CHAPTER_TEST_SECONDS_PER_Q,
      mcqs: items.map(publicMcq),
    });
  });

  return app;
}

/** Mounted at /v1/mcq-sessions */
export function makeMcqSessionsRoutes(deps: McqsRoutesDeps): Hono {
  const app = new Hono();

  app.post('/:sessionId/complete', async (c) => {
    const principal = requireAuth(c);
    const sessionId = c.req.param('sessionId');
    const isDaily = sessionId.startsWith(`daily:${principal.userId}:`);
    const isChapter = sessionId.startsWith(`chapter:${principal.userId}:`);
    if (!isDaily && !isChapter) {
      throw new HTTPException(403, { message: 'session does not belong to caller' });
    }
    const body = await c.req.json().catch(() => null);
    const parsed = completeSchema.safeParse(body);
    if (!parsed.success) {
      throw new HTTPException(400, {
        message: parsed.error.issues[0]?.message ?? 'invalid body',
      });
    }

    let correct = 0;
    const correctMcqIds: McqId[] = [];
    const explanations: { mcqId: string; correctOption: string; explanation: string }[] = [];
    for (const a of parsed.data.answers) {
      const mcq = await deps.mcqs.get(asMcqId(a.mcqId));
      if (!mcq) continue;
      explanations.push({
        mcqId: mcq.id,
        correctOption: mcq.correctOption,
        explanation: mcq.explanation,
      });
      if (a.chosen === mcq.correctOption) {
        correct += 1;
        correctMcqIds.push(mcq.id);
      }
    }

    const total = parsed.data.answers.length;
    const passed = correct >= PASS_THRESHOLD;
    const events = await deps.ledger.read(principal.userId);
    const result = award(
      {
        userId: principal.userId,
        source: passed ? 'mcq_pass' : 'mcq_fail_attempted',
        sourceRef: sessionId,
        idempotencyKey: `mcq:${sessionId}`,
      },
      events,
      { newId: deps.newId, now: deps.now },
    );
    let balance = computeBalance(events, principal.userId, deps.now()).total;
    let creditsAwarded = 0;
    let streakBumped = false;
    let newBadges: StreakBadge[] = [];
    if (result.kind === 'awarded') {
      await deps.ledger.append(result.event);
      creditsAwarded = result.event.amount;
      balance = result.newBalance;
      // Streak bump only on daily sessions. Chapter tests are practice
      // mode -- crediting their completion would dilute the streak's
      // signal of "the student showed up today".
      if (isDaily) {
        try {
          const before = (await deps.users.get(principal.userId))?.currentStreak ?? 0;
          const after = await deps.users.bumpStreak(principal.userId, deps.now());
          streakBumped = (after.currentStreak ?? 0) !== before;
          if (streakBumped) {
            const awarded = await awardStreakBadges(after, {
              users: deps.users,
              ledger: deps.ledger,
              logger: deps.logger,
              newId: deps.newId,
              now: deps.now,
            });
            newBadges = awarded.map((a) => a.badge);
            if (awarded.length > 0) {
              balance = awarded[awarded.length - 1]!.newBalance;
            }
          }
        } catch (e) {
          deps.logger.warn('mcq.streak.bump_failed', {
            userId: principal.userId,
            error: e instanceof Error ? e.message : String(e),
          });
        }
      }
    } else if (result.kind === 'duplicate') {
      creditsAwarded = result.event.amount;
      balance = result.balance;
    }

    deps.logger.info('mcq.session.complete', {
      userId: principal.userId,
      sessionId,
      kind: isDaily ? 'daily' : 'chapter',
      score: correct,
      total,
      creditsAwarded,
      streakBumped,
      newBadges: newBadges.length,
    });

    return c.json({
      sessionId,
      score: correct,
      total,
      passed,
      correctMcqIds,
      explanations,
      creditsAwarded,
      balance,
      newBadges,
    });
  });

  return app;
}
