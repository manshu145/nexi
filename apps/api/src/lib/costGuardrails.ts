/**
 * Cost Guardrails — runtime-configurable kill switches and limits for
 * expensive features.
 *
 * P0 Cost Audit (Aug 2026): the architecture must remain financially safe
 * if traffic increases 10× or 100×. This module provides:
 *
 *   1. Per-feature kill switches (disable without redeploy)
 *   2. Global + per-user daily AI request/cost limits
 *   3. Per-run guardrails for scheduled jobs
 *   4. Daily cost aggregation for the admin dashboard
 *
 * Config lives in Firestore at `platformConfig/costGuardrails` with an
 * in-memory 60s cache (same pattern as platformConfigStore). The admin
 * panel can toggle features and adjust limits in real time.
 *
 * When a kill switch is OFF, the corresponding route returns 503 with a
 * clear "feature temporarily disabled" message — no silent failures.
 */

import type { Firestore } from 'firebase-admin/firestore';
import type { Logger } from '../logger.js';

// ─── Types ───────────────────────────────────────────────────────────────

export type FeatureFlag =
  | 'currentAffairs'
  | 'aiChat'
  | 'aiImage'
  | 'chapterGeneration'
  | 'essayGrading'
  | 'mockTestGeneration'
  | 'contentRefresh'
  | 'pyqGeneration'
  | 'jobIngestion'
  | 'jobExtraction'
  | 'blogDraft';

export interface CostGuardrailsConfig {
  /** Global AI kill switch — disables ALL AI features instantly. */
  globalAIEnabled: boolean;

  /** Per-feature kill switches. Missing = enabled (fail-open for new features). */
  features: Partial<Record<FeatureFlag, boolean>>;

  /** Maximum AI requests per user per day (across all features). */
  maxAIRequestsPerUserDay: number;

  /** Maximum GLOBAL AI requests per day (all users combined). */
  maxAIRequestsGlobalDay: number;

  /** Maximum output tokens per single AI call. */
  maxOutputTokens: number;

  /** Maximum retry attempts for any AI call. */
  maxGenerationRetries: number;

  /** Current affairs: max articles to process per scheduler run. */
  maxCurrentAffairsItemsPerRun: number;

  /** Current affairs: max AI summarization calls per run. */
  maxAICallsPerRun: number;

  /** Maximum duration for any single scheduled job (ms). */
  maxJobDurationMs: number;

  /** Content refresh: max chapters to regenerate per weekly run. */
  maxContentRefreshBatch: number;

  /** Daily global AI spend cap in USD. When exceeded, all AI features pause. */
  dailyGlobalAICapUsd: number;
}

/** Sensible defaults — conservative enough for early-stage, adjustable via admin. */
export const DEFAULT_GUARDRAILS: CostGuardrailsConfig = {
  globalAIEnabled: true,
  features: {
    currentAffairs: true,
    aiChat: true,
    aiImage: true,
    chapterGeneration: true,
    essayGrading: true,
    mockTestGeneration: true,
    contentRefresh: true,
    pyqGeneration: true,
    jobIngestion: true,
    jobExtraction: true,
    blogDraft: true,
  },
  maxAIRequestsPerUserDay: 200,
  maxAIRequestsGlobalDay: 5000,
  maxOutputTokens: 8192,
  maxGenerationRetries: 2,
  maxCurrentAffairsItemsPerRun: 80,
  maxAICallsPerRun: 10,
  maxJobDurationMs: 10 * 60 * 1000, // 10 minutes
  maxContentRefreshBatch: 25,
  dailyGlobalAICapUsd: 5.0,
};

// ─── Store Interface ─────────────────────────────────────────────────────

export interface CostGuardrailsStore {
  getConfig(): Promise<CostGuardrailsConfig>;
  updateConfig(patch: Partial<CostGuardrailsConfig>): Promise<CostGuardrailsConfig>;
  isFeatureEnabled(feature: FeatureFlag): Promise<boolean>;
  /** Check if global AI is enabled AND the specific feature is enabled. */
  canUseFeature(feature: FeatureFlag): Promise<boolean>;
  /** Record a global AI request for today; returns new daily total. */
  recordGlobalAIRequest(): Promise<number>;
  /** Get today's global AI request count. */
  getGlobalAIRequestsToday(): Promise<number>;
}

// ─── Firestore Implementation ────────────────────────────────────────────

const COL = 'platformConfig';
const DOC = 'costGuardrails';
const COUNTERS_COL = 'costCounters';
const CACHE_TTL_MS = 60_000;

export class FirestoreCostGuardrailsStore implements CostGuardrailsStore {
  private cache: { config: CostGuardrailsConfig; expiresAt: number } | null = null;

  constructor(
    private readonly db: Firestore,
    private readonly logger: Logger,
  ) {}

  async getConfig(): Promise<CostGuardrailsConfig> {
    if (this.cache && this.cache.expiresAt > Date.now()) {
      return this.cache.config;
    }
    const snap = await this.db.collection(COL).doc(DOC).get();
    const stored = (snap.exists ? snap.data() : {}) as Partial<CostGuardrailsConfig>;
    const config: CostGuardrailsConfig = {
      ...DEFAULT_GUARDRAILS,
      ...stored,
      features: { ...DEFAULT_GUARDRAILS.features, ...(stored.features ?? {}) },
    };
    this.cache = { config, expiresAt: Date.now() + CACHE_TTL_MS };
    return config;
  }

  async updateConfig(patch: Partial<CostGuardrailsConfig>): Promise<CostGuardrailsConfig> {
    const current = await this.getConfig();
    const next: CostGuardrailsConfig = {
      ...current,
      ...patch,
      features: { ...current.features, ...(patch.features ?? {}) },
    };
    await this.db.collection(COL).doc(DOC).set(next, { merge: true });
    this.cache = null;
    this.logger.info('costGuardrails.updated', { fields: Object.keys(patch) });
    return next;
  }

  async isFeatureEnabled(feature: FeatureFlag): Promise<boolean> {
    const config = await this.getConfig();
    return config.features[feature] !== false;
  }

  async canUseFeature(feature: FeatureFlag): Promise<boolean> {
    const config = await this.getConfig();
    if (!config.globalAIEnabled) return false;
    return config.features[feature] !== false;
  }

  async recordGlobalAIRequest(): Promise<number> {
    const dayKey = utcDayKey();
    const ref = this.db.collection(COUNTERS_COL).doc(`global_ai_${dayKey}`);
    const { FieldValue } = await import('firebase-admin/firestore');
    const result = await this.db.runTransaction(async (txn) => {
      const snap = await txn.get(ref);
      const prev = snap.exists ? Number((snap.data() as { count?: number }).count ?? 0) : 0;
      const next = prev + 1;
      txn.set(ref, { count: next, day: dayKey, updatedAt: new Date().toISOString() }, { merge: true });
      return next;
    });
    return result;
  }

  async getGlobalAIRequestsToday(): Promise<number> {
    const dayKey = utcDayKey();
    const ref = this.db.collection(COUNTERS_COL).doc(`global_ai_${dayKey}`);
    const snap = await ref.get();
    return snap.exists ? Number((snap.data() as { count?: number }).count ?? 0) : 0;
  }
}

// ─── In-Memory Implementation ────────────────────────────────────────────

export class InMemoryCostGuardrailsStore implements CostGuardrailsStore {
  private config: CostGuardrailsConfig = { ...DEFAULT_GUARDRAILS };
  private dailyCount = 0;
  private countDay = utcDayKey();

  async getConfig(): Promise<CostGuardrailsConfig> {
    return { ...this.config };
  }

  async updateConfig(patch: Partial<CostGuardrailsConfig>): Promise<CostGuardrailsConfig> {
    this.config = {
      ...this.config,
      ...patch,
      features: { ...this.config.features, ...(patch.features ?? {}) },
    };
    return { ...this.config };
  }

  async isFeatureEnabled(feature: FeatureFlag): Promise<boolean> {
    return this.config.features[feature] !== false;
  }

  async canUseFeature(feature: FeatureFlag): Promise<boolean> {
    if (!this.config.globalAIEnabled) return false;
    return this.config.features[feature] !== false;
  }

  async recordGlobalAIRequest(): Promise<number> {
    const day = utcDayKey();
    if (day !== this.countDay) { this.dailyCount = 0; this.countDay = day; }
    return ++this.dailyCount;
  }

  async getGlobalAIRequestsToday(): Promise<number> {
    const day = utcDayKey();
    if (day !== this.countDay) return 0;
    return this.dailyCount;
  }
}

// ─── Helpers ─────────────────────────────────────────────────────────────

function utcDayKey(now: Date = new Date()): string {
  return `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}-${String(now.getUTCDate()).padStart(2, '0')}`;
}
