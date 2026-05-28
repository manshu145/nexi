/**
 * Platform configuration -- the runtime-editable mirror of the constants in
 * `@nexigrate/shared`.
 *
 * Every other store in this codebase (users, credit ledger, etc.) is the
 * source of truth for its data. This one is a controlled OVERRIDE on top of
 * compile-time shared constants: if Firestore has a value, use it; if not,
 * fall back to the locked-in PR-03 numbers from `@nexigrate/shared`. The
 * compile-time constants stay the canonical default so a fresh deploy
 * without any Firestore docs still behaves correctly.
 *
 * Two configs live here, mirroring the founder's PR-02 lock points:
 *   - 2.1 Plan matrix      -> Firestore: platformConfig/plans
 *   - 2.2 Credit rewards   -> Firestore: platformConfig/creditRewards
 *
 * Hot-path concerns:
 *   Earning credits and listing plans both happen on EVERY /me call (multi
 *   times per minute under load). A naive Firestore read on every grant
 *   would 4-5x the latency of /me. We cache the parsed config in process
 *   for 60 seconds; admin writes invalidate the cache immediately on the
 *   instance that processed them, and remote instances refresh on TTL --
 *   which is fine because price/reward edits are rare (manual admin
 *   action) and a 60-second propagation gap is acceptable.
 */

import type { Firestore } from 'firebase-admin/firestore';
import {
  PLANS,
  CREDIT_EARN_AMOUNTS,
  CREDIT_SPEND_AMOUNTS,
  priceFor as defaultPriceFor,
  type BillingPeriod,
  type CreditEarnSource,
  type CreditSpendReason,
  type PlanConfig,
  type PlanId,
} from '@nexigrate/shared';
import type { Logger } from '../logger.js';

const COL = 'platformConfig';
const DOC_PLANS = 'plans';
const DOC_CREDIT_REWARDS = 'creditRewards';

const CACHE_TTL_MS = 60_000;

export interface PlatformConfigStore {
  getPlans(): Promise<Record<PlanId, PlanConfig>>;
  getPlan(planId: PlanId): Promise<PlanConfig | null>;
  priceFor(planId: PlanId, period: BillingPeriod): Promise<number>;
  /**
   * Update a single plan. Pass only the fields you want to change; the rest
   * are merged with the current value. Returns the new full plan object.
   */
  updatePlan(planId: PlanId, patch: Partial<PlanConfig>): Promise<PlanConfig>;

  getEarnAmounts(): Promise<Record<CreditEarnSource, number>>;
  getEarnAmount(source: CreditEarnSource): Promise<number>;
  getSpendAmounts(): Promise<Record<CreditSpendReason, number>>;
  /** Patch one or more reward amounts. Unspecified keys are unchanged. */
  updateRewards(input: {
    earn?: Partial<Record<CreditEarnSource, number>>;
    spend?: Partial<Record<CreditSpendReason, number>>;
  }): Promise<{
    earn: Record<CreditEarnSource, number>;
    spend: Record<CreditSpendReason, number>;
  }>;
}

// ---------- Firestore implementation ----------

interface PlansCache {
  value: Record<PlanId, PlanConfig>;
  expiresAt: number;
}
interface RewardsCache {
  earn: Record<CreditEarnSource, number>;
  spend: Record<CreditSpendReason, number>;
  expiresAt: number;
}

export class FirestorePlatformConfigStore implements PlatformConfigStore {
  private plansCache: PlansCache | null = null;
  private rewardsCache: RewardsCache | null = null;

  constructor(private readonly db: Firestore, private readonly logger: Logger) {}

  // --- plans ---

  async getPlans(): Promise<Record<PlanId, PlanConfig>> {
    if (this.plansCache && this.plansCache.expiresAt > Date.now()) {
      return this.plansCache.value;
    }
    const snap = await this.db.collection(COL).doc(DOC_PLANS).get();
    const stored = (snap.exists ? snap.data() : {}) as Partial<Record<PlanId, Partial<PlanConfig>>>;
    const merged = mergePlans(stored);
    this.plansCache = { value: merged, expiresAt: Date.now() + CACHE_TTL_MS };
    return merged;
  }

  async getPlan(planId: PlanId): Promise<PlanConfig | null> {
    const all = await this.getPlans();
    return all[planId] ?? null;
  }

  async priceFor(planId: PlanId, period: BillingPeriod): Promise<number> {
    const plan = await this.getPlan(planId);
    if (!plan) return 0;
    return period === 'yearly' ? plan.yearlyPrice : plan.price;
  }

  async updatePlan(planId: PlanId, patch: Partial<PlanConfig>): Promise<PlanConfig> {
    const current = await this.getPlan(planId);
    if (!current) throw new Error(`Unknown plan: ${planId}`);
    const sanitised = sanitisePlanPatch(patch);
    const next: PlanConfig = { ...current, ...sanitised, id: current.id };
    await this.db.collection(COL).doc(DOC_PLANS).set(
      { [planId]: next },
      { merge: true },
    );
    this.plansCache = null; // local invalidate; remote refresh on TTL
    this.logger.info('platformConfig.plan_updated', { planId, fields: Object.keys(sanitised) });
    return next;
  }

  // --- rewards ---

  async getEarnAmounts(): Promise<Record<CreditEarnSource, number>> {
    return (await this.loadRewards()).earn;
  }

  async getEarnAmount(source: CreditEarnSource): Promise<number> {
    const earn = await this.getEarnAmounts();
    return earn[source];
  }

  async getSpendAmounts(): Promise<Record<CreditSpendReason, number>> {
    return (await this.loadRewards()).spend;
  }

  async updateRewards(input: {
    earn?: Partial<Record<CreditEarnSource, number>>;
    spend?: Partial<Record<CreditSpendReason, number>>;
  }): Promise<{
    earn: Record<CreditEarnSource, number>;
    spend: Record<CreditSpendReason, number>;
  }> {
    const current = await this.loadRewards();
    const earn = { ...current.earn };
    const spend = { ...current.spend };
    for (const [k, v] of Object.entries(input.earn ?? {})) {
      if (typeof v === 'number' && Number.isFinite(v) && v >= 0) {
        earn[k as CreditEarnSource] = Math.floor(v);
      }
    }
    for (const [k, v] of Object.entries(input.spend ?? {})) {
      if (typeof v === 'number' && Number.isFinite(v) && v >= 0) {
        spend[k as CreditSpendReason] = Math.floor(v);
      }
    }
    await this.db
      .collection(COL)
      .doc(DOC_CREDIT_REWARDS)
      .set({ earn, spend }, { merge: true });
    this.rewardsCache = null;
    this.logger.info('platformConfig.rewards_updated', {
      earnFields: Object.keys(input.earn ?? {}),
      spendFields: Object.keys(input.spend ?? {}),
    });
    return { earn, spend };
  }

  // --- internals ---

  private async loadRewards(): Promise<{
    earn: Record<CreditEarnSource, number>;
    spend: Record<CreditSpendReason, number>;
  }> {
    if (this.rewardsCache && this.rewardsCache.expiresAt > Date.now()) {
      return { earn: this.rewardsCache.earn, spend: this.rewardsCache.spend };
    }
    const snap = await this.db.collection(COL).doc(DOC_CREDIT_REWARDS).get();
    const stored = (snap.exists ? snap.data() : {}) as {
      earn?: Partial<Record<CreditEarnSource, number>>;
      spend?: Partial<Record<CreditSpendReason, number>>;
    };
    const earn: Record<CreditEarnSource, number> = { ...CREDIT_EARN_AMOUNTS, ...(stored.earn ?? {}) };
    const spend: Record<CreditSpendReason, number> = { ...CREDIT_SPEND_AMOUNTS, ...(stored.spend ?? {}) };
    this.rewardsCache = { earn, spend, expiresAt: Date.now() + CACHE_TTL_MS };
    return { earn, spend };
  }
}

// ---------- in-memory implementation (tests / no-Firestore dev) ----------

export class InMemoryPlatformConfigStore implements PlatformConfigStore {
  private plansOverride: Partial<Record<PlanId, Partial<PlanConfig>>> = {};
  private earnOverride: Partial<Record<CreditEarnSource, number>> = {};
  private spendOverride: Partial<Record<CreditSpendReason, number>> = {};

  async getPlans() {
    return mergePlans(this.plansOverride);
  }

  async getPlan(planId: PlanId) {
    return (await this.getPlans())[planId] ?? null;
  }

  async priceFor(planId: PlanId, period: BillingPeriod) {
    const plan = await this.getPlan(planId);
    if (!plan) return defaultPriceFor(planId, period);
    return period === 'yearly' ? plan.yearlyPrice : plan.price;
  }

  async updatePlan(planId: PlanId, patch: Partial<PlanConfig>): Promise<PlanConfig> {
    const sanitised = sanitisePlanPatch(patch);
    this.plansOverride[planId] = { ...this.plansOverride[planId], ...sanitised };
    return (await this.getPlan(planId))!;
  }

  async getEarnAmounts() {
    return { ...CREDIT_EARN_AMOUNTS, ...this.earnOverride } as Record<CreditEarnSource, number>;
  }

  async getEarnAmount(source: CreditEarnSource) {
    return (await this.getEarnAmounts())[source];
  }

  async getSpendAmounts() {
    return { ...CREDIT_SPEND_AMOUNTS, ...this.spendOverride } as Record<CreditSpendReason, number>;
  }

  async updateRewards(input: {
    earn?: Partial<Record<CreditEarnSource, number>>;
    spend?: Partial<Record<CreditSpendReason, number>>;
  }) {
    this.earnOverride = { ...this.earnOverride, ...(input.earn ?? {}) };
    this.spendOverride = { ...this.spendOverride, ...(input.spend ?? {}) };
    return {
      earn: await this.getEarnAmounts(),
      spend: await this.getSpendAmounts(),
    };
  }
}

// ---------- helpers ----------

/**
 * Merge a partial Firestore-stored plan map onto the locked compile-time
 * defaults from `@nexigrate/shared`. Each plan keeps its `id` from the
 * defaults so admin can never rename a plan into a different one and break
 * downstream lookups.
 */
function mergePlans(stored: Partial<Record<PlanId, Partial<PlanConfig>>>): Record<PlanId, PlanConfig> {
  const out = {} as Record<PlanId, PlanConfig>;
  for (const id of Object.keys(PLANS) as PlanId[]) {
    const base = PLANS[id];
    const override = stored[id] ?? {};
    out[id] = {
      ...base,
      ...sanitisePlanPatch(override),
      id: base.id, // never editable
      // Features merge nested:
      features: { ...base.features, ...(override.features ?? {}) },
    };
  }
  return out;
}

/**
 * Strip fields the admin should never set through the editor (id, raw enum
 * keys we don't want renamed) and clamp numeric fields to non-negative ints.
 */
function sanitisePlanPatch(patch: Partial<PlanConfig>): Partial<PlanConfig> {
  const out: Partial<PlanConfig> = {};
  if (typeof patch.name === 'string') out.name = patch.name.trim().slice(0, 80);
  if (typeof patch.nameHi === 'string') out.nameHi = patch.nameHi.trim().slice(0, 80);
  if (typeof patch.price === 'number' && patch.price >= 0) out.price = Math.floor(patch.price);
  if (typeof patch.yearlyPrice === 'number' && patch.yearlyPrice >= 0) out.yearlyPrice = Math.floor(patch.yearlyPrice);
  if (typeof patch.isActive === 'boolean') out.isActive = patch.isActive;
  if (typeof patch.comingSoon === 'boolean') out.comingSoon = patch.comingSoon;
  if (patch.features && typeof patch.features === 'object') {
    const f = patch.features;
    out.features = {
      dailyMCQ: typeof f.dailyMCQ === 'number' ? Math.max(-1, Math.floor(f.dailyMCQ)) : 0,
      mockTests: typeof f.mockTests === 'number' ? Math.max(-1, Math.floor(f.mockTests)) : 0,
      aiTutor: !!f.aiTutor,
      currentAffairs: !!f.currentAffairs,
      essayGrading: !!f.essayGrading,
      chaptersPerDay: typeof f.chaptersPerDay === 'number' ? Math.max(-1, Math.floor(f.chaptersPerDay)) : 0,
      creditDeduction: !!f.creditDeduction,
    };
  }
  return out;
}
