import { Hono } from 'hono';
import { HTTPException } from 'hono/http-exception';
import { z } from 'zod';
import {
  asISODateTime,
  asMcqId,
  isExamSlug,
  type CreditEventId,
  type ExamSlug,
  type ISODateTime,
  type MCQ,
  type McqId,
  type MockTestId,
  type MockTestSession,
  type UserId,
} from '@nexigrate/shared';
import { award, computeBalance, spend } from '@nexigrate/credits';
import { requireAuth } from '../auth.js';
import type { McqStore } from '../lib/mcqStore.js';
import {
  istDayKey,
  type MockTestSessionStore,
  type MockTestStore,
} from '../lib/mockTestStore.js';
import type { Logger } from '../logger.js';
import type { LedgerStore } from './credits.js';

/**
 * Mock-test HTTP routes.
 *
 *   GET  /v1/mock-tests                     list available mocks for the user's
 *                                            target exam (or ?exam=...)
 *   GET  /v1/mock-tests/:id                 single mock-test catalog entry
 *   POST /v1/mock-tests/:id/start           opens a session, charges credits,
 *                                            returns the MCQs WITHOUT answers
 *   POST /v1/mock-test-sessions/:sessionId/complete
 *                                           grades, returns score + answers,
 *                                            awards/refunds credits
 *
 * Charging is via the credit ledger. If the user can't afford the test
 * (balance < costCredits), start returns 402 Payment Required.
 *
 * Idempotency: starting the SAME mock on the SAME IST day re-uses the
 * existing session id (`mts:${userId}:${mockTestId}:${day}`) so a refresh
 * doesn't double-charge.
 */
const PASS_THRESHOLD = 0.6; // 60% to "pass"; bonus credits awarded if so

export interface MockTestsRoutesDeps {
  mockTests: MockTestStore;
  sessions: MockTestSessionStore;
  mcqs: McqStore;
  ledger: LedgerStore;
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
    .max(100),
});

/** Strip answer + explanation before sending MCQs to the client during the run. */
function publicMcq(mcq: MCQ): Omit<MCQ, 'correctOption' | 'explanation'> {
  const { correctOption: _c, explanation: _e, ...rest } = mcq;
  void _c;
  void _e;
  return rest;
}

export function makeMockTestsRoutes(deps: MockTestsRoutesDeps): Hono {
  const app = new Hono();

  app.get('/', async (c) => {
    const principal = requireAuth(c);
    const examQ = c.req.query('exam');
    const exam =
      examQ && isExamSlug(examQ)
        ? (examQ as ExamSlug)
        : await deps.getTargetExam(principal.userId);
    const list = await deps.mockTests.list(exam);
    return c.json({ mockTests: list });
  });

  app.get('/:id', async (c) => {
    requireAuth(c);
    const id = c.req.param('id') as MockTestId;
    const mock = await deps.mockTests.get(id);
    if (!mock) throw new HTTPException(404, { message: 'mock test not found' });
    return c.json({ mockTest: mock });
  });

  app.post('/:id/start', async (c) => {
    const principal = requireAuth(c);
    const mockTestId = c.req.param('id') as MockTestId;
    const mock = await deps.mockTests.get(mockTestId);
    if (!mock || !mock.isPublished) {
      throw new HTTPException(404, { message: 'mock test not available' });
    }

    const now = deps.now();
    const day = istDayKey(now);
    const sessionId = `mts:${principal.userId}:${mockTestId}:${day}`;

    // Existing session for today? Return it (idempotent).
    const existing = await deps.sessions.getActive(principal.userId, mockTestId, day);
    if (existing) {
      const mcqDocs = await loadMcqs(deps.mcqs, mock.mcqs);
      return c.json({
        session: existing,
        mcqs: mcqDocs.map(publicMcq),
        durationMinutes: mock.durationMinutes,
      });
    }

    // Charge credits.
    const events = await deps.ledger.read(principal.userId);
    const balance = computeBalance(events, principal.userId, now).total;
    if (balance < mock.costCredits) {
      throw new HTTPException(402, {
        message: `insufficient credits (have ${balance}, need ${mock.costCredits})`,
      });
    }
    const spendResult = spend(
      {
        userId: principal.userId,
        reason: 'mock_test',
        amount: mock.costCredits,
        sourceRef: sessionId,
        idempotencyKey: `mock_test:start:${sessionId}`,
      },
      events,
      { newId: deps.newId, now: deps.now },
    );
    if (spendResult.kind === 'spent') {
      await deps.ledger.append(spendResult.event);
    } else if (spendResult.kind === 'insufficient') {
      throw new HTTPException(402, { message: 'insufficient credits' });
    }
    // 'duplicate' -> credits were already charged for this session id; fine.

    const mcqDocs = await loadMcqs(deps.mcqs, mock.mcqs);
    if (mcqDocs.length !== mock.mcqs.length) {
      // We charged but couldn't materialise the test. Server bug; surface it.
      throw new HTTPException(500, {
        message: 'mock test references missing MCQs; please contact support',
      });
    }

    const expiresAt = asISODateTime(
      new Date(new Date(now).getTime() + mock.durationMinutes * 60_000).toISOString(),
    );
    const session: MockTestSession = {
      id: sessionId,
      userId: principal.userId,
      mockTest: mockTestId,
      startedAt: now,
      expiresAt,
      submittedAt: null,
      status: 'in_progress',
      score: -1,
      total: mock.mcqs.length,
      answers: {},
      costCredits: mock.costCredits,
      createdAt: now,
    };
    await deps.sessions.put(session);

    deps.logger.info('mock_test.start', {
      userId: principal.userId,
      mockTestId,
      sessionId,
      cost: mock.costCredits,
    });

    return c.json({
      session,
      mcqs: mcqDocs.map(publicMcq),
      durationMinutes: mock.durationMinutes,
    });
  });

  return app;
}

/** Mounted at /v1/mock-test-sessions */
export function makeMockTestSessionsRoutes(deps: MockTestsRoutesDeps): Hono {
  const app = new Hono();

  app.post('/:sessionId/complete', async (c) => {
    const principal = requireAuth(c);
    const sessionId = c.req.param('sessionId');
    if (!sessionId.startsWith(`mts:${principal.userId}:`)) {
      throw new HTTPException(403, { message: 'session does not belong to caller' });
    }
    const session = await deps.sessions.get(sessionId);
    if (!session) throw new HTTPException(404, { message: 'session not found' });
    if (session.status === 'submitted') {
      // Idempotent: re-submit returns the same grading.
      return c.json({ session, alreadySubmitted: true });
    }

    const body = await c.req.json().catch(() => null);
    const parsed = completeSchema.safeParse(body);
    if (!parsed.success) {
      throw new HTTPException(400, {
        message: parsed.error.issues[0]?.message ?? 'invalid body',
      });
    }

    let correct = 0;
    const answers: Record<string, 'A' | 'B' | 'C' | 'D' | null> = {};
    const explanations: { mcqId: string; correctOption: string; explanation: string }[] = [];
    for (const a of parsed.data.answers) {
      const mcq = await deps.mcqs.get(asMcqId(a.mcqId));
      if (!mcq) continue;
      answers[mcq.id] = a.chosen;
      explanations.push({
        mcqId: mcq.id,
        correctOption: mcq.correctOption,
        explanation: mcq.explanation,
      });
      if (a.chosen === mcq.correctOption) correct += 1;
    }

    const total = parsed.data.answers.length;
    const submittedAt = deps.now();
    const updated = await deps.sessions.submit(
      sessionId,
      correct,
      total,
      answers,
      submittedAt,
    );
    if (!updated) throw new HTTPException(404, { message: 'session not found' });

    // Pass bonus: if the user scores >= PASS_THRESHOLD, refund their cost +
    // award them an admin_grant style bonus. This makes paying for a mock
    // feel rewarding rather than a tax.
    let bonusAwarded = 0;
    let balanceAfter = computeBalance(
      await deps.ledger.read(principal.userId),
      principal.userId,
      submittedAt,
    ).total;
    const passed = total > 0 && correct / total >= PASS_THRESHOLD;
    if (passed) {
      const bonusEvents = await deps.ledger.read(principal.userId);
      const bonus = award(
        {
          userId: principal.userId,
          source: 'admin_grant',
          amount: updated.costCredits + Math.round(updated.costCredits * 0.5),
          sourceRef: sessionId,
          idempotencyKey: `mock_test:bonus:${sessionId}`,
        },
        bonusEvents,
        { newId: deps.newId, now: deps.now },
      );
      if (bonus.kind === 'awarded') {
        await deps.ledger.append(bonus.event);
        bonusAwarded = bonus.event.amount;
        balanceAfter = bonus.newBalance;
      } else if (bonus.kind === 'duplicate') {
        bonusAwarded = bonus.event.amount;
        balanceAfter = bonus.balance;
      }
    }

    deps.logger.info('mock_test.complete', {
      userId: principal.userId,
      sessionId,
      score: correct,
      total,
      passed,
      bonusAwarded,
    });

    return c.json({
      session: updated,
      passed,
      bonusAwarded,
      balance: balanceAfter,
      explanations,
    });
  });

  return app;
}

async function loadMcqs(store: McqStore, ids: McqId[]): Promise<MCQ[]> {
  const out: MCQ[] = [];
  for (const id of ids) {
    const m = await store.get(id);
    if (m) out.push(m);
  }
  return out;
}
