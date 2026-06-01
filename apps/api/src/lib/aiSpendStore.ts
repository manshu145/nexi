/**
 * Per-user daily AI spend tracking + cap enforcement (lock §3.8 second half).
 *
 * Closes the second half of the founder's §3.8 lock ("AI cost control").
 * The first half -- image generation -- shipped in PR-15. This adds the
 * cost ceiling so a single rogue user (or a runaway agent loop) can't
 * burn through provider quota the way OpenAI + Gemini did on 29 May 2026.
 *
 * Strategy:
 *   - Every AI call already passes its USD cost through logAICallToStore
 *     (in apps/api/src/lib/aiEngine.ts). PR-25 adds a sibling write to
 *     the per-user daily-spend counter at aiDailySpend/{userId__YYYY-MM-DD}.
 *   - Before each AI call we check the user's running daily total; if
 *     it exceeds their plan's per-day cap, the route returns 429 with a
 *     friendly "you've hit today's AI budget" message.
 *   - Caps are admin-tunable via platformConfig (extends the existing
 *     plan matrix in PR-04) so a noisy user can be silently bumped
 *     without a redeploy.
 *
 * Why this matters in production:
 *   29 May incident: single-day OpenAI + Gemini quota exhaustion took
 *   the assessment route down for every user. We had no per-user
 *   visibility into who was burning the budget. PR-25 makes future
 *   incidents diagnosable in seconds: "show top spenders" + "who hit
 *   the cap today" queries become trivial.
 */

import type { Firestore } from 'firebase-admin/firestore';
import type { UserId } from '@nexigrate/shared';

/** YYYY-MM-DD in UTC. Aligns daily reset with provider quota windows. */
function todayKey(now: Date = new Date()): string {
  return `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}-${String(now.getUTCDate()).padStart(2, '0')}`;
}

export interface AISpendStore {
  /**
   * Atomically increment the user's running spend for today. Returns the
   * new total. The caller decides whether to enforce a cap based on
   * the new total.
   */
  recordSpend(userId: UserId, costUsd: number): Promise<{ totalToday: number }>;

  /** Read the running total for today without incrementing. */
  getTodaySpend(userId: UserId): Promise<number>;

  /** Top N spenders today (admin diagnostic; sorted desc). */
  getTopSpendersToday(limit?: number): Promise<Array<{ userId: string; totalToday: number }>>;
}

const COLLECTION = 'aiDailySpend';

export class FirestoreAISpendStore implements AISpendStore {
  constructor(private readonly db: Firestore) {}

  private docId(userId: UserId, day: string): string {
    return `${userId}__${day}`;
  }

  async recordSpend(userId: UserId, costUsd: number): Promise<{ totalToday: number }> {
    const day = todayKey();
    const ref = this.db.collection(COLLECTION).doc(this.docId(userId, day));
    const { FieldValue } = await import('firebase-admin/firestore');
    const totalToday = await this.db.runTransaction(async (txn) => {
      const snap = await txn.get(ref);
      const prev = snap.exists ? Number((snap.data() as { totalUsd?: number }).totalUsd ?? 0) : 0;
      const next = prev + Math.max(0, costUsd);
      txn.set(ref, {
        userId,
        day,
        totalUsd: next,
        callCount: FieldValue.increment(1),
        // ttlAt -- Firestore TTL set up in console will sweep these
        // 14 days after the day's end so the collection doesn't grow
        // unboundedly.
        ttlAt: new Date(Date.now() + 14 * 86400_000).toISOString(),
        updatedAt: new Date().toISOString(),
      }, { merge: true });
      return next;
    });
    return { totalToday };
  }

  async getTodaySpend(userId: UserId): Promise<number> {
    const day = todayKey();
    const ref = this.db.collection(COLLECTION).doc(this.docId(userId, day));
    const snap = await ref.get();
    return snap.exists ? Number((snap.data() as { totalUsd?: number }).totalUsd ?? 0) : 0;
  }

  async getTopSpendersToday(limit = 10): Promise<Array<{ userId: string; totalToday: number }>> {
    const day = todayKey();
    // PR-35 hotfix: original query used .where('day','==').orderBy('totalUsd','desc')
    // which requires a composite index (day ASC, totalUsd DESC). Production hit
    // FAILED_PRECONDITION at 16:45 + 20:36 IST on 30 May 2026. Same root cause
    // as the credit-ledger index incident (hotfix #182).
    //
    // Strategy: drop orderBy; sort in JS. Per-day spender count is bounded
    // (active users per day, well under a few thousand), so a single-shot
    // fetch + JS sort is fine. The composite index is also added to
    // infra/firebase/firestore.indexes.json so future deploys can opt back
    // into the optimized server-side sort once the index is built.
    const snap = await this.db.collection(COLLECTION)
      .where('day', '==', day)
      .get();
    const rows = snap.docs.map(d => {
      const data = d.data() as { userId?: string; totalUsd?: number };
      return { userId: String(data.userId ?? ''), totalToday: Number(data.totalUsd ?? 0) };
    });
    rows.sort((a, b) => b.totalToday - a.totalToday);
    return rows.slice(0, limit);
  }
}

export class InMemoryAISpendStore implements AISpendStore {
  private totals = new Map<string, number>();

  private k(userId: UserId, day: string): string { return `${userId}__${day}`; }

  async recordSpend(userId: UserId, costUsd: number): Promise<{ totalToday: number }> {
    const day = todayKey();
    const key = this.k(userId, day);
    const next = (this.totals.get(key) ?? 0) + Math.max(0, costUsd);
    this.totals.set(key, next);
    return { totalToday: next };
  }

  async getTodaySpend(userId: UserId): Promise<number> {
    const day = todayKey();
    return this.totals.get(this.k(userId, day)) ?? 0;
  }

  async getTopSpendersToday(limit = 10): Promise<Array<{ userId: string; totalToday: number }>> {
    const day = todayKey();
    const prefix = `__${day}`;
    const entries: Array<{ userId: string; totalToday: number }> = [];
    for (const [k, v] of this.totals) {
      if (k.endsWith(prefix)) {
        entries.push({ userId: k.replace(prefix, ''), totalToday: v });
      }
    }
    return entries.sort((a, b) => b.totalToday - a.totalToday).slice(0, limit);
  }
}

/**
 * Per-plan daily AI spend cap in USD. Calibrated so a normal user never
 * hits the cap, but a runaway loop or a deliberate quota-burn attack
 * stops within a few minutes.
 *
 * Reference rates (post-PR-15):
 *   GPT-4o text:        ~$0.005 per 1k output tokens
 *   GPT-4o chapter gen: ~$0.05 per chapter
 *   Gemini Flash:       ~$0.0001 per 1k tokens (effectively free)
 *   gpt-image-1:        $0.02 per medium-quality image
 *
 * These are HARD per-day backstops that only abusers hit — normal users
 * stay well under. Combined with the per-feature daily quotas in the plan
 * matrix (essaysPerDay, imagesPerDay, aiTutorPerDay), they protect margin.
 * Recalibrated for the freemium plan restructure (Starter ₹79 / Pro ₹249 /
 * Elite ₹599) so even a maxed-out day stays within a sustainable fraction
 * of the plan price. Groq (free) is tried first so real spend is far lower.
 *
 * Admin-editable via platformConfig.
 */
export const DEFAULT_DAILY_AI_CAP_USD: Record<string, number> = {
  free:     0.15,   // ~₹12/day max — loss-leader hook, realistically pennies
  scholar:  0.40,   // Starter ₹79  — backstop only; daily quotas throttle normal use
  aspirant: 1.20,   // Pro ₹249
  achiever: 3.00,   // Elite ₹599
};
