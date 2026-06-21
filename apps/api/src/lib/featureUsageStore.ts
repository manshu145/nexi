import type { Firestore } from 'firebase-admin/firestore';

/**
 * Per-user feature usage counter, bucketed by IST day (default) or IST hour.
 *
 * Backs the admin-configurable per-day AI quotas (imagesPerDay, essaysPerDay
 * in the plan matrix) and the free-tier AI-tutor hourly rate limit. Founder
 * ask: "image generate free account me kar raha tha, limit lag gaya hoga —
 * lekin limit laga to uska message bhi milna chahiye"; and for AI tutor:
 * "free ko har ghante 5, baaki sab ko unlimited."
 *
 * Day boundary is IST (UTC+5:30) to match the rest of the app's daily resets
 * (streaks, AI spend cap). All methods are best-effort / fail-open: a counter
 * read/write hiccup must never block a paying user from a feature.
 */
export type UsageFeature = 'image' | 'essay' | 'aiTutor' | 'aiSupport' | 'mcq' | 'chapter' | 'mockTest';

/**
 * Counter window. 'day' = per IST calendar day (default, used by image/essay
 * /mcq/chapter/mock-test quotas). 'hour' = per IST clock hour (free-tier
 * AI-tutor rate limit). 'month' = per IST calendar month (kept for backward
 * compatibility; no feature currently uses a monthly window — mock tests are
 * now metered per day to stay consistent with every other daily cap).
 */
export type UsageGranularity = 'day' | 'hour' | 'month';

export interface FeatureUsageStore {
  getCount(userId: string, feature: UsageFeature, granularity?: UsageGranularity): Promise<number>;
  increment(userId: string, feature: UsageFeature, granularity?: UsageGranularity, by?: number): Promise<void>;
}

function istDayKey(): string {
  const ist = new Date(Date.now() + 5.5 * 60 * 60 * 1000);
  return ist.toISOString().slice(0, 10); // YYYY-MM-DD
}

function istHourKey(): string {
  const ist = new Date(Date.now() + 5.5 * 60 * 60 * 1000);
  return ist.toISOString().slice(0, 13); // YYYY-MM-DDTHH
}

function istMonthKey(): string {
  const ist = new Date(Date.now() + 5.5 * 60 * 60 * 1000);
  return ist.toISOString().slice(0, 7); // YYYY-MM
}

/** Bucket string for the given window. Day = 'YYYY-MM-DD', hour =
 *  'YYYY-MM-DDTHH', month = 'YYYY-MM' — none collide (day has two '-',
 *  hour has a 'T', month has one '-'). */
function bucketKey(granularity: UsageGranularity): string {
  if (granularity === 'hour') return istHourKey();
  if (granularity === 'month') return istMonthKey();
  return istDayKey();
}

export class InMemoryFeatureUsageStore implements FeatureUsageStore {
  private counts = new Map<string, number>();
  private key(userId: string, feature: string, granularity: UsageGranularity) { return `${userId}:${bucketKey(granularity)}:${feature}`; }
  async getCount(userId: string, feature: UsageFeature, granularity: UsageGranularity = 'day') { return this.counts.get(this.key(userId, feature, granularity)) ?? 0; }
  async increment(userId: string, feature: UsageFeature, granularity: UsageGranularity = 'day', by = 1) {
    const k = this.key(userId, feature, granularity);
    this.counts.set(k, (this.counts.get(k) ?? 0) + by);
  }
}

export class FirestoreFeatureUsageStore implements FeatureUsageStore {
  constructor(private readonly db: Firestore) {}
  private ref(userId: string, granularity: UsageGranularity) {
    // One doc per user per bucket (IST day or IST hour); old docs are
    // harmless and can be swept by a TTL/cleanup later. Counts live as
    // integer fields keyed by feature. Day docs end in 'YYYY-MM-DD', hour
    // docs in 'YYYY-MM-DDTHH', so the two never overwrite each other.
    return this.db.collection('featureUsage').doc(`${userId}_${bucketKey(granularity)}`);
  }
  async getCount(userId: string, feature: UsageFeature, granularity: UsageGranularity = 'day'): Promise<number> {
    try {
      const snap = await this.ref(userId, granularity).get();
      const data = snap.data() as Record<string, unknown> | undefined;
      const v = data?.[feature];
      return typeof v === 'number' ? v : 0;
    } catch {
      return 0; // fail-open: don't block on a read error
    }
  }
  async increment(userId: string, feature: UsageFeature, granularity: UsageGranularity = 'day', by = 1): Promise<void> {
    try {
      const { FieldValue } = await import('firebase-admin/firestore');
      await this.ref(userId, granularity).set(
        { [feature]: FieldValue.increment(by), updatedAt: new Date().toISOString() },
        { merge: true },
      );
    } catch {
      /* fail-open: a missed increment is better than blocking the user */
    }
  }
}
