import { Hono } from 'hono';
import type { AIModelResolver } from '../lib/aiModelResolver.js';
import { pickProbeModel } from '../lib/aiProviderRegistry.js';

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
 *
 * PR-29 (auto-resolver): the Gemini probe is no longer hardcoded to
 * `gemini-2.0-flash`. It asks the resolver (or, when no resolver is
 * wired, the registry's `pickProbeModel`) which model is currently
 * topmost-currently-working in the chain, probes that, and reports
 * which model actually fired. This is how the founder can confirm
 * "the auto-switch picked 2.5-flash because 2.0-flash was 404'd" by
 * eyeballing this endpoint after a fresh GCP key.
 */
export function makeDiagRoutes(
  env: { GROQ_API_KEY?: string; OPENAI_API_KEY?: string; GEMINI_API_KEY?: string; PERSISTENCE?: string },
  resolver?: AIModelResolver | null,
): Hono {
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
   * Live reachability probe. Tiny prompt to each configured provider
   * with a 10s timeout per call. Output is sanitised and never echoes
   * the key. Each provider's "model" field reports which entry in the
   * chain the resolver chose -- the founder uses this to confirm
   * auto-switch fired ("ok=true model=gemini-2.5-flash" after a fresh
   * key signals the chain stepped past the deprecated 2.0-flash).
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

    /**
     * Resolve (apiKey, model) for the probe. Prefers the auto-resolver
     * if wired (admin-saved key + chain-aware model pick), falls back
     * to env-var + registry probe model otherwise.
     */
    async function resolve(provider: 'groq' | 'openai' | 'gemini'): Promise<{ apiKey: string; model: string } | null> {
      if (resolver) {
        const r = await resolver.resolve(provider, { tier: 'flash' });
        if (r) return { apiKey: r.apiKey, model: r.model };
      }
      const envKey = provider === 'groq' ? env.GROQ_API_KEY
        : provider === 'openai' ? env.OPENAI_API_KEY
        : env.GEMINI_API_KEY;
      if (!isConfigured(envKey)) return null;
      const m = pickProbeModel(provider);
      if (!m) return null;
      return { apiKey: envKey!, model: m };
    }

    async function probeGroq(): Promise<ProbeResult> {
      const r = await resolve('groq');
      if (!r) return { ok: false, latencyMs: 0, error: 'not_configured' };
      const t0 = Date.now();
      try {
        const res = await withTimeout(fetch('https://api.groq.com/openai/v1/chat/completions', {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${r.apiKey}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            model: r.model,
            messages: [{ role: 'user', content: PROBE_PROMPT }],
            max_tokens: 10,
          }),
        }), TIMEOUT_MS);
        const latencyMs = Date.now() - t0;
        if (!res.ok) {
          const body = await res.text().catch(() => '');
          if (resolver) await resolver.reportModelFailure('groq', r.model, `HTTP ${res.status}: ${body.slice(0, 200)}`);
          return { ok: false, latencyMs, model: r.model, error: `HTTP ${res.status}: ${body.slice(0, 200)}` };
        }
        const data = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> };
        const sample = data.choices?.[0]?.message?.content?.trim().slice(0, 50) ?? '';
        if (resolver) await resolver.reportModelSuccess('groq', r.model);
        return { ok: true, latencyMs, model: r.model, sample };
      } catch (err) {
        return { ok: false, latencyMs: Date.now() - t0, model: r.model, error: err instanceof Error ? err.message.slice(0, 200) : String(err).slice(0, 200) };
      }
    }

    async function probeOpenAI(): Promise<ProbeResult> {
      const r = await resolve('openai');
      if (!r) return { ok: false, latencyMs: 0, error: 'not_configured' };
      const t0 = Date.now();
      try {
        const res = await withTimeout(fetch('https://api.openai.com/v1/chat/completions', {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${r.apiKey}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            model: r.model,
            messages: [{ role: 'user', content: PROBE_PROMPT }],
            max_tokens: 10,
          }),
        }), TIMEOUT_MS);
        const latencyMs = Date.now() - t0;
        if (!res.ok) {
          const body = await res.text().catch(() => '');
          if (resolver) await resolver.reportModelFailure('openai', r.model, `HTTP ${res.status}: ${body.slice(0, 200)}`);
          return { ok: false, latencyMs, model: r.model, error: `HTTP ${res.status}: ${body.slice(0, 200)}` };
        }
        const data = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> };
        const sample = data.choices?.[0]?.message?.content?.trim().slice(0, 50) ?? '';
        if (resolver) await resolver.reportModelSuccess('openai', r.model);
        return { ok: true, latencyMs, model: r.model, sample };
      } catch (err) {
        return { ok: false, latencyMs: Date.now() - t0, model: r.model, error: err instanceof Error ? err.message.slice(0, 200) : String(err).slice(0, 200) };
      }
    }

    async function probeGemini(): Promise<ProbeResult> {
      const r = await resolve('gemini');
      if (!r) return { ok: false, latencyMs: 0, error: 'not_configured' };
      const t0 = Date.now();
      try {
        const res = await withTimeout(fetch(
          `https://generativelanguage.googleapis.com/v1beta/models/${r.model}:generateContent?key=${r.apiKey}`,
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
          // Auto-blacklist on deprecation: this is exactly the founder's
          // pain point — fresh GCP key returning 404 on 2.0-flash. The
          // resolver pattern-matches the error and blacklists for 5 min;
          // the next probe (or the next AI call from any user) will
          // pick the next entry in the chain.
          if (resolver) await resolver.reportModelFailure('gemini', r.model, `HTTP ${res.status}: ${body.slice(0, 200)}`);
          return { ok: false, latencyMs, model: r.model, error: `HTTP ${res.status}: ${body.slice(0, 200)}` };
        }
        const data = (await res.json()) as { candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }> };
        const sample = data.candidates?.[0]?.content?.parts?.[0]?.text?.trim().slice(0, 50) ?? '';
        if (resolver) await resolver.reportModelSuccess('gemini', r.model);
        return { ok: true, latencyMs, model: r.model, sample };
      } catch (err) {
        return { ok: false, latencyMs: Date.now() - t0, model: r.model, error: err instanceof Error ? err.message.slice(0, 200) : String(err).slice(0, 200) };
      }
    }

    const [groqResult, openaiResult, geminiResult] = await Promise.all([
      probeGroq(),
      probeOpenAI(),
      probeGemini(),
    ]);

    // PR-48: Also probe ALL admin-panel providers (Anthropic, xAI, DeepSeek, Bedrock)
    type ExtraProvider = { id: string; baseUrl: string; model: string; format: 'openai' | 'anthropic' | 'bedrock' };
    const extras: ExtraProvider[] = [
      { id: 'anthropic', baseUrl: 'https://api.anthropic.com/v1/messages', model: 'claude-sonnet-4-20250514', format: 'anthropic' },
      { id: 'xai', baseUrl: 'https://api.x.ai/v1/chat/completions', model: 'grok-3-mini', format: 'openai' },
      { id: 'deepseek', baseUrl: 'https://api.deepseek.com/v1/chat/completions', model: 'deepseek-chat', format: 'openai' },
      { id: 'bedrock', baseUrl: '', model: '', format: 'bedrock' },
    ];

    async function probeExtra(p: ExtraProvider): Promise<ProbeResult> {
      if (!resolver) return { ok: false, latencyMs: 0, error: 'no_resolver' };
      try {
        const r = await resolver.resolve(p.id as any, { tier: 'flash' });
        if (!r?.apiKey) return { ok: false, latencyMs: 0, error: 'not_configured' };
        if (p.format === 'bedrock') return { ok: false, latencyMs: 0, model: r.model, error: 'key_present_probe_not_supported' };
        const t0 = Date.now();
        if (p.format === 'anthropic') {
          const res = await withTimeout(fetch(p.baseUrl, {
            method: 'POST',
            headers: { 'x-api-key': r.apiKey, 'Content-Type': 'application/json', 'anthropic-version': '2023-06-01' },
            body: JSON.stringify({ model: r.model || p.model, max_tokens: 10, messages: [{ role: 'user', content: PROBE_PROMPT }] }),
          }), TIMEOUT_MS);
          const latencyMs = Date.now() - t0;
          if (!res.ok) { const body = await res.text().catch(() => ''); return { ok: false, latencyMs, model: r.model, error: `HTTP ${res.status}: ${body.slice(0, 150)}` }; }
          return { ok: true, latencyMs, model: r.model || p.model, sample: 'OK' };
        }
        // OpenAI-compatible (xAI, DeepSeek)
        const res = await withTimeout(fetch(p.baseUrl, {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${r.apiKey}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ model: r.model || p.model, messages: [{ role: 'user', content: PROBE_PROMPT }], max_tokens: 10 }),
        }), TIMEOUT_MS);
        const latencyMs = Date.now() - t0;
        if (!res.ok) { const body = await res.text().catch(() => ''); return { ok: false, latencyMs, model: r.model, error: `HTTP ${res.status}: ${body.slice(0, 150)}` }; }
        const data = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> };
        return { ok: true, latencyMs, model: r.model || p.model, sample: data.choices?.[0]?.message?.content?.trim().slice(0, 50) ?? 'OK' };
      } catch (err) { return { ok: false, latencyMs: 0, error: err instanceof Error ? err.message.slice(0, 150) : 'probe_failed' }; }
    }

    const extraResults = await Promise.all(extras.map(p => probeExtra(p)));
    const extraMap: Record<string, ProbeResult> = {};
    extras.forEach((p, i) => { extraMap[p.id] = extraResults[i]!; });

    const allOk = groqResult.ok || openaiResult.ok || geminiResult.ok;
    const totalMs = Date.now() - startedAt;
    return c.json({
      ok: allOk,
      summary: allOk ? 'at least one provider reachable' : 'ALL providers unreachable — assessment + chat will 503',
      totalMs,
      providers: {
        groq: groqResult,
        openai: openaiResult,
        gemini: geminiResult,
        ...extraMap,
      },
      timestamp: new Date().toISOString(),
    }, allOk ? 200 : 503);
  });

  return app;
}
