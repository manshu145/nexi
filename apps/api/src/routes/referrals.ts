import { Hono } from 'hono';
import { HTTPException } from 'hono/http-exception';
import { z } from 'zod';
import { award } from '@nexigrate/credits';
import {
  CREDIT_EARN_AMOUNTS,
  type CreditEventId,
  type ISODateTime,
  type ReferralId,
} from '@nexigrate/shared';
import { requireAuth } from '../auth.js';
import {
  deriveReferralCode,
  type ReferralStore,
} from '../lib/referralStore.js';
import type { Logger } from '../logger.js';
import type { LedgerStore } from './credits.js';

/**
 * Referral routes (Phase 16).
 *
 *   GET  /v1/users/me/referral       my code, share URL, stats
 *   POST /v1/referrals/attribute     attribute me to a code
 *
 * Behaviour
 * - Codes are stable per-user and derived deterministically from the uid
 *   (see `deriveReferralCode`). The first call to `/me/referral` writes
 *   the reverse-lookup doc; subsequent calls are cheap reads.
 * - `/attribute` is idempotent on `referredUserId`. Self-attribution is
 *   blocked. Attribution awards `referral_signup` credits to the
 *   referrer immediately rather than gating on identity verification --
 *   the founder skipped Phase 15 for this iteration. The 7-day retention
 *   bonus is paid by a follow-up admin sweep (out of scope for this PR;
 *   the wiring is already in CREDIT_EARN_AMOUNTS).
 */

export interface ReferralsRoutesDeps {
  store: ReferralStore;
  ledger: LedgerStore;
  logger: Logger;
  newId: () => CreditEventId;
  now: () => ISODateTime;
  /** Public origin of the student app, used to build share URLs. */
  appOrigin: string;
}

const attributeSchema = z.object({
  code: z
    .string()
    .trim()
    .toUpperCase()
    .min(4)
    .max(20),
});

/** Mounted under /v1/users -- exposes /v1/users/me/referral. */
export function makeReferralsMeRoutes(deps: ReferralsRoutesDeps): Hono {
  const app = new Hono();

  app.get('/me/referral', async (c) => {
    const principal = requireAuth(c);
    const code = deriveReferralCode(principal.userId);
    await deps.store.getOrAssignCode(principal.userId, code);

    const referrals = await deps.store.listForReferrer(principal.userId);
    const totalCount = referrals.length;
    const retainedCount = referrals.filter((r) => r.status === 'retained').length;
    const rewardedCount = referrals.filter(
      (r) => r.status === 'rewarded' || r.status === 'retained',
    ).length;
    const creditsFromSignup =
      rewardedCount * CREDIT_EARN_AMOUNTS.referral_signup;
    const creditsFromRetention =
      retainedCount * CREDIT_EARN_AMOUNTS.referral_retained_7d;

    return c.json({
      code,
      shareUrl: buildShareUrl(deps.appOrigin, code),
      stats: {
        totalReferred: totalCount,
        rewarded: rewardedCount,
        retained: retainedCount,
        creditsEarned: creditsFromSignup + creditsFromRetention,
      },
      perReferralReward: {
        signup: CREDIT_EARN_AMOUNTS.referral_signup,
        retained: CREDIT_EARN_AMOUNTS.referral_retained_7d,
      },
    });
  });

  return app;
}

/** Mounted at /v1/referrals -- attribution at signup. */
export function makeReferralAttributionRoutes(deps: ReferralsRoutesDeps): Hono {
  const app = new Hono();

  app.post('/attribute', async (c) => {
    const principal = requireAuth(c);
    const body = await c.req.json().catch(() => null);
    const parsed = attributeSchema.safeParse(body);
    if (!parsed.success) {
      throw new HTTPException(400, {
        message: parsed.error.issues[0]?.message ?? 'invalid body',
      });
    }
    const code = parsed.data.code;

    // Already attributed? Idempotent: return the existing row.
    const existing = await deps.store.getForReferred(principal.userId);
    if (existing) {
      return c.json({ referral: existing, firstTime: false });
    }

    const referrerUserId = await deps.store.resolveCode(code);
    if (!referrerUserId) {
      throw new HTTPException(404, { message: 'referral code not found' });
    }
    if (referrerUserId === principal.userId) {
      throw new HTTPException(400, { message: 'cannot refer yourself' });
    }

    const now = deps.now();
    const referralId = `ref_${principal.userId}` as ReferralId;
    const { referral, firstTime } = await deps.store.attribute({
      id: referralId,
      referrerUserId,
      referredUserId: principal.userId,
      code,
      now,
    });

    if (!firstTime) {
      return c.json({ referral, firstTime: false });
    }

    // Award referral_signup credits to the referrer immediately. Verification
    // gating is deferred until Phase 15 ships; for now the founder accepts
    // the small fraud risk in exchange for instant gratification.
    try {
      const events = await deps.ledger.read(referrerUserId);
      const result = award(
        {
          userId: referrerUserId,
          source: 'referral_signup',
          sourceRef: referralId,
          idempotencyKey: `referral_signup:${referralId}`,
        },
        events,
        { newId: deps.newId, now: deps.now },
      );
      if (result.kind === 'awarded') {
        await deps.ledger.append(result.event);
      }
      await deps.store.markRewarded(referralId, now);
    } catch (e) {
      // The referral row is recorded even if the credit award fails; an
      // admin can backfill later. Surface the failure in logs but return
      // 200 so the new user's onboarding doesn't break on a bookkeeping
      // hiccup.
      deps.logger.warn('referral.signup_award_failed', {
        referrerUserId,
        referredUserId: principal.userId,
        error: e instanceof Error ? e.message : 'unknown',
      });
    }

    deps.logger.info('referral.attributed', {
      referrerUserId,
      referredUserId: principal.userId,
      code,
    });

    const stored = await deps.store.getForReferred(principal.userId);
    return c.json({ referral: stored ?? referral, firstTime: true });
  });

  return app;
}

function buildShareUrl(origin: string, code: string): string {
  const safeOrigin = origin.replace(/\/+$/, '');
  return `${safeOrigin}/signin?ref=${encodeURIComponent(code)}`;
}
