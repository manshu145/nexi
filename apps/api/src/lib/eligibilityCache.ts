/**
 * Eligibility verdict cache.
 *
 * The rule engine is cheap (pure arithmetic, microseconds per job), so this
 * cache exists to avoid repeated *serialisation and allocation* on hot feed
 * requests, not to avoid expensive computation. That framing matters: it is
 * always safe to miss.
 *
 * ── Why an in-process LRU and not Firestore ──────────────────────────────
 * Writing a verdict to Firestore would cost a document write per user per
 * job — the exact per-user-per-job explosion the architecture is designed to
 * avoid, and a real bill on a project that just came out of a cost incident.
 * Recomputing is far cheaper than persisting. So the cache is per-instance,
 * bounded, and disposable.
 *
 * ── Correctness ──────────────────────────────────────────────────────────
 * The key embeds `profileVersion` and `jobVersion`
 * (`user:profileVersion:job:jobVersion`), so a profile edit or a corrigendum
 * produces a different key rather than a stale hit. There is no invalidation
 * path to get wrong: old entries simply become unreachable and age out.
 */

import type { EligibilityResult } from '@nexigrate/shared';
import { eligibilityCacheKey } from '@nexigrate/shared';

/** Default ceiling on entries held per Cloud Run instance. */
const DEFAULT_MAX_ENTRIES = 5_000;
/** Entries older than this are discarded even if still addressable. */
const DEFAULT_TTL_MS = 10 * 60_000;

interface Entry {
  result: EligibilityResult;
  storedAt: number;
}

export interface EligibilityCacheStats {
  size: number;
  hits: number;
  misses: number;
  /** 0-1; useful for the admin cost dashboard. */
  hitRate: number;
}

export class EligibilityCache {
  private map = new Map<string, Entry>();
  private hits = 0;
  private misses = 0;

  constructor(
    private readonly maxEntries = DEFAULT_MAX_ENTRIES,
    private readonly ttlMs = DEFAULT_TTL_MS,
  ) {}

  get(userId: string, profileVersion: number, jobId: string, jobVersion: number): EligibilityResult | null {
    const key = eligibilityCacheKey(userId, profileVersion, jobId, jobVersion);
    const entry = this.map.get(key);
    if (!entry) {
      this.misses += 1;
      return null;
    }
    if (Date.now() - entry.storedAt > this.ttlMs) {
      this.map.delete(key);
      this.misses += 1;
      return null;
    }
    // Refresh recency for the LRU eviction order.
    this.map.delete(key);
    this.map.set(key, entry);
    this.hits += 1;
    return entry.result;
  }

  set(
    userId: string,
    profileVersion: number,
    jobId: string,
    jobVersion: number,
    result: EligibilityResult,
  ): void {
    const key = eligibilityCacheKey(userId, profileVersion, jobId, jobVersion);
    if (this.map.size >= this.maxEntries) {
      // Map preserves insertion order, so the first key is the least
      // recently used. Evict a small batch to amortise the cost.
      const evictCount = Math.max(1, Math.floor(this.maxEntries * 0.1));
      let evicted = 0;
      for (const k of this.map.keys()) {
        this.map.delete(k);
        if (++evicted >= evictCount) break;
      }
    }
    this.map.set(key, { result, storedAt: Date.now() });
  }

  stats(): EligibilityCacheStats {
    const total = this.hits + this.misses;
    return {
      size: this.map.size,
      hits: this.hits,
      misses: this.misses,
      hitRate: total === 0 ? 0 : this.hits / total,
    };
  }

  clear(): void {
    this.map.clear();
  }
}
