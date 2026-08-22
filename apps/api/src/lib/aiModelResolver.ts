/**
 * AIModelResolver — runtime auto-switch wrapper around AIProviderStore.
 *
 * Founder directive (29 May 2026, mid-PR-29):
 *   "kisi bhi model ko fix mt krna yr.. aisa hona chahiye ki jo model
 *   availbale ho usme auto switch ho jaye"
 *
 * What the resolver buys you:
 *   1. resolve(provider, { tier? }) returns { provider, model, apiKey }
 *      using the registry preference chain + admin pin + blacklist.
 *      No hardcoded model strings anywhere downstream.
 *   2. reportModelFailure(...) is what every engine call site calls
 *      from its catch block. If the error matches a deprecation
 *      pattern the resolver blacklists the model for 5 min so the
 *      next resolve() falls through to the next entry. Transient
 *      errors (5xx, timeout, rate-limit) are NOT blacklisted.
 *   3. reportModelSuccess(...) caches "this model worked" for 1h so
 *      the next call doesn't have to re-check the chain.
 *   4. callWithModelFallback(provider, fn) is the high-level helper
 *      that wraps any per-call function in resolve→try→on-deprecation
 *      fall-through→retry-once with the next chain entry. The engine's
 *      9 hardcoded `gemini-2.0-flash` blocks become 9 callsites of
 *      this helper.
 */

import type { Env } from '../env.js';
import type { Logger } from '../logger.js';
import {
  type AIProviderStore,
} from './aiProviderStore.js';
import { isModelDeprecationError } from './aiProviderStore.js';
import type { ProviderId, ModelTier } from './aiProviderRegistry.js';

export { isModelDeprecationError };

export interface ResolvedModel {
  provider: ProviderId;
  model: string;
  apiKey: string;
}


export interface ResolveOptions {
  /** Capability bucket. Defaults to 'flash'. */
  tier?: ModelTier;
}

export interface AIModelResolver {
  /**
   * Resolve a working (provider, model, apiKey) for the given provider.
   * Returns null if the provider has no configured key (admin or env)
   * OR if every model in the chain at the requested tier is blacklisted.
   */
  resolve(id: ProviderId, opts?: ResolveOptions): Promise<ResolvedModel | null>;

  /**
   * Call this after a real provider call returns an error. The
   * resolver inspects the error text and:
   *   - If it matches a deprecation / 404 / not-available pattern,
   *     blacklists the model for 5 minutes so subsequent resolves
   *     fall through to the next chain entry.
   *   - Otherwise (transient 5xx, network blip, timeout) it does NOT
   *     blacklist -- treats the failure as flaky-provider, not as a
   *     dead model.
   *
   * Logged either way for audit.
   */
  reportModelFailure(id: ProviderId, model: string, error: string): Promise<void>;

  /** Cache "this model worked" for 1h so resolves stay on it. */
  reportModelSuccess(id: ProviderId, model: string): Promise<void>;

  /**
   * High-level helper: resolve, run `fn(resolved)`, on a deprecation
   * error blacklist + re-resolve + retry ONCE with the next entry.
   * Returns whatever fn returns. Throws if the second attempt also
   * fails or there's no next candidate.
   *
   * The "retry-once-then-bubble" rule keeps a single user request
   * cheap while still self-healing the chain. Transient errors that
   * weren't deprecation patterns are re-thrown immediately so the
   * caller's outer fallback chain (groq → openai → gemini in the
   * engine) still runs.
   */
  callWithModelFallback<T>(
    id: ProviderId,
    fn: (resolved: ResolvedModel) => Promise<T>,
    opts?: ResolveOptions,
  ): Promise<T>;
}


/**
 * Map a ProviderId to the corresponding env-var fallback name.
 * Centralised here so adding a new provider doesn't fan out to every
 * call site that has to remember "gemini reads GEMINI_API_KEY".
 *
 * GEMINI_PRO_API_KEY exists historically as a separate Search-grounded
 * key; if it's set we prefer it over GEMINI_API_KEY for pro-tier
 * resolves (matches syllabusStore's previous behaviour).
 */
function envFallbackKey(env: Env, id: ProviderId, tier: ModelTier): string | undefined {
  switch (id) {
    case 'openai':    return env.OPENAI_API_KEY || undefined;
    case 'groq':      return env.GROQ_API_KEY || undefined;
    case 'gemini':    return tier === 'pro'
      ? (env.GEMINI_PRO_API_KEY || env.GEMINI_API_KEY || undefined)
      : (env.GEMINI_API_KEY || undefined);
    case 'anthropic': return undefined; // No legacy env var; admin-only.
    case 'xai':       return undefined;
    case 'deepseek':  return undefined;
    case 'bedrock':   return undefined;
    default: return undefined;
  }
}

/**
 * Default resolver. Backed by the AIProviderStore for persistence and
 * by env vars as a graceful fallback so existing production deployments
 * (which still store keys only in env) keep working with zero admin
 * config required.
 */
export class DefaultAIModelResolver implements AIModelResolver {
  constructor(
    private readonly store: AIProviderStore,
    private readonly env: Env,
    private readonly logger?: Logger,
  ) {}


  async resolve(id: ProviderId, opts: ResolveOptions = {}): Promise<ResolvedModel | null> {
    const tier: ModelTier = opts.tier ?? 'flash';
    const apiKey = await this.store.getKey(id, envFallbackKey(this.env, id, tier));
    if (!apiKey) {
      // No configured key (neither admin nor env); caller must skip.
      return null;
    }
    const model = await this.store.pickModel(id, tier);
    if (!model) {
      // Every chain entry at this tier is blacklisted. Caller should
      // try the next provider in their outer fallback chain.
      this.logger?.warn('ai.resolver_no_model', { provider: id, tier });
      return null;
    }
    return { provider: id, model, apiKey };
  }

  async reportModelFailure(id: ProviderId, model: string, error: string): Promise<void> {
    if (isModelDeprecationError(error)) {
      this.logger?.warn('ai.resolver_blacklist', {
        provider: id,
        model,
        reason: error.slice(0, 200),
      });
      try {
        await this.store.blacklistModel(id, model, error);
      } catch (err) {
        this.logger?.error('ai.resolver_blacklist_write_failed', {
          provider: id, model,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    } else {
      // Transient -- log but do not blacklist. The engine's outer
      // provider chain handles flaky-provider fallback.
      this.logger?.info('ai.resolver_transient_failure', {
        provider: id,
        model,
        error: error.slice(0, 200),
      });
    }
  }

  async reportModelSuccess(id: ProviderId, model: string): Promise<void> {
    try {
      await this.store.markKnownGood(id, model);
    } catch (err) {
      // Non-blocking -- markKnownGood is a cache hint, not correctness.
      this.logger?.warn('ai.resolver_known_good_write_failed', {
        provider: id, model,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }


  async callWithModelFallback<T>(
    id: ProviderId,
    fn: (resolved: ResolvedModel) => Promise<T>,
    opts: ResolveOptions = {},
  ): Promise<T> {
    const first = await this.resolve(id, opts);
    if (!first) {
      throw new Error(`ai_resolver: no available model for provider "${id}" (tier=${opts.tier ?? 'flash'})`);
    }

    try {
      const result = await fn(first);
      // Don't await on the success report — fire-and-forget so the
      // hot path returns immediately. Failures here are logged, not
      // thrown.
      void this.reportModelSuccess(id, first.model);
      return result;
    } catch (firstErr) {
      const errMsg = firstErr instanceof Error ? firstErr.message : String(firstErr);
      // Always report so transient errors get logged. Only deprecation
      // errors actually mutate the blacklist.
      await this.reportModelFailure(id, first.model, errMsg);

      // If this wasn't a deprecation pattern, no point retrying with
      // the same chain — it's a flaky-provider issue. Re-throw so the
      // engine's outer chain (groq → openai → gemini) takes over.
      if (!isModelDeprecationError(errMsg)) {
        throw firstErr;
      }


      // Re-resolve — the blacklist write should now make the next
      // chain entry topmost. Note: depending on the store's cache,
      // this may briefly still return the old model on Cloud Run
      // instances other than ours. The InMemory + the Firestore
      // impls in aiProviderStore.ts patch the local cache
      // synchronously after a write, so the same-instance retry
      // here ALWAYS sees the updated blacklist.
      const next = await this.resolve(id, opts);
      if (!next) {
        throw new Error(
          `ai_resolver: model "${first.model}" failed with deprecation error and no fallback available for provider "${id}"`,
        );
      }
      if (next.model === first.model) {
        // Should not happen because we just blacklisted it, but guard
        // anyway -- if the chain is exhausted we'd rather throw a
        // clear error than infinite-loop.
        throw new Error(
          `ai_resolver: model "${first.model}" failed and chain has no other candidates for provider "${id}"`,
        );
      }

      this.logger?.info('ai.resolver_retry_with_fallback', {
        provider: id,
        from: first.model,
        to: next.model,
      });

      try {
        const result = await fn(next);
        void this.reportModelSuccess(id, next.model);
        return result;
      } catch (secondErr) {
        const secondMsg = secondErr instanceof Error ? secondErr.message : String(secondErr);
        await this.reportModelFailure(id, next.model, secondMsg);
        throw secondErr;
      }
    }
  }
}

/**
 * No-op resolver useful for tests that don't care about provider
 * resolution. Returns null from resolve() and is a no-op for
 * report*() / callWithModelFallback throws.
 */
export class NullAIModelResolver implements AIModelResolver {
  async resolve(): Promise<ResolvedModel | null> { return null; }
  async reportModelFailure(): Promise<void> { /* no-op */ }
  async reportModelSuccess(): Promise<void> { /* no-op */ }
  async callWithModelFallback<T>(_id: ProviderId, _fn: (r: ResolvedModel) => Promise<T>): Promise<T> {
    throw new Error('NullAIModelResolver: no provider configured');
  }
}
