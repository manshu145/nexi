import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { HTTPException } from 'hono/http-exception';
import { asExamSlug, type ExamSlug, type UserId } from '@nexigrate/shared';
import { authMiddleware, makeVerifier } from './auth.js';
import type { Env } from './env.js';
import { getFirebaseFirestore } from './lib/firebaseAdmin.js';
import { FirestoreLedgerStore } from './lib/firestoreLedger.js';
import { FirestoreMcqStore, InMemoryMcqStore, type McqStore } from './lib/mcqStore.js';
import {
  FirestoreSubscriptionStore,
  InMemorySubscriptionStore,
  type SubscriptionStore,
} from './lib/subscriptionStore.js';
import { FirestoreUserStore, InMemoryUserStore, type UserStore } from './lib/userStore.js';
import { createAIEngine } from './lib/aiEngine.js';
import { makeRateLimitMiddleware } from './lib/rateLimit.js';
import type { Logger } from './logger.js';
import { makeBillingRoutes } from './routes/billing.js';
import {
  defaultEngineDeps,
  InMemoryLedgerStore,
  makeCreditsRoutes,
  type LedgerStore,
} from './routes/credits.js';
import { makeHealthRoutes } from './routes/health.js';
import { makeMcqsRoutes, makeMcqSessionsRoutes } from './routes/mcqs.js';
import { makeUsersRoutes } from './routes/users.js';
import { makeAdaptiveRoutes } from './routes/adaptive.js';
import { makePersonalizedRoutes } from './routes/personalized.js';

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

  const verifier = makeVerifier(env);
  const engineDeps = defaultEngineDeps();

  // AI Engine for personalized content generation
  const ai = createAIEngine({
    openaiApiKey: env.OPENAI_API_KEY,
    geminiApiKey: env.GEMINI_API_KEY,
    groqApiKey: env.GROQ_API_KEY,
  });

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

  // Per-IP rate limit guarding the whole API. Tuned generously enough that
  // a normal classroom on shared NAT won't trip; see lib/rateLimit.ts.
  // Skips Cloud Run health probes and Razorpay webhooks (which legitimately
  // burst during payment reconciliation).
  app.use(
    '*',
    makeRateLimitMiddleware({
      burst: 30,
      refillRatePerSecond: 2, // 120 req / minute sustained
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
  v1.route(
    '/mcqs',
    makeMcqsRoutes({ mcqs, ledger, users, logger, ...engineDeps, getTargetExam }),
  );
  v1.route(
    '/mcq-sessions',
    makeMcqSessionsRoutes({ mcqs, ledger, users, logger, ...engineDeps, getTargetExam }),
  );
  v1.route('/billing', makeBillingRoutes({ env, subscriptions, logger }));
  v1.route('/adaptive', makeAdaptiveRoutes({ ai, users, logger }));
  v1.route('/ai', makePersonalizedRoutes({ ai, users, logger, openaiApiKey: env.OPENAI_API_KEY }));
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
