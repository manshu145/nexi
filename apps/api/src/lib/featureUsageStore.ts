import type { Firestore } from 'firebase-admin/firestore';

/**
 * Per-user, per-day feature usage counter.
 *
 * Backs the admin-configurable per-day AI quotas (imagesPerDay, essaysPerDay,
 * aiTutorPerDay in the plan matrix). Founder ask: "image generate free account
 * me kar raha tha, limit lag gaya hoga — lekin limit laga to uska message bhi
 * milna chahiye." So we count usage per IST day and the routes block + return a
 * clear message once the plan's cap is hit.
 *
 * Day boundary is IST (UTC+5:30) to match the rest of the app's daily resets
 * (streaks, AI spend cap). All methods are best-effort / fail-open: a counter
 * read/write hiccup must never block a paying user from a feature.
 */
export type UsageFeature = 'image' | 'essay' | 'aiTutor';

export interface FeatureUsageStore {
  getCount(userId: string, feature: UsageFeature): Promise<number>;
  increment(userId: string, feature: UsageFeature): Promise<void>;
}

function istDayKey(): string {
  const ist = new Date(Date.now() + 5.5 * 60 * 60 * 1000);
  return ist.toISOString().slice(0, 10); // YYYY-MM-DD
}

export class InMemoryFeatureUsageStore implements FeatureUsageStore {
  private counts = new Map<string, number>();
  private key(userId: string, feature: string) { return `${userId}:${istDayKey()}:${feature}`; }
  async getCount(userId: string, feature: UsageFeature) { return this.counts.get(this.key(userId, feature)) ?? 0; }
  async increment(userId: string, feature: UsageFeature) {
    const k = this.key(userId, feature);
    this.counts.set(k, (this.counts.get(k) ?? 0) + 1);
  }
}

export class FirestoreFeatureUsageStore implements FeatureUsageStore {
  constructor(private readonly db: Firestore) {}
  private ref(userId: string) {
    // One doc per user per IST day; old docs are harmless and can be swept
    // by a TTL/cleanup later. Counts live as integer fields keyed by feature.
    return this.db.collection('featureUsage').doc(`${userId}_${istDayKey()}`);
  }
  async getCount(userId: string, feature: UsageFeature): Promise<number> {
    try {
      const snap = await this.ref(userId).get();
      const data = snap.data() as Record<string, unknown> | undefined;
      const v = data?.[feature];
      return typeof v === 'number' ? v : 0;
    } catch {
      return 0; // fail-open: don't block on a read error
    }
  }
  async increment(userId: string, feature: UsageFeature): Promise<void> {
    try {
      const { FieldValue } = await import('firebase-admin/firestore');
      await this.ref(userId).set(
        { [feature]: FieldValue.increment(1), updatedAt: new Date().toISOString() },
        { merge: true },
      );
    } catch {
      /* fail-open: a missed increment is better than blocking the user */
    }
  }
}
