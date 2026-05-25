import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { HTTPException } from 'hono/http-exception';
import type { Env } from './env.js';
import { getFirebaseAuth, getFirebaseFirestore } from './lib/firebaseAdmin.js';
import { FirestoreUserStore, InMemoryUserStore, type UserStore } from './lib/userStore.js';
import { createAIEngine, type AIEngine } from './lib/aiEngine.js';
import { authMiddleware } from './auth.js';
import type { Logger } from './logger.js';
import { makeHealthRoutes } from './routes/health.js';
import { makeUsersRoutes } from './routes/users.js';
import { makeAssessmentRoutes } from './routes/assessment.js';

/**
 * Build the Hono app.
 *
 * Pure factory: no listeners, no I/O. The composition root lives in
 * `server.ts` (Node) and starts an HTTP listener around the returned app.
 */
export interface AppDeps {
  env: Env;
  logger: Logger;
  users?: UserStore;
  aiEngine?: AIEngine;
}

export function buildApp(deps: AppDeps): Hono {
  const { env, logger } = deps;
  const useFirestore = env.PERSISTENCE === 'firestore';
  const fs = useFirestore ? getFirebaseFirestore(env) : null;

  const users = deps.users ?? (fs ? new FirestoreUserStore(fs) : new InMemoryUserStore());
  const aiEngine = deps.aiEngine ?? createAIEngine(env, logger);
  const firebaseAuth = getFirebaseAuth(env);

  const app = new Hono();

  // CORS
  app.use(
    '*',
    cors({
      origin: (origin) => (env.CORS_ALLOWED_ORIGINS.includes(origin) ? origin : null),
      allowMethods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
      allowHeaders: [
        'Authorization',
        'Content-Type',
        'X-User-Email',
        'X-User-Name',
        'X-User-Photo',
        'X-User-Provider',
      ],
      maxAge: 600,
      credentials: true,
    }),
  );

  // Request logging
  app.use('*', async (c, next) => {
    const start = performance.now();
    const requestId = c.req.header('x-request-id') ?? crypto.randomUUID();
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

  // Health routes (unauthenticated)
  app.route('/', makeHealthRoutes());

  // Root info
  app.get('/', (c) =>
    c.json({
      service: 'nexigrate-api',
      version: '1.0.0',
      docs: 'https://github.com/manshu145/nexi',
    }),
  );

  // Authenticated v1 routes
  const v1 = new Hono();
  v1.use('*', authMiddleware(firebaseAuth));
  v1.route('/users', makeUsersRoutes({ users, logger }));
  v1.route('/assessment', makeAssessmentRoutes({ users, aiEngine, logger }));
  app.route('/v1', v1);

  // Error handler
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
