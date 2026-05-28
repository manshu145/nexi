import { Hono } from 'hono';

export function makeHealthRoutes(): Hono {
  const app = new Hono();
  app.get('/healthz', (c) => c.json({ status: 'ok', version: '1.0.0', timestamp: new Date().toISOString() }));
  app.get('/readyz', (c) => c.json({ status: 'ready' }));
  return app;
}

/**
 * Diagnostic endpoint -- shows AI provider configuration STATUS without
 * leaking the keys themselves. Pre-PR-06 this returned the first 6
 * characters of each key plus the full length, which is enough material
 * for an attacker to fingerprint a leaked key from logs / GitHub history.
 * The current shape returns only `configured: boolean` so ops can tell at
 * a glance which providers are wired without exposing key material.
 */
export function makeDiagRoutes(env: { GROQ_API_KEY?: string; OPENAI_API_KEY?: string; GEMINI_API_KEY?: string; PERSISTENCE?: string }): Hono {
  const app = new Hono();
  const isConfigured = (v?: string) => !!(v && v.length > 5);
  app.get('/diag/ai', (c) => {
    return c.json({
      providers: {
        groq:   { configured: isConfigured(env.GROQ_API_KEY) },
        openai: { configured: isConfigured(env.OPENAI_API_KEY) },
        gemini: { configured: isConfigured(env.GEMINI_API_KEY) },
      },
      persistence: env.PERSISTENCE ?? 'not set',
      timestamp: new Date().toISOString(),
    });
  });
  return app;
}
