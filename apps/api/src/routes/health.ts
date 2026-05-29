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
 *
 * PR-17 also adds GET /diag/ai/test which actually CALLS each provider
 * with a tiny prompt and reports up/down + latency. That's how we tell
 * within seconds when a key has been rotated, throttled, or revoked --
 * without that endpoint, the only signal was a 503 cascade in /assessment
 * and a generic "AI service may be busy" toast at the user.
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

  /**
   * Live reachability probe. Tiny prompt to each configured provider with
   * a 10s timeout per call -- responds with up/down + latency + error
   * snippet per provider. NOT auth-gated (public diag like /diag/ai),
   * intentionally low-cost (~$0.0001 per probe) so admin can curl this
   * from anywhere without managing tokens. Output is sanitised: never
   * echoes the key, only the failure mode / first 200 chars of error.
   */
  app.get('/diag/ai/test', async (c) => {
    const startedAt = Date.now();
    const PROBE_PROMPT = 'Reply with the single word OK and nothing else.';
    const TIMEOUT_MS = 10_000;

    type ProbeResult = { ok: boolean; latencyMs: number; model?: string; sample?: string; error?: string };

    async function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
      return Promise.race([
        p,
        new Promise<T>((_, reject) => setTimeout(() => reject(new Error(`probe_timeout_${ms}ms`)), ms)),
      ]);
    }

    async function probeGroq(): Promise<ProbeResult> {
      if (!isConfigured(env.GROQ_API_KEY)) return { ok: false, latencyMs: 0, error: 'not_configured' };
      const t0 = Date.now();
      try {
        const res = await withTimeout(fetch('https://api.groq.com/openai/v1/chat/completions', {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${env.GROQ_API_KEY}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            model: 'llama-3.3-70b-versatile',
            messages: [{ role: 'user', content: PROBE_PROMPT }],
            max_tokens: 10,
          }),
        }), TIMEOUT_MS);
        const latencyMs = Date.now() - t0;
        if (!res.ok) {
          const body = await res.text().catch(() => '');
          return { ok: false, latencyMs, error: `HTTP ${res.status}: ${body.slice(0, 200)}` };
        }
        const data = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> };
        const sample = data.choices?.[0]?.message?.content?.trim().slice(0, 50) ?? '';
        return { ok: true, latencyMs, model: 'llama-3.3-70b-versatile', sample };
      } catch (err) {
        return { ok: false, latencyMs: Date.now() - t0, error: err instanceof Error ? err.message.slice(0, 200) : String(err).slice(0, 200) };
      }
    }

    async function probeOpenAI(): Promise<ProbeResult> {
      if (!isConfigured(env.OPENAI_API_KEY)) return { ok: false, latencyMs: 0, error: 'not_configured' };
      const t0 = Date.now();
      try {
        const res = await withTimeout(fetch('https://api.openai.com/v1/chat/completions', {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${env.OPENAI_API_KEY}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            model: 'gpt-4o-mini',
            messages: [{ role: 'user', content: PROBE_PROMPT }],
            max_tokens: 10,
          }),
        }), TIMEOUT_MS);
        const latencyMs = Date.now() - t0;
        if (!res.ok) {
          const body = await res.text().catch(() => '');
          return { ok: false, latencyMs, error: `HTTP ${res.status}: ${body.slice(0, 200)}` };
        }
        const data = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> };
        const sample = data.choices?.[0]?.message?.content?.trim().slice(0, 50) ?? '';
        return { ok: true, latencyMs, model: 'gpt-4o-mini', sample };
      } catch (err) {
        return { ok: false, latencyMs: Date.now() - t0, error: err instanceof Error ? err.message.slice(0, 200) : String(err).slice(0, 200) };
      }
    }

    async function probeGemini(): Promise<ProbeResult> {
      if (!isConfigured(env.GEMINI_API_KEY)) return { ok: false, latencyMs: 0, error: 'not_configured' };
      const t0 = Date.now();
      try {
        const res = await withTimeout(fetch(
          `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${env.GEMINI_API_KEY}`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              contents: [{ parts: [{ text: PROBE_PROMPT }] }],
              generationConfig: { maxOutputTokens: 10 },
            }),
          },
        ), TIMEOUT_MS);
        const latencyMs = Date.now() - t0;
        if (!res.ok) {
          const body = await res.text().catch(() => '');
          return { ok: false, latencyMs, error: `HTTP ${res.status}: ${body.slice(0, 200)}` };
        }
        const data = (await res.json()) as { candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }> };
        const sample = data.candidates?.[0]?.content?.parts?.[0]?.text?.trim().slice(0, 50) ?? '';
        return { ok: true, latencyMs, model: 'gemini-2.0-flash', sample };
      } catch (err) {
        return { ok: false, latencyMs: Date.now() - t0, error: err instanceof Error ? err.message.slice(0, 200) : String(err).slice(0, 200) };
      }
    }

    const [groqResult, openaiResult, geminiResult] = await Promise.all([
      probeGroq(),
      probeOpenAI(),
      probeGemini(),
    ]);

    const allOk = groqResult.ok || openaiResult.ok || geminiResult.ok; // At least one provider up = chain functional
    const totalMs = Date.now() - startedAt;
    return c.json({
      ok: allOk,
      summary: allOk ? 'at least one provider reachable' : 'ALL providers unreachable — assessment + chat will 503',
      totalMs,
      providers: {
        groq: groqResult,
        openai: openaiResult,
        gemini: geminiResult,
      },
      timestamp: new Date().toISOString(),
    }, allOk ? 200 : 503);
  });

  return app;
}
