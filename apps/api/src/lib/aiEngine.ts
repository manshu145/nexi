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
import { getFallbackQuestions } from './fallbackQuestions.js';

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
  /**
   * Generate a full mock test as difficulty SECTIONS (default 20 easy +
   * 20 medium + 10 hard = 50). Each section is generated in batches of 10
   * (with one retry per batch) across the resilient provider chain, in
   * parallel for speed. Short batches are topped up from the static
   * fallback bank so the caller always gets a full-length test; if too
   * few REAL questions came back it throws so the route can refund.
   */
  generateMockTest(examSlug: string, language: 'en' | 'hi', opts?: { easy?: number; medium?: number; hard?: number; userLevel?: 'beginner' | 'intermediate' | 'advanced'; weakSubjects?: string[]; avoidQuestions?: string[]; syllabusContext?: string | null }): Promise<GeneratedMCQ[]>;
  generateStage1Questions(examSlug: string, language: 'en' | 'hi', count?: number, syllabusContext?: string | null): Promise<GeneratedMCQ[]>;
  generateStage2Questions(examSlug: string, language: 'en' | 'hi', stage1Results: StageResults): Promise<GeneratedMCQ[]>;
  generateStage3Questions(examSlug: string, language: 'en' | 'hi', stage1Results: StageResults, stage2Results: StageResults): Promise<GeneratedMCQ[]>;
  scoreAssessment(questions: GeneratedMCQ[], answers: { questionId: string; chosen: string | null }[]): Promise<AssessmentResult>;
  scoreMultiStageAssessment(stage1: StageResults, stage2: StageResults, stage3: StageResults): Promise<AssessmentResult>;
  /**
   * Score the redesigned assessment: 15 exam MCQs + 5 reasoning MCQs.
   * Level is weighted 75% exam knowledge / 25% reasoning capacity; weak +
   * strong areas come from the exam questions' subject breakdown.
   */
  scoreAssessmentV2(examResults: StageResults, reasoningResults: StageResults): Promise<AssessmentResult>;
  generateChapterContent(chapter: string, subject: string, exam: string, language: 'en' | 'hi', userContext?: UserContext): Promise<string>;
  generateChapterMCQs(chapter: string, subject: string, exam: string, language: 'en' | 'hi', count?: number, seed?: string, chapterContent?: string, userLevel?: 'beginner' | 'intermediate' | 'advanced'): Promise<GeneratedMCQ[]>;
  /** Concise revision flashcards (front/back) for a chapter. */
  generateFlashcards(chapter: string, subject: string, exam: string, language: 'en' | 'hi', count?: number, chapterContent?: string): Promise<Array<{ front: string; back: string }>>;
  generateMermaidDiagram(chapter: string, subject: string, exam: string): Promise<string>;
  generateVisualization(topic: string, subject: string, exam: string, type: VisualizationType): Promise<VisualizationResult>;
  generateSyllabus(examSlug: string, examName: string, level: string): Promise<GeneratedSyllabus>;
  /** AI-estimate upcoming exam events (Prelims/Mains/registration) with month estimates. */
  generateExamDates(examSlug: string, examName: string): Promise<Array<{ name: string; estimatedMonth: string; sourceUrl: string }>>;
  generateSelectionDiagram(selectedText: string, subject: string, language: 'en' | 'hi'): Promise<string>;
  generateCurrentAffairsQuiz(headlines: string, count?: number, language?: 'en' | 'hi'): Promise<GeneratedMCQ[]>;
  /**
   * Reconstruct a "previous year pattern" question paper for an exam's
   * given session year. Grounded (web search when available) on the real
   * topics, weightage, and difficulty of that exam — returned as MCQs
   * with answers + explanations. This is an AI-reconstructed PRACTICE set
   * modelled on the previous-year pattern, NOT a verbatim copy of the
   * copyrighted original; the route + UI label it as such. Shared +
   * cached per (exam, year, language) by the PYQ store.
   */
  generatePYQPaper(examSlug: string, examName: string, year: number, language: 'en' | 'hi', count?: number): Promise<GeneratedMCQ[]>;
  translateToHindi(items: { headline: string; summary: string; bullets?: string[] }[]): Promise<{ headline: string; summary: string; bullets?: string[] }[]>;
  chat(messages: { role: 'user' | 'assistant'; content: string }[], userContext: { exam: string; level: string; language: 'en' | 'hi' }, preferredModel?: 'gpt4o' | 'groq' | 'gemini'): Promise<string>;
  /**
   * Generate an SEO-friendly blog draft (lock §5.3).
   *
   * Returns markdown-formatted body. The admin then reviews + edits in
   * /admin/blog before publishing -- AI assists, human ships. The prompt
   * asks for canonical structure (H2 sections, intro + body + takeaway,
   * 800-1500 words) so drafts are consistent across topics.
   *
   * Hindi drafts are generated in Devanagari, English in plain prose.
   * Both stay under the per-call AI budget by capping max_tokens at
   * ~3500 (a 1500-word post fits comfortably under that).
   */
  generateBlogDraft(input: { topic: string; outline?: string; language: 'en' | 'hi'; targetExam?: string }): Promise<string>;
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
  // `costPer1kUsd` is the rate PER 1,000 tokens, so divide by 1000 — the
  // previous code multiplied by raw token count, inflating every logged AI
  // cost ~1000x (which is why "AI Cost Today" was meaningless).
  return (getCostPer1k('', model) * tokens) / 1000;
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
   * Auto-switching OpenAI chat-completion. THE fix for the platform-wide
   * "503 / Internal Server Error" outage where chapter content, essay
   * grading, mock tests, syllabus + diagram generation all died: every
   * call site hardcoded `model: 'gpt-4o'`, but the active OpenAI key/plan
   * only has `gpt-4o-mini` access, so gpt-4o returned 404 "model does not
   * exist / you do not have access" and the whole call threw.
   *
   * This helper resolves the best AVAILABLE OpenAI model — pro tier
   * (gpt-4o) first, then flash tier (gpt-4o-mini) — calls the completion,
   * and reports success/failure so a deprecated/unavailable model gets
   * blacklisted and skipped next time. Returns the SAME ChatCompletion
   * shape as openai.chat.completions.create so call sites only drop the
   * hardcoded `model` field and keep reading `.choices[0].message.content`.
   *
   * Founder directive honoured: no model is hardcoded anywhere — the
   * registry chain + resolver decide what runs.
   */
  async function oaCreate(
    params: Omit<OpenAI.Chat.Completions.ChatCompletionCreateParamsNonStreaming, 'model'>,
  ): Promise<OpenAI.Chat.Completions.ChatCompletion> {
    const attempts: Array<{ client: OpenAI; model: string }> = [];
    const pro = await getOpenAIClient();
    if (pro) attempts.push(pro);
    const flash = await getOpenAIClientFlash();
    if (flash && !attempts.some(a => a.model === flash.model)) attempts.push(flash);
    if (attempts.length === 0) throw new Error('OPENAI_API_KEY not configured');
    let lastErr: unknown;
    for (const a of attempts) {
      try {
        const c = await a.client.chat.completions.create({ ...params, model: a.model });
        if (resolver) void resolver.reportModelSuccess('openai', a.model);
        return c;
      } catch (err) {
        lastErr = err;
        if (resolver) await resolver.reportModelFailure('openai', a.model, err instanceof Error ? err.message : String(err));
      }
    }
    throw lastErr ?? new Error('OpenAI completion failed for every available model');
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
    // No hardcoded model (founder directive: "kisi bhi model ko fix mt
    // krna... jo available ho usme auto switch ho jaye"). getGroqClient()
    // resolves the topmost non-blacklisted Groq model from the registry
    // chain; we report success/failure so a deprecated model auto-
    // blacklists for the next call and the chain steps forward on its own.
    const groqResolved = await getGroqClient();
    if (groqResolved) {
      try {
        const completion = await withRetryOnTransient('groq', () =>
          groqResolved.client.chat.completions.create({
            model: groqResolved.model,
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
          if (resolver) void resolver.reportModelSuccess('groq', groqResolved.model);
          const tokens = estimateTokens(raw);
          logAICallToStore(store, groqResolved.model, tokens, estimateCost(groqResolved.model, tokens), 0, undefined, { status: 'success', endpoint, provider: 'groq', requestPreview: prompt.slice(0, 200), responsePreview: raw.slice(0, 300) });
          logger.info('ai.questions_generated', { provider: 'groq', model: groqResolved.model, endpoint, examSlug, language, count: recovered.length, finishReason });
          return recovered;
        }
        errors.push(`Groq(${groqResolved.model}) returned ${raw.length} chars, no parseable questions (finish=${finishReason}, preview="${raw.slice(0, 120).replace(/\s+/g, ' ')}")`);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        if (resolver) await resolver.reportModelFailure('groq', groqResolved.model, msg);
        errors.push(`Groq(${groqResolved.model}): ${msg}`);
      }
    } else {
      errors.push('Groq not configured');
    }

    // ── Provider 2: OpenAI (reliable JSON) ───────────────────────────
    // No hardcoded model. The previous code hardcoded 'gpt-4o', which
    // 404'd ("model does not exist / you do not have access") on the
    // active key/plan — per /diag/ai/test the key only has gpt-4o-mini
    // access. That silently knocked OpenAI out of the fallback chain and
    // left only Groq (which truncates Hindi JSON) → ~8/10 assessment
    // failures for new users. getOpenAIClientFlash() resolves the topmost
    // non-blacklisted OpenAI *flash* model (gpt-4o-mini) which is
    // confirmed reachable and produces reliable MCQ JSON; if it ever gets
    // deprecated the resolver auto-switches to the next chain entry.
    const openaiResolved = await getOpenAIClientFlash();
    if (openaiResolved) {
      try {
        const completion = await withRetryOnTransient('openai', () =>
          openaiResolved.client.chat.completions.create({
            model: openaiResolved.model,
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
          if (resolver) void resolver.reportModelSuccess('openai', openaiResolved.model);
          const tokens = estimateTokens(raw);
          logAICallToStore(store, openaiResolved.model, tokens, estimateCost(openaiResolved.model, tokens), 0, undefined, { status: 'success', endpoint, provider: 'openai', requestPreview: prompt.slice(0, 200), responsePreview: raw.slice(0, 300) });
          logger.info('ai.questions_generated', { provider: 'openai', model: openaiResolved.model, endpoint, examSlug, language, count: recovered.length, finishReason });
          return recovered;
        }
        errors.push(`OpenAI(${openaiResolved.model}) returned ${raw.length} chars, no parseable questions (finish=${finishReason}, preview="${raw.slice(0, 120).replace(/\s+/g, ' ')}")`);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        if (resolver) await resolver.reportModelFailure('openai', openaiResolved.model, msg);
        errors.push(`OpenAI(${openaiResolved.model}): ${msg}`);
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
      try {
        return await _generateQuestionsBatched(buildPrompt, count, 3, 'generateAssessmentQuestions', examSlug, language, 'a');
      } catch (err) {
        // Last-resort safety net: every AI provider failed. Rather than
        // dead-ending a brand-new user on the onboarding assessment, serve
        // a static bilingual question set so onboarding still completes.
        logger.error('ai.assessment_static_fallback', { endpoint: 'generateAssessmentQuestions', examSlug, language, count, error: err instanceof Error ? err.message.slice(0, 200) : String(err) });
        return getFallbackQuestions({ language: language === 'hi' ? 'hi' : 'en', count, idPrefix: 'a', offset: 0 });
      }
    },

    async generateMockTest(examSlug, language = 'en', opts) {
      const easy = opts?.easy ?? 20;
      const medium = opts?.medium ?? 20;
      const hard = opts?.hard ?? 10;
      const langInstr = language === 'hi' ? 'Generate all questions and options in Hindi (Devanagari script).' : 'Generate all questions and options in English.';

      // Grounding + personalization context (PR adaptive-learning):
      //  - syllabusContext: the exam's real subjects/chapters so questions
      //    stay on-syllabus instead of "any X-exam question".
      //  - weakSubjects: bias coverage toward the student's weak areas.
      //  - avoidQuestions: recent question stems the student has already seen,
      //    so a fresh attempt doesn't repeat earlier mock/quiz questions.
      const syllabusBlock = opts?.syllabusContext
        ? `\n\nThe OFFICIAL ${examSlug} syllabus is below. EVERY question MUST map to one of these subjects/topics — do not stray off-syllabus:\n${opts.syllabusContext}`
        : `\n\nCover DIFFERENT subjects/topics from the official ${examSlug} syllabus.`;
      const weakBlock = opts?.weakSubjects && opts.weakSubjects.length > 0
        ? `\n- Allocate a few extra questions to the student's WEAK areas: ${opts.weakSubjects.join(', ')}.`
        : '';
      const levelBlock = opts?.userLevel
        ? `\n- Calibrate overall toughness for a ${opts.userLevel.toUpperCase()}-level aspirant (without changing the per-batch difficulty rule below).`
        : '';
      // Keep the avoid-list bounded so the prompt stays small; the route also
      // hash-filters exact repeats as a safety net.
      const avoidBlock = opts?.avoidQuestions && opts.avoidQuestions.length > 0
        ? `\n- DO NOT repeat, reuse, or lightly reword any of these questions the student has already attempted:\n${opts.avoidQuestions.slice(0, 40).map((q, i) => `  ${i + 1}. ${q.slice(0, 120)}`).join('\n')}`
        : '';

      const buildPrompt = (n: number, difficulty: 'easy' | 'medium' | 'hard', batchIdx: number) =>
        `${JSON_ONLY_PREFIX}You are an expert Indian competitive exam question creator.\n\nGenerate exactly ${n} ${difficulty.toUpperCase()}-difficulty MCQs for "${examSlug}" exam mock test${batchIdx > 0 ? ` (continuation batch ${batchIdx + 1})` : ''}.\n${langInstr}${syllabusBlock}\n\nRequirements:\n- ALL ${n} questions MUST be ${difficulty} difficulty.\n- ${difficulty === 'hard' ? 'Analytical / multi-step; all 4 options plausible; require deep understanding.' : difficulty === 'medium' ? 'Application-based; require careful thought; at least 2 close options.' : 'Direct factual recall; one clearly correct answer.'}${levelBlock}${weakBlock}${avoidBlock}\n- 4 options (A-D), correct answer, brief explanation.\n- MUST include subject and topic fields.\n\nRespond ONLY with JSON:\n{"questions":[{"id":"m-q1","question":"...","options":[{"key":"A","text":"..."},{"key":"B","text":"..."},{"key":"C","text":"..."},{"key":"D","text":"..."}],"correctOption":"A","explanation":"...","difficulty":"${difficulty}","subject":"...","topic":"..."}]}`;

      // Build batch specs: chunks of 10 per difficulty.
      const specs: { difficulty: 'easy' | 'medium' | 'hard'; count: number }[] = [];
      const chunk = (total: number, difficulty: 'easy' | 'medium' | 'hard') => {
        let rem = total;
        while (rem > 0) { const n = Math.min(10, rem); specs.push({ difficulty, count: n }); rem -= n; }
      };
      chunk(easy, 'easy'); chunk(medium, 'medium'); chunk(hard, 'hard');

      // One retry per batch, run in parallel. Each _generateQuestions call
      // already falls across Groq -> OpenAI -> Gemini internally, so a
      // single provider hiccup doesn't sink a batch.
      const runBatch = async (spec: { difficulty: 'easy' | 'medium' | 'hard'; count: number }, idx: number): Promise<GeneratedMCQ[]> => {
        for (let attempt = 0; attempt < 2; attempt++) {
          try {
            const qs = await _generateQuestions(buildPrompt(spec.count, spec.difficulty, idx), `generateMockTest_${spec.difficulty}`, examSlug, language);
            if (qs.length > 0) return qs.map((q) => ({ ...q, difficulty: spec.difficulty }));
          } catch { /* retry once */ }
        }
        return [];
      };

      const settled = await Promise.allSettled(specs.map((s, i) => runBatch(s, i)));
      const byDiff: Record<'easy' | 'medium' | 'hard', GeneratedMCQ[]> = { easy: [], medium: [], hard: [] };
      settled.forEach((r, i) => {
        if (r.status === 'fulfilled') byDiff[specs[i]!.difficulty].push(...r.value);
      });

      const realCount = byDiff.easy.length + byDiff.medium.length + byDiff.hard.length;
      const target = easy + medium + hard;
      // If too little REAL content came back, fail so the route refunds
      // rather than handing the user a test padded with repeated fallbacks.
      if (realCount < Math.ceil(target * 0.5)) {
        throw new Error(`Mock test generation produced only ${realCount}/${target} real questions`);
      }

      // Top up any short section from the static bank so the test is full.
      const topUp = (arr: GeneratedMCQ[], wanted: number, difficulty: 'easy' | 'medium' | 'hard', idPrefix: string): GeneratedMCQ[] => {
        if (arr.length >= wanted) return arr.slice(0, wanted);
        const fb = getFallbackQuestions({ language: language === 'hi' ? 'hi' : 'en', count: wanted - arr.length, idPrefix, offset: arr.length })
          .map((q) => ({ ...q, difficulty }));
        return [...arr, ...fb];
      };

      const all = [
        ...topUp(byDiff.easy, easy, 'easy', 'me'),
        ...topUp(byDiff.medium, medium, 'medium', 'mm'),
        ...topUp(byDiff.hard, hard, 'hard', 'mh'),
      ].map((q, i) => ({ ...q, id: `m-q${i + 1}` }));

      logger.info('ai.mock_test_generated', {
        examSlug, language,
        easy: byDiff.easy.length, medium: byDiff.medium.length, hard: byDiff.hard.length,
        real: realCount, total: all.length,
      });
      return all;
    },

    async generateStage1Questions(examSlug, language = 'en', count = 15, syllabusContext) {
      const langInstr = language === 'hi' ? 'Generate all questions and options in Hindi (Devanagari script).' : 'Generate all questions and options in English.';
      const buildPrompt = (n: number, batchIdx: number) => {
        // Prefer the exam's REAL curated syllabus (subjects + chapters) when
        // we have it, so assessment questions are genuinely on-syllabus
        // rather than the model's loose idea of the exam. Fall back to the
        // generic exam-family guidance only when no curated syllabus exists.
        const subjectGuidance = syllabusContext
          ? `Generate questions STRICTLY from this official "${examSlug}" syllabus. Distribute questions across these subjects proportionally and stay on-topic:\n${syllabusContext}`
          : `Based on the exam "${examSlug}", generate questions covering the OFFICIAL SYLLABUS subjects:\n- If exam is UPSC/upsc-cse: test History + Geography + Polity + Economy + Science\n- If exam is NEET/neet-ug: test Physics + Chemistry + Biology\n- If exam is JEE/jee-main: test Physics + Chemistry + Mathematics\n- If exam is SSC CGL/ssc-cgl or Banking: test Reasoning + Quant + GK + English\n- If exam is Class 10/class-10-cbse or Class 12/class-12-cbse: test Math + Science + Social Science + English\n- If exam is IT/Python/Web Dev/Data Science/digital-marketing/tally-accounting: test relevant technical topics proportionally\n- For any other exam: identify its core subjects and distribute questions proportionally`;
        return `${JSON_ONLY_PREFIX}You are an expert Indian competitive exam question creator.\n\nGenerate exactly ${n} MCQs for "${examSlug}" exam — Stage 1 Core Subjects assessment${batchIdx > 0 ? ` (continuation batch ${batchIdx + 1})` : ''}.\n${langInstr}\n\n${subjectGuidance}\n\nRequirements:\n- Mix of easy and medium difficulty\n- 4 options (A-D), correct answer, brief explanation\n- MUST include subject and topic fields for each question\n- Questions must be relevant to the SPECIFIC exam syllabus\n\nRespond ONLY with JSON:\n{"questions":[{"id":"s1-q1","question":"...","options":[{"key":"A","text":"..."},{"key":"B","text":"..."},{"key":"C","text":"..."},{"key":"D","text":"..."}],"correctOption":"A","explanation":"...","difficulty":"medium","subject":"history","topic":"modern-india"}]}`;
      };
      // 15 questions → fallback: 3 batches of 5. Single-shot fast-path stays.
      try {
        return await _generateQuestionsBatched(buildPrompt, count, Math.max(1, Math.ceil(count / 5)), 'generateStage1Questions', examSlug, language, 's1');
      } catch (err) {
        logger.error('ai.assessment_static_fallback', { endpoint: 'generateStage1Questions', examSlug, language, error: err instanceof Error ? err.message.slice(0, 200) : String(err) });
        return getFallbackQuestions({ language: language === 'hi' ? 'hi' : 'en', count, idPrefix: 's1', offset: 0 });
      }
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
      try {
        return await _generateQuestionsBatched(buildPrompt, 8, 2, 'generateStage2Questions', examSlug, language, 's2');
      } catch (err) {
        logger.error('ai.assessment_static_fallback', { endpoint: 'generateStage2Questions', examSlug, language, error: err instanceof Error ? err.message.slice(0, 200) : String(err) });
        return getFallbackQuestions({ language: language === 'hi' ? 'hi' : 'en', count: 8, idPrefix: 's2', offset: 4 });
      }
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
      try {
        return await _generateQuestions(prompt, 'generateStage3Questions', examSlug, language);
      } catch (err) {
        logger.error('ai.assessment_static_fallback', { endpoint: 'generateStage3Questions', examSlug, language, error: err instanceof Error ? err.message.slice(0, 200) : String(err) });
        return getFallbackQuestions({ language: language === 'hi' ? 'hi' : 'en', count: 5, idPrefix: 's3', offset: 8 });
      }
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
          const completion = await oaCreate({ messages: [{ role: 'user', content: prompt }], temperature: 0.5, max_tokens: 300, response_format: { type: 'json_object' } });
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

    async scoreAssessmentV2(examResults, reasoningResults) {
      const scoreStage = (sr: StageResults) => {
        let correct = 0;
        for (const a of sr.answers) {
          const q = sr.questions.find(qq => qq.id === a.questionId);
          if (q && a.chosen === q.correctOption) correct++;
        }
        return { correct, total: sr.questions.length, pct: sr.questions.length > 0 ? (correct / sr.questions.length) * 100 : 0 };
      };

      const exam = scoreStage(examResults);
      const reasoning = scoreStage(reasoningResults);

      // Exam knowledge weighted 75%, reasoning capacity 25%.
      const totalPct = (exam.pct * 0.75) + (reasoning.pct * 0.25);
      const totalCorrect = exam.correct + reasoning.correct;
      const totalQuestions = exam.total + reasoning.total;
      const level: 'beginner' | 'intermediate' | 'advanced' = totalPct > 70 ? 'advanced' : totalPct >= 40 ? 'intermediate' : 'beginner';

      // Weak/strong areas from the exam questions' subjects.
      const subjectScores: Record<string, { correct: number; total: number }> = {};
      for (const q of examResults.questions) {
        const subj = q.subject ?? 'general';
        if (!subjectScores[subj]) subjectScores[subj] = { correct: 0, total: 0 };
        subjectScores[subj]!.total++;
        const ans = examResults.answers.find(a => a.questionId === q.id);
        if (ans && ans.chosen === q.correctOption) subjectScores[subj]!.correct++;
      }
      const weakAreas: string[] = [];
      const strongAreas: string[] = [];
      for (const [subj, sc] of Object.entries(subjectScores)) {
        const pct = sc.total > 0 ? (sc.correct / sc.total) * 100 : 0;
        if (pct < 40) weakAreas.push(subj);
        else if (pct > 70) strongAreas.push(subj);
      }

      try {
        const prompt = `A student finished an onboarding assessment for an Indian competitive exam.\nExam-knowledge: ${exam.correct}/${exam.total} (${exam.pct.toFixed(0)}%). Reasoning: ${reasoning.correct}/${reasoning.total} (${reasoning.pct.toFixed(0)}%).\nLevel assigned: ${level}. Weak: ${weakAreas.join(', ') || 'none'}. Strong: ${strongAreas.join(', ') || 'none'}.\nWrite a short encouraging message. Respond ONLY JSON:\n{"message":"English (2-3 sentences)","messageHi":"Hindi Devanagari (2-3 sentences)"}`;
        if (openai) {
          const completion = await oaCreate({ messages: [{ role: 'user', content: prompt }], temperature: 0.5, max_tokens: 300, response_format: { type: 'json_object' } });
          const parsed = JSON.parse(completion.choices[0]?.message?.content ?? '{}') as { message: string; messageHi: string };
          if (parsed.message) {
            return { score: totalCorrect, total: totalQuestions, level, message: parsed.message, messageHi: parsed.messageHi, weakAreas, strongAreas };
          }
        }
      } catch (err) {
        logger.error('ai.score_v2_error', { error: err instanceof Error ? err.message : String(err) });
      }

      return {
        score: totalCorrect,
        total: totalQuestions,
        level,
        message: `You scored ${totalCorrect}/${totalQuestions} (${totalPct.toFixed(0)}%). Level: ${level}. Let's personalise your learning!`,
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
        const completion = await oaCreate({ messages: [{ role: 'user', content: prompt }], temperature: 0.5, max_tokens: 300, response_format: { type: 'json_object' } });
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

      // ── Tier (level) configuration ───────────────────────────────────
      // The student-facing level maps to a quality tier. Depth + word
      // count scale with the tier; the SECTION STRUCTURE is the same for
      // every tier so each chapter is genuinely exam-complete (no more
      // shallow "khana-purti" content).
      const level = userContext?.onboardingLevel ?? 'intermediate';
      const tier =
        level === 'beginner'
          ? {
              name: 'FOUNDATION',
              desc: 'The student is NEW to this subject. Build basics from scratch, explain every term, use daily-life analogies. Assume NO prior knowledge — but still cover the full topic, do not skip the hard parts (introduce them gently).',
              minWords: 1000,
              maxWords: 1200,
            }
          : level === 'advanced'
            ? {
                name: 'MASTERY',
                desc: 'The student has STRONG preparation. Go deep and analytical, assume solid basics, add inter-topic connections, the examiner\u2019s perspective, tricky/high-difficulty areas, and recent developments (last 5 years).',
                minWords: 1500,
                maxWords: 1800,
              }
            : {
                name: 'STRENGTHENING',
                desc: 'The student has a decent base. Give a clear, exam-focused explanation: define technical terms briefly, emphasise application, and connect concepts to how they are actually tested.',
                minWords: 1200,
                maxWords: 1500,
              };

      // ── Subject-aware rules ──────────────────────────────────────────
      // Forces concrete, verifiable detail appropriate to the subject so
      // the AI cannot get away with vague generalities.
      const s = `${subject} ${chapter}`.toLowerCase();
      let subjectRule: string;
      if (/history|इतिहास|culture|संस्कृति|freedom|movement|आंदोलन/.test(s)) {
        subjectRule = 'HISTORY topic: every event MUST carry an exact date/year; name the people, dynasties, movements and treaties involved; explain cause \u2192 effect \u2192 significance.';
      } else if (/polity|constitution|राजव्यवस्था|संविधान|governance|शासन|civics/.test(s)) {
        subjectRule = 'POLITY topic: cite specific Article numbers, constitutional provisions, key Amendments, landmark Supreme Court cases, and name the institutions involved.';
      } else if (/econom|अर्थ|finance|वित्त|banking|बैंक|budget|बजट/.test(s)) {
        subjectRule = 'ECONOMY topic: include relevant government schemes, key figures/data (clearly note that current figures change over time), economic terms with definitions, and recent policy developments.';
      } else if (/physic|भौतिक/.test(s)) {
        subjectRule = 'PHYSICS topic: include every relevant formula in $...$ with each symbol explained and SI units; show a short derivation where needed; include at least one fully worked numerical example.';
      } else if (/chemis|रसायन/.test(s)) {
        subjectRule = 'CHEMISTRY topic: include balanced reactions/equations, formulas, periodic trends where relevant, and the exam-important exceptions students forget.';
      } else if (/bio|जीव|botany|वनस्पति|zoology|प्राणि/.test(s)) {
        subjectRule = 'BIOLOGY topic: describe key labelled diagrams in words, define scientific terms, explain processes step-by-step, and stick to NCERT-line facts.';
      } else if (/math|गणित|quantitative|aptitude|अभियोग्यता|reasoning|तर्क/.test(s)) {
        subjectRule = 'MATH/QUANT topic: include formulas, at least two step-by-step worked examples, time-saving shortcuts/tricks, and the common traps that cost marks.';
      } else if (/geograph|भूगोल/.test(s)) {
        subjectRule = 'GEOGRAPHY topic: describe maps/locations in words, give specific place names (rivers, ranges, regions), explain the mechanism behind phenomena, and include relevant data.';
      } else if (/current|समसामयिक|affairs/.test(s)) {
        subjectRule = 'CURRENT-AFFAIRS topic: focus on developments from the last 1\u20135 years with dates and names; clearly flag anything time-sensitive.';
      } else if (/english|अंग्रेज|language|भाषा|hindi|हिन्दी|grammar|व्याकरण/.test(s)) {
        subjectRule = 'LANGUAGE topic: state each rule with clear examples, show the common error patterns, and add practice-style illustrations.';
      } else {
        subjectRule = 'Use specific, verifiable facts (names, numbers, dates, definitions) throughout \u2014 never vague generalities.';
      }

      // Light personalization (kept secondary to canonical tier quality).
      const weakStr = userContext?.weakAreas?.length
        ? `\n- The student is weaker in: ${userContext.weakAreas.slice(0, 5).join(', ')} \u2014 add a little extra clarity wherever this chapter touches those areas.`
        : '';

      // Mandatory section headings, localised to the output language.
      const sectionList =
        language === 'hi'
          ? [
              '## परिचय (यह क्या है और परीक्षा के लिए क्यों ज़रूरी है)',
              '## मुख्य अवधारणाएँ (विस्तार से समझाएँ)',
              '## महत्वपूर्ण तथ्य एवं आँकड़े (बुलेट में, परीक्षा-केंद्रित)',
              '## पिछले वर्षों के प्रश्नों का स्वरूप (किस तरह के प्रश्न आते हैं)',
              '## याद रखने की ट्रिक्स (mnemonics/संक्षेप)',
              '## मुख्य बिंदु \u2014 रिवीज़न (5\u20137 बुलेट)',
            ]
          : [
              '## Introduction (what it is & why it matters for this exam)',
              '## Core Concepts (explained in depth)',
              '## Key Facts & Figures (bulleted, exam-focused)',
              '## Previous-Year Question Patterns (what kind of questions appear)',
              '## Memory Tricks (mnemonics / shortcuts)',
              '## Key Takeaways \u2014 Revision (5\u20137 bullets)',
            ];

      const prompt = `You are a SENIOR FACULTY MEMBER at one of India\u2019s top coaching institutes (think Vajiram & Ravi for UPSC, Allen for NEET/JEE) with 20+ years of experience. You know EXACTLY what is asked in ${exam} and what a student must know to score. You NEVER write filler, padding, or vague statements.

TASK: Write a COMPREHENSIVE, exam-ready chapter on "${chapter}" (subject: ${subject}) for ${exam}.
${langInstr}

SYLLABUS DISCIPLINE:
- Strictly follow the official ${exam} syllabus; cover only what is in the official curriculum for this topic.
- Ground factual content in NCERT/standard sources where applicable.
- Do NOT add topics outside the official syllabus.

TARGET TIER \u2014 ${tier.name}:
${tier.desc}
- LENGTH: ${tier.minWords}\u2013${tier.maxWords} words. This is a hard minimum \u2014 a short chapter is a FAILED chapter.

SUBJECT RULE:
- ${subjectRule}${weakStr}

MANDATORY STRUCTURE \u2014 use these exact Markdown section headings, in this order, and fill EVERY one with real substance:
${sectionList.join('\n')}

Within sections you may add more ## sub-headings as needed.

QUALITY RULES (strict):
- Every claim must be factual and accurate \u2014 no hallucinations.
- No vague lines like "this is very important" \u2014 say WHY and HOW, with specifics.
- Do not repeat the same point in different words; no filler phrases.
- Do not skip any mandatory section. Do not stop early.
- For science/math include formulas in $...$.
- Use real Indian examples, exact dates/numbers/names where relevant.
- Write in ${language === 'hi' ? 'pure Hindi (Devanagari)' : 'clear English'} throughout.

Write ONLY the Markdown content for the chapter \u2014 no preamble, no closing notes.`;
      const startTime = performance.now();

      // Inner: one attempt at content generation. Resilient across
      // providers (OpenAI auto-switch -> Groq -> Gemini) so a single
      // provider outage/quota doesn't 500 "Failed to generate chapter
      // content" — mirrors the syllabus generation chain. Pulled out so we
      // can call it twice if the verifier flags low confidence on the
      // first pass (regenerate-with-feedback loop).
      async function generateOnce(extraInstr?: string): Promise<string> {
        const finalPrompt = extraInstr ? `${prompt}\n\nADDITIONAL CONSTRAINTS FROM VERIFIER:\n${extraInstr}` : prompt;
        const errors: string[] = [];
        const ok = (t: string) => t.trim().length > 0;

        // Attempt 1: OpenAI (auto-switch gpt-4o -> gpt-4o-mini). Previously
        // the only path and hardcoded 'gpt-4o', which 404'd on the active
        // key -> a 500 on every chapter open for new users.
        if (openai) {
          try {
            const c = await oaCreate({ messages: [{ role: 'user', content: finalPrompt }], temperature: 0.6, max_tokens: 8000 });
            const text = c.choices[0]?.message?.content ?? '';
            if (ok(text)) return text;
            errors.push('OpenAI returned empty content');
          } catch (err) {
            errors.push(`OpenAI: ${err instanceof Error ? err.message : String(err)}`);
            logger.warn('ai.chapter_openai_failed', { error: errors[errors.length - 1] });
          }
        } else { errors.push('OPENAI_API_KEY not configured'); }

        // Attempt 2: Groq (resolver-picked model, no hardcode).
        const groq = await getGroqClient();
        if (groq) {
          try {
            const c = await groq.client.chat.completions.create({ model: groq.model, messages: [{ role: 'user', content: finalPrompt }], temperature: 0.6, max_tokens: 8000 });
            const text = c.choices[0]?.message?.content ?? '';
            if (ok(text)) {
              if (resolver) void resolver.reportModelSuccess('groq', groq.model);
              return text;
            }
            errors.push('Groq returned empty content');
          } catch (err) {
            if (resolver) await resolver.reportModelFailure('groq', groq.model, err instanceof Error ? err.message : String(err));
            errors.push(`Groq: ${err instanceof Error ? err.message : String(err)}`);
            logger.warn('ai.chapter_groq_failed', { error: errors[errors.length - 1] });
          }
        } else { errors.push('GROQ_API_KEY not configured'); }

        // Attempt 3: Gemini.
        if (env.GEMINI_API_KEY) {
          try {
            const r = await callGemini({ prompt: finalPrompt, generationConfig: { temperature: 0.6, maxOutputTokens: 8000 }, tier: 'flash' });
            if (r.ok && ok(r.text)) return r.text;
            errors.push(r.ok ? 'Gemini returned empty content' : `Gemini: ${r.error}`);
          } catch (err) {
            errors.push(`Gemini: ${err instanceof Error ? err.message : String(err)}`);
            logger.warn('ai.chapter_gemini_failed', { error: errors[errors.length - 1] });
          }
        } else { errors.push('GEMINI_API_KEY not configured'); }

        throw new Error(`All AI providers failed for chapter content: ${errors.join('; ')}`);
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

      const prompt = `Generate exactly ${count} UNIQUE multiple choice questions for chapter "${chapter}" (${subject}, ${exam}).\n${langInstr}${seedInstr}${contentContext}\n\nRules:\n- Questions MUST be based on the chapter content provided above\n- Do NOT ask about topics not covered in the chapter\n- Each question must have exactly 4 options (A/B/C/D), one correct answer, and a brief explanation\n- Mix: ${difficultyMix}\n- ${difficultyStyle}\n- Include explanation referencing the chapter content\n- IMPORTANT: All JSON keys MUST be in English. Only the values (question text, option text, explanation) should be in ${language === 'hi' ? 'Hindi' : 'English'}.\n- Return ONLY valid JSON, no markdown fences.\n\nJSON only:\n{"questions":[{"id":"q1","question":"...","options":[{"key":"A","text":"..."},{"key":"B","text":"..."},{"key":"C","text":"..."},{"key":"D","text":"..."}],"correctOption":"A","explanation":"...","difficulty":"easy","subject":"${subject}","topic":"${chapter}"}]}`;
      const errors: string[] = [];

      /** Robust JSON parse — handles ANY key name, direct arrays, truncated output */
      function safeParseMCQs(raw: string): GeneratedMCQ[] {
        if (!raw || raw.length < 10) return [];
        // Strip markdown code fences if present
        let text = raw.replace(/^```(?:json)?\s*/gm, '').replace(/```\s*$/gm, '').trim();
        // Fix trailing commas before parsing
        text = text.replace(/,\s*([}\]])/g, '$1');

        // Strategy 1: Try direct parse as object with any key containing an array
        try {
          const jsonStart = text.indexOf('{');
          const jsonEnd = text.lastIndexOf('}');
          if (jsonStart !== -1 && jsonEnd !== -1) {
            const objText = text.slice(jsonStart, jsonEnd + 1);
            const parsed = JSON.parse(objText) as Record<string, unknown>;
            // Find the FIRST key that has an array value with objects inside
            for (const val of Object.values(parsed)) {
              if (Array.isArray(val) && val.length > 0 && typeof val[0] === 'object') {
                return val as GeneratedMCQ[];
              }
            }
          }
        } catch { /* continue to next strategy */ }

        // Strategy 2: Direct array parse (AI returned [{...},{...}] without wrapper)
        try {
          const arrStart = text.indexOf('[');
          const arrEnd = text.lastIndexOf(']');
          if (arrStart !== -1 && arrEnd !== -1) {
            const arrText = text.slice(arrStart, arrEnd + 1);
            const arr = JSON.parse(arrText);
            if (Array.isArray(arr) && arr.length > 0) return arr as GeneratedMCQ[];
          }
        } catch { /* continue */ }

        // Strategy 3: Truncated JSON — find the last complete object in array
        try {
          const arrStart = text.indexOf('[');
          if (arrStart !== -1) {
            let arrText = text.slice(arrStart);
            // Find last complete '}' and close the array there
            const lastBrace = arrText.lastIndexOf('}');
            if (lastBrace > 0) {
              arrText = arrText.slice(0, lastBrace + 1) + ']';
              arrText = arrText.replace(/,\s*\]$/g, ']');
              const arr = JSON.parse(arrText);
              if (Array.isArray(arr) && arr.length > 0) return arr as GeneratedMCQ[];
            }
          }
        } catch { /* give up */ }

        return [];
      }

      // ─── ATTEMPT 1: Groq via RESOLVER (admin-panel key — ALWAYS first) ───
      // PR-45: The old `groq ?? resolver` pattern was broken because env
      // has a stale key → groq is NOT null → resolver never reached.
      // Now: resolver FIRST, env-instance only as last-resort fallback.
      if (resolver) {
        try {
          const resolved = await resolver.resolve('groq');
          if (resolved?.apiKey) {
            const freshGroq = new Groq({ apiKey: resolved.apiKey });
            const model = resolved.model || 'llama-3.3-70b-versatile';
            const c = await freshGroq.chat.completions.create({ model, messages: [{ role: 'user', content: prompt }], temperature: 0.7, max_tokens: 4096, response_format: { type: 'json_object' } });
            const rawContent = c.choices[0]?.message?.content ?? '';
            const parsed = safeParseMCQs(rawContent);
            if (parsed.length) { logger.info('ai.chapter_mcqs', { provider: 'groq-resolver', chapter, count: parsed.length, model }); return parsed; }
            errors.push(`Groq (resolver, model=${model}) returned empty/unparseable`);
            logger.warn('ai.mcq_parse_empty', { provider: 'groq-resolver', rawLength: rawContent.length, rawPreview: rawContent.slice(0, 300) });
          } else { errors.push('Groq: resolver returned no key (check /admin/ai-providers)'); }
        } catch (err) { errors.push(`Groq (resolver): ${err instanceof Error ? err.message : String(err)}`); }
      }
      // Env fallback (only if resolver path failed entirely)
      if (groq) {
        try {
          const mcqGroq = await getGroqClient();
          const c = await (mcqGroq?.client ?? groq!).chat.completions.create({ model: mcqGroq?.model ?? 'llama-3.3-70b-versatile', messages: [{ role: 'user', content: prompt }], temperature: 0.7, max_tokens: 4096, response_format: { type: 'json_object' } });
          const parsed = safeParseMCQs(c.choices[0]?.message?.content ?? '');
          if (parsed.length) { logger.info('ai.chapter_mcqs', { provider: 'groq-env', chapter, count: parsed.length }); return parsed; }
          errors.push('Groq (env) returned empty/unparseable');
        } catch (err) { errors.push(`Groq (env): ${err instanceof Error ? err.message : String(err)}`); }
      }

      // ─── ATTEMPT 2: OpenAI via RESOLVER ───
      if (resolver) {
        try {
          const resolved = await resolver.resolve('openai');
          if (resolved?.apiKey) {
            const freshOai = new OpenAI({ apiKey: resolved.apiKey });
            const model = resolved.model || 'gpt-4o';
            const c = await freshOai.chat.completions.create({ model, messages: [{ role: 'user', content: prompt }], temperature: 0.7, max_tokens: 4096, response_format: { type: 'json_object' } });
            const parsed = safeParseMCQs(c.choices[0]?.message?.content ?? '');
            if (parsed.length) { logger.info('ai.chapter_mcqs', { provider: 'openai-resolver', chapter, count: parsed.length, model }); return parsed; }
            errors.push(`OpenAI (resolver, model=${model}) returned empty/unparseable`);
          } else { errors.push('OpenAI: resolver returned no key'); }
        } catch (err) { errors.push(`OpenAI (resolver): ${err instanceof Error ? err.message : String(err)}`); }
      }
      if (openai) {
        try {
          const c = await openai.chat.completions.create({ model: 'gpt-4o-mini', messages: [{ role: 'user', content: prompt }], temperature: 0.7, max_tokens: 4096, response_format: { type: 'json_object' } });
          const parsed = safeParseMCQs(c.choices[0]?.message?.content ?? '');
          if (parsed.length) { logger.info('ai.chapter_mcqs', { provider: 'openai-env', chapter, count: parsed.length }); return parsed; }
          errors.push('OpenAI (env) returned empty/unparseable');
        } catch (err) { errors.push(`OpenAI (env): ${err instanceof Error ? err.message : String(err)}`); }
      }

      // ─── ATTEMPT 3: Gemini (callGemini already uses resolver internally) ───
      try {
        const r = await callGemini({ prompt, generationConfig: { temperature: 0.7, maxOutputTokens: 4096 }, tier: 'flash' });
        if (r.ok) {
          const parsed = safeParseMCQs(r.text);
          if (parsed.length) { logger.info('ai.chapter_mcqs', { provider: 'gemini', chapter, count: parsed.length, model: r.model }); return parsed; }
          errors.push('Gemini returned unparseable response');
        } else {
          errors.push(`Gemini: ${('error' in r) ? r.error : 'call failed'}`);
        }
      } catch (err) { errors.push(`Gemini: ${err instanceof Error ? err.message : String(err)}`); }

      logger.error('ai.chapter_mcqs_all_failed', { errors, chapter, subject, exam });
      logAICallToStore(store, 'all-providers', 0, 0, 0, undefined, { status: 'error', endpoint: 'generateChapterMCQs', error: errors.join('; '), requestPreview: `Chapter: ${chapter}, Subject: ${subject}` });
      throw new Error(`Failed to generate chapter MCQs: ${errors.join('; ')}`);
    },

    async generateFlashcards(chapter, subject, exam, language = 'en', count = 12, chapterContent?: string) {
      const langInstr = language === 'hi'
        ? 'Write BOTH front and back in Hindi (Devanagari).'
        : 'Write in English.';
      const ctx = chapterContent
        ? `Base the cards ONLY on this chapter content:\n"""\n${chapterContent.slice(0, 6000)}\n"""\n`
        : '';
      const prompt = `You are creating revision flashcards for the chapter "${chapter}" (${subject}, exam: ${exam}).
${ctx}Make exactly ${count} high-yield flashcards a student can revise quickly before the exam.
${langInstr}
Rules:
- "front": a crisp question / term / prompt (max ~120 chars).
- "back": the concise answer / definition / key fact (max ~240 chars). No fluff.
- Cover the most exam-relevant facts, definitions, formulas, dates and concepts.
- No duplicates.

Respond ONLY with valid JSON (no markdown fences):
{"cards":[{"front":"...","back":"..."}]}`;

      const parse = (raw: string): Array<{ front: string; back: string }> | null => {
        if (!raw) return null;
        const txt = raw.trim().replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/i, '').trim();
        const attempt = (s: string) => {
          try {
            const p = JSON.parse(s) as { cards?: Array<{ front?: string; back?: string }> };
            if (!Array.isArray(p?.cards)) return null;
            const cards = p.cards
              .filter(k => k && typeof k.front === 'string' && typeof k.back === 'string' && k.front.trim() && k.back.trim())
              .slice(0, 40)
              .map(k => ({ front: String(k.front).slice(0, 200), back: String(k.back).slice(0, 400) }));
            return cards.length ? cards : null;
          } catch { return null; }
        };
        return attempt(txt) ?? (txt.match(/\{[\s\S]*\}/) ? attempt(txt.match(/\{[\s\S]*\}/)![0]) : null);
      };

      const errors: string[] = [];

      const groq = await getGroqClient();
      if (groq) {
        try {
          const c = await groq.client.chat.completions.create({ model: groq.model, messages: [{ role: 'user', content: prompt }], temperature: 0.5, max_tokens: 3000, response_format: { type: 'json_object' } });
          const parsed = parse(c.choices[0]?.message?.content ?? '');
          if (parsed) { if (resolver) void resolver.reportModelSuccess('groq', groq.model); logger.info('ai.flashcards', { provider: 'groq', chapter, count: parsed.length }); return parsed; }
          errors.push('Groq returned unparseable flashcards');
        } catch (err) {
          if (resolver) await resolver.reportModelFailure('groq', groq.model, err instanceof Error ? err.message : String(err));
          errors.push(`Groq: ${err instanceof Error ? err.message : String(err)}`);
        }
      } else { errors.push('GROQ not configured'); }

      if (openai) {
        try {
          const c = await oaCreate({ messages: [{ role: 'user', content: prompt }], temperature: 0.5, max_tokens: 3000, response_format: { type: 'json_object' } });
          const parsed = parse(c.choices[0]?.message?.content ?? '');
          if (parsed) { logger.info('ai.flashcards', { provider: 'openai', chapter, count: parsed.length }); return parsed; }
          errors.push('OpenAI returned unparseable flashcards');
        } catch (err) { errors.push(`OpenAI: ${err instanceof Error ? err.message : String(err)}`); }
      } else { errors.push('OpenAI not configured'); }

      if (env.GEMINI_API_KEY) {
        try {
          const r = await callGemini({ prompt, generationConfig: { temperature: 0.5, maxOutputTokens: 3000 }, tier: 'flash' });
          if (r.ok) {
            const parsed = parse(r.text);
            if (parsed) { logger.info('ai.flashcards', { provider: 'gemini', chapter, count: parsed.length, model: r.model }); return parsed; }
            errors.push('Gemini returned unparseable flashcards');
          } else { errors.push(`Gemini: ${r.error}`); }
        } catch (err) { errors.push(`Gemini: ${err instanceof Error ? err.message : String(err)}`); }
      } else { errors.push('GEMINI not configured'); }

      logger.error('ai.flashcards_all_failed', { errors, chapter, subject, exam });
      throw new Error(`Failed to generate flashcards: ${errors.join('; ')}`);
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
        const c = await oaCreate({ messages: [{ role: 'user', content: prompt }], temperature: 0.5, max_tokens: 800 });
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
              // Convert URL to base64 data URL so it never expires
              try {
                const imgFetch = await fetch(imageUrl);
                if (imgFetch.ok) {
                  const buffer = await imgFetch.arrayBuffer();
                  const base64 = Buffer.from(buffer).toString('base64');
                  const contentType = imgFetch.headers.get('content-type') || 'image/png';
                  return { type: 'image', content: `data:${contentType};base64,${base64}` };
                }
              } catch (fetchErr) {
                logger.warn('ai.visualization_dalle_url_fetch_failed', { error: fetchErr instanceof Error ? fetchErr.message : String(fetchErr) });
              }
              // If fetch-to-base64 failed, return URL as fallback
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
        const c = await oaCreate({ messages: [{ role: 'user', content: prompt }], temperature: 0.5, max_tokens: 1000 });
        const raw = c.choices[0]?.message?.content ?? '';
        const cleaned = raw.replace(/```mermaid\n?/g, '').replace(/```\n?/g, '').trim();
        logger.info('ai.visualization_mermaid', { type, topic, subject, exam, provider: 'openai' });
        return { type: 'mermaid', content: cleaned };
      } catch (err) {
        logger.error('ai.visualization_error', { type, error: err instanceof Error ? err.message : String(err) });
        throw new Error(`Failed to generate ${type} visualization`);
      }
    },

    async generateSyllabus(examSlug: string, examName: string, level: string): Promise<GeneratedSyllabus> {
      const prompt = `You are an expert Indian competitive-exam curriculum designer.

Generate a COMPLETE, exam-specific study syllabus for the "${examName}" exam (slug: ${examSlug}).
Student level: ${level}.

CRITICAL requirements:
- Use the REAL subjects that actually appear in THIS exam's official syllabus. Do NOT collapse everything into a single generic "General Studies" subject — break it into the actual papers/subjects this exam tests (e.g. History, Polity, Geography, Economy, plus the state-specific subjects for a state PSC such as state history/geography/current affairs).
- 4-7 subjects relevant to THIS specific exam.
- 5-8 chapters per subject, ordered from basic to advanced.
- Each chapter: slug (kebab-case, ascii), name (English), nameHi (Hindi Devanagari), order (1-based integer), estimatedMinutes (20-60).
- Each subject: slug (kebab-case, ascii), name (English), nameHi (Hindi Devanagari), icon (single emoji).

Respond ONLY with valid JSON (no markdown fences):
{"exam":"${examSlug}","examName":"${examName}","subjects":[{"slug":"subject-slug","name":"Subject Name","nameHi":"विषय नाम","icon":"📚","chapters":[{"slug":"chapter-slug","name":"Chapter Name","nameHi":"अध्याय नाम","order":1,"estimatedMinutes":40}]}]}`;

      // Robust JSON parse: handle markdown fences and surrounding prose.
      const parseSyllabus = (raw: string): GeneratedSyllabus | null => {
        if (!raw) return null;
        const txt = raw.trim().replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/i, '').trim();
        const tryParse = (s: string): GeneratedSyllabus | null => {
          try {
            const p = JSON.parse(s) as GeneratedSyllabus;
            return p?.subjects?.length ? p : null;
          } catch { return null; }
        };
        return tryParse(txt) ?? (txt.match(/\{[\s\S]*\}/) ? tryParse(txt.match(/\{[\s\S]*\}/)![0]) : null);
      };

      // Normalize/defend against missing optional fields.
      const normalize = (s: GeneratedSyllabus): GeneratedSyllabus => ({
        exam: s.exam || examSlug,
        examName: s.examName || examName,
        subjects: (s.subjects ?? [])
          .filter((sub) => sub && Array.isArray(sub.chapters) && sub.chapters.length > 0)
          .map((sub) => ({
            slug: sub.slug,
            name: sub.name,
            nameHi: sub.nameHi ?? sub.name,
            icon: sub.icon ?? '📚',
            chapters: sub.chapters.map((ch, i) => ({
              slug: ch.slug,
              name: ch.name,
              nameHi: ch.nameHi ?? ch.name,
              order: ch.order ?? i + 1,
              estimatedMinutes: ch.estimatedMinutes ?? 40,
            })),
          })),
      });

      const errors: string[] = [];

      // Attempt 1: Groq (fast, rarely rate-limited; auto-switch model via resolver — no hardcode)
      const groq = await getGroqClient();
      if (groq) {
        try {
          const c = await groq.client.chat.completions.create({ model: groq.model, messages: [{ role: 'user', content: prompt }], temperature: 0.5, max_tokens: 6000, response_format: { type: 'json_object' } });
          const parsed = parseSyllabus(c.choices[0]?.message?.content ?? '');
          if (parsed) {
            const out = normalize(parsed);
            if (out.subjects.length) {
              if (resolver) void resolver.reportModelSuccess('groq', groq.model);
              logger.info('ai.syllabus_generated', { provider: 'groq', model: groq.model, examSlug, subjects: out.subjects.length });
              return out;
            }
          }
          errors.push('Groq returned no usable subjects');
        } catch (err) {
          if (resolver) await resolver.reportModelFailure('groq', groq.model, err instanceof Error ? err.message : String(err));
          errors.push(`Groq: ${err instanceof Error ? err.message : String(err)}`);
          logger.warn('ai.syllabus_groq_failed', { error: errors[errors.length - 1] });
        }
      } else { errors.push('GROQ_API_KEY not configured'); }

      // Attempt 2: OpenAI (oaCreate handles pro->flash auto-switch internally)
      if (openai) {
        try {
          const c = await oaCreate({ messages: [{ role: 'user', content: prompt }], temperature: 0.5, max_tokens: 6000, response_format: { type: 'json_object' } });
          const parsed = parseSyllabus(c.choices[0]?.message?.content ?? '');
          if (parsed) {
            const out = normalize(parsed);
            if (out.subjects.length) {
              logger.info('ai.syllabus_generated', { provider: 'openai', examSlug, subjects: out.subjects.length });
              return out;
            }
          }
          errors.push('OpenAI returned no usable subjects');
        } catch (err) {
          errors.push(`OpenAI: ${err instanceof Error ? err.message : String(err)}`);
          logger.warn('ai.syllabus_openai_failed', { error: errors[errors.length - 1] });
        }
      } else { errors.push('OPENAI_API_KEY not configured'); }

      // Attempt 3: Gemini (auto-resolved chain)
      if (env.GEMINI_API_KEY) {
        try {
          const r = await callGemini({ prompt, generationConfig: { temperature: 0.5, maxOutputTokens: 6000 }, tier: 'flash' });
          if (r.ok) {
            const parsed = parseSyllabus(r.text);
            if (parsed) {
              const out = normalize(parsed);
              if (out.subjects.length) {
                logger.info('ai.syllabus_generated', { provider: 'gemini', model: r.model, examSlug, subjects: out.subjects.length });
                return out;
              }
            }
            errors.push('Gemini returned no usable subjects');
          } else { errors.push(`Gemini: ${r.error}`); }
        } catch (err) {
          errors.push(`Gemini: ${err instanceof Error ? err.message : String(err)}`);
          logger.warn('ai.syllabus_gemini_failed', { error: errors[errors.length - 1] });
        }
      } else { errors.push('GEMINI_API_KEY not configured'); }

      logger.error('ai.syllabus_all_failed', { examSlug, errors });
      throw new Error(`All AI providers failed for syllabus generation: ${errors.join('; ')}`);
    },

    async generateExamDates(examSlug: string, examName: string) {
      const year = new Date().getFullYear();
      const prompt = `You are an expert on Indian competitive exam schedules.

For the exam "${examName}" (slug: ${examSlug}), list its typical UPCOMING events/stages for the ${year}-${year + 1} cycle, based on the exam's HISTORICAL annual calendar pattern.

Rules:
- Include each distinct stage the exam actually has (e.g. Prelims, Mains, Interview, or Session 1/2, Tier I/II, Registration window) — only stages that REALLY exist for THIS exam.
- "estimatedMonth": the month + year you'd expect it, e.g. "May 2027". If genuinely unpredictable, use "To be announced".
- "name": short stage label including the year, e.g. "Prelims 2027".
- "sourceUrl": the official portal URL for this exam.
- 1 to 6 events. These are ESTIMATES from historical patterns, not official dates.

Respond ONLY with valid JSON (no markdown fences):
{"events":[{"name":"Prelims 2027","estimatedMonth":"May 2027","sourceUrl":"https://..."}]}`;

      const parse = (raw: string): Array<{ name: string; estimatedMonth: string; sourceUrl: string }> | null => {
        if (!raw) return null;
        const txt = raw.trim().replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/i, '').trim();
        const tryParse = (s: string) => {
          try {
            const p = JSON.parse(s) as { events?: Array<{ name?: string; estimatedMonth?: string; sourceUrl?: string }> };
            if (!Array.isArray(p?.events)) return null;
            const events = p.events
              .filter(e => e && typeof e.name === 'string' && e.name.trim())
              .slice(0, 6)
              .map(e => ({
                name: String(e.name).slice(0, 120),
                estimatedMonth: String(e.estimatedMonth ?? 'To be announced').slice(0, 60),
                sourceUrl: String(e.sourceUrl ?? '').slice(0, 300),
              }));
            return events.length ? events : null;
          } catch { return null; }
        };
        return tryParse(txt) ?? (txt.match(/\{[\s\S]*\}/) ? tryParse(txt.match(/\{[\s\S]*\}/)![0]) : null);
      };

      const errors: string[] = [];

      // Attempt 1: Groq
      const groq = await getGroqClient();
      if (groq) {
        try {
          const c = await groq.client.chat.completions.create({ model: groq.model, messages: [{ role: 'user', content: prompt }], temperature: 0.4, max_tokens: 1200, response_format: { type: 'json_object' } });
          const parsed = parse(c.choices[0]?.message?.content ?? '');
          if (parsed) {
            if (resolver) void resolver.reportModelSuccess('groq', groq.model);
            logger.info('ai.exam_dates_generated', { provider: 'groq', examSlug, events: parsed.length });
            return parsed;
          }
          errors.push('Groq returned no usable events');
        } catch (err) {
          if (resolver) await resolver.reportModelFailure('groq', groq.model, err instanceof Error ? err.message : String(err));
          errors.push(`Groq: ${err instanceof Error ? err.message : String(err)}`);
        }
      } else { errors.push('GROQ_API_KEY not configured'); }

      // Attempt 2: OpenAI
      if (openai) {
        try {
          const c = await oaCreate({ messages: [{ role: 'user', content: prompt }], temperature: 0.4, max_tokens: 1200, response_format: { type: 'json_object' } });
          const parsed = parse(c.choices[0]?.message?.content ?? '');
          if (parsed) {
            logger.info('ai.exam_dates_generated', { provider: 'openai', examSlug, events: parsed.length });
            return parsed;
          }
          errors.push('OpenAI returned no usable events');
        } catch (err) {
          errors.push(`OpenAI: ${err instanceof Error ? err.message : String(err)}`);
        }
      } else { errors.push('OPENAI_API_KEY not configured'); }

      // Attempt 3: Gemini
      if (env.GEMINI_API_KEY) {
        try {
          const r = await callGemini({ prompt, generationConfig: { temperature: 0.4, maxOutputTokens: 1200 }, tier: 'flash' });
          if (r.ok) {
            const parsed = parse(r.text);
            if (parsed) {
              logger.info('ai.exam_dates_generated', { provider: 'gemini', model: r.model, examSlug, events: parsed.length });
              return parsed;
            }
            errors.push('Gemini returned no usable events');
          } else { errors.push(`Gemini: ${r.error}`); }
        } catch (err) {
          errors.push(`Gemini: ${err instanceof Error ? err.message : String(err)}`);
        }
      } else { errors.push('GEMINI_API_KEY not configured'); }

      logger.error('ai.exam_dates_all_failed', { examSlug, errors });
      throw new Error(`All AI providers failed for exam-date generation: ${errors.join('; ')}`);
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
        const c = await oaCreate({ messages: [{ role: 'user', content: prompt }], temperature: 0.5, max_tokens: 600 });
        const raw = c.choices[0]?.message?.content ?? '';
        logger.info('ai.selection_diagram_openai_fallback', { subject, language });
        return raw.replace(/```mermaid\n?/g, '').replace(/```\n?/g, '').trim();
      } catch (err) { logger.error('ai.selection_diagram_error', { error: err instanceof Error ? err.message : String(err) }); throw new Error('Failed to generate diagram'); }
    },

    async generateCurrentAffairsQuiz(headlines: string, count = 30, language: 'en' | 'hi' = 'en') {
      const langInstr = language === 'hi' ? 'Generate ALL questions, options, and explanations in Hindi (Devanagari script).' : 'Generate in English.';
      const prompt = `You are a current affairs quiz generator for Indian competitive exams (UPSC, SSC, Banking).\n\nBased on today's news headlines below, generate exactly ${count} MCQs.\n${langInstr}\n\nHeadlines:\n${headlines.slice(0, 3000)}\n\nRequirements:\n- Questions should test factual recall from these headlines\n- 4 options (A-D), one correct answer\n- Mix difficulty: 7 easy, 8 medium, 5 hard\n- Include brief explanation for correct answer\n- Cover different categories (national, international, economy, science, sports)\n\nRespond ONLY with JSON:\n{"questions":[{"id":"ca-q1","question":"...","options":[{"key":"A","text":"..."},{"key":"B","text":"..."},{"key":"C","text":"..."},{"key":"D","text":"..."}],"correctOption":"A","explanation":"...","difficulty":"easy","subject":"current-affairs","topic":"national"}]}`;

      // Try Groq first (fast), then OpenAI fallback, then Gemini fallback
      const errors: string[] = [];

      // Second-pass fact-check: re-validate the generated MCQs against the
      // source headlines with a different (Gemini) model at low temperature.
      // Current affairs MUST be accurate, so we drop/fix questions whose
      // marked answer can't be verified. Best-effort: if verification is
      // unavailable or over-drops, we keep the original set (never block).
      const verifyAndCleanQuiz = async (questions: GeneratedMCQ[]): Promise<GeneratedMCQ[]> => {
        if (!Array.isArray(questions) || questions.length === 0) return questions;
        if (!env.GEMINI_API_KEY) return questions;
        const vPrompt = `You are a STRICT fact-checker for an Indian current-affairs quiz. Below are MCQs and the source headlines they were built from. For EACH question: confirm the marked "correctOption" is actually correct, the options are sensible, and the question is unambiguous and supported by the headlines/well-known facts.\n- Fix "correctOption" if a different option is clearly the right answer.\n- DROP any question that is factually wrong, ambiguous, a trick, or not supported.\nKeep the EXACT same JSON schema and ids.\n\nHeadlines:\n${headlines.slice(0, 3000)}\n\nQuestions JSON:\n${JSON.stringify({ questions }).slice(0, 12000)}\n\nRespond ONLY with JSON: {"questions":[ ... validated questions ... ]}`;
        try {
          const r = await callGemini({ prompt: vPrompt, generationConfig: { temperature: 0.1, maxOutputTokens: 8000 }, tier: 'flash' });
          if (r.ok) {
            const m = r.text.match(/\{[\s\S]*\}/);
            if (m) {
              const parsed = JSON.parse(m[0]) as { questions?: GeneratedMCQ[] };
              const cleaned = (parsed.questions ?? []).filter(q =>
                q && typeof q.question === 'string' && Array.isArray(q.options) && q.options.length === 4 && typeof q.correctOption === 'string');
              // Only trust the verifier if it kept a healthy majority; otherwise
              // it likely misfired — fall back to the original set.
              if (cleaned.length >= Math.ceil(questions.length * 0.6)) {
                logger.info('ai.ca_quiz_verified', { before: questions.length, after: cleaned.length });
                return cleaned.slice(0, count);
              }
              logger.warn('ai.ca_quiz_verify_overdrop', { before: questions.length, after: cleaned.length });
            }
          }
        } catch (err) {
          logger.warn('ai.ca_quiz_verify_failed', { error: err instanceof Error ? err.message : String(err) });
        }
        return questions;
      };

      // Attempt 1: Groq (auto-switch model via resolver — no hardcode)
      const caGroq = await getGroqClient();
      if (caGroq) {
        try {
          const c = await caGroq.client.chat.completions.create({ model: caGroq.model, messages: [{ role: 'user', content: prompt }], temperature: 0.6, max_tokens: 6000, response_format: { type: 'json_object' } });
          const parsed = JSON.parse(c.choices[0]?.message?.content ?? '{}') as { questions: GeneratedMCQ[] };
          if (parsed.questions?.length) {
            if (resolver) void resolver.reportModelSuccess('groq', caGroq.model);
            logger.info('ai.ca_quiz_generated', { provider: 'groq', model: caGroq.model, count: parsed.questions.length });
            return await verifyAndCleanQuiz(parsed.questions);
          }
          errors.push('Groq returned empty questions');
        } catch (err) {
          if (resolver) await resolver.reportModelFailure('groq', caGroq.model, err instanceof Error ? err.message : String(err));
          errors.push(`Groq: ${err instanceof Error ? err.message : String(err)}`);
          logger.warn('ai.ca_quiz_groq_failed', { error: errors[errors.length - 1] });
        }
      } else { errors.push('GROQ_API_KEY not configured'); }

      // Attempt 2: OpenAI
      if (openai) {
        try {
          const c = await oaCreate({ messages: [{ role: 'user', content: prompt }], temperature: 0.6, max_tokens: 6000, response_format: { type: 'json_object' } });
          const parsed = JSON.parse(c.choices[0]?.message?.content ?? '{}') as { questions: GeneratedMCQ[] };
          if (parsed.questions?.length) {
            logger.info('ai.ca_quiz_generated', { provider: 'openai', count: parsed.questions.length });
            return await verifyAndCleanQuiz(parsed.questions);
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
                return await verifyAndCleanQuiz(parsed.questions);
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

    async generatePYQPaper(examSlug: string, examName: string, year: number, language: 'en' | 'hi', count = 25): Promise<GeneratedMCQ[]> {
      const langInstr = language === 'hi'
        ? 'Write ALL questions, options, and explanations in Hindi (Devanagari script).'
        : 'Write in clear English.';
      const prompt = `You are an exam-paper analyst for Indian competitive & board exams.

Reconstruct a PREVIOUS-YEAR PATTERN question paper for the exam "${examName}" (slug: ${examSlug}) as it appeared in its ${year} session.

CRITICAL — accuracy + honesty:
- Base the questions on the REAL syllabus, topic weightage, question style, and difficulty distribution of ${examName}'s ${year} exam. If you have knowledge of the actual topics asked that year, mirror them closely.
- Do NOT fabricate a verbatim copy claim. These are practice questions modelled on the previous-year pattern.
- Match the exam's real subject mix (e.g. for UPSC Prelims: Polity, History, Geography, Economy, Environment, Science, Current Affairs).

Generate exactly ${count} multiple-choice questions.
${langInstr}

Requirements:
- 4 options (A-D), exactly one correct.
- Realistic difficulty spread matching this exam (roughly 30% easy, 45% medium, 25% hard).
- Each question MUST include a concise explanation of the correct answer (1-3 sentences).
- Tag each with the subject and a specific topic.

Respond ONLY with valid JSON, no prose:
{"questions":[{"id":"pyq-1","question":"...","options":[{"key":"A","text":"..."},{"key":"B","text":"..."},{"key":"C","text":"..."},{"key":"D","text":"..."}],"correctOption":"A","explanation":"...","difficulty":"medium","subject":"...","topic":"..."}]}`;

      const errors: string[] = [];

      const parseQuestions = (raw: string): GeneratedMCQ[] | null => {
        if (!raw) return null;
        const match = raw.match(/\{[\s\S]*\}/);
        if (!match) return null;
        try {
          const parsed = JSON.parse(match[0]) as { questions?: GeneratedMCQ[] };
          return Array.isArray(parsed.questions) && parsed.questions.length > 0 ? parsed.questions : null;
        } catch { return null; }
      };

      // Attempt 1: Gemini PRO with Google Search grounding — best for
      // recalling a specific year's real topics. Grounding may inject
      // prose, so we regex-extract the JSON block.
      if (env.GEMINI_API_KEY) {
        try {
          const r = await callGemini({
            prompt,
            generationConfig: { temperature: 0.4, maxOutputTokens: 8000 },
            tier: 'pro',
            tools: [{ googleSearch: {} }],
          });
          if (r.ok) {
            const qs = parseQuestions(r.text);
            if (qs) {
              logger.info('ai.pyq_generated', { provider: 'gemini', model: r.model, grounded: true, examSlug, year, count: qs.length });
              return qs;
            }
            errors.push('Gemini(pro+grounding) returned no parseable questions');
          } else { errors.push(`Gemini(pro): ${r.error}`); }
        } catch (err) {
          errors.push(`Gemini(pro): ${err instanceof Error ? err.message : String(err)}`);
          logger.warn('ai.pyq_gemini_failed', { error: errors[errors.length - 1] });
        }
      } else { errors.push('GEMINI_API_KEY not configured'); }

      // Attempt 2: Groq (fast, no grounding).
      const pyqGroq = await getGroqClient();
      if (pyqGroq) {
        try {
          const c = await pyqGroq.client.chat.completions.create({ model: pyqGroq.model, messages: [{ role: 'user', content: prompt }], temperature: 0.4, max_tokens: 8000, response_format: { type: 'json_object' } });
          const qs = parseQuestions(c.choices[0]?.message?.content ?? '');
          if (qs) {
            if (resolver) void resolver.reportModelSuccess('groq', pyqGroq.model);
            logger.info('ai.pyq_generated', { provider: 'groq', model: pyqGroq.model, examSlug, year, count: qs.length });
            return qs;
          }
          errors.push('Groq returned no parseable questions');
        } catch (err) {
          if (resolver) await resolver.reportModelFailure('groq', pyqGroq.model, err instanceof Error ? err.message : String(err));
          errors.push(`Groq: ${err instanceof Error ? err.message : String(err)}`);
          logger.warn('ai.pyq_groq_failed', { error: errors[errors.length - 1] });
        }
      } else { errors.push('GROQ_API_KEY not configured'); }

      // Attempt 3: OpenAI.
      if (openai) {
        try {
          const c = await oaCreate({ messages: [{ role: 'user', content: prompt }], temperature: 0.4, max_tokens: 8000, response_format: { type: 'json_object' } });
          const qs = parseQuestions(c.choices[0]?.message?.content ?? '');
          if (qs) {
            logger.info('ai.pyq_generated', { provider: 'openai', examSlug, year, count: qs.length });
            return qs;
          }
          errors.push('OpenAI returned no parseable questions');
        } catch (err) {
          errors.push(`OpenAI: ${err instanceof Error ? err.message : String(err)}`);
          logger.warn('ai.pyq_openai_failed', { error: errors[errors.length - 1] });
        }
      } else { errors.push('OPENAI_API_KEY not configured'); }

      logger.error('ai.pyq_all_failed', { examSlug, year, errors });
      throw new Error(`All AI providers failed for PYQ generation: ${errors.join('; ')}`);
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
            const chatGroq = await getGroqClient();
            const c = await (chatGroq?.client ?? groq!).chat.completions.create({ model: chatGroq?.model ?? 'llama-3.3-70b-versatile', messages: chatMessages, temperature: 0.7, max_tokens: 1500 });
            const reply = c.choices[0]?.message?.content ?? '';
            if (reply) { const tokens = estimateTokens(reply); logAICallToStore(store, 'llama-3.3-70b-versatile', tokens, estimateCost('llama-3.3-70b-versatile', tokens), Math.round(performance.now() - startTime), undefined, { status: 'success', endpoint: 'chat', provider: 'groq', requestPreview: messages[messages.length - 1]?.content?.slice(0, 200), responsePreview: reply.slice(0, 300) }); logger.info('ai.chat', { provider: 'groq', length: reply.length, preferredModel }); return reply; }
          } catch (err) { logger.warn('ai.chat_groq_failed', { error: err instanceof Error ? err.message : String(err) }); }
        }
        if (provider === 'openai' && openai) {
          try {
            const startTime = performance.now();
            const c = await oaCreate({ messages: chatMessages, temperature: 0.7, max_tokens: 1500 });
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

    async translateToHindi(items: { headline: string; summary: string; bullets?: string[] }[]) {
      if (items.length === 0) return [];

      // Strip any stray CJK (Chinese/Japanese/Korean) characters the model
      // occasionally leaks into Hindi output (e.g. "नए रक्त को注入 करने"). We
      // remove those code points and tidy the spacing so the reader never
      // sees foreign glyphs.
      const stripCJK = (s: string): string =>
        (s ?? '')
          .replace(/[\u3000-\u303F\u3040-\u30FF\u3400-\u4DBF\u4E00-\u9FFF\uF900-\uFAFF\uAC00-\uD7AF]/g, '')
          .replace(/[ \t]{2,}/g, ' ')
          .replace(/\s+([।,.])/g, '$1')
          .trim();

      const buildPrompt = (batch: { headline: string; summary: string; bullets?: string[] }[]) =>
        `You are a Hindi current-affairs writer for Indian competitive-exam students (UPSC, SSC, Banking, State PCS). You are NOT a literal translator — you REWRITE each English item as clean, natural Hindi that a Hindi-medium student understands instantly.

HOW TO WRITE (most important):
- Convey the MEANING in simple, everyday Hindi — the register of Drishti IAS / Dainik Jagran current-affairs notes, or a teacher explaining to students. Short, active sentences.
- This is TRANSCREATION, not word-for-word translation. Rebuild each sentence the way it is naturally said in Hindi. If a literal rendering sounds awkward or "machine-translated", rewrite it until it reads like a human wrote it.
- Do NOT use heavy, literary or over-Sanskritised Hindi. Use the word students actually know:
    • "रिपोर्ट" not "प्रतिवेदन", "लॉन्च किया" not "प्रक्षेपित किया" (unless it's literally a rocket), "इस्तीफ़ा" not "त्यागपत्र", "बैठक/मीटिंग" not "अधिवेशन" when informal.
    • NEVER invent an obscure Hindi word for a term people normally say in English.
- Keep these in English but written in Devanagari (the way people actually write them): institution names (Supreme Court → सुप्रीम कोर्ट), scheme/product/mission names, scientific & technical terms, ranks, and common loanwords (मिशन, प्रोजेक्ट, समिट, रिपोर्ट, इकॉनमी). Keep ALL acronyms (ISRO, RBI, UN, GDP), proper nouns, numbers, dates, amounts and units EXACTLY as given.
- Use active voice ("RBI ने ... किया"). Avoid bureaucratic constructions ("के द्वारा किया गया", needless passives).

WHAT TO PRODUCE per item:
- headline: a punchy, specific Hindi headline that leads with the key fact / name / number.
- summary: rewrite the FULL summary in natural Hindi, keeping its paragraph breaks / blank lines. Keep every fact; do NOT pad or repeat.
- bullets: rewrite EACH bullet as a sharp, exam-ready Hindi revision point. The Hindi bullets array MUST have EXACTLY the same number of items as the English one, in the same order.

HARD RULES:
- Output ONLY Hindi (Devanagari). NEVER output Chinese, Japanese, Korean or any non-Hindi script.
- No commentary, no markdown headings. Output ONLY JSON.

Items:
${batch.map((it, i) => `### ITEM ${i + 1}\nHeadline: ${it.headline}\nSummary:\n${it.summary}\nBullets: ${JSON.stringify(it.bullets ?? [])}`).join('\n\n')}

Respond ONLY with valid JSON (summary may contain \\n newlines):
{"items":[{"headline":"हिंदी शीर्षक","summary":"हिंदी सारांश (पैराग्राफ़ सहित)","bullets":["बिंदु 1","बिंदु 2","बिंदु 3"]}]}`;

      type TItem = { headline: string; summary: string; bullets?: string[] };
      const sanitize = (it: TItem): TItem => ({
        headline: stripCJK(it.headline),
        summary: stripCJK(it.summary),
        ...(it.bullets ? { bullets: it.bullets.map(stripCJK).filter(Boolean) } : {}),
      });

      // Translate a single batch via Gemini → Groq → OpenAI. Returns the
      // translated array, or null if every provider failed for this batch.
      const translateBatch = async (batch: TItem[]): Promise<TItem[] | null> => {
        const prompt = buildPrompt(batch);

        if (env.GEMINI_API_KEY) {
          try {
            const r = await callGemini({ prompt, generationConfig: { temperature: 0.5, maxOutputTokens: 8000 }, tier: 'flash' });
            if (r.ok) {
              const jsonMatch = r.text.match(/\{[\s\S]*\}/);
              if (jsonMatch) {
                const parsed = JSON.parse(jsonMatch[0]) as { items?: TItem[] };
                if (parsed.items?.length) {
                  logger.info('ai.translate_hindi', { provider: 'gemini', count: parsed.items.length, model: r.model });
                  return parsed.items.map(sanitize);
                }
              }
            }
          } catch (err) { logger.warn('ai.translate_gemini_failed', { error: err instanceof Error ? err.message : String(err) }); }
        }

        if (groq) {
          try {
            const trGroq = await getGroqClient();
            const c = await (trGroq?.client ?? groq!).chat.completions.create({ model: trGroq?.model ?? 'llama-3.3-70b-versatile', messages: [{ role: 'user', content: prompt }], temperature: 0.5, max_tokens: 8000, response_format: { type: 'json_object' } });
            const parsed = JSON.parse(c.choices[0]?.message?.content ?? '{}') as { items?: TItem[] };
            if (parsed.items?.length) {
              logger.info('ai.translate_hindi', { provider: 'groq', count: parsed.items.length });
              return parsed.items.map(sanitize);
            }
          } catch (err) { logger.warn('ai.translate_groq_failed', { error: err instanceof Error ? err.message : String(err) }); }
        }

        if (openai) {
          try {
            const c = await oaCreate({ messages: [{ role: 'user', content: prompt }], temperature: 0.5, max_tokens: 8000, response_format: { type: 'json_object' } });
            const parsed = JSON.parse(c.choices[0]?.message?.content ?? '{}') as { items?: TItem[] };
            if (parsed.items?.length) {
              logger.info('ai.translate_hindi', { provider: 'openai', count: parsed.items.length });
              return parsed.items.map(sanitize);
            }
          } catch (err) { logger.warn('ai.translate_openai_failed', { error: err instanceof Error ? err.message : String(err) }); }
        }

        return null;
      };

      // Batch in small groups (5) so the JSON never gets truncated. Each
      // batch keeps its slot alignment: a failed batch falls back to the
      // English originals (same as the previous total-failure behaviour)
      // rather than shifting every later item's index.
      const BATCH_SIZE = 5;
      const out: TItem[] = [];
      let anyFailed = false;
      for (let i = 0; i < items.length; i += BATCH_SIZE) {
        const batch = items.slice(i, i + BATCH_SIZE);
        const translated = await translateBatch(batch);
        if (translated && translated.length === batch.length) {
          out.push(...translated);
        } else if (translated && translated.length > 0) {
          // Provider returned a partial batch — keep what we got, pad the
          // rest with originals to preserve index alignment.
          for (let j = 0; j < batch.length; j++) out.push(translated[j] ?? batch[j]!);
          anyFailed = true;
        } else {
          out.push(...batch);
          anyFailed = true;
        }
      }

      if (anyFailed) logger.warn('ai.translate_partial', { message: 'Some Hindi translation batches fell back to English', total: items.length });
      return out;
    },

    async generateBlogDraft(input) {
      const { topic, outline, language, targetExam } = input;
      const audience = targetExam
        ? `Indian competitive-exam students preparing for ${targetExam}`
        : 'Indian competitive-exam students';
      const langInstr = language === 'hi'
        ? 'Write entirely in Hindi (Devanagari script). Use natural, accessible Hindi. Do NOT mix in English transliteration except for proper nouns.'
        : 'Write in clear, accessible English suitable for a 16-22 year old student.';

      const userPrompt = `Write a blog post for the Nexigrate study platform.

TOPIC: ${topic}

${outline ? `OUTLINE / KEY POINTS THE ADMIN WANTS COVERED:\n${outline}\n` : ''}TARGET AUDIENCE: ${audience}.

REQUIREMENTS:
- 800 to 1500 words.
- Begin with a 2-3 line hook that frames the question / pain.
- Use ## H2 headings for each major section (3 to 6 sections).
- Inside each section, use short paragraphs (2-4 lines), occasional bullet lists, and at least one practical example or tip.
- End with a "Key Takeaways" section as a bulleted list (3 to 5 items).
- Maintain a calm, expert, exam-focused tone -- never preachy or salesy.
- Do NOT mention or link to competing platforms.
- Do NOT include a title at the top -- the admin sets that separately. Start directly with the hook paragraph.
- Output PURE markdown. No code fences. No commentary before or after.

${langInstr}`;

      // Same fallback chain order as chat() -- Groq first because the user-
      // reported 29 May incident showed it was the only reachable provider
      // when OpenAI/Gemini quotas were exhausted. We want the blog draft to
      // succeed on the cheap+fast path without burning the more expensive
      // GPT-4o budget on a draft the admin will edit anyway.
      const tries: Array<() => Promise<string | null>> = [];

      if (groq) {
        tries.push(async () => {
          try {
            const t0 = performance.now();
            const blogGroq = await getGroqClient();
            const c = await (blogGroq?.client ?? groq!).chat.completions.create({
              model: blogGroq?.model ?? 'llama-3.3-70b-versatile',
              messages: [{ role: 'user', content: userPrompt }],
              temperature: 0.7,
              max_tokens: 3500,
            });
            const reply = c.choices[0]?.message?.content?.trim() ?? '';
            if (reply) {
              const tokens = estimateTokens(reply);
              logAICallToStore(store, 'llama-3.3-70b-versatile', tokens, estimateCost('llama-3.3-70b-versatile', tokens), Math.round(performance.now() - t0), undefined, { status: 'success', endpoint: 'blog_draft', provider: 'groq', requestPreview: topic.slice(0, 200), responsePreview: reply.slice(0, 300) });
              return reply;
            }
          } catch (err) {
            logger.warn('ai.blog_draft_groq_failed', { error: err instanceof Error ? err.message : String(err) });
          }
          return null;
        });
      }

      if (openai) {
        tries.push(async () => {
          try {
            const t0 = performance.now();
            const c = await oaCreate({
              messages: [{ role: 'user', content: userPrompt }],
              temperature: 0.7,
              max_tokens: 3500,
            });
            const reply = c.choices[0]?.message?.content?.trim() ?? '';
            if (reply) {
              const tokens = estimateTokens(reply);
              logAICallToStore(store, 'gpt-4o', tokens, estimateCost('gpt-4o', tokens), Math.round(performance.now() - t0), undefined, { status: 'success', endpoint: 'blog_draft', provider: 'openai', requestPreview: topic.slice(0, 200), responsePreview: reply.slice(0, 300) });
              return reply;
            }
          } catch (err) {
            logger.warn('ai.blog_draft_openai_failed', { error: err instanceof Error ? err.message : String(err) });
          }
          return null;
        });
      }

      if (env.GEMINI_API_KEY && env.GEMINI_API_KEY.length > 5) {
        tries.push(async () => {
          try {
            const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${env.GEMINI_API_KEY}`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ contents: [{ parts: [{ text: userPrompt }] }], generationConfig: { temperature: 0.7, maxOutputTokens: 3500 } }),
            });
            if (res.ok) {
              const data = await res.json() as { candidates?: { content?: { parts?: { text?: string }[] } }[] };
              const reply = (data.candidates?.[0]?.content?.parts?.[0]?.text ?? '').trim();
              if (reply) {
                logger.info('ai.blog_draft', { provider: 'gemini', length: reply.length });
                return reply;
              }
            }
          } catch (err) {
            logger.warn('ai.blog_draft_gemini_failed', { error: err instanceof Error ? err.message : String(err) });
          }
          return null;
        });
      }

      for (const tryFn of tries) {
        const out = await tryFn();
        if (out && out.length > 200) return out;
      }
      throw new Error('Blog draft AI unavailable. Please try again.');
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
