/**
 * planGate — the SINGLE source of truth for "can this user use this feature,
 * and what happens when they hit the limit".
 *
 * Why this exists (Part 4 pricing/feature audit): plan checks were scattered
 * and inconsistent — some routes read the raw `user.plan` (so an EXPIRED paid
 * user kept paid perks), some advertised limits that were never enforced
 * (dailyMCQ, mock-test monthly cap), and mock tests charged credits even to
 * active paid users. Every gated route now goes through this helper so the
 * behaviour is uniform:
 *
 *   1. EXPIRY-AWARE — the *effective* plan is Free once `planExpiresAt`
 *      passes, regardless of the stored `user.plan`.
 *   2. ADMIN-EDITABLE — limits come from the live platformConfig matrix
 *      (PLANS is only the compile-time fallback). Nothing is hard-coded.
 *   3. CREDITS KEEP RUNNING — for Free/expired users, credit-metered
 *      features (chapters, mock tests, AI tutor) deduct credits; paid users
 *      are metered by a daily/monthly fair-use cap instead (no deduction).
 *   4. EVERY LIMIT → UPGRADE — a blocked call returns a structured body
 *      `{ error, feature, upgrade: true, message }` that the web client turns
 *      into an upgrade prompt. Founder rule: "agar koi bhi feature me plan me
 *      limit aata hai aur user dobara use karne ki koshish karta hai to proper
 *      upgrade ka option aana hi chahiye."
 */

import {
  PLANS,
  isPlanActive,
  shouldDeductCredits,
  planDisplayName,
  asUserId,
  type PlanFeatures,
  type PlanId,
  type CreditSpendReason,
} from '@nexigrate/shared';
import type { Logger } from '../logger.js';
import type { StoredUser } from './userStore.js';
import type { PlatformConfigStore } from './platformConfigStore.js';
import type { FeatureUsageStore, UsageFeature, UsageGranularity } from './featureUsageStore.js';
import type { CreditLedger } from './creditLedger.js';

/** Every gated feature in the product. Used as the canonical key everywhere
 *  (API enforcement + frontend `<PlanGate feature=...>`). */
export enum FeatureKey {
  DAILY_MCQ = 'DAILY_MCQ',
  MOCK_TEST = 'MOCK_TEST',
  AI_CHAT = 'AI_CHAT',
  AI_IMAGE = 'AI_IMAGE',
  CURRENT_AFFAIRS = 'CURRENT_AFFAIRS',
  CHAPTER_ACCESS = 'CHAPTER_ACCESS',
  ESSAY_GRADING = 'ESSAY_GRADING',
  MULTI_EXAM = 'MULTI_EXAM',
  ADVANCED_ANALYTICS = 'ADVANCED_ANALYTICS',
  DOWNLOAD_NOTES = 'DOWNLOAD_NOTES',
  PYQ_ACCESS = 'PYQ_ACCESS',
  REVISION = 'REVISION',
}

type Lang = 'en' | 'hi';

interface FeatureMeta {
  /** Numeric per-window limit field on PlanFeatures (-1 = unlimited, 0 = not included). */
  limitField?: keyof PlanFeatures;
  /** Boolean access field on PlanFeatures. */
  boolField?: keyof PlanFeatures;
  /** Usage-counter key + window for numeric features. */
  usage?: UsageFeature;
  window?: UsageGranularity;
  /** If set, Free/expired users pay this many credits per use instead of a count cap. */
  creditReason?: CreditSpendReason;
  /** Features we don't gate today (kept in the enum for a stable, complete API). */
  alwaysAllowed?: boolean;
  labelEn: string;
  labelHi: string;
}

const FEATURE_META: Record<FeatureKey, FeatureMeta> = {
  [FeatureKey.DAILY_MCQ]: { limitField: 'dailyMCQ', usage: 'mcq', window: 'day', labelEn: 'daily practice sets', labelHi: 'डेली प्रैक्टिस सेट' },
  [FeatureKey.CHAPTER_ACCESS]: { limitField: 'chaptersPerDay', usage: 'chapter', window: 'day', creditReason: 'read_chapter', labelEn: 'chapter reads', labelHi: 'चैप्टर' },
  [FeatureKey.MOCK_TEST]: { limitField: 'mockTests', usage: 'mockTest', window: 'month', creditReason: 'mock_test', labelEn: 'mock tests', labelHi: 'मॉक टेस्ट' },
  [FeatureKey.AI_CHAT]: { limitField: 'aiTutorPerDay', usage: 'aiTutor', window: 'day', creditReason: 'ai_tutor_question', labelEn: 'AI tutor messages', labelHi: 'AI ट्यूटर संदेश' },
  [FeatureKey.AI_IMAGE]: { limitField: 'imagesPerDay', usage: 'image', window: 'day', labelEn: 'AI images', labelHi: 'AI इमेज' },
  [FeatureKey.ESSAY_GRADING]: { limitField: 'essaysPerDay', usage: 'essay', window: 'day', labelEn: 'essay gradings', labelHi: 'निबंध जाँच' },
  [FeatureKey.MULTI_EXAM]: { limitField: 'maxExams', labelEn: 'exams', labelHi: 'परीक्षाएँ' },
  [FeatureKey.PYQ_ACCESS]: { boolField: 'pyqAccess', labelEn: 'previous-year question papers', labelHi: 'पिछले वर्ष के प्रश्नपत्र' },
  [FeatureKey.REVISION]: { boolField: 'revisionAccess', labelEn: 'revision', labelHi: 'रिवीज़न' },
  [FeatureKey.CURRENT_AFFAIRS]: { boolField: 'currentAffairs', labelEn: 'current affairs', labelHi: 'करंट अफेयर्स' },
  // Not gated today (admin-only analytics dashboard; downloads are open).
  [FeatureKey.ADVANCED_ANALYTICS]: { alwaysAllowed: true, labelEn: 'analytics', labelHi: 'एनालिटिक्स' },
  [FeatureKey.DOWNLOAD_NOTES]: { alwaysAllowed: true, labelEn: 'downloads', labelHi: 'डाउनलोड' },
};

// ─── structured result ─────────────────────────────────────────────────────

export interface GateAllow {
  ok: true;
  /** Call AFTER the work succeeds to record the usage (count features only). */
  commit: () => Promise<void>;
}
export interface GateBlockBody {
  error: 'plan_limit' | 'insufficient_credits';
  feature: string;
  plan: PlanId;
  limit: number;
  used?: number;
  balance?: number;
  /** Always true — signals the web client to show an upgrade prompt. */
  upgrade: true;
  message: string;
}
export interface GateBlock {
  ok: false;
  status: 402 | 403;
  body: GateBlockBody;
}
export type GateResult = GateAllow | GateBlock;

const ALLOW_NOOP: GateAllow = { ok: true, commit: async () => {} };

// ─── helpers ────────────────────────────────────────────────────────────────

function numField(features: PlanFeatures, field: keyof PlanFeatures, fallback = 0): number {
  const v = features[field];
  return typeof v === 'number' && Number.isFinite(v) ? v : fallback;
}
function boolField(features: PlanFeatures, field: keyof PlanFeatures): boolean {
  return !!features[field];
}

export function effectivePlanId(user: Pick<StoredUser, 'plan' | 'planExpiresAt'> | null | undefined): PlanId {
  const plan = (user?.plan ?? 'free') as PlanId;
  return isPlanActive(plan, user?.planExpiresAt ?? null) ? plan : 'free';
}

// ─── the gate ────────────────────────────────────────────────────────────────

export interface PlanGateDeps {
  config: PlatformConfigStore;
  /** Per-user usage counter for numeric/count features. Boolean-only routes
   *  (PYQ, revision) may omit it. */
  usage?: FeatureUsageStore;
  /** Only needed for credit-metered features (chapters, mock tests, AI tutor).
   *  Count/boolean-only routes (essay, PYQ, revision) can omit it. */
  ledger?: CreditLedger;
  logger: Logger;
}

type GateUser = Pick<StoredUser, 'id' | 'plan' | 'planExpiresAt'>;

export class PlanGate {
  constructor(private readonly deps: PlanGateDeps) {}

  /** Resolve the effective (expiry-aware) plan id, its live feature matrix,
   *  and whether credits should be deducted for this user. */
  async resolve(user: GateUser | null | undefined): Promise<{ planId: PlanId; features: PlanFeatures; deduct: boolean }> {
    const planId = effectivePlanId(user);
    let features: PlanFeatures;
    try {
      const plan = await this.deps.config.getPlan(planId);
      features = plan?.features ?? PLANS[planId].features;
    } catch {
      features = PLANS[planId].features; // fail-safe to compile-time defaults
    }
    const deduct = shouldDeductCredits(user?.plan ?? 'free', user?.planExpiresAt ?? null);
    return { planId, features, deduct };
  }

  /** Numeric limit for a feature, or 'unlimited'. (Boolean features report
   *  'unlimited' when enabled, 0 when not.) Honors the task's helper API. */
  async getFeatureLimit(user: GateUser | null | undefined, feature: FeatureKey): Promise<number | 'unlimited'> {
    const meta = FEATURE_META[feature];
    if (meta.alwaysAllowed) return 'unlimited';
    const { features } = await this.resolve(user);
    if (meta.boolField && !meta.limitField) return boolField(features, meta.boolField) ? 'unlimited' : 0;
    if (meta.limitField) {
      const v = numField(features, meta.limitField, 0);
      return v < 0 ? 'unlimited' : v;
    }
    return 'unlimited';
  }

  /** Does the user's plan include this feature at all? (boolean access). */
  async hasFeatureAccess(user: GateUser | null | undefined, feature: FeatureKey): Promise<boolean> {
    const meta = FEATURE_META[feature];
    if (meta.alwaysAllowed) return true;
    const { features } = await this.resolve(user);
    if (meta.boolField && !meta.limitField) return boolField(features, meta.boolField);
    if (meta.limitField) return numField(features, meta.limitField, 0) !== 0;
    return true;
  }

  /**
   * Full enforcement for a feature use, with automatic credit-vs-count
   * behaviour:
   *   - boolean feature off          → block (plan_limit)
   *   - Free/expired + creditReason  → deduct credits (block 402 if broke)
   *   - otherwise                    → daily/monthly count cap
   * Returns a GateResult; on allow, call `.commit()` AFTER the work succeeds.
   */
  async enforce(user: GateUser | null | undefined, feature: FeatureKey, lang: Lang = 'en', opts?: { cost?: number; deferCredits?: boolean }): Promise<GateResult> {
    const meta = FEATURE_META[feature];
    if (meta.alwaysAllowed) return ALLOW_NOOP;
    const { planId, features, deduct } = await this.resolve(user);

    // Pure boolean access (PYQ, revision, current affairs).
    if (meta.boolField && !meta.limitField) {
      return boolField(features, meta.boolField) ? ALLOW_NOOP : this.blockBoolean(feature, planId, lang);
    }

    if (!meta.limitField) return ALLOW_NOOP;
    const limit = numField(features, meta.limitField, 0);

    // Free/expired users pay credits for credit-metered features.
    if (meta.creditReason && deduct) {
      return this.deductCredits(user, feature, meta.creditReason, planId, lang, { defer: opts?.deferCredits });
    }

    // Count-metered (everyone for plain count features; paid users for
    // credit-metered features once their plan is active).
    return this.consumeCount(user, feature, meta, limit, planId, lang, opts?.cost ?? 1);
  }

  /**
   * Count-cap WITHOUT the credit path — used by routes (chapters, mock tests)
   * that run their own credit charge + refund logic for Free/expired users
   * and only need planGate to enforce the PAID fair-use cap.
   * For Free/expired users this is a no-op (the route handles credits).
   */
  async enforcePaidCap(user: GateUser | null | undefined, feature: FeatureKey, lang: Lang = 'en'): Promise<GateResult> {
    const meta = FEATURE_META[feature];
    const { planId, features, deduct } = await this.resolve(user);
    if (deduct) return ALLOW_NOOP; // Free/expired → metered by credits in the route
    if (!meta.limitField) return ALLOW_NOOP;
    const limit = numField(features, meta.limitField, 0);
    return this.consumeCount(user, feature, meta, limit, planId, lang);
  }

  /**
   * Spend credits for a credit-metered action (Free/expired users only; a
   * no-op that allows for active paid users). Mirrors the task's
   * `checkAndDeductCredits` — returns a structured 402 when the balance is
   * too low so the client can prompt an upgrade / earn-credits.
   */
  async checkAndDeductCredits(
    user: GateUser | null | undefined,
    feature: FeatureKey,
    opts: { idempotencyKey: string; sourceRef?: string; lang?: Lang },
  ): Promise<GateResult> {
    const meta = FEATURE_META[feature];
    if (!meta.creditReason) return ALLOW_NOOP;
    const { planId, deduct } = await this.resolve(user);
    if (!deduct) return ALLOW_NOOP; // active paid plan → no deduction
    return this.deductCredits(user, feature, meta.creditReason, planId, opts.lang ?? 'en', opts);
  }

  // ── internals ──────────────────────────────────────────────────────────

  private async consumeCount(
    user: GateUser | null | undefined,
    feature: FeatureKey,
    meta: FeatureMeta,
    limit: number,
    planId: PlanId,
    lang: Lang,
    cost = 1,
  ): Promise<GateResult> {
    if (limit < 0) return ALLOW_NOOP; // unlimited (fair-use)
    if (limit === 0) return this.blockCount(feature, planId, 0, 0, lang); // not included
    if (!user || !meta.usage || !meta.window || !this.deps.usage) return ALLOW_NOOP; // can't meter → fail-open
    const usage = this.deps.usage;
    const win = meta.window;
    const usageKey = meta.usage;
    let used = 0;
    try {
      used = await usage.getCount(user.id, usageKey, win);
    } catch {
      return ALLOW_NOOP; // fail-open on counter read error — never block a paying user
    }
    if (used >= limit) return this.blockCount(feature, planId, limit, used, lang);
    return {
      ok: true,
      commit: async () => {
        try { await usage.increment(user.id, usageKey, win, cost); } catch { /* fail-open */ }
      },
    };
  }

  private async deductCredits(
    user: GateUser | null | undefined,
    feature: FeatureKey,
    reason: CreditSpendReason,
    planId: PlanId,
    lang: Lang,
    opts?: { idempotencyKey?: string; sourceRef?: string; defer?: boolean },
  ): Promise<GateResult> {
    if (!user) return ALLOW_NOOP;
    let amount = 0;
    try {
      amount = await this.deps.config.getSpendAmount(reason);
    } catch {
      return ALLOW_NOOP; // fail-open if spend config unreachable
    }
    if (amount <= 0) return ALLOW_NOOP; // nothing to charge
    if (!this.deps.ledger) return ALLOW_NOOP; // no ledger wired → can't charge, fail-open
    const ledger = this.deps.ledger;
    const uid = asUserId(user.id);
    const doSpend = async (): Promise<void> => {
      const key = opts?.idempotencyKey ?? `${reason}:${user.id}:${Date.now()}:${Math.random().toString(36).slice(2, 8)}`;
      try {
        await ledger.spend({ userId: uid, reason, amount, idempotencyKey: key, ...(opts?.sourceRef ? { sourceRef: opts.sourceRef } : {}) });
      } catch (err) {
        this.deps.logger.warn('planGate.credit_spend_failed', { feature, error: err instanceof Error ? err.message : String(err) });
      }
    };

    // Deferred mode (e.g. AI chat): peek the balance now so we can prompt an
    // upgrade BEFORE doing the work, but only charge on `commit()` after the
    // work succeeds — so a failed AI call never burns the user's credits.
    if (opts?.defer) {
      let balance = Number.POSITIVE_INFINITY;
      try { balance = await ledger.getBalance(uid); } catch { return ALLOW_NOOP; }
      if (balance < amount) return this.blockCredits(feature, planId, amount, balance, lang);
      return { ok: true, commit: doSpend };
    }

    // Immediate mode: spend now, block on insufficient.
    try {
      const key = opts?.idempotencyKey ?? `${reason}:${user.id}:${Date.now()}:${Math.random().toString(36).slice(2, 8)}`;
      const result = await ledger.spend({
        userId: uid,
        reason,
        amount,
        idempotencyKey: key,
        ...(opts?.sourceRef ? { sourceRef: opts.sourceRef } : {}),
      });
      if (result.kind === 'insufficient') {
        return this.blockCredits(feature, planId, amount, result.balance ?? 0, lang);
      }
      return ALLOW_NOOP; // 'spent' or 'duplicate' → allow
    } catch (err) {
      this.deps.logger.warn('planGate.credit_spend_failed', { feature, error: err instanceof Error ? err.message : String(err) });
      return ALLOW_NOOP; // fail-open: an infra hiccup must not block a user
    }
  }

  // ── block-body builders ──────────────────────────────────────────────────

  private blockCount(feature: FeatureKey, planId: PlanId, limit: number, used: number, lang: Lang): GateBlock {
    const meta = FEATURE_META[feature];
    const planName = planDisplayName(planId);
    const label = lang === 'hi' ? meta.labelHi : meta.labelEn;
    const period = meta.window === 'month' ? (lang === 'hi' ? 'इस महीने' : 'this month') : (lang === 'hi' ? 'आज' : 'today');
    const message = limit === 0
      ? (lang === 'hi'
        ? `${label} ${planName} प्लान में शामिल नहीं है। अनलॉक करने के लिए अपग्रेड करें।`
        : `${label} isn't included in the ${planName} plan. Upgrade to unlock it.`)
      : (lang === 'hi'
        ? `आपने ${planName} प्लान की ${label} सीमा (${limit}) ${period} पूरी कर ली है। और के लिए अपग्रेड करें।`
        : `You've reached your ${label} limit (${limit}) ${period} on the ${planName} plan. Upgrade for more.`);
    return { ok: false, status: 403, body: { error: 'plan_limit', feature, plan: planId, limit, used, upgrade: true, message } };
  }

  private blockBoolean(feature: FeatureKey, planId: PlanId, lang: Lang): GateBlock {
    const meta = FEATURE_META[feature];
    const planName = planDisplayName(planId);
    const label = lang === 'hi' ? meta.labelHi : meta.labelEn;
    const message = lang === 'hi'
      ? `${label} ${planName} प्लान में शामिल नहीं है। अनलॉक करने के लिए अपग्रेड करें।`
      : `${label} isn't included in the ${planName} plan. Upgrade to unlock it.`;
    return { ok: false, status: 403, body: { error: 'plan_limit', feature, plan: planId, limit: 0, upgrade: true, message } };
  }

  private blockCredits(feature: FeatureKey, planId: PlanId, needed: number, balance: number, lang: Lang): GateBlock {
    const meta = FEATURE_META[feature];
    const label = lang === 'hi' ? meta.labelHi : meta.labelEn;
    const message = lang === 'hi'
      ? `${label} के लिए पर्याप्त क्रेडिट नहीं हैं (चाहिए ${needed}, हैं ${balance})। अनलिमिटेड के लिए अपग्रेड करें, या क्रेडिट कमाएँ।`
      : `Not enough credits for ${label} (need ${needed}, have ${balance}). Upgrade for unlimited access, or earn more credits.`;
    return { ok: false, status: 402, body: { error: 'insufficient_credits', feature, plan: planId, limit: needed, balance, upgrade: true, message } };
  }
}
