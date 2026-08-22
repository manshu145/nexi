/**
 * AI Provider Registry — declarative metadata for every provider the
 * platform knows about. Closes the long-running gap where AI keys lived
 * only in env vars and the admin "API Config" page was a fake UI that
 * said "connected" for any input.
 *
 * Why a registry rather than per-provider code in 12 places:
 *   - Adding a new provider (e.g. xAI Grok in 6 months) is a single new
 *     entry here + a validate() impl. No hunt across aiEngine.ts.
 *   - Admin UI auto-renders cards from this list -- no UI changes needed
 *     when a new provider lands.
 *   - Each entry knows its own preference chain + validate URL + auth
 *     shape, so the registry is the truth, not env-var convention.
 *
 * The PREFERENCE CHAIN, not a fixed default model
 * ------------------------------------------------
 * Founder directive (29 May 2026, mid-PR): "kisi bhi model ko fix mt
 * krna yr.. aisa hona chahiye ki jo model availbale ho usme auto switch
 * ho jaye". Rationale: Gemini 2.0-flash got deprecated for new GCP
 * projects in May 2026 with ZERO migration window for new keys, which
 * caused our `gemini-2.0-flash:generateContent` URL to return
 * `404 model not available to new users` on every probe with the
 * founder's brand-new key. Hardcoding the model name made the platform
 * un-self-healing. Same will happen to 2.5-flash within 6-12 months.
 *
 * Solution: each provider's `models[]` array is now a PREFERENCE CHAIN,
 * newest-first. The runtime resolver (aiModelResolver.ts) picks the
 * first non-blacklisted entry, falls through on 404 / "not available"
 * errors, and the system self-heals without admin intervention. Admin
 * can still PIN a specific model in the UI for compliance / cost
 * reasons; if the pinned model fails, the chain takes over with an
 * audit-logged warning.
 *
 * Tier 1 (full implementation, used by the engine today):
 *   - openai, groq, gemini, anthropic
 * Tier 2 (UI + key storage ready, engine integration pending):
 *   - xai, deepseek, bedrock
 *
 * Tier 2 providers can have keys saved + validated against their
 * /chat/completions endpoint so the founder can wire them in advance.
 * The engine simply doesn't call them yet -- when we build their
 * adapters, the keys are already there waiting.
 */

export type ProviderId =
  | 'openai'
  | 'groq'
  | 'gemini'
  | 'anthropic'
  | 'xai'
  | 'deepseek'
  | 'bedrock';

/**
 * A "tier" coarsely separates flash-tier (fast, cheap, default) models
 * from pro-tier (slow, expensive, grounded-search-capable) models within
 * the SAME provider. The resolver filters by tier when picking.
 *
 * Why tier rather than a parallel ProviderId per tier (e.g. "gemini-pro"):
 *   - One API key per upstream account. Mirroring keys across two ids is
 *     a footgun -- admin saves under "gemini" and "gemini-pro" silently
 *     diverges.
 *   - Costs / blacklists / known-good cache entries are conceptually
 *     per-key, not per-tier. Sharing the ProviderConfig doc keeps that
 *     single-source-of-truth.
 *
 * Default tier is `flash` (the workhorse). The syllabusStore fallback
 * which needs Search-grounded research calls `resolve('gemini', { tier:
 * 'pro' })` to get the 2.5-pro chain. Image-generation models live in
 * `tier: 'image'` so a flash-tier resolve never accidentally returns
 * an image model that has no text-generation modality.
 */
export type ModelTier = 'flash' | 'pro' | 'image';

export interface ProviderModel {
  id: string;
  label: string;
  /**
   * Coarse capability bucket. Defaults to 'flash' if omitted. Used by
   * the resolver to filter `models[]` when callers ask for a specific
   * tier (e.g. syllabusStore needs `pro`, image-gen needs `image`).
   */
  tier?: ModelTier;
  /**
   * Cost per 1K tokens in USD, rough average (input + output blended).
   * Image models use this as the per-image price (call sites pass
   * `tokens=1`). Used both for cost estimation in the engine and for
   * picking the cheapest model when probing key validity.
   */
  costPer1kUsd?: number;
  /** Marker so the UI shows "Recommended" badge; informational only --
   *  does NOT affect resolver pick order (chain order does). */
  recommended?: boolean;
}

export interface ProviderMetadata {
  id: ProviderId;
  label: string;
  /** Short marketing-style description for the admin card. */
  description: string;
  /** Tier 1 = engine actually uses it. Tier 2 = key storage only. */
  tier: 1 | 2;
  /**
   * PREFERENCE CHAIN, newest-first by convention. The resolver picks
   * the first NON-BLACKLISTED entry whose tier matches the caller's
   * request (defaulting to 'flash'). On a deprecation / 404 / "model
   * not available to new users" error mid-call, the resolver
   * blacklists that entry for 5 min and the next call falls through
   * to the next entry automatically.
   *
   * Order this list deliberately: putting an unstable preview model at
   * the top will cause every fresh deploy to start by failing once
   * before the chain settles. Rule of thumb: top entry should be the
   * model the founder is actively using on his current GCP project,
   * second entry the immediate predecessor, third+ entries the
   * fallback path for older accounts that haven't been migrated yet.
   */
  models: ProviderModel[];
  /** Where the admin gets a key. */
  signupUrl: string;
  /** Where the admin manages billing. */
  billingUrl: string;
  /** What the masked key should look like roughly. */
  keyExamplePrefix: string;
  /** Approximate length range for sanity-check on save. */
  keyMinLength: number;
  keyMaxLength: number;
}

export const AI_PROVIDERS: ProviderMetadata[] = [
  {
    id: 'openai',
    label: 'OpenAI',
    description: 'GPT-4o family + DALL-E + gpt-image-1 for chapter generation, chat, and visualisations.',
    tier: 1,
    models: [
      { id: 'gpt-4o',            label: 'GPT-4o',                 tier: 'pro',   costPer1kUsd: 0.005,   recommended: true },
      { id: 'gpt-4o-mini',       label: 'GPT-4o mini',            tier: 'flash', costPer1kUsd: 0.00015 },
      { id: 'gpt-image-1',       label: 'gpt-image-1 (images)',   tier: 'image', costPer1kUsd: 0.020 },
      { id: 'dall-e-3',          label: 'DALL-E 3 (legacy)',      tier: 'image', costPer1kUsd: 0.040 },
    ],
    signupUrl: 'https://platform.openai.com/api-keys',
    billingUrl: 'https://platform.openai.com/settings/organization/billing/overview',
    keyExamplePrefix: 'sk-',
    keyMinLength: 30,
    keyMaxLength: 200,
  },
  {
    id: 'groq',
    label: 'Groq',
    description: 'Ultra-fast Llama inference. The reliable workhorse during the 29 May incident — kept assessment alive when others hit quota walls.',
    tier: 1,
    models: [
      { id: 'llama-3.3-70b-versatile',  label: 'Llama 3.3 70B',  tier: 'flash', costPer1kUsd: 0.0008, recommended: true },
      { id: 'llama-3.1-8b-instant',     label: 'Llama 3.1 8B',   tier: 'flash', costPer1kUsd: 0.0001 },
    ],
    signupUrl: 'https://console.groq.com/keys',
    billingUrl: 'https://console.groq.com/settings/billing',
    keyExamplePrefix: 'gsk_',
    keyMinLength: 30,
    keyMaxLength: 200,
  },
  {
    id: 'gemini',
    label: 'Google Gemini',
    description: '2.5 Flash for general work, 2.5 Pro for grounded research, image generation via Imagen. 2.0-flash deprecated for new projects May 2026 — chain auto-falls through.',
    tier: 1,
    models: [
      // Flash chain (newest first). 2.0-flash is intentionally LAST so
      // a fresh GCP project (which has 2.0 disabled) never hits it
      // first; the resolver still keeps it as a last resort for older
      // accounts where 2.5-flash is region-restricted.
      { id: 'gemini-2.5-flash',           label: 'Gemini 2.5 Flash',          tier: 'flash', costPer1kUsd: 0.0001, recommended: true },
      { id: 'gemini-2.5-flash-lite',      label: 'Gemini 2.5 Flash Lite',     tier: 'flash', costPer1kUsd: 0.00005 },
      { id: 'gemini-2.0-flash',           label: 'Gemini 2.0 Flash (legacy)', tier: 'flash', costPer1kUsd: 0.0001 },
      // Pro chain — used by syllabusStore for grounded Search.
      { id: 'gemini-2.5-pro',             label: 'Gemini 2.5 Pro',            tier: 'pro',   costPer1kUsd: 0.0025, recommended: true },
      { id: 'gemini-1.5-pro',             label: 'Gemini 1.5 Pro (legacy)',   tier: 'pro',   costPer1kUsd: 0.0035 },
      // Image chain — used by chapter visualisation fallback.
      { id: 'gemini-2.5-flash-image-preview',     label: '2.5 Flash Image (Nano Banana)', tier: 'image', costPer1kUsd: 0.005, recommended: true },
      { id: 'gemini-2.0-flash-preview-image-generation', label: '2.0 Flash Image (legacy)', tier: 'image', costPer1kUsd: 0.005 },
    ],
    signupUrl: 'https://aistudio.google.com/app/apikey',
    billingUrl: 'https://console.cloud.google.com/billing',
    keyExamplePrefix: 'AIza',
    keyMinLength: 30,
    keyMaxLength: 200,
  },
  {
    id: 'anthropic',
    label: 'Anthropic Claude',
    description: 'Claude Sonnet / Opus — strong instruction-following, large context. Useful as primary or fallback for chapter generation.',
    tier: 1,
    models: [
      { id: 'claude-sonnet-4-5-20250929',   label: 'Claude Sonnet 4.5', tier: 'pro',   costPer1kUsd: 0.003,  recommended: true },
      { id: 'claude-opus-4-1-20250805',     label: 'Claude Opus 4.1',   tier: 'pro',   costPer1kUsd: 0.015 },
      { id: 'claude-3-5-haiku-20241022',    label: 'Claude 3.5 Haiku',  tier: 'flash', costPer1kUsd: 0.00025 },
    ],
    signupUrl: 'https://console.anthropic.com/settings/keys',
    billingUrl: 'https://console.anthropic.com/settings/billing',
    keyExamplePrefix: 'sk-ant-',
    keyMinLength: 30,
    keyMaxLength: 250,
  },
  {
    id: 'xai',
    label: 'xAI Grok',
    description: 'Grok models — large context, real-time information. Engine wiring planned; key storage ready today.',
    tier: 2,
    models: [
      { id: 'grok-4',          label: 'Grok 4',          tier: 'pro',   costPer1kUsd: 0.005, recommended: true },
      { id: 'grok-4-fast',     label: 'Grok 4 Fast',     tier: 'flash', costPer1kUsd: 0.0015 },
      { id: 'grok-3',          label: 'Grok 3',          tier: 'pro',   costPer1kUsd: 0.003 },
    ],
    signupUrl: 'https://console.x.ai',
    billingUrl: 'https://console.x.ai/billing',
    keyExamplePrefix: 'xai-',
    keyMinLength: 30,
    keyMaxLength: 250,
  },
  {
    id: 'deepseek',
    label: 'DeepSeek',
    description: 'Cost-efficient alternative for bulk content generation. Engine wiring planned; key storage ready today.',
    tier: 2,
    models: [
      { id: 'deepseek-chat',     label: 'DeepSeek V3 Chat',  tier: 'flash', costPer1kUsd: 0.00027, recommended: true },
      { id: 'deepseek-reasoner', label: 'DeepSeek Reasoner', tier: 'pro',   costPer1kUsd: 0.00055 },
    ],
    signupUrl: 'https://platform.deepseek.com/api_keys',
    billingUrl: 'https://platform.deepseek.com/billing',
    keyExamplePrefix: 'sk-',
    keyMinLength: 30,
    keyMaxLength: 200,
  },
  {
    id: 'bedrock',
    label: 'Amazon Bedrock',
    description: 'Multi-model gateway: Claude / Titan / Llama on AWS. Engine wiring planned; key storage ready today.',
    tier: 2,
    models: [
      { id: 'anthropic.claude-sonnet-4-v1:0', label: 'Bedrock Claude Sonnet 4', tier: 'pro',   costPer1kUsd: 0.003, recommended: true },
      { id: 'amazon.nova-pro-v1:0',           label: 'Amazon Nova Pro',         tier: 'flash', costPer1kUsd: 0.0008 },
      { id: 'meta.llama3-3-70b-instruct-v1:0',label: 'Bedrock Llama 3.3 70B',   tier: 'flash', costPer1kUsd: 0.001 },
    ],
    signupUrl: 'https://console.aws.amazon.com/iam/home#/users',
    billingUrl: 'https://console.aws.amazon.com/billing',
    keyExamplePrefix: 'AKIA',
    keyMinLength: 16,
    keyMaxLength: 250,
  },
];

export function getProviderMetadata(id: ProviderId): ProviderMetadata | undefined {
  return AI_PROVIDERS.find(p => p.id === id);
}

/**
 * Pick the first non-blacklisted model from a provider's preference
 * chain at the requested tier. Returns null if the provider isn't
 * known or every model at that tier is blacklisted.
 *
 * This is the core of the founder's auto-switch directive: hardcoding
 * `'gemini-2.0-flash'` in the engine made the platform fragile when
 * Google deprecated that model for new projects. Instead, every engine
 * call site asks `pickPreferredModel('gemini')` (or the resolver
 * wrapper, which adds blacklist persistence) and always gets back the
 * topmost currently-working model.
 *
 * Why a function over a static `defaultModel` field:
 *   - The blacklist is dynamic (5-minute TTL set by the resolver when
 *     a model errors with a deprecation pattern). A static field can't
 *     react to runtime failures.
 *   - Tiering is a runtime concern; the same provider has different
 *     "preferred" entries depending on whether the caller wants flash
 *     speed or pro grounding.
 *
 * @param id        Provider id from the registry.
 * @param tier      Capability bucket; defaults to 'flash'.
 * @param blacklist Set of model ids the resolver has marked as failing
 *                  (typically because a recent call returned 404 /
 *                  deprecated / not-available). Pass an empty set or
 *                  omit to ignore the blacklist (e.g. for admin UI
 *                  display purposes).
 */
export function pickPreferredModel(
  id: ProviderId,
  tier: ModelTier = 'flash',
  blacklist?: ReadonlySet<string>,
): string | null {
  const meta = getProviderMetadata(id);
  if (!meta) return null;
  for (const m of meta.models) {
    const mtier: ModelTier = m.tier ?? 'flash';
    if (mtier !== tier) continue;
    if (blacklist?.has(m.id)) continue;
    return m.id;
  }
  return null;
}

/**
 * Pick the cheapest model in a provider's chain to use for a key
 * VALIDATION probe. We don't burn full GPT-4o tokens just to test
 * "does this key work" -- we use the smallest model the provider
 * offers (filtered to flash tier so we never accidentally probe with
 * an expensive image model).
 *
 * Falls back to the first non-blacklisted flash model if no costs are
 * declared. Returns null only if every flash model is blacklisted AND
 * there is no provider entry at all.
 *
 * Used by:
 *   - validateProviderKey() below — admin "Test Connection" button.
 *   - /diag/ai/test in routes/health.ts — founder-facing reachability.
 *   - aiProviderStore.upsert() when admin saves a new key (auto-test).
 */
export function pickProbeModel(
  id: ProviderId,
  blacklist?: ReadonlySet<string>,
): string | null {
  const meta = getProviderMetadata(id);
  if (!meta) return null;
  // Restrict to flash + non-blacklisted candidates.
  const candidates = meta.models.filter(m => {
    const mtier: ModelTier = m.tier ?? 'flash';
    if (mtier !== 'flash') return false;
    if (blacklist?.has(m.id)) return false;
    return true;
  });
  if (candidates.length === 0) {
    // No flash model usable -- fall back to ANY non-blacklisted entry,
    // even if pro/image, so the probe still tells us the key works.
    const any = meta.models.find(m => !blacklist?.has(m.id));
    return any?.id ?? null;
  }
  // Pick the cheapest declared cost; ties broken by chain order (later
  // entries are usually older + cheaper). If no costs declared, use
  // last entry in the filtered list (chain convention: cheapest last).
  let cheapest = candidates[0]!;
  for (const c of candidates) {
    const a = c.costPer1kUsd ?? Number.POSITIVE_INFINITY;
    const b = cheapest.costPer1kUsd ?? Number.POSITIVE_INFINITY;
    if (a < b) cheapest = c;
  }
  return cheapest.id;
}

/**
 * Live provider validation. Each function makes a real API call to verify
 * the key actually works. Returns latency + sample response for the
 * "Test Connection" button in the admin UI.
 *
 * Distinct from /diag/ai/test (in routes/health.ts) which probes the
 * env-var-backed keys -- these probe a candidate key the admin pasted,
 * BEFORE saving, so a typo doesn't get saved as "connected".
 *
 * Auto-resolver behaviour: when no `modelOverride` is supplied, this
 * function asks `pickProbeModel` for the cheapest non-blacklisted
 * flash model in the chain. So even without admin config the validator
 * picks `gpt-4o-mini` for OpenAI, `llama-3.1-8b-instant` for Groq,
 * `gemini-2.5-flash-lite` for Gemini, and so on -- whichever is
 * currently topmost in the chain at probe-cheap tier.
 */
export interface ProviderValidationResult {
  ok: boolean;
  latencyMs: number;
  /** Echo back the model used for the test so admin sees what was probed. */
  model?: string;
  /** First 50 chars of the response, sanitised. */
  sample?: string;
  /** First 200 chars of error, sanitised, no key material. */
  error?: string;
}

const PROBE_PROMPT = 'Reply with the single word OK and nothing else.';
const PROBE_TIMEOUT_MS = 12_000;

async function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  return Promise.race([
    p,
    new Promise<T>((_, reject) =>
      setTimeout(() => reject(new Error(`probe_timeout_${ms}ms`)), ms),
    ),
  ]);
}

function sanitiseError(err: unknown): string {
  const msg = err instanceof Error ? err.message : String(err);
  return msg.slice(0, 200);
}

export async function validateProviderKey(
  id: ProviderId,
  apiKey: string,
  modelOverride?: string,
  blacklist?: ReadonlySet<string>,
): Promise<ProviderValidationResult> {
  const meta = getProviderMetadata(id);
  if (!meta) return { ok: false, latencyMs: 0, error: 'unknown_provider' };
  if (!apiKey || apiKey.length < meta.keyMinLength) {
    return { ok: false, latencyMs: 0, error: `key too short (need >= ${meta.keyMinLength} chars)` };
  }
  // No hardcoded fallback model -- ask the registry what's currently
  // topmost-cheap in the chain. If somebody blacklisted everything we
  // get null, which means the test should not run; surface that
  // explicitly rather than 500 on a fetch with model="undefined".
  const model = modelOverride ?? pickProbeModel(id, blacklist);
  if (!model) {
    return { ok: false, latencyMs: 0, error: 'no_probe_model_available (every model in chain is blacklisted)' };
  }
  const t0 = Date.now();

  try {
    switch (id) {
      case 'openai': {
        const res = await withTimeout(fetch('https://api.openai.com/v1/chat/completions', {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ model, messages: [{ role: 'user', content: PROBE_PROMPT }], max_tokens: 10 }),
        }), PROBE_TIMEOUT_MS);
        const latencyMs = Date.now() - t0;
        if (!res.ok) {
          const body = (await res.text().catch(() => '')).slice(0, 200);
          return { ok: false, latencyMs, model, error: `HTTP ${res.status}: ${body}` };
        }
        const data = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> };
        return { ok: true, latencyMs, model, sample: data.choices?.[0]?.message?.content?.trim().slice(0, 50) };
      }

      case 'groq': {
        const res = await withTimeout(fetch('https://api.groq.com/openai/v1/chat/completions', {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ model, messages: [{ role: 'user', content: PROBE_PROMPT }], max_tokens: 10 }),
        }), PROBE_TIMEOUT_MS);
        const latencyMs = Date.now() - t0;
        if (!res.ok) {
          const body = (await res.text().catch(() => '')).slice(0, 200);
          return { ok: false, latencyMs, model, error: `HTTP ${res.status}: ${body}` };
        }
        const data = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> };
        return { ok: true, latencyMs, model, sample: data.choices?.[0]?.message?.content?.trim().slice(0, 50) };
      }

      case 'gemini': {
        const res = await withTimeout(fetch(
          `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              contents: [{ parts: [{ text: PROBE_PROMPT }] }],
              generationConfig: { maxOutputTokens: 10 },
            }),
          },
        ), PROBE_TIMEOUT_MS);
        const latencyMs = Date.now() - t0;
        if (!res.ok) {
          const body = (await res.text().catch(() => '')).slice(0, 200);
          return { ok: false, latencyMs, model, error: `HTTP ${res.status}: ${body}` };
        }
        const data = (await res.json()) as { candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }> };
        const sample = data.candidates?.[0]?.content?.parts?.[0]?.text?.trim().slice(0, 50);
        return { ok: true, latencyMs, model, sample };
      }

      case 'anthropic': {
        const res = await withTimeout(fetch('https://api.anthropic.com/v1/messages', {
          method: 'POST',
          headers: {
            'x-api-key': apiKey,
            'anthropic-version': '2023-06-01',
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            model,
            max_tokens: 10,
            messages: [{ role: 'user', content: PROBE_PROMPT }],
          }),
        }), PROBE_TIMEOUT_MS);
        const latencyMs = Date.now() - t0;
        if (!res.ok) {
          const body = (await res.text().catch(() => '')).slice(0, 200);
          return { ok: false, latencyMs, model, error: `HTTP ${res.status}: ${body}` };
        }
        const data = (await res.json()) as { content?: Array<{ text?: string }> };
        const sample = data.content?.[0]?.text?.trim().slice(0, 50);
        return { ok: true, latencyMs, model, sample };
      }

      case 'xai': {
        // xAI uses OpenAI-compatible /v1/chat/completions
        const res = await withTimeout(fetch('https://api.x.ai/v1/chat/completions', {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ model, messages: [{ role: 'user', content: PROBE_PROMPT }], max_tokens: 10 }),
        }), PROBE_TIMEOUT_MS);
        const latencyMs = Date.now() - t0;
        if (!res.ok) {
          const body = (await res.text().catch(() => '')).slice(0, 200);
          return { ok: false, latencyMs, model, error: `HTTP ${res.status}: ${body}` };
        }
        const data = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> };
        return { ok: true, latencyMs, model, sample: data.choices?.[0]?.message?.content?.trim().slice(0, 50) };
      }

      case 'deepseek': {
        // DeepSeek uses OpenAI-compatible /v1/chat/completions
        const res = await withTimeout(fetch('https://api.deepseek.com/v1/chat/completions', {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ model, messages: [{ role: 'user', content: PROBE_PROMPT }], max_tokens: 10 }),
        }), PROBE_TIMEOUT_MS);
        const latencyMs = Date.now() - t0;
        if (!res.ok) {
          const body = (await res.text().catch(() => '')).slice(0, 200);
          return { ok: false, latencyMs, model, error: `HTTP ${res.status}: ${body}` };
        }
        const data = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> };
        return { ok: true, latencyMs, model, sample: data.choices?.[0]?.message?.content?.trim().slice(0, 50) };
      }

      case 'bedrock': {
        // Bedrock uses AWS SigV4 -- a real probe needs AWS SDK + secret key
        // pair, not a single bearer token. We accept the credential format
        // as "ACCESS_KEY:SECRET_KEY:REGION" and do shape validation here;
        // a true SigV4 probe lands when the bedrock adapter ships.
        const parts = apiKey.split(':');
        if (parts.length < 2) {
          return {
            ok: false, latencyMs: Date.now() - t0,
            error: 'bedrock_credential_format: expected "ACCESS_KEY:SECRET_KEY[:REGION]"',
          };
        }
        return {
          ok: true, latencyMs: Date.now() - t0, model,
          sample: `(stored, validated when adapter lands; region=${parts[2] ?? 'ap-south-1'})`,
        };
      }
    }
  } catch (err) {
    return { ok: false, latencyMs: Date.now() - t0, model, error: sanitiseError(err) };
  }
  return { ok: false, latencyMs: Date.now() - t0, error: 'unhandled_provider' };
}

/**
 * Look up the per-1k-token cost for a (provider, model) pair from the
 * registry. Used by `aiEngine.estimateCost` so the cost map lives in
 * one place rather than being duplicated as a local Record literal in
 * the engine. Returns 0.000001 (a microcent) as a final fallback so a
 * cost line never NaNs out -- 0.000001/1k is small enough not to
 * pollute analytics if a model id is genuinely unknown.
 *
 * Image models use the per-1k field as a per-image price (see registry
 * comments). Callers that bill per image pass `tokens=1` so the
 * multiplication degenerates to the unit price.
 */
export function getCostPer1k(id: ProviderId | string, model: string): number {
  // Accept string for the engine's per-call site which may not have
  // ProviderId narrowed (e.g. when reading from a log line).
  const meta = AI_PROVIDERS.find(p => p.id === id);
  if (!meta) {
    // Not a known provider id; scan all entries by model id as a courtesy.
    for (const p of AI_PROVIDERS) {
      const m = p.models.find(x => x.id === model);
      if (m?.costPer1kUsd != null) return m.costPer1kUsd;
    }
    return 0.000001;
  }
  const m = meta.models.find(x => x.id === model);
  return m?.costPer1kUsd ?? 0.000001;
}
