import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { HTTPException } from 'hono/http-exception';
import { asExamSlug, type ExamSlug, type UserId } from '@nexigrate/shared';
import { authMiddleware, makeVerifier } from './auth.js';
import type { Env } from './env.js';
import {
  FirestoreAdminUserStore,
  InMemoryAdminUserStore,
  type AdminUserStore,
} from './lib/adminUserStore.js';
import {
  FirestoreChapterDraftStore,
  FirestoreChapterStore,
  InMemoryChapterDraftStore,
  InMemoryChapterStore,
  type ChapterDraftStore,
  type ChapterStore,
} from './lib/chapterDraftStore.js';
import {
  FirestoreChapterReadStore,
  InMemoryChapterReadStore,
  type ChapterReadStore,
} from './lib/chapterReadStore.js';
import {
  FirestoreExamDatesStore,
  InMemoryExamDatesStore,
  type ExamDatesStore,
} from './lib/examDatesStore.js';
import { getFirebaseFirestore } from './lib/firebaseAdmin.js';
import { FirestoreLedgerStore } from './lib/firestoreLedger.js';
import {
  FirestoreMcqAttemptStore,
  InMemoryMcqAttemptStore,
  type McqAttemptStore,
} from './lib/mcqAttemptStore.js';
import {
  FirestoreMcqDraftStore,
  InMemoryMcqDraftStore,
  type McqDraftStore,
} from './lib/mcqDraftStore.js';
import { FirestoreMcqStore, InMemoryMcqStore, type McqStore } from './lib/mcqStore.js';
import {
  FirestoreMockTestSessionStore,
  FirestoreMockTestStore,
  InMemoryMockTestSessionStore,
  InMemoryMockTestStore,
  type MockTestSessionStore,
  type MockTestStore,
} from './lib/mockTestStore.js';
import {
  FirestoreNexipediaArticleStore,
  FirestoreNexipediaDraftStore,
  InMemoryNexipediaArticleStore,
  InMemoryNexipediaDraftStore,
  type NexipediaArticleStore,
  type NexipediaDraftStore,
} from './lib/nexipediaArticleStore.js';
import { makeRateLimitMiddleware } from './lib/rateLimit.js';
import {
  FirestoreSubscriptionStore,
  InMemorySubscriptionStore,
  type SubscriptionStore,
} from './lib/subscriptionStore.js';
import { FirestoreUserStore, InMemoryUserStore, type UserStore } from './lib/userStore.js';
import type { Logger } from './logger.js';
import { makeAdminRoutes } from './routes/admin.js';
import { makeAdminAuthRoutes } from './routes/admin-auth.js';
import {
  makeAdminChapterRoutes,
  makeStudentChapterRoutes,
} from './routes/admin-chapters.js';
import { makeBillingRoutes } from './routes/billing.js';
import {
  defaultEngineDeps,
  InMemoryLedgerStore,
  makeCreditsRoutes,
  type LedgerStore,
} from './routes/credits.js';
import { makeExamDatesRoutes } from './routes/examDates.js';
import { makeHealthRoutes } from './routes/health.js';
import { makeMcqsRoutes, makeMcqSessionsRoutes } from './routes/mcqs.js';
import {
  makeMockTestSessionsRoutes,
  makeMockTestsRoutes,
} from './routes/mockTests.js';
import {
  makeAdminNexipediaRoutes,
  makeStudentNexipediaRoutes,
} from './routes/nexipedia.js';
import { makeProgressRoutes } from './routes/progress.js';
import { makeUsersRoutes } from './routes/users.js';

/**
 * Build the Hono app.
 *
 * Pure factory: no listeners, no I/O. The composition root lives in
 * `server.ts` (Node) and starts an HTTP listener around the returned app.
 *
 * Tests construct a fresh app per test via this factory, injecting the
 * in-memory stores and a stub auth verifier.
 */
export interface AppDeps {
  env: Env;
  logger: Logger;
  ledger?: LedgerStore;
  mcqs?: McqStore;
  users?: UserStore;
  subscriptions?: SubscriptionStore;
  drafts?: McqDraftStore;
  mockTests?: MockTestStore;
  mockTestSessions?: MockTestSessionStore;
  admins?: AdminUserStore;
  chapterDrafts?: ChapterDraftStore;
  chapters?: ChapterStore;
  chapterReads?: ChapterReadStore;
  nexipediaDrafts?: NexipediaDraftStore;
  nexipediaArticles?: NexipediaArticleStore;
  attempts?: McqAttemptStore;
  examDates?: ExamDatesStore;
}

export function buildApp(deps: AppDeps): Hono {
  const { env, logger } = deps;
  const useFirestore = env.PERSISTENCE === 'firestore';
  const fs = useFirestore ? getFirebaseFirestore(env) : null;

  const ledger =
    deps.ledger ?? (fs ? new FirestoreLedgerStore(fs) : new InMemoryLedgerStore());
  const mcqs = deps.mcqs ?? (fs ? new FirestoreMcqStore(fs) : new InMemoryMcqStore());
  const users = deps.users ?? (fs ? new FirestoreUserStore(fs) : new InMemoryUserStore());
  const subscriptions =
    deps.subscriptions ??
    (fs ? new FirestoreSubscriptionStore(fs) : new InMemorySubscriptionStore());
  const drafts =
    deps.drafts ?? (fs ? new FirestoreMcqDraftStore(fs) : new InMemoryMcqDraftStore());
  const mockTests =
    deps.mockTests ?? (fs ? new FirestoreMockTestStore(fs) : new InMemoryMockTestStore());
  const mockTestSessions =
    deps.mockTestSessions ??
    (fs ? new FirestoreMockTestSessionStore(fs) : new InMemoryMockTestSessionStore());
  const admins =
    deps.admins ?? (fs ? new FirestoreAdminUserStore(fs) : new InMemoryAdminUserStore());
  const chapterDrafts =
    deps.chapterDrafts ??
    (fs ? new FirestoreChapterDraftStore(fs) : new InMemoryChapterDraftStore());
  const chapters =
    deps.chapters ?? (fs ? new FirestoreChapterStore(fs) : new InMemoryChapterStore());
  const chapterReads =
    deps.chapterReads ??
    (fs ? new FirestoreChapterReadStore(fs) : new InMemoryChapterReadStore());
  const nexipediaDrafts =
    deps.nexipediaDrafts ??
    (fs ? new FirestoreNexipediaDraftStore(fs) : new InMemoryNexipediaDraftStore());
  const nexipediaArticles =
    deps.nexipediaArticles ??
    (fs ? new FirestoreNexipediaArticleStore(fs) : new InMemoryNexipediaArticleStore());
  const attempts =
    deps.attempts ??
    (fs ? new FirestoreMcqAttemptStore(fs) : new InMemoryMcqAttemptStore());
  const examDates =
    deps.examDates ??
    (fs ? new FirestoreExamDatesStore(fs) : new InMemoryExamDatesStore());

  const verifier = makeVerifier(env);
  const engineDeps = defaultEngineDeps();

  const getTargetExam = async (userId: UserId): Promise<ExamSlug> => {
    const u = await users.get(userId);
    return u?.targetExam ?? asExamSlug('jee-main');
  };

  const app = new Hono();

  app.use(
    '*',
    cors({
      origin: (origin) => (env.CORS_ALLOWED_ORIGINS.includes(origin) ? origin : null),
      allowMethods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
      allowHeaders: [
        'Authorization',
        'Content-Type',
        'X-Idempotency-Key',
        'X-User-Email',
        'X-User-Name',
        'X-User-Photo',
        'X-User-Provider',
      ],
      maxAge: 600,
      credentials: true,
    }),
  );

  // Per-IP rate limit guarding the whole API. Skips Cloud Run health
  // probes and Razorpay webhooks (which legitimately burst during
  // payment reconciliation).
  app.use(
    '*',
    makeRateLimitMiddleware({
      burst: 30,
      refillRatePerSecond: 2,
      logger,
      skip: (path) =>
        path === '/healthz' ||
        path === '/readyz' ||
        path === '/v1/billing/webhook',
    }),
  );

  app.use('*', async (c, next) => {
    const start = performance.now();
    const requestId = c.req.header('x-request-id') ?? cryptoRandom();
    c.header('x-request-id', requestId);
    await next();
    const ms = performance.now() - start;
    logger.info('request', {
      method: c.req.method,
      path: c.req.path,
      status: c.res.status,
      durationMs: Math.round(ms),
      requestId,
    });
  });

  app.route('/', makeHealthRoutes(env));

  app.get('/', (c) =>
    c.json({
      service: 'nexigrate-api',
      version: '0.1.0',
      docs: 'https://github.com/manshu145/nexi/blob/main/apps/api/README.md',
    }),
  );

  const v1 = new Hono();
  v1.use('*', authMiddleware(verifier));
  v1.route('/credits', makeCreditsRoutes({ ledger, logger, ...engineDeps }));
  v1.route('/users', makeUsersRoutes({ users, logger }));
  // Phase 12: progress snapshot for /progress page + dashboard widgets.
  // Mounted on the same /users prefix so the path is /v1/users/me/progress.
  v1.route(
    '/users',
    makeProgressRoutes({
      attempts,
      reads: chapterReads,
      chapters,
      users,
      logger,
      now: engineDeps.now,
    }),
  );
  v1.route(
    '/mcqs',
    makeMcqsRoutes({ mcqs, attempts, ledger, users, logger, ...engineDeps, getTargetExam }),
  );
  v1.route(
    '/mcq-sessions',
    makeMcqSessionsRoutes({ mcqs, attempts, ledger, users, logger, ...engineDeps, getTargetExam }),
  );
  v1.route(
    '/mock-tests',
    makeMockTestsRoutes({
      mockTests,
      sessions: mockTestSessions,
      mcqs,
      ledger,
      logger,
      ...engineDeps,
      getTargetExam,
    }),
  );
  v1.route(
    '/mock-test-sessions',
    makeMockTestSessionsRoutes({
      mockTests,
      sessions: mockTestSessions,
      mcqs,
      ledger,
      logger,
      ...engineDeps,
      getTargetExam,
    }),
  );
  v1.route('/billing', makeBillingRoutes({ env, subscriptions, logger }));
  // Phase 12: read-only exam dates endpoint for the dashboard countdown.
  v1.route('/exam-dates', makeExamDatesRoutes({ store: examDates, logger }));
  // Phase 9-10: AI-generated chapters. Student-facing list + read endpoints.
  // Phase 12: same routes now also expose `mark-read` and join with chapter_reads.
  v1.route(
    '/chapters',
    makeStudentChapterRoutes({
      chapters,
      reads: chapterReads,
      logger,
      now: engineDeps.now,
    }),
  );
  // Phase 14: Nexipedia (verified topic articles via 3-AI pipeline).
  v1.route(
    '/nexipedia',
    makeStudentNexipediaRoutes({
      articles: nexipediaArticles,
      logger,
      now: engineDeps.now,
    }),
  );
  // Phase 6: RBAC bootstrap routes. /admin/auth/* MUST be mounted BEFORE
  // /admin/* so its specific paths win over the generic admin route's
  // catch-all (Hono matches in registration order).
  v1.route('/admin/auth', makeAdminAuthRoutes({ env, admins, logger }));
  // Phase 9-10: admin chapter pipeline (3-AI generation + review + publish).
  // Mounted BEFORE the generic /admin so /admin/chapters/* and
  // /admin/chapter-drafts/* paths resolve here first.
  v1.route(
    '/admin',
    makeAdminChapterRoutes({
      env,
      drafts: chapterDrafts,
      chapters,
      admins,
      logger,
    }),
  );
  // Phase 14: admin Nexipedia pipeline. Mounted BEFORE the generic /admin
  // so its specific paths resolve first.
  v1.route(
    '/admin',
    makeAdminNexipediaRoutes({
      env,
      drafts: nexipediaDrafts,
      articles: nexipediaArticles,
      admins,
      logger,
    }),
  );
  v1.route('/admin', makeAdminRoutes({ env, drafts, mcqs, admins, logger }));
  app.route('/v1', v1);

  app.onError((err, c) => {
    if (err instanceof HTTPException) {
      logger.warn('http.error', {
        status: err.status,
        message: err.message,
        path: c.req.path,
      });
      return c.json({ error: err.message }, err.status);
    }
    logger.error('unhandled.error', {
      message: err.message,
      stack: err.stack,
      path: c.req.path,
    });
    return c.json({ error: 'internal server error' }, 500);
  });

  app.notFound((c) => c.json({ error: 'not found' }, 404));

  return app;
}

function cryptoRandom(): string {
  return globalThis.crypto.randomUUID();
}
