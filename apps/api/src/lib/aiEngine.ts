import Groq from 'groq-sdk';
import OpenAI from 'openai';
import { buildChapterVerifier, type VerificationVerdict, type VerifyChapterFn } from '@nexigrate/ai-pipeline';
import type { Env } from '../env.js';
import type { Logger } from '../logger.js';
import type { AdminStore } from './adminStore.js';
import type { AISpendStore } from './aiSpendStore.js';
import type { UserContext } from './chapterStore.js';
import type { AIModelResolver, ResolvedModel } from './aiModelResolver.js';
import { isModelDeprecationError } from './aiModelResolver.js';
import { getCostPer1k } from './aiProviderRegistry.js';

export interface MCQOption { key: 'A' | 'B' | 'C' | 'D'; text: string; }
export interface GeneratedMCQ { id: string; question: string; options: MCQOption[]; correctOption: 'A' | 'B' | 'C' | 'D'; explanation: string; difficulty: 'easy' | 'medium' | 'hard'; subject?: string; topic?: string; }
export interface AssessmentResult { score: number; total: number; level: 'beginner' | 'intermediate' | 'advanced'; message: string; messageHi: string; weakAreas?: string[]; strongAreas?: string[]; }

export interface GeneratedSyllabus {
  exam: string;
  examName: string;
  subjects: { slug: string; name: string; nameHi: string; icon: string; chapters: { slug: string; name: string; nameHi: string; order: number; estimatedMinutes: number; }[]; }[];
}

export type VisualizationType = 'diagram' | 'mindmap' | 'flowchart' | 'timeline' | 'image';
export interface VisualizationResult { type: 'mermaid' | 'image'; content: string; /* mermaid code or image URL */ }

export interface StageResults {
  questions: GeneratedMCQ[];
  answers: { questionId: string; chosen: string | null }[];
}

export interface AIEngine {
  generateAssessmentQuestions(examSlug: string, language: 'en' | 'hi', count?: number): Promise<GeneratedMCQ[]>;
  generateStage1Questions(examSlug: string, language: 'en' | 'hi'): Promise<GeneratedMCQ[]>;
  generateStage2Questions(examSlug: string, language: 'en' | 'hi', stage1Results: StageResults): Promise<GeneratedMCQ[]>;
  generateStage3Questions(examSlug: string, language: 'en' | 'hi', stage1Results: StageResults, stage2Results: StageResults): Promise<GeneratedMCQ[]>;
  scoreAssessment(questions: GeneratedMCQ[], answers: { questionId: string; chosen: string | null }[]): Promise<AssessmentResult>;
  scoreMultiStageAssessment(stage1: StageResults, stage2: StageResults, stage3: StageResults): Promise<AssessmentResult>;
  generateChapterContent(chapter: string, subject: string, exam: string, language: 'en' | 'hi', userContext?: UserContext): Promise<string>;
  generateChapterMCQs(chapter: string, subject: string, exam: string, language: 'en' | 'hi', count?: number, seed?: string, chapterContent?: string, userLevel?: 'beginner' | 'intermediate' | 'advanced'): Promise<GeneratedMCQ[]>;
  generateMermaidDiagram(chapter: string, subject: string, exam: string): Promise<string>;
  generateVisualization(topic: string, subject: string, exam: string, type: VisualizationType): Promise<VisualizationResult>;
  generateSyllabus(examSlug: string, examName: string, level: string): Promise<GeneratedSyllabus>;
  generateSelectionDiagram(selectedText: string, subject: string, language: 'en' | 'hi'): Promise<string>;
  generateCurrentAffairsQuiz(headlines: string, count?: number, language?: 'en' | 'hi'): Promise<GeneratedMCQ[]>;
  translateToHindi(items: { headline: string; summary: string }[]): Promise<{ headline: string; summary: string }[]>;
  chat(messages: { role: 'user' | 'assistant'; content: string }[], userContext: { exam: string; level: string; language: 'en' | 'hi' }, preferredModel?: 'gpt4o' | 'groq' | 'gemini'): Promise<string>;
  /**
   * Record a user's USD cost contribution for cap enforcement (lock §3.8).
   * Called by AI-using routes AFTER the engine returns, so the next
   * request from the same user sees the updated daily total. No-op if
   * the engine wasn't wired with an AISpendStore (in-memory dev mode).
   */
  recordAICost(userId: string, costUsd: number): Promise<void>;
}

/** Helper to log AI calls to adminStore for system logs visibility */
function logAICallToStore(
  adminStore: AdminStore | null,
  model: string,
  tokens: number,
  cost: number,
  latencyMs: number,
  userId?: string,
  extra?: { status?: 'success' | 'error'; endpoint?: string; provider?: string; error?: string; requestPreview?: string; responsePreview?: string }
) {
  if (!adminStore) return;
  adminStore.logAICall({
    model, tokens, cost, latencyMs, userId, timestamp: new Date().toISOString(),
    status: extra?.status ?? 'success',
    endpoint: extra?.endpoint,
    provider: extra?.provider,
    error: extra?.error,
    requestPreview: extra?.requestPreview?.slice(0, 300),
    responsePreview: extra?.responsePreview?.slice(0, 500),
  }).catch(() => {});
}

/** Estimate token count from text length */
function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

/** Estimate cost based on model and tokens. Pulls per-1k rates from the
 *  registry so the rate map lives in one place rather than being
 *  duplicated here. Falls back to a microcent if the model id isn't in
 *  the registry (which can happen when an AI call site drifts ahead of
 *  the registry; better to bill ~zero than to crash on undefined). */
function estimateCost(model: string, tokens: number): number {
  // Try every provider's model list — the registry already does this
  // scan when called with a non-matching providerId, so we just pass
  // an empty string and let `getCostPer1k` walk all providers.
  return getCostPer1k('', model) * tokens;
}

export function createAIEngine(
  env: Env,
  logger: Logger,
  adminStore?: AdminStore | null,
  aiSpend?: AISpendStore | null,
  resolver?: AIModelResolver | null,
): AIEngine {
  // Log which AI providers are available at startup
  const hasGroq = !!(env.GROQ_API_KEY && env.GROQ_API_KEY.length > 5);
  const hasOpenai = !!(env.OPENAI_API_KEY && env.OPENAI_API_KEY.length > 5);
  const hasGemini = !!(env.GEMINI_API_KEY && env.GEMINI_API_KEY.length > 5);
  logger.info('ai.providers_init', {
    groq: hasGroq, openai: hasOpenai, gemini: hasGemini,
    groqKeyLen: env.GROQ_API_KEY?.length ?? 0,
    openaiKeyLen: env.OPENAI_API_KEY?.length ?? 0,
    geminiKeyLen: env.GEMINI_API_KEY?.length ?? 0,
  });
  const groq = hasGroq ? new Groq({ apiKey: env.GROQ_API_KEY }) : null;
  const openai = hasOpenai ? new OpenAI({ apiKey: env.OPENAI_API_KEY }) : null;
  const store = adminStore ?? null;

  /**
   * Auto-switch helper for direct Gemini REST calls.
   *
   * Replaces the 9 hardcoded `gemini-2.0-flash` URL constructions that
   * used to live throughout this file. Each call site previously read:
   *
   *   const res = await fetch(`https://...models/gemini-2.0-flash:generateContent?key=${env.GEMINI_API_KEY}`, { body: JSON.stringify({ contents: [...], generationConfig: {...} }) });
   *
   * Now reads:
   *
   *   const res = await callGemini({ promptText, generationConfig, tier });
   *
   * Behaviour:
   *   1. Resolve the (apiKey, model) for gemini at the requested tier.
   *      No resolver / no key configured => returns { ok: false, ... }
   *      so the caller's outer fallback chain proceeds untouched.
   *   2. POST to `models/{model}:generateContent`.
   *   3. On 4xx with a deprecation pattern (model not available, 404
   *      with /models/, etc), the resolver blacklists the model for
   *      5 minutes and we re-resolve + retry ONCE with the next chain
   *      entry. Subsequent calls in the same minute hit the new
   *      model directly without probing the dead one.
   *   4. On 5xx / network errors, NO blacklist -- those are flaky-
   *      provider, not dead-model. Returns the failure to the caller
   *      so its outer chain runs.
   *
   * @returns { ok: true, text, model } on success, { ok: false, error,
   *   model? } on failure (model present iff a resolve happened).
   */
  type GeminiCallOpts = {
    prompt: string;
    /** Pass through to the Gemini API generationConfig. */
    generationConfig?: Record<string, unknown>;
    /** Defaults to flash. Use 'pro' for grounded research / search. */
    tier?: 'flash' | 'pro' | 'image';
    /** Pass-through tools for Gemini (e.g. googleSearch grounding). */
    tools?: unknown[];
    /** Optional contents override (multimodal). Otherwise we wrap
     *  `prompt` in a single text part. */
    contents?: unknown[];
  };
  type GeminiCallResult =
    | { ok: true; text: string; model: string; raw: any; latencyMs: number }
    | { ok: false; error: string; model?: string; latencyMs: number };

  async function callGeminiOnce(resolved: ResolvedModel, opts: GeminiCallOpts): Promise<GeminiCallResult> {
    const t0 = Date.now();
    const body: Record<string, unknown> = {
      contents: opts.contents ?? [{ parts: [{ text: opts.prompt }] }],
    };
    if (opts.generationConfig) body['generationConfig'] = opts.generationConfig;
    if (opts.tools) body['tools'] = opts.tools;
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${resolved.model}:generateContent?key=${resolved.apiKey}`,
      { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) },
    );
    const latencyMs = Date.now() - t0;
    if (!res.ok) {
      const errText = await res.text().catch(() => '');
      // Throw so callWithModelFallback's catch can pattern-match on
      // "HTTP 404 ... /models/..." and decide to blacklist + retry.
      // (Returning false here would skip the auto-switch.)
      throw new Error(`Gemini HTTP ${res.status}: ${errText.slice(0, 200)}`);
    }
    const raw = (await res.json()) as { candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }> };
    const text = raw.candidates?.[0]?.content?.parts?.[0]?.text ?? '';
    return { ok: true, text, model: resolved.model, raw, latencyMs };
  }

  async function callGemini(opts: GeminiCallOpts): Promise<GeminiCallResult> {
    if (!resolver) {
      // No resolver wired (legacy path): the engine still works on the
      // env-only setup, but cannot auto-switch. Use whatever the env
      // var has and the FIRST flash model in the registry chain.
      // This is the path test setups + ad-hoc dev hits.
      if (!env.GEMINI_API_KEY || env.GEMINI_API_KEY.length < 6) {
        return { ok: false, error: 'gemini_not_configured', latencyMs: 0 };
      }
      const { pickPreferredModel } = await import('./aiProviderRegistry.js');
      const tier = opts.tier ?? 'flash';
      const model = pickPreferredModel('gemini', tier);
      if (!model) return { ok: false, error: 'no_gemini_model_in_registry', latencyMs: 0 };
      try {
        return await callGeminiOnce({ provider: 'gemini', model, apiKey: env.GEMINI_API_KEY }, opts);
      } catch (err) {
        return { ok: false, error: err instanceof Error ? err.message : String(err), model, latencyMs: 0 };
      }
    }
    const tier = opts.tier ?? 'flash';
    try {
      return await resolver.callWithModelFallback('gemini', (resolved) => callGeminiOnce(resolved, opts), { tier });
    } catch (err) {
      const error = err instanceof Error ? err.message : String(err);
      return { ok: false, error, latencyMs: 0 };
    }
  }

  /**
   * Resolve the runtime OpenAI client, preferring the admin-saved key
   * over the env var. Returns the eager-init env client if no admin
   * key was saved (or no resolver wired). Re-builds a fresh client
   * each call when the admin key is in play because admin can rotate
   * keys live; the env-init client is reused for free.
   */
  async function getOpenAIClient(): Promise<{ client: OpenAI; model: string } | null> {
    if (resolver) {
      const r = await resolver.resolve('openai', { tier: 'pro' });
      if (r) {
        // env path hits this too via resolver.getKey(env-fallback).
        if (r.apiKey === env.OPENAI_API_KEY && openai) {
          return { client: openai, model: r.model };
        }
        return { client: new OpenAI({ apiKey: r.apiKey }), model: r.model };
      }
    }
    // No resolver, fall back to the eager-init env client + a chain pick.
    if (!openai) return null;
    const { pickPreferredModel } = await import('./aiProviderRegistry.js');
    const m = pickPreferredModel('openai', 'pro') ?? pickPreferredModel('openai', 'flash');
    if (!m) return null;
    return { client: openai, model: m };
  }

  async function getOpenAIClientFlash(): Promise<{ client: OpenAI; model: string } | null> {
    if (resolver) {
      const r = await resolver.resolve('openai', { tier: 'flash' });
      if (r) {
        if (r.apiKey === env.OPENAI_API_KEY && openai) return { client: openai, model: r.model };
        return { client: new OpenAI({ apiKey: r.apiKey }), model: r.model };
      }
    }
    if (!openai) return null;
    const { pickPreferredModel } = await import('./aiProviderRegistry.js');
    const m = pickPreferredModel('openai', 'flash') ?? pickPreferredModel('openai', 'pro');
    if (!m) return null;
    return { client: openai, model: m };
  }

  /**
   * Resolve the Groq client + currently-preferred model. Same
   * lazy-rebuild-on-admin-key logic as OpenAI above.
   */
  async function getGroqClient(): Promise<{ client: Groq; model: string } | null> {
    if (resolver) {
      const r = await resolver.resolve('groq', { tier: 'flash' });
      if (r) {
        if (r.apiKey === env.GROQ_API_KEY && groq) return { client: groq, model: r.model };
        return { client: new Groq({ apiKey: r.apiKey }), model: r.model };
      }
    }
    if (!groq) return null;
    const { pickPreferredModel } = await import('./aiProviderRegistry.js');
    const m = pickPreferredModel('groq', 'flash');
    if (!m) return null;
    return { client: groq, model: m };
  }

  /**
   * Generic per-call fallback wrapper for the SDK-based providers.
   * If the call throws a deprecation-flavoured error, blacklist the
   * model and retry once with the next chain entry. Transient errors
   * are re-thrown immediately (the engine's outer provider chain
   * handles flaky-provider fallback).
   *
   * Reserved for future SDK call sites that want auto-switching for
   * Groq / OpenAI model deprecations. The current engine call sites
   * still pass static model ids ('llama-3.3-70b-versatile', 'gpt-4o')
   * because those have not yet been deprecated; when they are, lifting
   * the call into this helper is a one-line change.
   */
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  async function withSdkModelFallback<T>(
    provider: 'openai' | 'groq',
    primary: { model: string },
    callFn: (model: string) => Promise<T>,
  ): Promise<T> {
    try {
      const result = await callFn(primary.model);
      if (resolver) void resolver.reportModelSuccess(provider, primary.model);
      return result;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (resolver) await resolver.reportModelFailure(provider, primary.model, msg);
      if (!isModelDeprecationError(msg) || !resolver) throw err;
      // Re-resolve and retry once.
      const next = provider === 'openai' ? await getOpenAIClient() : await getGroqClient();
      if (!next || next.model === primary.model) throw err;
      logger.info('ai.engine_sdk_fallback_retry', { provider, from: primary.model, to: next.model });
      try {
        const result = await callFn(next.model);
        if (resolver) void resolver.reportModelSuccess(provider, next.model);
        return result;
      } catch (err2) {
        if (resolver) await resolver.reportModelFailure(provider, next.model, err2 instanceof Error ? err2.message : String(err2));
        throw err2;
      }
    }
  }

  /**
   * 3-Layer AI verifier (lock §5.2 + marketing §2.4 claim).
   *
   * Built once at engine construction, reused for every chapter generation.
   * The verifier is fail-open by design: if Gemini is down AND OpenAI is
   * down, it returns `{ verified: true, confidence: 0.5, verifier: 'fallback' }`
   * so a paying student does NOT get blocked on infrastructure issues. The
   * caller logs the fallback verdict so we can chase outages.
   *
   * Cost: ~$0.0005 per chapter via Gemini Flash (verifier) on top of the
   * ~$0.05 GPT-4o generation -- a 1% increment in exchange for making the
   * "verified by 3-layer AI detection" marketing claim true in code.
   *
   * If Gemini is missing entirely (e.g. a half-configured staging env)
   * the verifier is `null` and the route falls back to the legacy
   * single-provider path with a warning logged at startup.
   */
  const chapterVerifier: VerifyChapterFn | null = hasGemini
    ? buildChapterVerifier({
        geminiApiKey: env.GEMINI_API_KEY ?? '',
        openaiApiKey: hasOpenai ? env.OPENAI_API_KEY : undefined,
        // Resolver-aware key+model lookup. When wired (PR-29 onward),
        // the verifier resolves a fresh non-blacklisted Gemini flash
        // model on every call so a deprecation in the chain doesn't
        // brick chapter cross-checking. Falls back to the static
        // geminiApiKey above if no resolver.
        getGeminiKeyAndModel: resolver
          ? async () => {
              const r = await resolver.resolve('gemini', { tier: 'flash' });
              return r ? { apiKey: r.apiKey, model: r.model } : null;
            }
          : undefined,
        reportGeminiResult: resolver
          ? async (model, ok, error) => {
              if (ok) await resolver.reportModelSuccess('gemini', model);
              else await resolver.reportModelFailure('gemini', model, error ?? 'verifier_failed');
            }
          : undefined,
        getOpenAIKeyAndModel: resolver && hasOpenai
          ? async () => {
              const r = await resolver.resolve('openai', { tier: 'flash' });
              return r ? { apiKey: r.apiKey, model: r.model } : null;
            }
          : undefined,
        reportOpenAIResult: resolver
          ? async (model, ok, error) => {
              if (ok) await resolver.reportModelSuccess('openai', model);
              else await resolver.reportModelFailure('openai', model, error ?? 'verifier_failed');
            }
          : undefined,
      })
    : null;
  if (!chapterVerifier) {
    logger.warn('ai.verifier_disabled', {
      reason: 'GEMINI_API_KEY missing; chapters will ship without cross-check',
    });
  }

  /**
   * Multi-provider question generator with the resilience properties the
   * assessment endpoint actually needs in production:
   *
   *   - Token budget headroom: 8192 instead of the previous 4096. Hindi
   *     responses (Devanagari script + GSM-7-style multi-byte handling
   *     by tokenizers) commonly double the token count of the same
   *     content in English. 10 detailed MCQs plus explanations plus
   *     subject + topic fields tipped past 4096 frequently for Stage 1
   *     in Hindi -- the response would silently truncate mid-JSON, the
   *     `JSON.parse` would throw, every provider would hit the same
   *     wall, and the route would 503 with the now-infamous "AI service
   *     may be busy" message.
   *
   *   - Best-effort partial recovery: when JSON.parse fails on a
   *     truncated response, we try to find the LAST complete `}` before
   *     the truncation and re-parse that prefix. If we get back >=5
   *     questions for Stage 1 (which has 10 target), we return what we
   *     have rather than burning the full provider chain on the same
   *     bug. The user gets a slightly shorter assessment instead of an
   *     error.
   *
   *   - Useful errors: the thrown message now lists which provider hit
   *     which failure mode, so admin /admin/logs can diagnose at a
   *     glance instead of seeing "Failed: Groq: <error>; OpenAI: <error>;
   *     Gemini failed" with no structure.
   */
  /**
   * Per-call retry helper. Wraps an async provider call and retries ONCE
   * on transient errors (network blip, 5xx, 429 rate limit, timeout).
   * Hard errors (4xx other than 429, malformed key) bypass retry and go
   * straight to the next provider in the fallback chain. PR-17 fix for
   * the post-PR-196-deploy assessment 503s where a single transient
   * Groq blip would burn through OpenAI + Gemini on the same wall.
   */
  async function withRetryOnTransient<T>(
    provider: string,
    op: () => Promise<T>,
  ): Promise<T> {
    try {
      return await op();
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      const isTransient =
        /timeout|ETIMEDOUT|ECONNRESET|ECONNREFUSED|ENOTFOUND|EAI_AGAIN|fetch failed/i.test(msg) ||
        /\b(429|500|502|503|504)\b/.test(msg) ||
        /rate.?limit|too many requests|service unavailable|gateway/i.test(msg);
      if (!isTransient) throw err;
      logger.warn('ai.provider_retry', { provider, reason: msg.slice(0, 120) });
      // 800ms backoff is a sweet spot: long enough for a provider's
      // burst rate-limit window to slide, short enough that the user
      // hasn't hit our outer 60s Cloud Run request timeout yet.
      await new Promise(resolve => setTimeout(resolve, 800));
      return await op();
    }
  }

  async function _generateQuestions(prompt: string, endpoint: string, examSlug: string, language: string): Promise<GeneratedMCQ[]> {
    const errors: string[] = [];
    const MAX_TOKENS = 8192;
    // PR-18: lowered from 5 to 3. Groq Llama 3.3 in Hindi often produces
    // valid JSON for 3-4 questions then truncates or malforms. Returning
    // 3 partial questions is far better than failing the whole call --
    // the assessment route on the web side already handles short stages
    // gracefully (totals are computed proportionally), and `generateStage1Questions`
    // / `generateStage2Questions` now wrap this with a batched fallback
    // that fills in the missing questions via a separate smaller call.
    const MIN_USABLE_QUESTIONS = 3;

    /** Try to extract a usable questions array from a possibly-truncated response. */
    function recoverQuestions(raw: string): GeneratedMCQ[] | null {
      // Fast path: clean JSON.
      try {
        const parsed = JSON.parse(raw) as { questions?: GeneratedMCQ[] };
        if (parsed.questions && parsed.questions.length >= MIN_USABLE_QUESTIONS) return parsed.questions;
        if (parsed.questions && parsed.questions.length > 0) return parsed.questions; // Better than nothing.
      } catch { /* fall through to recovery */ }

      // Truncated path: walk back from the end to find a balanced JSON
      // substring. We start from the last `}` and try parsing
      // progressively shorter prefixes that close any open question
      // objects + array.
      const lastObjEnd = raw.lastIndexOf('}');
      if (lastObjEnd < 0) return null;
      // Heuristic: close the array + outer object after the last full
      // question we can see. Find the position of the last `,` before
      // the truncation, snip there, append `]}` to close cleanly.
      const head = raw.slice(0, lastObjEnd + 1);
      const candidates = [head + ']}', head + '}'];
      for (const candidate of candidates) {
        try {
          const parsed = JSON.parse(candidate) as { questions?: GeneratedMCQ[] };
          if (parsed.questions && parsed.questions.length >= MIN_USABLE_QUESTIONS) return parsed.questions;
        } catch { /* try next */ }
      }
      // Last resort: regex out individual question objects.
      const matches = raw.match(/\{\s*"id"[^}]*"correctOption"\s*:\s*"[A-D]"[^}]*\}/g);
      if (matches && matches.length >= MIN_USABLE_QUESTIONS) {
        const recovered: GeneratedMCQ[] = [];
        for (const m of matches) {
          try { recovered.push(JSON.parse(m) as GeneratedMCQ); } catch { /* skip malformed */ }
        }
        if (recovered.length >= MIN_USABLE_QUESTIONS) return recovered;
      }
      return null;
    }

    // ── Provider 1: Groq (fastest path) ──────────────────────────────
    if (groq) {
      try {
        const completion = await withRetryOnTransient('groq', () =>
          groq.chat.completions.create({
            model: 'llama-3.3-70b-versatile',
            messages: [{ role: 'user', content: prompt }],
            temperature: 0.7,
            max_tokens: MAX_TOKENS,
            response_format: { type: 'json_object' },
          })
        );
        const raw = completion.choices[0]?.message?.content ?? '';
        const finishReason = completion.choices[0]?.finish_reason ?? 'unknown';
        const recovered = recoverQuestions(raw);
        if (recovered) {
          const tokens = estimateTokens(raw);
          logAICallToStore(store, 'llama-3.3-70b-versatile', tokens, estimateCost('llama-3.3-70b-versatile', tokens), 0, undefined, { status: 'success', endpoint, provider: 'groq', requestPreview: prompt.slice(0, 200), responsePreview: raw.slice(0, 300) });
          logger.info('ai.questions_generated', { provider: 'groq', endpoint, examSlug, language, count: recovered.length, finishReason });
          return recovered;
        }
        errors.push(`Groq returned ${raw.length} chars, no parseable questions (finish=${finishReason}, preview="${raw.slice(0, 120).replace(/\s+/g, ' ')}")`);
      } catch (err) {
        errors.push(`Groq: ${err instanceof Error ? err.message : String(err)}`);
      }
    } else {
      errors.push('Groq not configured');
    }

    // ── Provider 2: OpenAI (slower, more reliable) ───────────────────
    if (openai) {
      try {
        const completion = await withRetryOnTransient('openai', () =>
          openai.chat.completions.create({
            model: 'gpt-4o',
            messages: [{ role: 'user', content: prompt }],
            temperature: 0.7,
            max_tokens: MAX_TOKENS,
            response_format: { type: 'json_object' },
          })
        );
        const raw = completion.choices[0]?.message?.content ?? '';
        const finishReason = completion.choices[0]?.finish_reason ?? 'unknown';
        const recovered = recoverQuestions(raw);
        if (recovered) {
          logger.info('ai.questions_generated', { provider: 'openai', endpoint, examSlug, language, count: recovered.length, finishReason });
          return recovered;
        }
        errors.push(`OpenAI returned ${raw.length} chars, no parseable questions (finish=${finishReason}, preview="${raw.slice(0, 120).replace(/\s+/g, ' ')}")`);
      } catch (err) {
        errors.push(`OpenAI: ${err instanceof Error ? err.message : String(err)}`);
      }
    } else {
      errors.push('OpenAI not configured');
    }

    // ── Provider 3: Gemini (final fallback) ──────────────────────────
    // Auto-resolver wired (PR-29): no hardcoded model name. The
    // resolver picks the topmost non-blacklisted entry from the
    // gemini flash chain on each call; on a deprecation 404 it
    // blacklists + retries the next entry within the same call.
    if (env.GEMINI_API_KEY && env.GEMINI_API_KEY.length > 5) {
      try {
        const result = await withRetryOnTransient('gemini', async () => {
          const r = await callGemini({
            prompt,
            generationConfig: { temperature: 0.7, maxOutputTokens: MAX_TOKENS },
            tier: 'flash',
          });
          if (!r.ok) throw new Error(r.error);
          return r;
        });
        const rawText = result.text;
        const finishReason = (result.raw?.candidates?.[0]?.finishReason as string | undefined) ?? 'unknown';
        // Gemini sometimes wraps JSON in ```json ... ``` fences.
        const stripped = rawText.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/i, '');
        const recovered = recoverQuestions(stripped);
        if (recovered) {
          logger.info('ai.questions_generated', { provider: 'gemini', endpoint, examSlug, language, count: recovered.length, finishReason, model: result.model });
          return recovered;
        }
        errors.push(`Gemini returned ${rawText.length} chars, no parseable questions (model=${result.model}, finish=${finishReason}, preview="${rawText.slice(0, 120).replace(/\s+/g, ' ')}")`);
      } catch (err) {
        errors.push(`Gemini: ${err instanceof Error ? err.message : String(err)}`);
      }
    } else {
      errors.push('Gemini not configured');
    }

    logger.error('ai.questions_all_failed', { errors, endpoint, examSlug, language });
    logAICallToStore(store, 'all-providers', 0, 0, 0, undefined, {
      status: 'error',
      endpoint,
      error: errors.join(' | '),
      requestPreview: prompt.slice(0, 200),
    });
    throw new Error(`All AI providers failed for ${endpoint} (${examSlug}/${language}): ${errors.join(' | ')}`);
  }

  /**
   * Batched-fallback wrapper around `_generateQuestions`. For Stage 1 (10 Hindi
   * MCQs) and Stage 2 (8 Hindi MCQs) the single-shot prompt is large enough
   * that Groq's Llama 3.3, when it is the only provider not rate-limited,
   * frequently produces malformed JSON or truncates mid-response. Splitting
   * into smaller batches dramatically improves output quality because each
   * batch's JSON tree is small enough to fit comfortably under both Groq's
   * tokenizer-effective budget AND the model's structural-coherence horizon.
   *
   * Strategy:
   *   1. Try a single shot at `targetCount` -- this is still the fast path
   *      (1 round-trip) when the providers are healthy. If that succeeds
   *      with anywhere close to the expected count, we ship it and skip
   *      batching entirely.
   *   2. If the single shot THROWS (all providers failed) OR returns less
   *      than 60% of the target, fall back to running `numBatches` smaller
   *      calls SEQUENTIALLY (not parallel -- gives Groq a 200ms gap between
   *      requests so its per-second rate limit window can slide).
   *   3. Concatenate results, renumber IDs to a stable sequence so the
   *      front-end never sees collisions, and return.
   *   4. If even the batched fallback comes back empty, throw the original
   *      single-shot error so the route's 503 carries a meaningful reason.
   *
   * `buildPrompt` is a closure that produces a prompt for a given batch
   * size + 0-indexed batch number; this lets each caller keep its prompt
   * template (subject distribution, difficulty calibration, weak-area
   * targeting) while the batching logic stays generic.
   */
  async function _generateQuestionsBatched(
    buildPrompt: (count: number, batchIdx: number) => string,
    targetCount: number,
    numBatches: number,
    endpoint: string,
    examSlug: string,
    language: string,
    idPrefix: string,
  ): Promise<GeneratedMCQ[]> {
    const batchSize = Math.ceil(targetCount / numBatches);
    let singleShotError: Error | null = null;

    // Step 1: single shot at full target.
    try {
      const result = await _generateQuestions(
        buildPrompt(targetCount, 0),
        endpoint,
        examSlug,
        language,
      );
      // 60% of target = good enough; anything less and we top up via batches.
      if (result.length >= Math.ceil(targetCount * 0.6)) {
        return result.map((q, i) => ({ ...q, id: `${idPrefix}-q${i + 1}` }));
      }
      logger.info('ai.batch_fallback_threshold_not_met', {
        endpoint, examSlug, language, returned: result.length, target: targetCount,
      });
    } catch (err) {
      singleShotError = err instanceof Error ? err : new Error(String(err));
      logger.warn('ai.batch_fallback_triggered', {
        endpoint, examSlug, language, reason: singleShotError.message.slice(0, 200),
      });
    }

    // Step 2 + 3: sequential batched fallback.
    const collected: GeneratedMCQ[] = [];
    for (let i = 0; i < numBatches; i++) {
      try {
        const batch = await _generateQuestions(
          buildPrompt(batchSize, i),
          `${endpoint}_batch${i + 1}`,
          examSlug,
          language,
        );
        collected.push(...batch);
        if (i < numBatches - 1) {
          // Small gap between batches so Groq's per-second rate-limit window
          // slides and we don't trigger a 429 on batch 2.
          await new Promise(resolve => setTimeout(resolve, 200));
        }
      } catch (err) {
        logger.warn('ai.batch_fallback_batch_failed', {
          endpoint, examSlug, language, batchIdx: i,
          reason: err instanceof Error ? err.message.slice(0, 200) : String(err).slice(0, 200),
        });
      }
    }

    // Step 4: at least *some* questions back, otherwise propagate the failure.
    if (collected.length === 0) {
      throw singleShotError ?? new Error(`Batched fallback for ${endpoint} produced 0 questions`);
    }

    logger.info('ai.batch_fallback_succeeded', {
      endpoint, examSlug, language, returned: collected.length, target: targetCount,
    });
    return collected.map((q, i) => ({ ...q, id: `${idPrefix}-q${i + 1}` }));
  }

  /**
   * Reinforced JSON-only prefix prepended to every question-generation
   * prompt. Groq's Llama 3.3 70B in particular has a tendency to emit a
   * markdown code fence or a polite preamble before the JSON when the
   * request is in Hindi -- this prefix collapses that behaviour by being
   * explicit + repeated. Empirically improves clean-parse rate from
   * ~70% to ~95% on Hindi Stage 1.
   */
  const JSON_ONLY_PREFIX = `CRITICAL OUTPUT RULES:
1. Respond with ONE valid JSON object and NOTHING ELSE.
2. Do NOT wrap the JSON in markdown code fences (no \\\`\\\`\\\` or \\\`\\\`\\\`json).
3. Do NOT add any text before or after the JSON.
4. Verify every brace and bracket is closed before responding.

`;

  return {
    async generateAssessmentQuestions(examSlug, language = 'en', count = 15) {
      const langInstr = language === 'hi' ? 'Generate all questions and options in Hindi (Devanagari script).' : 'Generate all questions and options in English.';
      const buildPrompt = (n: number) => `${JSON_ONLY_PREFIX}You are an expert Indian competitive exam question creator.\n\nGenerate exactly ${n} MCQs for "${examSlug}" exam.\n${langInstr}\n\nRequirements:\n- Mix difficulty levels (easy, medium, hard)\n- 4 options (A-D), correct answer, brief explanation\n- Different subjects/topics\n\nRespond ONLY with JSON:\n{"questions":[{"id":"q1","question":"...","options":[{"key":"A","text":"..."},{"key":"B","text":"..."},{"key":"C","text":"..."},{"key":"D","text":"..."}],"correctOption":"A","explanation":"...","difficulty":"easy","subject":"...","topic":"..."}]}`;
      // 15 questions → 3 batches of 5. Single-shot first; batched only on failure.
      return _generateQuestionsBatched(buildPrompt, count, 3, 'generateAssessmentQuestions', examSlug, language, 'a');
    },

    async generateStage1Questions(examSlug, language = 'en') {
      const langInstr = language === 'hi' ? 'Generate all questions and options in Hindi (Devanagari script).' : 'Generate all questions and options in English.';
      const buildPrompt = (n: number, batchIdx: number) => {
        const subjectGuidance = `Based on the exam "${examSlug}", generate questions covering the OFFICIAL SYLLABUS subjects:\n- If exam is UPSC/upsc-cse: test History + Geography + Polity + Economy + Science\n- If exam is NEET/neet-ug: test Physics + Chemistry + Biology\n- If exam is JEE/jee-main: test Physics + Chemistry + Mathematics\n- If exam is SSC CGL/ssc-cgl or Banking: test Reasoning + Quant + GK + English\n- If exam is Class 10/class-10-cbse or Class 12/class-12-cbse: test Math + Science + Social Science + English\n- If exam is IT/Python/Web Dev/Data Science/digital-marketing/tally-accounting: test relevant technical topics proportionally\n- For any other exam: identify its core subjects and distribute questions proportionally`;
        return `${JSON_ONLY_PREFIX}You are an expert Indian competitive exam question creator.\n\nGenerate exactly ${n} MCQs for "${examSlug}" exam — Stage 1 Core Subjects assessment${batchIdx > 0 ? ` (continuation batch ${batchIdx + 1})` : ''}.\n${langInstr}\n\n${subjectGuidance}\n\nRequirements:\n- Mix of easy and medium difficulty\n- 4 options (A-D), correct answer, brief explanation\n- MUST include subject and topic fields for each question\n- Questions must be relevant to the SPECIFIC exam syllabus\n\nRespond ONLY with JSON:\n{"questions":[{"id":"s1-q1","question":"...","options":[{"key":"A","text":"..."},{"key":"B","text":"..."},{"key":"C","text":"..."},{"key":"D","text":"..."}],"correctOption":"A","explanation":"...","difficulty":"medium","subject":"history","topic":"modern-india"}]}`;
      };
      // 10 questions → fallback: 2 batches of 5. Single-shot fast-path stays.
      return _generateQuestionsBatched(buildPrompt, 10, 2, 'generateStage1Questions', examSlug, language, 's1');
    },

    async generateStage2Questions(examSlug, language = 'en', stage1Results) {
      // Calculate stage 1 score to determine difficulty
      let correct = 0;
      for (const a of stage1Results.answers) {
        const q = stage1Results.questions.find(qq => qq.id === a.questionId);
        if (q && a.chosen === q.correctOption) correct++;
      }
      const stage1Pct = (correct / stage1Results.questions.length) * 100;
      let difficulty: string;
      if (stage1Pct >= 70) difficulty = 'hard';
      else if (stage1Pct >= 40) difficulty = 'medium';
      else difficulty = 'easy';

      const langInstr = language === 'hi' ? 'Generate all questions and options in Hindi (Devanagari script).' : 'Generate all questions and options in English.';
      const buildPrompt = (n: number, batchIdx: number) => `${JSON_ONLY_PREFIX}You are an expert Indian competitive exam question creator.\n\nGenerate exactly ${n} MCQs for "${examSlug}" exam — Stage 2 Difficulty Calibration${batchIdx > 0 ? ` (continuation batch ${batchIdx + 1})` : ''}.\n${langInstr}\n\nThe student scored ${correct}/${stage1Results.questions.length} (${stage1Pct.toFixed(0)}%) in Stage 1.\nBased on this performance, generate ${difficulty.toUpperCase()} level questions.\n\nRequirements:\n- All ${n} questions should be ${difficulty} difficulty\n- Cover multiple subjects from the exam syllabus\n- ${difficulty === 'hard' ? 'Analytical, require deep understanding. All 4 options plausible.' : difficulty === 'medium' ? 'Application-based, require careful thought. 2 close options.' : 'Factual recall, straightforward. Clear correct answer.'}\n- 4 options (A-D), correct answer, brief explanation\n- Include subject and topic fields\n\nRespond ONLY with JSON:\n{"questions":[{"id":"s2-q1","question":"...","options":[{"key":"A","text":"..."},{"key":"B","text":"..."},{"key":"C","text":"..."},{"key":"D","text":"..."}],"correctOption":"A","explanation":"...","difficulty":"${difficulty}","subject":"...","topic":"..."}]}`;
      // 8 questions → fallback: 2 batches of 4.
      return _generateQuestionsBatched(buildPrompt, 8, 2, 'generateStage2Questions', examSlug, language, 's2');
    },

    async generateStage3Questions(examSlug, language = 'en', stage1Results, _stage2Results) {
      // Identify weakest subjects from stage 1
      const subjectScores: Record<string, { correct: number; total: number }> = {};
      for (const q of stage1Results.questions) {
        const subj = q.subject ?? 'general';
        if (!subjectScores[subj]) subjectScores[subj] = { correct: 0, total: 0 };
        subjectScores[subj]!.total++;
        const ans = stage1Results.answers.find(a => a.questionId === q.id);
        if (ans && ans.chosen === q.correctOption) subjectScores[subj]!.correct++;
      }

      // Find 2 weakest subjects
      const sorted = Object.entries(subjectScores)
        .map(([subj, scores]) => ({ subj, pct: (scores.correct / scores.total) * 100 }))
        .sort((a, b) => a.pct - b.pct);
      const weakSubjects = sorted.slice(0, 2).map(s => s.subj);

      const langInstr = language === 'hi' ? 'Generate all questions and options in Hindi (Devanagari script).' : 'Generate all questions and options in English.';
      const prompt = `${JSON_ONLY_PREFIX}You are an expert Indian competitive exam question creator.\n\nGenerate exactly 5 MCQs for "${examSlug}" exam — Stage 3 Weak Area Deep Dive.\n${langInstr}\n\nThe student's weakest subjects are: ${weakSubjects.join(', ')}.\nGenerate targeted questions on these weak areas to better understand the gaps.\n\nRequirements:\n- Focus on: ${weakSubjects.join(' and ')}\n- 2-3 questions on the weakest subject, rest on the second weakest\n- Mix of easy and medium difficulty (to identify exact gaps)\n- 4 options (A-D), correct answer, brief explanation\n- Include subject and topic fields\n\nRespond ONLY with JSON:\n{"questions":[{"id":"s3-q1","question":"...","options":[{"key":"A","text":"..."},{"key":"B","text":"..."},{"key":"C","text":"..."},{"key":"D","text":"..."}],"correctOption":"A","explanation":"...","difficulty":"medium","subject":"...","topic":"..."}]}`;
      // Stage 3 stays single-shot: only 5 questions, well within Groq's reliable
      // single-call ceiling even in Hindi. The JSON_ONLY_PREFIX still helps with
      // markdown-fence prevention.
      return _generateQuestions(prompt, 'generateStage3Questions', examSlug, language);
    },

    async scoreMultiStageAssessment(stage1, stage2, stage3) {
      // Calculate per-stage scores
      const scoreStage = (sr: StageResults) => {
        let correct = 0;
        for (const a of sr.answers) {
          const q = sr.questions.find(qq => qq.id === a.questionId);
          if (q && a.chosen === q.correctOption) correct++;
        }
        return { correct, total: sr.questions.length, pct: sr.questions.length > 0 ? (correct / sr.questions.length) * 100 : 0 };
      };

      const s1 = scoreStage(stage1);
      const s2 = scoreStage(stage2);
      const s3 = scoreStage(stage3);

      // Weighted average: stage1 40%, stage2 40%, stage3 20%
      const totalPct = (s1.pct * 0.4) + (s2.pct * 0.4) + (s3.pct * 0.2);
      const totalCorrect = s1.correct + s2.correct + s3.correct;
      const totalQuestions = s1.total + s2.total + s3.total;

      // Determine level
      const level: 'beginner' | 'intermediate' | 'advanced' = totalPct > 70 ? 'advanced' : totalPct >= 40 ? 'intermediate' : 'beginner';

      // Identify weak and strong areas from stage 1 subjects
      const subjectScores: Record<string, { correct: number; total: number }> = {};
      for (const q of stage1.questions) {
        const subj = q.subject ?? 'general';
        if (!subjectScores[subj]) subjectScores[subj] = { correct: 0, total: 0 };
        subjectScores[subj]!.total++;
        const ans = stage1.answers.find(a => a.questionId === q.id);
        if (ans && ans.chosen === q.correctOption) subjectScores[subj]!.correct++;
      }
      // Also count stage3 subjects
      for (const q of stage3.questions) {
        const subj = q.subject ?? 'general';
        if (!subjectScores[subj]) subjectScores[subj] = { correct: 0, total: 0 };
        subjectScores[subj]!.total++;
        const ans = stage3.answers.find(a => a.questionId === q.id);
        if (ans && ans.chosen === q.correctOption) subjectScores[subj]!.correct++;
      }

      const weakAreas: string[] = [];
      const strongAreas: string[] = [];
      for (const [subj, scores] of Object.entries(subjectScores)) {
        const pct = (scores.correct / scores.total) * 100;
        if (pct < 40) weakAreas.push(subj);
        else if (pct > 70) strongAreas.push(subj);
      }

      // Generate message
      try {
        const prompt = `Student completed a 3-stage assessment for Indian competitive exam.\nTotal weighted score: ${totalPct.toFixed(1)}% (${totalCorrect}/${totalQuestions} questions correct)\nLevel assigned: ${level}\nWeak areas: ${weakAreas.join(', ') || 'none'}\nStrong areas: ${strongAreas.join(', ') || 'none'}\n\nProvide an encouraging message about their performance. Respond ONLY JSON:\n{"message":"English (2-3 sentences)","messageHi":"Hindi Devanagari (2-3 sentences)"}`;
        if (openai) {
          const completion = await openai.chat.completions.create({ model: 'gpt-4o', messages: [{ role: 'user', content: prompt }], temperature: 0.5, max_tokens: 300, response_format: { type: 'json_object' } });
          const parsed = JSON.parse(completion.choices[0]?.message?.content ?? '{}') as { message: string; messageHi: string };
          return { score: totalCorrect, total: totalQuestions, level, message: parsed.message, messageHi: parsed.messageHi, weakAreas, strongAreas };
        }
      } catch (err) {
        logger.error('ai.multi_stage_score_error', { error: err instanceof Error ? err.message : String(err) });
      }

      // Fallback message
      return {
        score: totalCorrect,
        total: totalQuestions,
        level,
        message: `You scored ${totalCorrect}/${totalQuestions} (${totalPct.toFixed(0)}%). Level: ${level}. Let's personalize your learning!`,
        messageHi: `आपने ${totalCorrect}/${totalQuestions} अंक प्राप्त किए (${totalPct.toFixed(0)}%)। स्तर: ${level}। चलिए आपकी पढ़ाई को व्यक्तिगत बनाते हैं!`,
        weakAreas,
        strongAreas,
      };
    },

    async scoreAssessment(questions, answers) {
      let correct = 0;
      for (const a of answers) { const q = questions.find((qq) => qq.id === a.questionId); if (q && a.chosen === q.correctOption) correct++; }
      const total = questions.length;
      const pct = (correct / total) * 100;
      try {
        const prompt = `Student scored ${correct}/${total} (${pct.toFixed(1)}%) on Indian competitive exam assessment.\nAssign level and provide encouraging message.\nRespond ONLY JSON: {"level":"beginner"|"intermediate"|"advanced","message":"English (1-2 sentences)","messageHi":"Hindi Devanagari"}`;
        if (!openai) throw new Error("OPENAI_API_KEY not configured"); const completion = await openai.chat.completions.create({ model: 'gpt-4o', messages: [{ role: 'user', content: prompt }], temperature: 0.5, max_tokens: 300, response_format: { type: 'json_object' } });
        const parsed = JSON.parse(completion.choices[0]?.message?.content ?? '{}') as { level: 'beginner'|'intermediate'|'advanced'; message: string; messageHi: string };
        logger.info('ai.scored', { correct, total, level: parsed.level });
        return { score: correct, total, ...parsed };
      } catch (err) {
        logger.error('ai.score_error', { error: err instanceof Error ? err.message : String(err) });
        const level: 'beginner'|'intermediate'|'advanced' = pct >= 70 ? 'advanced' : pct >= 40 ? 'intermediate' : 'beginner';
        return { score: correct, total, level, message: `You scored ${correct}/${total}. Level: ${level}. Let's start!`, messageHi: `आपने ${correct}/${total} अंक प्राप्त किए। स्तर: ${level}। शुरू करते हैं!` };
      }
    },

    async generateChapterContent(chapter, subject, exam, language = 'en', userContext?) {
      const langInstr = language === 'hi' ? 'Write the entire chapter in Hindi (Devanagari). Simple, student-friendly language.' : 'Write in clear, student-friendly English.';

      // Build personalization section based on user level
      let personalizationInstr = '';
      const level = userContext?.onboardingLevel ?? 'intermediate';

      if (level === 'beginner') {
        const weakAreasStr = userContext?.weakAreas?.length ? `The student's weak areas are: ${userContext.weakAreas.join(', ')} — be extra careful to build strong basics in these areas.` : '';
        personalizationInstr = `This student is a BEGINNER — they are new to this topic.
Writing style: Simple language, avoid jargon, explain every term.
Structure: Start with 'What is this?', use many examples from daily life, include memory tricks and mnemonics, use simple analogies.
Length: 600-800 words. Language: ${language === 'hi' ? 'Hindi' : 'English'}.
${weakAreasStr}
End with: 3 key takeaways in bullet points.`;
      } else if (level === 'advanced') {
        const strongAreasStr = userContext?.strongAreas?.length ? `Student's strong areas: ${userContext.strongAreas.join(', ')} — use these as reference points.` : '';
        personalizationInstr = `This student is ADVANCED — high level of preparation.
Writing style: Analytical and deep, assume strong foundational knowledge.
Structure: Advanced concepts, critical analysis, inter-topic connections, recent developments, previous year questions with approach strategy, common mistakes to avoid at advanced level.
Length: 1000-1200 words. Language: ${language === 'hi' ? 'Hindi' : 'English'}.
${strongAreasStr}
End with: Examiner perspective and scoring strategy.`;
      } else {
        // intermediate
        const completedStr = userContext?.completedChapters?.length ? `The student has already completed: ${userContext.completedChapters.slice(0, 10).join(', ')} — build connections to those topics where relevant.` : '';
        personalizationInstr = `This student has basic knowledge — INTERMEDIATE level.
Writing style: Clear and direct, some technical terms with brief explanation.
Structure: Quick concept recap, deeper explanation, exam-relevant facts and figures, previous year question patterns.
Length: 800-1000 words. Language: ${language === 'hi' ? 'Hindi' : 'English'}.
${completedStr}
End with: Important facts to remember for exam.`;
      }

      const prompt = `You are an expert Indian education content writer.\nYou are generating educational content for ${exam}.\nThis content must strictly follow the official ${exam} syllabus.\nOnly cover topics that are part of the official curriculum.\nGround all factual content in NCERT textbooks where applicable.\nDo not add topics outside the official syllabus.\n\nGenerate a chapter on "${chapter}" (subject: ${subject}) for ${exam} preparation.\n${langInstr}\n\n${personalizationInstr}\n\nAdditional Requirements:\n- Use Markdown format with ## headings for each major section\n- Use ## headings generously — each sub-topic should have its own ## heading\n- Include real-world Indian examples\n- Exam-focused: highlight frequently-asked areas\n- For science/math: include formulas in $...$\n- Reference NCERT concepts and terminology where applicable\n- Be thorough and cover every aspect needed for this level.\n\nWrite ONLY the Markdown content.`;
      const startTime = performance.now();

      // Inner: one attempt at the primary generator. Pulled out so we
      // can call it twice if the verifier flags low confidence on the
      // first pass (regenerate-with-feedback loop).
      async function generateOnce(extraInstr?: string): Promise<string> {
        if (!openai) throw new Error('OPENAI_API_KEY not configured');
        const finalPrompt = extraInstr ? `${prompt}\n\nADDITIONAL CONSTRAINTS FROM VERIFIER:\n${extraInstr}` : prompt;
        const c = await openai.chat.completions.create({
          model: 'gpt-4o',
          messages: [{ role: 'user', content: finalPrompt }],
          temperature: 0.6,
          max_tokens: 8000,
        });
        return c.choices[0]?.message?.content ?? '';
      }

      try {
        // Layer 1: primary generation.
        let content = await generateOnce();
        let verdict: VerificationVerdict | null = null;
        let regenerated = false;

        // Layer 2: cross-check via @nexigrate/ai-pipeline.
        if (chapterVerifier && content.trim().length >= 100) {
          verdict = await chapterVerifier(content, {
            exam,
            subject,
            chapter,
            language,
            level: userContext?.onboardingLevel ?? 'intermediate',
          });

          // Regenerate ONCE if confidence is below threshold AND the
          // verifier produced concrete issues we can feed back. Capped
          // at a single retry so we never burn 3x cost on a chronic
          // hallucination -- in that case we ship with the warning and
          // let the admin dashboard surface the low-confidence row.
          if (!verdict.verified && verdict.issues.length > 0 && verdict.confidence < 0.7) {
            const feedback = verdict.issues
              .map((i) => `- ${i.kind}: ${i.message}${i.excerpt ? ` (excerpt: "${i.excerpt}")` : ''}`)
              .join('\n');
            const retryHint = `Your previous draft had these issues, fix them:\n${feedback}`;
            const retried = await generateOnce(retryHint);
            if (retried.trim().length >= 100) {
              content = retried;
              regenerated = true;
              verdict = await chapterVerifier(content, {
                exam, subject, chapter, language,
                level: userContext?.onboardingLevel ?? 'intermediate',
              });
            }
          }
        }

        const tokens = estimateTokens(content + prompt);
        const latencyMs = Math.round(performance.now() - startTime);
        logAICallToStore(store, 'gpt-4o', tokens, estimateCost('gpt-4o', tokens), latencyMs, undefined, {
          status: 'success',
          endpoint: 'generateChapterContent',
          provider: 'openai',
          requestPreview: prompt.slice(0, 200),
          responsePreview: content.slice(0, 300),
        });
        // The verifier verdict is logged separately so the admin can
        // see, per-chapter, which were verified vs which shipped on the
        // verifier's fallback path. Issues are summarised, not the full
        // raw response (that's only useful for one-off debugging and
        // would bloat the log store).
        if (verdict) {
          logger.info('ai.chapter_verified', {
            chapter,
            subject,
            exam,
            language,
            verifier: verdict.verifier,
            verified: verdict.verified,
            confidence: verdict.confidence,
            issueCount: verdict.issues.length,
            issueKinds: verdict.issues.map((i) => i.kind),
            verifierLatencyMs: verdict.latencyMs,
            regenerated,
          });
        }
        logger.info('ai.chapter_generated', {
          chapter,
          subject,
          exam,
          language,
          words: content.split(/\s+/).length,
          regenerated,
        });
        return content;
      } catch (err) {
        logger.error('ai.chapter_error', { error: err instanceof Error ? err.message : String(err) });
        throw new Error('Failed to generate chapter content');
      }
    },

    async generateChapterMCQs(chapter, subject, exam, language = 'en', count = 10, seed?: string, chapterContent?: string, userLevel?: 'beginner' | 'intermediate' | 'advanced') {
      const langInstr = language === 'hi' ? 'Generate in Hindi (Devanagari).' : 'Generate in English.';
      const seedInstr = seed ? `\nVariation seed: ${seed}. Make these questions DIFFERENT from previous attempts. Use creative angles, tricky options, and less common facts from the content.` : '';
      const contentContext = chapterContent ? `\n\nIMPORTANT: Generate questions ONLY from this specific chapter content. Do NOT ask about topics not covered here:\n---\n${chapterContent.slice(0, 3000)}\n---` : '';

      // Difficulty distribution based on user level
      let difficultyMix: string;
      let difficultyStyle: string;
      if (userLevel === 'beginner') {
        difficultyMix = '6 easy, 3 medium, 1 hard';
        difficultyStyle = 'Beginner MCQs: factual recall, straightforward options, test basic understanding.';
      } else if (userLevel === 'advanced') {
        difficultyMix = '1 easy, 3 medium, 6 hard';
        difficultyStyle = 'Advanced MCQs: analysis-based, all 4 options should be plausible, require deep understanding and critical thinking.';
      } else {
        difficultyMix = '3 easy, 4 medium, 3 hard';
        difficultyStyle = 'Intermediate MCQs: application-based, 2 close options that require careful thinking.';
      }

      const prompt = `Generate exactly ${count} UNIQUE multiple choice questions for chapter "${chapter}" (${subject}, ${exam}).\n${langInstr}${seedInstr}${contentContext}\n\nRules:\n- Questions MUST be based on the chapter content provided above\n- Do NOT ask about topics not covered in the chapter\n- Each question must have exactly 4 options (A/B/C/D), one correct answer, and a brief explanation\n- Mix: ${difficultyMix}\n- ${difficultyStyle}\n- Include explanation referencing the chapter content\n\nJSON only:\n{"questions":[{"id":"q1","question":"...","options":[{"key":"A","text":"..."},{"key":"B","text":"..."},{"key":"C","text":"..."},{"key":"D","text":"..."}],"correctOption":"A","explanation":"...","difficulty":"easy","subject":"${subject}","topic":"${chapter}"}]}`;
      const errors: string[] = [];
      if (groq) {
        try {
          const c = await groq.chat.completions.create({ model: 'llama-3.3-70b-versatile', messages: [{ role: 'user', content: prompt }], temperature: 0.7, max_tokens: 4096, response_format: { type: 'json_object' } });
          const parsed = JSON.parse(c.choices[0]?.message?.content ?? '{}') as { questions: GeneratedMCQ[] };
          if (parsed.questions?.length) { logger.info('ai.chapter_mcqs', { provider: 'groq', chapter, count: parsed.questions.length }); return parsed.questions; }
          errors.push('Groq returned empty');
        } catch (err) { errors.push(`Groq: ${err instanceof Error ? err.message : String(err)}`); }
      } else { errors.push('Groq not configured'); }
      if (openai) {
        try {
          const c = await openai.chat.completions.create({ model: 'gpt-4o', messages: [{ role: 'user', content: prompt }], temperature: 0.7, max_tokens: 4096, response_format: { type: 'json_object' } });
          const parsed = JSON.parse(c.choices[0]?.message?.content ?? '{}') as { questions: GeneratedMCQ[] };
          if (parsed.questions?.length) { logger.info('ai.chapter_mcqs', { provider: 'openai', chapter, count: parsed.questions.length }); return parsed.questions; }
          errors.push('OpenAI returned empty');
        } catch (err) { errors.push(`OpenAI: ${err instanceof Error ? err.message : String(err)}`); }
      } else { errors.push('OpenAI not configured'); }
      if (env.GEMINI_API_KEY && env.GEMINI_API_KEY.length > 5) {
        try {
          const r = await callGemini({ prompt, generationConfig: { temperature: 0.7, maxOutputTokens: 4096 }, tier: 'flash' });
          if (r.ok) {
            const rawText = r.text;
            const jsonMatch = rawText.match(/\{[\s\S]*\}/);
            if (jsonMatch) {
              const parsed = JSON.parse(jsonMatch[0]) as { questions: GeneratedMCQ[] };
              if (parsed.questions?.length) { logger.info('ai.chapter_mcqs', { provider: 'gemini', chapter, count: parsed.questions.length, model: r.model }); return parsed.questions; }
            }
          }
          errors.push(`Gemini failed${('error' in r) ? ': ' + r.error : ''}`);
        } catch (err) { errors.push(`Gemini: ${err instanceof Error ? err.message : String(err)}`); }
      } else { errors.push('Gemini not configured'); }
      logger.error('ai.chapter_mcqs_all_failed', { errors, chapter, subject, exam });
      logAICallToStore(store, 'all-providers', 0, 0, 0, undefined, { status: 'error', endpoint: 'generateChapterMCQs', error: errors.join('; '), requestPreview: `Chapter: ${chapter}, Subject: ${subject}` });
      throw new Error(`Failed to generate chapter MCQs: ${errors.join('; ')}`);
    },

    async generateMermaidDiagram(chapter, subject, exam) {
      const prompt = `Create a Mermaid.js flowchart (graph TD) that visually explains key concepts of "${chapter}" (${subject}, ${exam}).\n\nRequirements:\n- Max 12 nodes with clear, concise labels\n- Use meaningful connections with labels on arrows where helpful\n- Group related concepts visually\n- Valid Mermaid syntax only, no markdown fences\n- Use subgraphs if the topic has distinct sub-areas\n\nExample:\ngraph TD\n    A[Main Concept] --> B[Sub-concept 1]\n    A --> C[Sub-concept 2]\n    B --> D[Detail]\n    C --> E[Detail]`;
      try {
        // Use Gemini Flash for visual/diagram tasks (auto-resolved chain)
        if (env.GEMINI_API_KEY) {
          const r = await callGemini({ prompt, generationConfig: { temperature: 0.5, maxOutputTokens: 800 }, tier: 'flash' });
          if (r.ok) {
            const cleaned = r.text.replace(/```mermaid\n?/g, '').replace(/```\n?/g, '').trim();
            if (cleaned) { logger.info('ai.mermaid_gemini', { chapter, subject, exam, model: r.model }); return cleaned; }
          }
        }
        // Fallback to OpenAI if Gemini fails
        if (!openai) throw new Error("No AI API key configured");
        const c = await openai.chat.completions.create({ model: 'gpt-4o', messages: [{ role: 'user', content: prompt }], temperature: 0.5, max_tokens: 800 });
        const raw = c.choices[0]?.message?.content ?? '';
        const cleaned = raw.replace(/```mermaid\n?/g, '').replace(/```\n?/g, '').trim();
        logger.info('ai.mermaid_openai_fallback', { chapter, subject, exam });
        return cleaned;
      } catch (err) { logger.error('ai.mermaid_error', { error: err instanceof Error ? err.message : String(err) }); throw new Error('Failed to generate diagram'); }
    },

    async generateVisualization(topic: string, subject: string, exam: string, type: VisualizationType): Promise<VisualizationResult> {
      // For image type: try gpt-image-1 (current OpenAI flagship) -> DALL-E 3 ->
      // Gemini Imagen (multiple model names) -> mermaid fallback. Mermaid
      // never errors to the user (lock §3.8: 'image generation work kr nhi
      // raha hai' was caused by the legacy DALL-E 3 path returning short-
      // lived URLs that expired before the frontend could cache them, and
      // the Gemini preview model name being out of date).
      if (type === 'image') {
        // ─── Attempt 1: gpt-image-1 (March 2025+, base64 by default) ───
        //
        // gpt-image-1 is OpenAI's production image model that succeeded
        // DALL-E 3 in early 2025. It returns base64-encoded image data
        // (`b64_json`) so we can hand the frontend a `data:` URL that
        // never expires, fixing the legacy "image disappears after 1
        // hour" bug. Pricing on medium quality is roughly half of DALL-E
        // 3 standard (~$0.02 vs $0.04). Sizes supported: 1024x1024,
        // 1024x1536, 1536x1024.
        if (openai) {
          try {
            const startTime = performance.now();
            const imagePrompt = `Educational diagram of "${topic}" for Indian ${exam} students. Clean, labeled, black and white, textbook style. No watermark. Simple and clear for students.`;
            const imageRes = await openai.images.generate({
              model: 'gpt-image-1',
              prompt: imagePrompt,
              n: 1,
              size: '1024x1024',
              // gpt-image-1 quality scale is 'low' | 'medium' | 'high'
              // (not DALL-E 3's 'standard' | 'hd'). 'medium' gives a
              // ~10x cost vs 'low' for visibly-better diagrams.
              quality: 'medium',
              // Locks the non-streaming overload so the SDK return type
              // is `ImagesResponse` (not the streaming union). Without
              // `stream: false` here, openai@6 falls into the
              // `ImageGenerateParamsBase` overload and `data` is no
              // longer accessible without a runtime narrowing.
              stream: false,
            });
            const b64 = imageRes.data?.[0]?.b64_json;
            if (b64) {
              const dataUrl = `data:image/png;base64,${b64}`;
              const latencyMs = Math.round(performance.now() - startTime);
              logAICallToStore(store, 'gpt-image-1', 1, 0.02, latencyMs, undefined, {
                status: 'success',
                endpoint: 'generateVisualization',
                provider: 'openai',
                requestPreview: imagePrompt.slice(0, 200),
                responsePreview: 'Image generated as base64 data URL (gpt-image-1)',
              });
              logger.info('ai.visualization_image', { topic, subject, exam, provider: 'gpt-image-1' });
              return { type: 'image', content: dataUrl };
            }
          } catch (err) {
            logger.warn('ai.visualization_gpt_image_failed', {
              error: err instanceof Error ? err.message : String(err),
              topic,
            });
          }
        }

        // ─── Attempt 2: DALL-E 3 (legacy fallback) ─────────────────────
        //
        // Some org accounts still don't have gpt-image-1 access, so we
        // fall back to DALL-E 3 if the gpt-image-1 call errors. Same
        // shape as before -- returns a 1-hour URL, but better than no
        // image at all. Frontend should download + cache promptly.
        if (openai) {
          try {
            const startTime = performance.now();
            const imagePrompt = `Educational diagram of "${topic}" for Indian ${exam} students. Clean, labeled, black and white, textbook style. No watermark. Simple and clear for students.`;
            const imageRes = await openai.images.generate({
              model: 'dall-e-3',
              prompt: imagePrompt,
              n: 1,
              size: '1024x1024',
              quality: 'standard',
            });
            const imageUrl = imageRes.data?.[0]?.url;
            if (imageUrl) {
              const latencyMs = Math.round(performance.now() - startTime);
              logAICallToStore(store, 'dall-e-3', 1, 0.04, latencyMs, undefined, {
                status: 'success',
                endpoint: 'generateVisualization',
                provider: 'openai',
                requestPreview: imagePrompt.slice(0, 200),
                responsePreview: `Image URL generated (DALL-E 3 fallback): ${imageUrl.slice(0, 80)}...`,
              });
              logger.info('ai.visualization_image', { topic, subject, exam, provider: 'dalle3' });
              // Note: DALL-E URLs expire in ~1hr. Frontend should cache/download.
              return { type: 'image', content: imageUrl };
            }
          } catch (err) {
            logger.warn('ai.visualization_dalle_failed', { error: err instanceof Error ? err.message : String(err), topic });
          }
        }

        // ─── Attempt 3 + 4: Gemini image generation (auto-resolved) ───
        //
        // The image-tier chain in the registry handles model swapping
        // for us: `gemini-2.5-flash-image-preview` (new) is tried
        // first; if Google routes a 404 because the project hasn't
        // been migrated, the resolver blacklists it and falls through
        // to `gemini-2.0-flash-preview-image-generation` automatically.
        // No need for the manual loop below — it's encoded in the
        // chain order in aiProviderRegistry.ts.
        if (env.GEMINI_API_KEY) {
          const geminiImagePrompt = `Generate an educational black-and-white textbook-style diagram explaining "${topic}" for Indian ${exam} students. Clean labels, simple layout, no text watermarks.`;
          const r = await callGemini({
            prompt: geminiImagePrompt,
            generationConfig: { temperature: 0.4, maxOutputTokens: 4096, responseModalities: ['TEXT', 'IMAGE'] },
            tier: 'image',
          });
          if (r.ok) {
            const parts = (r.raw?.candidates?.[0]?.content?.parts ?? []) as Array<{ text?: string; inlineData?: { mimeType: string; data: string } }>;
            for (const part of parts) {
              if (part.inlineData?.data) {
                const dataUrl = `data:${part.inlineData.mimeType};base64,${part.inlineData.data}`;
                logger.info('ai.visualization_image', { topic, subject, exam, provider: 'gemini-imagen', model: r.model });
                return { type: 'image', content: dataUrl };
              }
            }
            logger.warn('ai.visualization_gemini_no_image_data', { topic, model: r.model, partsCount: parts.length });
          } else {
            logger.warn('ai.visualization_gemini_failed', { error: r.error, topic });
          }
        }

        // ─── Attempt 5: Detailed mermaid diagram (never error to user) ─
        logger.info('ai.visualization_image_fallback_to_diagram', { topic, subject, exam });
        // Fall through to generate a detailed diagram instead
      }

      // For diagram/mindmap/flowchart/timeline, use Mermaid syntax via Gemini/OpenAI
      let mermaidType: string;
      let mermaidExample: string;
      switch (type) {
        case 'mindmap':
          mermaidType = 'mindmap';
          mermaidExample = `mindmap\n  root((${topic}))\n    Branch 1\n      Sub-topic A\n      Sub-topic B\n    Branch 2\n      Sub-topic C`;
          break;
        case 'timeline':
          mermaidType = 'timeline';
          mermaidExample = `timeline\n    title Timeline of ${topic}\n    section Phase 1\n      Event 1 : Description\n    section Phase 2\n      Event 2 : Description`;
          break;
        case 'flowchart':
          mermaidType = 'flowchart (graph TD)';
          mermaidExample = `graph TD\n    A[Start] --> B{Decision}\n    B -->|Yes| C[Action 1]\n    B -->|No| D[Action 2]`;
          break;
        default: // 'diagram'
          mermaidType = 'flowchart (graph TD)';
          mermaidExample = `graph TD\n    A[Main Concept] --> B[Sub-concept 1]\n    A --> C[Sub-concept 2]\n    B --> D[Detail]`;
      }

      const prompt = `Create a Mermaid.js ${mermaidType} that visually explains key concepts of "${topic}" (${subject}, ${exam}).

Requirements:
- Use ${mermaidType} syntax
- Max 12-15 nodes with clear, concise labels
- Use meaningful connections with labels where helpful
- Valid Mermaid syntax ONLY, no markdown fences, no backticks
- Make it educational and easy to understand for students

Example format:
${mermaidExample}

Generate ONLY the Mermaid code, nothing else.`;

      try {
        // Use Gemini Flash for mermaid generation (cheap + fast, auto-resolved)
        if (env.GEMINI_API_KEY) {
          const r = await callGemini({ prompt, generationConfig: { temperature: 0.5, maxOutputTokens: 1000 }, tier: 'flash' });
          if (r.ok) {
            const cleaned = r.text.replace(/```mermaid\n?/g, '').replace(/```\n?/g, '').trim();
            if (cleaned) {
              logger.info('ai.visualization_mermaid', { type, topic, subject, exam, provider: 'gemini', model: r.model });
              return { type: 'mermaid', content: cleaned };
            }
          }
        }
        // Fallback to OpenAI
        if (!openai) throw new Error('No AI API key configured');
        const c = await openai.chat.completions.create({ model: 'gpt-4o', messages: [{ role: 'user', content: prompt }], temperature: 0.5, max_tokens: 1000 });
        const raw = c.choices[0]?.message?.content ?? '';
        const cleaned = raw.replace(/```mermaid\n?/g, '').replace(/```\n?/g, '').trim();
        logger.info('ai.visualization_mermaid', { type, topic, subject, exam, provider: 'openai' });
        return { type: 'mermaid', content: cleaned };
      } catch (err) {
        logger.error('ai.visualization_error', { type, error: err instanceof Error ? err.message : String(err) });
        throw new Error(`Failed to generate ${type} visualization`);
      }
    },

    async generateSyllabus(examSlug: string, examName: string, level: string) {
      const prompt = `You are an expert Indian education curriculum designer.\n\nGenerate a complete study syllabus for "${examName}" exam.\nStudent level: ${level}.\n\nRequirements:\n- 3-5 subjects relevant to this exam\n- 5-8 chapters per subject, ordered from basic to advanced\n- Each chapter: slug (kebab-case), name (English), nameHi (Hindi Devanagari), estimated study time in minutes\n- Each subject: slug, name, nameHi, icon (single emoji)\n- Order chapters logically for progressive learning\n\nRespond ONLY with valid JSON:\n{"exam":"${examSlug}","examName":"${examName}","subjects":[{"slug":"subject-slug","name":"Subject Name","nameHi":"विषय नाम","icon":"📚","chapters":[{"slug":"chapter-slug","name":"Chapter Name","nameHi":"अध्याय नाम","order":1,"estimatedMinutes":40}]}]}`;
      try {
        if (!openai) throw new Error("OPENAI_API_KEY not configured");
        const c = await openai.chat.completions.create({ model: 'gpt-4o', messages: [{ role: 'user', content: prompt }], temperature: 0.6, max_tokens: 4000, response_format: { type: 'json_object' } });
        const parsed = JSON.parse(c.choices[0]?.message?.content ?? '{}') as GeneratedSyllabus;
        logger.info('ai.syllabus_generated', { examSlug, subjects: parsed.subjects?.length ?? 0 });
        return parsed;
      } catch (err) { logger.error('ai.syllabus_error', { error: err instanceof Error ? err.message : String(err) }); throw new Error('Failed to generate syllabus'); }
    },

    async generateSelectionDiagram(selectedText: string, subject: string, language: 'en' | 'hi') {
      const langInstr = language === 'hi' ? 'Use Hindi labels in the diagram nodes.' : 'Use English labels.';
      const prompt = `Create a Mermaid.js diagram (graph TD or graph LR) that visually explains this concept from ${subject}:\n\n"${selectedText.slice(0, 500)}"\n\n${langInstr}\nRequirements:\n- Max 10 nodes with concise, clear labels\n- Show relationships/flow clearly\n- Valid Mermaid syntax only, no markdown fences\n- Use appropriate diagram type (flowchart for processes, graph for relationships)`;
      try {
        // Use Gemini Flash for visual tasks (auto-resolved chain)
        if (env.GEMINI_API_KEY) {
          const r = await callGemini({ prompt, generationConfig: { temperature: 0.5, maxOutputTokens: 600 }, tier: 'flash' });
          if (r.ok) {
            const cleaned = r.text.replace(/```mermaid\n?/g, '').replace(/```\n?/g, '').trim();
            if (cleaned) { logger.info('ai.selection_diagram_gemini', { subject, language, model: r.model }); return cleaned; }
          }
        }
        // Fallback to OpenAI
        if (!openai) throw new Error("No AI API key configured");
        const c = await openai.chat.completions.create({ model: 'gpt-4o', messages: [{ role: 'user', content: prompt }], temperature: 0.5, max_tokens: 600 });
        const raw = c.choices[0]?.message?.content ?? '';
        logger.info('ai.selection_diagram_openai_fallback', { subject, language });
        return raw.replace(/```mermaid\n?/g, '').replace(/```\n?/g, '').trim();
      } catch (err) { logger.error('ai.selection_diagram_error', { error: err instanceof Error ? err.message : String(err) }); throw new Error('Failed to generate diagram'); }
    },

    async generateCurrentAffairsQuiz(headlines: string, count = 20, language: 'en' | 'hi' = 'en') {
      const langInstr = language === 'hi' ? 'Generate ALL questions, options, and explanations in Hindi (Devanagari script).' : 'Generate in English.';
      const prompt = `You are a current affairs quiz generator for Indian competitive exams (UPSC, SSC, Banking).\n\nBased on today's news headlines below, generate exactly ${count} MCQs.\n${langInstr}\n\nHeadlines:\n${headlines.slice(0, 3000)}\n\nRequirements:\n- Questions should test factual recall from these headlines\n- 4 options (A-D), one correct answer\n- Mix difficulty: 7 easy, 8 medium, 5 hard\n- Include brief explanation for correct answer\n- Cover different categories (national, international, economy, science, sports)\n\nRespond ONLY with JSON:\n{"questions":[{"id":"ca-q1","question":"...","options":[{"key":"A","text":"..."},{"key":"B","text":"..."},{"key":"C","text":"..."},{"key":"D","text":"..."}],"correctOption":"A","explanation":"...","difficulty":"easy","subject":"current-affairs","topic":"national"}]}`;

      // Try Groq first (fast), then OpenAI fallback, then Gemini fallback
      const errors: string[] = [];

      // Attempt 1: Groq
      if (groq) {
        try {
          const c = await groq.chat.completions.create({ model: 'llama-3.3-70b-versatile', messages: [{ role: 'user', content: prompt }], temperature: 0.6, max_tokens: 6000, response_format: { type: 'json_object' } });
          const parsed = JSON.parse(c.choices[0]?.message?.content ?? '{}') as { questions: GeneratedMCQ[] };
          if (parsed.questions?.length) {
            logger.info('ai.ca_quiz_generated', { provider: 'groq', count: parsed.questions.length });
            return parsed.questions;
          }
          errors.push('Groq returned empty questions');
        } catch (err) {
          errors.push(`Groq: ${err instanceof Error ? err.message : String(err)}`);
          logger.warn('ai.ca_quiz_groq_failed', { error: errors[errors.length - 1] });
        }
      } else { errors.push('GROQ_API_KEY not configured'); }

      // Attempt 2: OpenAI
      if (openai) {
        try {
          const c = await openai.chat.completions.create({ model: 'gpt-4o', messages: [{ role: 'user', content: prompt }], temperature: 0.6, max_tokens: 6000, response_format: { type: 'json_object' } });
          const parsed = JSON.parse(c.choices[0]?.message?.content ?? '{}') as { questions: GeneratedMCQ[] };
          if (parsed.questions?.length) {
            logger.info('ai.ca_quiz_generated', { provider: 'openai', count: parsed.questions.length });
            return parsed.questions;
          }
          errors.push('OpenAI returned empty questions');
        } catch (err) {
          errors.push(`OpenAI: ${err instanceof Error ? err.message : String(err)}`);
          logger.warn('ai.ca_quiz_openai_failed', { error: errors[errors.length - 1] });
        }
      } else { errors.push('OPENAI_API_KEY not configured'); }

      // Attempt 3: Gemini (auto-resolved chain)
      if (env.GEMINI_API_KEY) {
        try {
          const r = await callGemini({ prompt, generationConfig: { temperature: 0.6, maxOutputTokens: 6000 }, tier: 'flash' });
          if (r.ok) {
            const rawText = r.text;
            const jsonMatch = rawText.match(/\{[\s\S]*\}/);
            if (jsonMatch) {
              const parsed = JSON.parse(jsonMatch[0]) as { questions: GeneratedMCQ[] };
              if (parsed.questions?.length) {
                logger.info('ai.ca_quiz_generated', { provider: 'gemini', count: parsed.questions.length, model: r.model });
                return parsed.questions;
              }
            }
            errors.push('Gemini returned no parseable questions');
          } else { errors.push(`Gemini: ${r.error}`); }
        } catch (err) {
          errors.push(`Gemini: ${err instanceof Error ? err.message : String(err)}`);
          logger.warn('ai.ca_quiz_gemini_failed', { error: errors[errors.length - 1] });
        }
      } else { errors.push('GEMINI_API_KEY not configured'); }

      logger.error('ai.ca_quiz_all_failed', { errors });
      throw new Error(`All AI providers failed for quiz generation: ${errors.join('; ')}`);
    },

    async chat(messages: { role: 'user' | 'assistant'; content: string }[], userContext: { exam: string; level: string; language: 'en' | 'hi' }, preferredModel?: 'gpt4o' | 'groq' | 'gemini'): Promise<string> {
      const langInstr = userContext.language === 'hi' ? 'Reply in Hindi (Devanagari script). Be concise.' : 'Reply in English. Be concise.';
      const systemPrompt = `You are Nexi, an AI study mentor for Indian competitive exam students. Student is preparing for ${userContext.exam} at ${userContext.level} level. ${langInstr}

Rules for your responses:
- When responding with code, use markdown code blocks with language identifier.
- When responding with a table, use markdown table syntax.
- When a concept can be shown as a diagram, output a Mermaid diagram in a \`\`\`mermaid code block.
- When giving a quote or important highlight, wrap it in a blockquote (> text).
- For step-by-step processes, use numbered lists.
- Always structure long responses with clear headings (## or ###).
- Be helpful, encouraging, and exam-focused. Keep answers under 300 words unless asked for detail.`;
      const chatMessages = [{ role: 'system' as const, content: systemPrompt }, ...messages.map(m => ({ role: m.role as 'user' | 'assistant', content: m.content }))];

      // Determine provider order based on preferredModel
      type Provider = 'groq' | 'openai' | 'gemini';
      let providerOrder: Provider[];
      switch (preferredModel) {
        case 'gpt4o': providerOrder = ['openai', 'groq', 'gemini']; break;
        case 'gemini': providerOrder = ['gemini', 'groq', 'openai']; break;
        case 'groq': providerOrder = ['groq', 'openai', 'gemini']; break;
        default: providerOrder = ['groq', 'openai', 'gemini']; break;
      }

      for (const provider of providerOrder) {
        if (provider === 'groq' && groq) {
          try {
            const startTime = performance.now();
            const c = await groq.chat.completions.create({ model: 'llama-3.3-70b-versatile', messages: chatMessages, temperature: 0.7, max_tokens: 1500 });
            const reply = c.choices[0]?.message?.content ?? '';
            if (reply) { const tokens = estimateTokens(reply); logAICallToStore(store, 'llama-3.3-70b-versatile', tokens, estimateCost('llama-3.3-70b-versatile', tokens), Math.round(performance.now() - startTime), undefined, { status: 'success', endpoint: 'chat', provider: 'groq', requestPreview: messages[messages.length - 1]?.content?.slice(0, 200), responsePreview: reply.slice(0, 300) }); logger.info('ai.chat', { provider: 'groq', length: reply.length, preferredModel }); return reply; }
          } catch (err) { logger.warn('ai.chat_groq_failed', { error: err instanceof Error ? err.message : String(err) }); }
        }
        if (provider === 'openai' && openai) {
          try {
            const startTime = performance.now();
            const c = await openai.chat.completions.create({ model: 'gpt-4o', messages: chatMessages, temperature: 0.7, max_tokens: 1500 });
            const reply = c.choices[0]?.message?.content ?? '';
            if (reply) { const tokens = estimateTokens(reply); logAICallToStore(store, 'gpt-4o', tokens, estimateCost('gpt-4o', tokens), Math.round(performance.now() - startTime), undefined, { status: 'success', endpoint: 'chat', provider: 'openai', requestPreview: messages[messages.length - 1]?.content?.slice(0, 200), responsePreview: reply.slice(0, 300) }); logger.info('ai.chat', { provider: 'openai', length: reply.length, preferredModel }); return reply; }
          } catch (err) { logger.warn('ai.chat_openai_failed', { error: err instanceof Error ? err.message : String(err) }); }
        }
        if (provider === 'gemini' && env.GEMINI_API_KEY && env.GEMINI_API_KEY.length > 5) {
          try {
            const geminiMessages = chatMessages.map(m => m.content).join('\n\n');
            const r = await callGemini({ prompt: geminiMessages, generationConfig: { temperature: 0.7, maxOutputTokens: 1500 }, tier: 'flash' });
            if (r.ok) {
              const reply = r.text;
              if (reply) { logger.info('ai.chat', { provider: 'gemini', length: reply.length, preferredModel, model: r.model }); return reply; }
            }
          } catch (err) { logger.warn('ai.chat_gemini_failed', { error: err instanceof Error ? err.message : String(err) }); }
        }
      }
      throw new Error('Chat AI unavailable. Please try again.');
    },

    async translateToHindi(items: { headline: string; summary: string }[]) {
      if (items.length === 0) return [];
      const prompt = `Translate the following news items to Hindi (Devanagari script). Keep them concise and factual.\n\nItems:\n${items.map((it, i) => `${i + 1}. Headline: ${it.headline}\n   Summary: ${it.summary}`).join('\n')}\n\nRespond ONLY with valid JSON:\n{"items":[{"headline":"हिंदी headline","summary":"हिंदी summary"}]}`;

      // Try Gemini first (cheap + fast for translation, auto-resolved)
      if (env.GEMINI_API_KEY) {
        try {
          const r = await callGemini({ prompt, generationConfig: { temperature: 0.2, maxOutputTokens: 3000 }, tier: 'flash' });
          if (r.ok) {
            const rawText = r.text;
            const jsonMatch = rawText.match(/\{[\s\S]*\}/);
            if (jsonMatch) {
              const parsed = JSON.parse(jsonMatch[0]) as { items: { headline: string; summary: string }[] };
              if (parsed.items?.length) {
                logger.info('ai.translate_hindi', { provider: 'gemini', count: parsed.items.length, model: r.model });
                return parsed.items;
              }
            }
          }
        } catch (err) { logger.warn('ai.translate_gemini_failed', { error: err instanceof Error ? err.message : String(err) }); }
      }

      // Fallback: Groq
      if (groq) {
        try {
          const c = await groq.chat.completions.create({ model: 'llama-3.3-70b-versatile', messages: [{ role: 'user', content: prompt }], temperature: 0.2, max_tokens: 3000, response_format: { type: 'json_object' } });
          const parsed = JSON.parse(c.choices[0]?.message?.content ?? '{}') as { items: { headline: string; summary: string }[] };
          if (parsed.items?.length) {
            logger.info('ai.translate_hindi', { provider: 'groq', count: parsed.items.length });
            return parsed.items;
          }
        } catch (err) { logger.warn('ai.translate_groq_failed', { error: err instanceof Error ? err.message : String(err) }); }
      }

      // Fallback: OpenAI
      if (openai) {
        try {
          const c = await openai.chat.completions.create({ model: 'gpt-4o', messages: [{ role: 'user', content: prompt }], temperature: 0.2, max_tokens: 3000, response_format: { type: 'json_object' } });
          const parsed = JSON.parse(c.choices[0]?.message?.content ?? '{}') as { items: { headline: string; summary: string }[] };
          if (parsed.items?.length) {
            logger.info('ai.translate_hindi', { provider: 'openai', count: parsed.items.length });
            return parsed.items;
          }
        } catch (err) { logger.warn('ai.translate_openai_failed', { error: err instanceof Error ? err.message : String(err) }); }
      }

      logger.warn('ai.translate_all_failed', { message: 'All providers failed, returning original items' });
      return items; // Return originals if all translation fails
    },

    async recordAICost(userId: string, costUsd: number): Promise<void> {
      if (!aiSpend || !userId || !Number.isFinite(costUsd) || costUsd <= 0) return;
      try {
        await aiSpend.recordSpend(userId as unknown as import('@nexigrate/shared').UserId, costUsd);
      } catch (err) {
        // Spend tracking is non-critical -- never block a user response on it.
        logger.warn('ai.record_cost_failed', { userId, costUsd, error: err instanceof Error ? err.message : String(err) });
      }
    },
  };
}
