import { Hono } from 'hono';

export function makeHealthRoutes(): Hono {
  const app = new Hono();
  app.get('/healthz', (c) => c.json({ status: 'ok', version: '1.0.0', timestamp: new Date().toISOString() }));
  app.get('/readyz', (c) => c.json({ status: 'ready' }));
  return app;
}

/** Diagnostic endpoint — shows AI key status without exposing values */
export function makeDiagRoutes(env: { GROQ_API_KEY?: string; OPENAI_API_KEY?: string; GEMINI_API_KEY?: string; PERSISTENCE?: string }): Hono {
  const app = new Hono();
  app.get('/diag/ai', (c) => {
    return c.json({
      providers: {
        groq: { configured: !!(env.GROQ_API_KEY && env.GROQ_API_KEY.length > 5), keyLength: env.GROQ_API_KEY?.length ?? 0, prefix: env.GROQ_API_KEY?.slice(0, 6) ?? '' },
        openai: { configured: !!(env.OPENAI_API_KEY && env.OPENAI_API_KEY.length > 5), keyLength: env.OPENAI_API_KEY?.length ?? 0, prefix: env.OPENAI_API_KEY?.slice(0, 6) ?? '' },
        gemini: { configured: !!(env.GEMINI_API_KEY && env.GEMINI_API_KEY.length > 5), keyLength: env.GEMINI_API_KEY?.length ?? 0, prefix: env.GEMINI_API_KEY?.slice(0, 6) ?? '' },
      },
      persistence: env.PERSISTENCE ?? 'not set',
      timestamp: new Date().toISOString(),
    });
  });
  return app;
}
