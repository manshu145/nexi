import { Hono } from 'hono';

export function makeHealthRoutes(): Hono {
  const app = new Hono();

  app.get('/healthz', (c) =>
    c.json({ status: 'ok', version: '1.0.0', timestamp: new Date().toISOString() }),
  );

  app.get('/readyz', (c) => c.json({ status: 'ready' }));

  return app;
}
