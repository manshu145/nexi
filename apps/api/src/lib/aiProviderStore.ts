/**
 * AIProviderStore — Firestore-backed per-provider config + blacklist.
 *
 * One Firestore doc per provider at `aiProviders/{providerId}` carries
 * the admin's API key, optional pinned model, last-validated metadata,
 * and the runtime blacklist that the auto-resolver writes to when a
 * model returns a deprecation / 404 error mid-call.
 *
 * Founder directive (29 May 2026 mid-PR-29):
 *   "kisi bhi model ko fix mt krna yr.. aisa hona chahiye ki jo model
 *   availbale ho usme auto switch ho jaye"
 *
 * The whole reason this store exists: the engine used to hardcode
 * `gemini-2.0-flash` in 9 call sites. That model is now deprecated for
 * new GCP projects, so the founder's brand-new key returned 404 on
 * every call. Hardcoded model ids cannot self-heal. Persisting a
 * blacklist + a known-good cache lets the registry's preference chain
 * step forward to the next entry automatically and lets the system
 * stay on that working model for an hour without re-probing.
 *
 * Why Firestore and not in-memory:
 *   - Cloud Run scales to N instances; an in-memory blacklist on
 *     instance A doesn't help instance B that the load balancer
 *     happens to route the next user to. They'd both probe the same
 *     dead model and both hit 404.
 *   - Admin-saved keys must survive a deploy / cold start.
 *   - The blacklist is small (one map entry per failing model with an
 *     ISO expiry timestamp). Cost is negligible vs the value of every
 *     instance sharing the same self-healing decision.
 *
 * Cache layer: the resolver is on the hot path of EVERY AI call. We
 * absolutely cannot do a Firestore round-trip per call. The store
 * keeps a 60-second snapshot of all provider docs in memory; admin
 * mutations bump a version counter that invalidates the snapshot
 * locally. Other Cloud Run instances see staleness up to 60 seconds,
 * which is acceptable -- the worst case is one instance running on a
 * just-blacklisted model for up to a minute before its snapshot
 * refreshes.
 *
 * Trust model: API keys are stored AS-IS in Firestore. The trust
 * boundary is the Firestore IAM rule that only the admin SDK service
 * account can read this collection (already in place in
 * `infra/firestore.rules`). KMS encryption-at-rest is a follow-up
 * (the directive explicitly defers it to keep this PR focused on the
 * "model auto-switch" pain).
 */

import type { Firestore } from 'firebase-admin/firestore';
import {
  type ProviderId,
  type ModelTier,
  pickPreferredModel,
  pickProbeModel,
  getProviderMetadata,
} from './aiProviderRegistry.js';

/** Per-model blacklist entry. Keyed by model id in `blacklist` map. */
export interface BlacklistEntry {
  /** ISO timestamp when this blacklist entry expires. */
  until: string;
  /** First 200 chars of the error that triggered the blacklist (audit). */
  reason?: string;
}

export interface ProviderConfig {
  id: ProviderId;
  /** Admin can disable a provider without deleting the saved key. */
  enabled: boolean;
  /**
   * Stored as-is. NEVER returned by API endpoints in raw form -- the
   * route layer always masks (last 4 chars + dots). The trust boundary
   * is Firestore IAM (admin SDK only). Encryption-at-rest via KMS is
   * a follow-up.
   */
  apiKey: string;
  /**
   * Optional admin override: a specific model id to use first. Even
   * when pinned, the resolver still falls through to the chain after
   * 3 consecutive failures of the pinned model (audit-logged so the
   * admin sees they need to fix their pin).
   */
  pinnedModel?: string;
  /** Counter for the pinned-model fail-over rule; reset on success. */
  pinnedModelFailureCount?: number;
  /**
   * Last successful key validation. Used by the resolver as a freshness
   * heuristic: a pinned model is honoured only if validated within the
   * last 24 hours, otherwise the chain takes precedence on the
   * assumption the pin is stale.
   */
  lastValidatedAt?: string;
  lastValidationLatencyMs?: number;
  /** First 200 chars of the most recent validation error, masked. */
  lastValidationError?: string;
  /**
   * Per-model 5-minute cooldown set by the resolver when a call
   * returns a deprecation / 404 / "not available" error. The resolver
   * scans this map on every resolve(), drops expired entries, and
   * writes back if any pruning happened. Map shape (rather than array)
   * so writes are idempotent regardless of duplicate failure reports.
   */
  blacklist: Record<string, BlacklistEntry>;
  /** Last successfully-used model id, used as a 1-hour cache hint. */
  knownGoodModel?: string;
  knownGoodAt?: string;
  /** ISO timestamps for audit / debugging. */
  updatedAt: string;
  createdAt: string;
}

/**
 * Default blacklist TTL when the resolver flags a model. 5 minutes is
 * long enough that the same call doesn't keep re-trying the dead model,
 * short enough that a transient Google deploy that briefly returned
 * 404s doesn't lock us out for the rest of the day.
 */
export const DEFAULT_BLACKLIST_TTL_MS = 5 * 60 * 1000;

/**
 * How long a known-good model decision is trusted before re-running
 * the chain. 1 hour matches the admin's "test connection" cadence and
 * is short enough that a model deprecation will be picked up on the
 * next hour boundary even if no call fails in between.
 */
export const KNOWN_GOOD_TTL_MS = 60 * 60 * 1000;

/**
 * Admin pinned model is only honoured if it was validated in the last
 * 24 hours. Older pins are likely stale (admin set it three months ago
 * before the model got deprecated and forgot to retest).
 */
export const PINNED_MODEL_VALIDATION_TTL_MS = 24 * 60 * 60 * 1000;

/**
 * Snapshot cache TTL in the in-process store. Cloud Run instances will
 * see at most this much staleness on each other's blacklist updates.
 * 60s is a sweet spot: low enough that auto-switching converges
 * quickly across instances, high enough that the bulk of AI calls
 * skip Firestore entirely.
 */
export const STORE_SNAPSHOT_TTL_MS = 60_000;

export interface AIProviderStore {
  getAll(): Promise<ProviderConfig[]>;
  get(id: ProviderId): Promise<ProviderConfig | null>;
  upsert(id: ProviderId, patch: Partial<ProviderConfig>): Promise<ProviderConfig>;
  /** Mark a model as failing — blacklist it for `ttlMs` (default 5 min). */
  blacklistModel(id: ProviderId, model: string, reason?: string, ttlMs?: number): Promise<void>;
  /** Clear ALL blacklist entries for a provider (admin override). */
  clearBlacklist(id: ProviderId): Promise<void>;
  /** Record a successful call so subsequent calls can use the same model fast. */
  markKnownGood(id: ProviderId, model: string): Promise<void>;
  /**
   * Get the API key for a provider. Falls back to the env var if no
   * admin config exists (or the saved key is empty) so the founder's
   * existing env-only deployments keep working untouched.
   */
  getKey(id: ProviderId, envFallback?: string): Promise<string | null>;
  /**
   * Pick the model to use right now, honouring (in order):
   *   1. admin pinnedModel — if not blacklisted, validated within 24h,
   *      and pinnedModelFailureCount < 3.
   *   2. knownGoodModel — if not blacklisted and fresh within 1h.
   *   3. first non-blacklisted model from the registry preference chain.
   *
   * Returns null only if every model in the chain at the requested
   * tier is currently blacklisted. Callers should treat that as
   * "provider unavailable, try the next provider in your fallback
   * chain".
   */
  pickModel(id: ProviderId, tier?: ModelTier): Promise<string | null>;
}

// ─── helpers ─────────────────────────────────────────────────────────────

function nowIso(): string {
  return new Date().toISOString();
}

/** Drop expired blacklist entries; return whether any were pruned. */
function pruneBlacklist(map: Record<string, BlacklistEntry>): { pruned: boolean; map: Record<string, BlacklistEntry> } {
  const now = Date.now();
  let pruned = false;
  const next: Record<string, BlacklistEntry> = {};
  for (const [model, entry] of Object.entries(map ?? {})) {
    if (Date.parse(entry.until) > now) {
      next[model] = entry;
    } else {
      pruned = true;
    }
  }
  return { pruned, map: next };
}

/** Build the active blacklist set for a config (skipping expired). */
function activeBlacklistSet(cfg: ProviderConfig | null): Set<string> {
  if (!cfg) return new Set();
  const { map } = pruneBlacklist(cfg.blacklist ?? {});
  return new Set(Object.keys(map));
}

/** Apply selection rules: pinned → knownGood → chain. */
function selectModelFromConfig(
  id: ProviderId,
  tier: ModelTier,
  cfg: ProviderConfig | null,
): string | null {
  const blacklist = activeBlacklistSet(cfg);
  const meta = getProviderMetadata(id);
  if (!meta) return null;

  // 1. admin pinnedModel — only if recently validated and fail count < 3.
  const pin = cfg?.pinnedModel;
  if (pin && !blacklist.has(pin)) {
    const validatedAt = cfg?.lastValidatedAt ? Date.parse(cfg.lastValidatedAt) : 0;
    const validatedFresh = validatedAt && (Date.now() - validatedAt) < PINNED_MODEL_VALIDATION_TTL_MS;
    const failures = cfg?.pinnedModelFailureCount ?? 0;
    if (validatedFresh && failures < 3) {
      // Confirm pin is part of registry AND matches requested tier.
      // If tier mismatches, fall through -- a flash-tier caller asking
      // for a pro-pinned model is a misconfiguration, not a working
      // pick. (Admin pins are tier-agnostic in storage; we filter by
      // requested tier here so syllabusStore's pro request never lands
      // on a pinned flash model.)
      const m = meta.models.find(x => x.id === pin);
      if (m && (m.tier ?? 'flash') === tier) return pin;
    }
  }

  // 2. knownGoodModel — fresh within 1h and not blacklisted.
  const kg = cfg?.knownGoodModel;
  if (kg && !blacklist.has(kg)) {
    const at = cfg?.knownGoodAt ? Date.parse(cfg.knownGoodAt) : 0;
    if (at && (Date.now() - at) < KNOWN_GOOD_TTL_MS) {
      const m = meta.models.find(x => x.id === kg);
      if (m && (m.tier ?? 'flash') === tier) return kg;
    }
  }

  // 3. preference chain.
  return pickPreferredModel(id, tier, blacklist);
}

// ─── In-memory store (tests + dev fallback) ──────────────────────────────

/**
 * Pure in-memory implementation. Used by tests and as the fallback when
 * Firestore is not configured (e.g. local dev with PERSISTENCE=memory).
 * Behaviour identical to the Firestore impl from a caller's POV.
 */
export class InMemoryAIProviderStore implements AIProviderStore {
  private docs = new Map<ProviderId, ProviderConfig>();

  async getAll(): Promise<ProviderConfig[]> {
    return [...this.docs.values()];
  }

  async get(id: ProviderId): Promise<ProviderConfig | null> {
    const d = this.docs.get(id);
    if (!d) return null;
    // Prune expired blacklist entries on read so callers always see
    // the live state without a separate sweep step.
    const { pruned, map } = pruneBlacklist(d.blacklist);
    if (pruned) {
      d.blacklist = map;
      d.updatedAt = nowIso();
    }
    return d;
  }

  async upsert(id: ProviderId, patch: Partial<ProviderConfig>): Promise<ProviderConfig> {
    const existing = this.docs.get(id);
    const now = nowIso();
    const next: ProviderConfig = {
      id,
      enabled: patch.enabled ?? existing?.enabled ?? true,
      apiKey: patch.apiKey ?? existing?.apiKey ?? '',
      pinnedModel: patch.pinnedModel ?? existing?.pinnedModel,
      pinnedModelFailureCount: patch.pinnedModelFailureCount ?? existing?.pinnedModelFailureCount ?? 0,
      lastValidatedAt: patch.lastValidatedAt ?? existing?.lastValidatedAt,
      lastValidationLatencyMs: patch.lastValidationLatencyMs ?? existing?.lastValidationLatencyMs,
      lastValidationError: patch.lastValidationError ?? existing?.lastValidationError,
      blacklist: patch.blacklist ?? existing?.blacklist ?? {},
      knownGoodModel: patch.knownGoodModel ?? existing?.knownGoodModel,
      knownGoodAt: patch.knownGoodAt ?? existing?.knownGoodAt,
      updatedAt: now,
      createdAt: existing?.createdAt ?? now,
    };
    this.docs.set(id, next);
    return next;
  }

  async blacklistModel(id: ProviderId, model: string, reason?: string, ttlMs = DEFAULT_BLACKLIST_TTL_MS): Promise<void> {
    const existing = (await this.get(id)) ?? (await this.upsert(id, {}));
    const until = new Date(Date.now() + ttlMs).toISOString();
    existing.blacklist[model] = { until, reason: reason?.slice(0, 200) };
    existing.updatedAt = nowIso();
    // If the blacklisted model is the pinned one, increment the
    // failure counter so the resolver eventually falls through to
    // the chain even after admin pinned it.
    if (existing.pinnedModel === model) {
      existing.pinnedModelFailureCount = (existing.pinnedModelFailureCount ?? 0) + 1;
    }
    this.docs.set(id, existing);
  }

  async clearBlacklist(id: ProviderId): Promise<void> {
    const existing = await this.get(id);
    if (!existing) return;
    existing.blacklist = {};
    existing.pinnedModelFailureCount = 0;
    existing.updatedAt = nowIso();
    this.docs.set(id, existing);
  }

  async markKnownGood(id: ProviderId, model: string): Promise<void> {
    const existing = (await this.get(id)) ?? (await this.upsert(id, {}));
    existing.knownGoodModel = model;
    existing.knownGoodAt = nowIso();
    // Successful call resets the pinned-model failure counter so a
    // recovering admin pin gets a fair second chance without admin
    // intervention.
    if (existing.pinnedModel === model) {
      existing.pinnedModelFailureCount = 0;
    }
    existing.updatedAt = nowIso();
    this.docs.set(id, existing);
  }

  async getKey(id: ProviderId, envFallback?: string): Promise<string | null> {
    const cfg = await this.get(id);
    if (cfg && cfg.apiKey && cfg.apiKey.length > 5 && cfg.enabled !== false) {
      return cfg.apiKey;
    }
    if (envFallback && envFallback.length > 5) return envFallback;
    return null;
  }

  async pickModel(id: ProviderId, tier: ModelTier = 'flash'): Promise<string | null> {
    const cfg = await this.get(id);
    return selectModelFromConfig(id, tier, cfg);
  }
}

// ─── Firestore store ─────────────────────────────────────────────────────

interface SnapshotCache {
  byId: Map<ProviderId, ProviderConfig>;
  loadedAt: number;
}

/**
 * Firestore-backed implementation with an in-process snapshot cache.
 *
 * Behaviour:
 *   - First call (per instance) loads all docs in `aiProviders/`.
 *   - Subsequent calls within `STORE_SNAPSHOT_TTL_MS` reuse the
 *     snapshot.
 *   - Mutations write through to Firestore AND patch the local
 *     snapshot in-place so the next read sees the change without
 *     waiting for the TTL.
 *   - Reads after a mutation on ANOTHER instance see staleness up to
 *     `STORE_SNAPSHOT_TTL_MS`. That's acceptable for blacklist
 *     propagation: the worst case is one instance probes a dead model
 *     once before its snapshot refreshes, which is exactly the same
 *     failure that would have triggered the blacklist write in the
 *     first place. The system is self-correcting.
 */
export class FirestoreAIProviderStore implements AIProviderStore {
  private cache: SnapshotCache | null = null;

  constructor(private readonly db: Firestore) {}

  private collection() {
    return this.db.collection('aiProviders');
  }

  /** Ensure the snapshot is fresh; reload if expired. */
  private async ensureCache(): Promise<SnapshotCache> {
    if (this.cache && (Date.now() - this.cache.loadedAt) < STORE_SNAPSHOT_TTL_MS) {
      return this.cache;
    }
    const snap = await this.collection().get();
    const byId = new Map<ProviderId, ProviderConfig>();
    snap.forEach(doc => {
      const data = doc.data() as Partial<ProviderConfig>;
      byId.set(doc.id as ProviderId, this.fromFirestore(doc.id as ProviderId, data));
    });
    this.cache = { byId, loadedAt: Date.now() };
    return this.cache;
  }

  /** Defensive read: tolerate missing fields from older docs. */
  private fromFirestore(id: ProviderId, data: Partial<ProviderConfig>): ProviderConfig {
    return {
      id,
      enabled: data.enabled ?? true,
      apiKey: data.apiKey ?? '',
      pinnedModel: data.pinnedModel,
      pinnedModelFailureCount: data.pinnedModelFailureCount ?? 0,
      lastValidatedAt: data.lastValidatedAt,
      lastValidationLatencyMs: data.lastValidationLatencyMs,
      lastValidationError: data.lastValidationError,
      blacklist: data.blacklist ?? {},
      knownGoodModel: data.knownGoodModel,
      knownGoodAt: data.knownGoodAt,
      updatedAt: data.updatedAt ?? nowIso(),
      createdAt: data.createdAt ?? nowIso(),
    };
  }

  /**
   * Strip undefined values before writing -- Firestore Admin SDK
   * rejects them. Callers pass `apiKey: undefined` to mean "leave it
   * alone", we translate to "don't include this field in the update".
   */
  private stripUndefined<T extends Record<string, unknown>>(obj: T): Record<string, unknown> {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(obj)) {
      if (v !== undefined) out[k] = v;
    }
    return out;
  }

  async getAll(): Promise<ProviderConfig[]> {
    const cache = await this.ensureCache();
    return [...cache.byId.values()];
  }

  async get(id: ProviderId): Promise<ProviderConfig | null> {
    const cache = await this.ensureCache();
    const doc = cache.byId.get(id);
    if (!doc) return null;
    // Prune expired blacklist entries lazily on read; only write back
    // if pruning actually happened (to avoid noisy Firestore writes
    // every minute on every read).
    const { pruned, map } = pruneBlacklist(doc.blacklist);
    if (pruned) {
      doc.blacklist = map;
      doc.updatedAt = nowIso();
      // Best-effort write-through; failure here is non-blocking
      // because the in-memory copy is the source of truth for this
      // request and the next read will retry.
      try {
        await this.collection().doc(id).set({ blacklist: map, updatedAt: doc.updatedAt }, { merge: true });
      } catch {
        // Swallow -- avoid spamming logs for a sweep race; main reads still work.
      }
    }
    return doc;
  }

  async upsert(id: ProviderId, patch: Partial<ProviderConfig>): Promise<ProviderConfig> {
    const cache = await this.ensureCache();
    const existing = cache.byId.get(id) ?? this.fromFirestore(id, {});
    const now = nowIso();
    const next: ProviderConfig = {
      id,
      enabled: patch.enabled ?? existing.enabled,
      apiKey: patch.apiKey ?? existing.apiKey,
      pinnedModel: patch.pinnedModel !== undefined ? patch.pinnedModel : existing.pinnedModel,
      pinnedModelFailureCount: patch.pinnedModelFailureCount ?? existing.pinnedModelFailureCount,
      lastValidatedAt: patch.lastValidatedAt ?? existing.lastValidatedAt,
      lastValidationLatencyMs: patch.lastValidationLatencyMs ?? existing.lastValidationLatencyMs,
      lastValidationError: patch.lastValidationError !== undefined ? patch.lastValidationError : existing.lastValidationError,
      blacklist: patch.blacklist ?? existing.blacklist,
      knownGoodModel: patch.knownGoodModel ?? existing.knownGoodModel,
      knownGoodAt: patch.knownGoodAt ?? existing.knownGoodAt,
      updatedAt: now,
      createdAt: existing.createdAt || now,
    };
    // Patch local cache first so a follow-up read in the same handler
    // sees the new value without waiting on the Firestore round-trip.
    cache.byId.set(id, next);
    await this.collection().doc(id).set(this.stripUndefined({ ...next }), { merge: true });
    return next;
  }

  async blacklistModel(id: ProviderId, model: string, reason?: string, ttlMs = DEFAULT_BLACKLIST_TTL_MS): Promise<void> {
    const existing = (await this.get(id)) ?? (await this.upsert(id, {}));
    const until = new Date(Date.now() + ttlMs).toISOString();
    const blacklist = { ...existing.blacklist, [model]: { until, reason: reason?.slice(0, 200) } };
    const pinnedModelFailureCount = existing.pinnedModel === model
      ? (existing.pinnedModelFailureCount ?? 0) + 1
      : existing.pinnedModelFailureCount;
    await this.upsert(id, { blacklist, pinnedModelFailureCount });
  }

  async clearBlacklist(id: ProviderId): Promise<void> {
    await this.upsert(id, { blacklist: {}, pinnedModelFailureCount: 0 });
  }

  async markKnownGood(id: ProviderId, model: string): Promise<void> {
    const existing = (await this.get(id)) ?? (await this.upsert(id, {}));
    const pinnedModelFailureCount = existing.pinnedModel === model ? 0 : existing.pinnedModelFailureCount;
    await this.upsert(id, {
      knownGoodModel: model,
      knownGoodAt: nowIso(),
      pinnedModelFailureCount,
    });
  }

  async getKey(id: ProviderId, envFallback?: string): Promise<string | null> {
    const cfg = await this.get(id);
    if (cfg && cfg.apiKey && cfg.apiKey.length > 5 && cfg.enabled !== false) {
      return cfg.apiKey;
    }
    if (envFallback && envFallback.length > 5) return envFallback;
    return null;
  }

  async pickModel(id: ProviderId, tier: ModelTier = 'flash'): Promise<string | null> {
    const cfg = await this.get(id);
    return selectModelFromConfig(id, tier, cfg);
  }
}

/**
 * Helper for tests + the validate route: detect well-known model
 * deprecation patterns. Used by the resolver to decide whether a call
 * failure should auto-blacklist the model (true) or be treated as a
 * transient outage that doesn't justify cooldown (false).
 *
 * Re-exported by aiModelResolver as part of its public surface so call
 * sites don't have to import from two places.
 */
export function isModelDeprecationError(error: string): boolean {
  if (!error) return false;
  const e = error.toLowerCase();
  return (
    e.includes('is not available to new users') ||
    e.includes('is no longer available') ||
    e.includes('model not found') ||
    e.includes('model_not_found') ||
    e.includes('does not exist') ||
    e.includes('deprecated') ||
    e.includes('invalid model') ||
    e.includes('unknown model') ||
    e.includes('not_found_error') ||
    // HTTP 404 with /models/ in path is the gemini deprecation signature
    (e.includes('http 404') && e.includes('/models/')) ||
    // 400 with "is not found" in google's REST error body
    (e.includes('http 400') && e.includes('is not found'))
  );
}
