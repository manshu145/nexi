import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { HTTPException } from 'hono/http-exception';
import { authMiddleware, makeVerifier } from './auth.js';
import type { Env } from './env.js';
import type { Logger } from './logger.js';
import { makeCreditsRoutes, defaultEngineDeps, InMemoryLedgerStore, type LedgerStore } from './routes/credits.js';
import { makeHealthRoutes } from './routes/health.js';

/**
 * Build the Hono app.
 *
 * Pure factory: no listeners, no I/O. The composition root lives in
 * `server.ts` (Node) and will eventually live in a Cloud Run-friendly entry
 * point that imports this builder.
 *
 * Tests construct a fresh app per test via this factory, injecting an
 * in-memory ledger and a stub auth verifier.
 */
export interface AppDeps {
  env: Env;
  logger: Logger;
  ledger?: LedgerStore;
}

export function buildApp(deps: AppDeps): Hono {
  const { env, logger } = deps;
  const ledger = deps.ledger ?? new InMemoryLedgerStore();
  const verifier = makeVerifier(env);

  const app = new Hono();

  // CORS for browser clients (web app, admin panel).
  app.use(
    '*',
    cors({
      origin: (origin) => (env.CORS_ALLOWED_ORIGINS.includes(origin) ? origin : null),
      allowMethods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
      allowHeaders: ['Authorization', 'Content-Type', 'X-Idempotency-Key'],
      maxAge: 600,
      credentials: true,
    }),
  );

  // Per-request log binding.
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

  // Public, unauthenticated routes.
  app.route('/', makeHealthRoutes(env));

  app.get('/', (c) =>
    c.json({
      service: 'nexigrate-api',
      version: '0.1.0',
      docs: 'https://github.com/manshu145/nexi/blob/main/apps/api/README.md',
    }),
  );

  // Authenticated v1 surface.
  const v1 = new Hono();
  v1.use('*', authMiddleware(verifier));
  v1.route('/credits', makeCreditsRoutes({ ledger, logger, ...defaultEngineDeps() }));
  app.route('/v1', v1);

  // Centralised error mapping.
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
