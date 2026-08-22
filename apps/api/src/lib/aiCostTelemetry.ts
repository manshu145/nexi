/**
 * Per-Feature AI Cost Telemetry — tracks token usage and estimated cost
 * broken down by feature, provider, and model.
 *
 * P0 Cost Audit (Aug 2026): Every AI/expensive backend operation should
 * record: feature, provider, model, request_count, input_tokens,
 * output_tokens, duration_ms, success, cached, retry_count, user_id_hash,
 * estimated_cost. Aggregate daily by feature.
 *
 * Desired admin report:
 *   | Feature         | Calls/day | Tokens/day | Estimated cost/day |
 *   | Nexi chat       |           |            |                    |
 *   | Chapters        |           |            |                    |
 *   | Current affairs |           |            |                    |
 *   | Essay grading   |           |            |                    |
 *   | Mock tests      |           |            |                    |
 *   | Images          |           |            |                    |
 *
 * Storage: Firestore `aiCostTelemetry/{feature}_{YYYY-MM-DD}` — one doc
 * per feature per day, atomically incremented. 14-day TTL sweep keeps
 * the collection bounded.
 *
 * This supplements the existing aiSpendStore (per-user daily cap) and
 * adminStore.logAICall (per-call audit log) with aggregate per-FEATURE
 * visibility that neither of those provide.
 */

import type { Firestore } from 'firebase-admin/firestore';
import type { Logger } from '../logger.js';

// ─── Types ───────────────────────────────────────────────────────────────

export type AIFeature =
  | 'chat'
  | 'chapter_generation'
  | 'chapter_mcq'
  | 'current_affairs_ingest'
  | 'current_affairs_quiz'
  | 'current_affairs_translate'
  | 'essay_grading'
  | 'mock_test'
  | 'assessment'
  | 'image_generation'
  | 'content_refresh'
  | 'pyq_generation'
  | 'interview_scoring'
  | 'blog_draft'
  | 'syllabus_generation'
  | 'visualization'
  | 'flashcards'
  | 'other';

export interface AICallRecord {
  feature: AIFeature;
  provider: 'gemini' | 'openai' | 'groq' | 'other';
  model: string;
  inputTokens: number;
  outputTokens: number;
  durationMs: number;
  success: boolean;
  cached: boolean;
  retryCount: number;
  estimatedCostUsd: number;
  /** Hashed user ID for privacy-safe attribution. */
  userIdHash?: string;
}

export interface FeatureDailySummary {
  feature: AIFeature;
  day: string;
  totalCalls: number;
  successCalls: number;
  failedCalls: number;
  cachedCalls: number;
  totalInputTokens: number;
  totalOutputTokens: number;
  totalDurationMs: number;
  totalRetries: number;
  estimatedCostUsd: number;
  /** Breakdown by provider for this feature. */
  byProvider: Record<string, { calls: number; tokens: number; costUsd: number }>;
  updatedAt: string;
}

export interface AICostTelemetryStore {
  /** Record a single AI call. Best-effort — never throws. */
  record(call: AICallRecord): Promise<void>;
  /** Get today's summary for a single feature. */
  getFeatureToday(feature: AIFeature): Promise<FeatureDailySummary | null>;
  /** Get all features' summaries for today. */
  getAllToday(): Promise<FeatureDailySummary[]>;
  /** Get all features' summaries for a specific day (YYYY-MM-DD). */
  getAllForDay(day: string): Promise<FeatureDailySummary[]>;
  /** Get total estimated cost for today across all features. */
  getTotalCostToday(): Promise<number>;
}

// ─── Firestore Implementation ────────────────────────────────────────────

const COLLECTION = 'aiCostTelemetry';

export class FirestoreAICostTelemetryStore implements AICostTelemetryStore {
  constructor(
    private readonly db: Firestore,
    private readonly logger: Logger,
  ) {}

  async record(call: AICallRecord): Promise<void> {
    try {
      const day = utcDayKey();
      const docId = `${call.feature}_${day}`;
      const ref = this.db.collection(COLLECTION).doc(docId);
      const { FieldValue } = await import('firebase-admin/firestore');

      const providerKey = `byProvider.${call.provider}`;

      await ref.set({
        feature: call.feature,
        day,
        totalCalls: FieldValue.increment(1),
        successCalls: FieldValue.increment(call.success ? 1 : 0),
        failedCalls: FieldValue.increment(call.success ? 0 : 1),
        cachedCalls: FieldValue.increment(call.cached ? 1 : 0),
        totalInputTokens: FieldValue.increment(call.inputTokens),
        totalOutputTokens: FieldValue.increment(call.outputTokens),
        totalDurationMs: FieldValue.increment(call.durationMs),
        totalRetries: FieldValue.increment(call.retryCount),
        estimatedCostUsd: FieldValue.increment(call.estimatedCostUsd),
        [`${providerKey}.calls`]: FieldValue.increment(1),
        [`${providerKey}.tokens`]: FieldValue.increment(call.inputTokens + call.outputTokens),
        [`${providerKey}.costUsd`]: FieldValue.increment(call.estimatedCostUsd),
        updatedAt: new Date().toISOString(),
        // TTL for automatic cleanup (14 days)
        ttlAt: new Date(Date.now() + 14 * 86_400_000).toISOString(),
      }, { merge: true });
    } catch (err) {
      // Best-effort — telemetry failures must never break AI calls
      this.logger.warn('aiCostTelemetry.record_failed', {
        feature: call.feature,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  async getFeatureToday(feature: AIFeature): Promise<FeatureDailySummary | null> {
    const day = utcDayKey();
    const docId = `${feature}_${day}`;
    const snap = await this.db.collection(COLLECTION).doc(docId).get();
    if (!snap.exists) return null;
    return snap.data() as FeatureDailySummary;
  }

  async getAllToday(): Promise<FeatureDailySummary[]> {
    return this.getAllForDay(utcDayKey());
  }

  async getAllForDay(day: string): Promise<FeatureDailySummary[]> {
    const snap = await this.db.collection(COLLECTION)
      .where('day', '==', day)
      .get();
    return snap.docs.map(d => d.data() as FeatureDailySummary);
  }

  async getTotalCostToday(): Promise<number> {
    const all = await this.getAllToday();
    return all.reduce((sum, f) => sum + (f.estimatedCostUsd ?? 0), 0);
  }
}

// ─── In-Memory Implementation ────────────────────────────────────────────

export class InMemoryAICostTelemetryStore implements AICostTelemetryStore {
  private data = new Map<string, FeatureDailySummary>();

  async record(call: AICallRecord): Promise<void> {
    const day = utcDayKey();
    const key = `${call.feature}_${day}`;
    const existing = this.data.get(key);
    if (existing) {
      existing.totalCalls += 1;
      existing.successCalls += call.success ? 1 : 0;
      existing.failedCalls += call.success ? 0 : 1;
      existing.cachedCalls += call.cached ? 1 : 0;
      existing.totalInputTokens += call.inputTokens;
      existing.totalOutputTokens += call.outputTokens;
      existing.totalDurationMs += call.durationMs;
      existing.totalRetries += call.retryCount;
      existing.estimatedCostUsd += call.estimatedCostUsd;
      const bp = existing.byProvider[call.provider] ?? { calls: 0, tokens: 0, costUsd: 0 };
      bp.calls += 1;
      bp.tokens += call.inputTokens + call.outputTokens;
      bp.costUsd += call.estimatedCostUsd;
      existing.byProvider[call.provider] = bp;
      existing.updatedAt = new Date().toISOString();
    } else {
      this.data.set(key, {
        feature: call.feature,
        day,
        totalCalls: 1,
        successCalls: call.success ? 1 : 0,
        failedCalls: call.success ? 0 : 1,
        cachedCalls: call.cached ? 1 : 0,
        totalInputTokens: call.inputTokens,
        totalOutputTokens: call.outputTokens,
        totalDurationMs: call.durationMs,
        totalRetries: call.retryCount,
        estimatedCostUsd: call.estimatedCostUsd,
        byProvider: {
          [call.provider]: {
            calls: 1,
            tokens: call.inputTokens + call.outputTokens,
            costUsd: call.estimatedCostUsd,
          },
        },
        updatedAt: new Date().toISOString(),
      });
    }
  }

  async getFeatureToday(feature: AIFeature): Promise<FeatureDailySummary | null> {
    return this.data.get(`${feature}_${utcDayKey()}`) ?? null;
  }

  async getAllToday(): Promise<FeatureDailySummary[]> {
    return this.getAllForDay(utcDayKey());
  }

  async getAllForDay(day: string): Promise<FeatureDailySummary[]> {
    const results: FeatureDailySummary[] = [];
    for (const [key, val] of this.data) {
      if (key.endsWith(`_${day}`)) results.push(val);
    }
    return results;
  }

  async getTotalCostToday(): Promise<number> {
    const all = await this.getAllToday();
    return all.reduce((sum, f) => sum + (f.estimatedCostUsd ?? 0), 0);
  }
}

// ─── Helpers ─────────────────────────────────────────────────────────────

function utcDayKey(now: Date = new Date()): string {
  return `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}-${String(now.getUTCDate()).padStart(2, '0')}`;
}
