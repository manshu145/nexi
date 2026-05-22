import { Hono } from 'hono';
import type { Env } from '../env.js';

/**
 * Health and readiness routes.
 *
 * Cloud Run uses `/healthz` for the liveness probe (am I up?) and `/readyz`
 * for readiness (am I ready to serve traffic?). For now they are equivalent
 * because the API has no slow-warming dependencies; once we wire Firestore,
 * `/readyz` will additionally check that the Admin SDK is initialised.
 */
export function makeHealthRoutes(env: Pick<Env, 'NODE_ENV'>): Hono {
  const app = new Hono();

  app.get('/healthz', (c) =>
    c.json({
      ok: true,
      service: 'nexigrate-api',
      env: env.NODE_ENV,
      ts: new Date().toISOString(),
    }),
  );

  app.get('/readyz', (c) =>
    c.json({
      ok: true,
      service: 'nexigrate-api',
      env: env.NODE_ENV,
      ts: new Date().toISOString(),
    }),
  );

  return app;
}
