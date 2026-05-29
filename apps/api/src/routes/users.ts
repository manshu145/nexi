import { Hono } from 'hono';
import { HTTPException } from 'hono/http-exception';
import { z } from 'zod';
import { asExamSlug, asUserId, isExamSlug } from '@nexigrate/shared';
import { requireAuth } from '../auth.js';
import type { Logger } from '../logger.js';
import type { UserStore } from '../lib/userStore.js';
import type { Firestore } from 'firebase-admin/firestore';
import type { CreditLedger } from '../lib/creditLedger.js';
import type { PlatformConfigStore } from '../lib/platformConfigStore.js';

export interface UsersRoutesDeps {
  users: UserStore;
  logger: Logger;
  db?: Firestore | null;
  ledger: CreditLedger;
  /** Live earn amounts read from platformConfig (admin-editable). */
  config: PlatformConfigStore;
}

const patchSchema = z.object({ name: z.string().min(1).optional(), phone: z.string().optional(), dob: z.string().optional(), classLevel: z.string().optional(), board: z.string().optional(), school: z.string().optional(), aim: z.string().optional() });
const onboardingSchema = z.object({ language: z.enum(['en','hi']).optional(), targetExam: z.string().refine(isExamSlug, { message: 'unknown exam slug' }).optional(), name: z.string().min(1).optional(), email: z.string().email().optional(), phone: z.string().optional(), dob: z.string().optional(), classLevel: z.string().optional(), board: z.string().optional(), school: z.string().optional(), aim: z.string().optional() });

/**
 * Body for POST /v1/users/me/onboarding/plan-chosen.
 *
 * The chosen plan is recorded for analytics; the actual plan activation
 * (for paid tiers) still happens through /v1/billing/order + /verify.
 * This endpoint exists purely so the dashboard guard knows the user has
 * been through the post-assessment plan-selection step and shouldn't be
 * sent back to it.
 */
const planChosenSchema = z.object({
  chosenPlan: z.enum(['free', 'scholar', 'aspirant', 'achiever']),
});

export function makeUsersRoutes(deps: UsersRoutesDeps): Hono {
  const app = new Hono();

  /**
   * Calendar day in IST (Asia/Kolkata) for a given ISO timestamp. Used as
   * part of the idempotency key for `daily_login` and the streak-milestone
   * grants so each IST day is its own logical event.
   */
  function istDateKey(iso: string): string {
    const t = new Date(iso).getTime() + 5.5 * 60 * 60 * 1000;
    const d = new Date(t);
    return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`;
  }

  app.get('/me', async (c) => {
    const principal = requireAuth(c);
    // Identity fields come from the verified Firebase ID token claims
    // attached to `principal` by the auth middleware -- NOT from
    // X-User-* request headers (lock §1.5 fix). The client cannot forge
    // these, so a malicious caller can no longer write arbitrary email
    // or display name onto another user's Firestore doc on first
    // contact, and they cannot impersonate the SUPER_ADMIN_EMAIL by
    // typing it into a header.
    //
    // For email/name/picture/provider fall-back chains:
    //   - email      : trusted, may be '' for phone-only signups
    //   - name       : token's `name` claim (Google profile name) ->
    //                  email-prefix as a last resort -> 'Student'
    //   - picture    : token's `picture` claim or null
    //   - provider   : 'phone' iff Firebase issued via phone OTP,
    //                  else 'google' (covers password + google.com etc.)
    const email = principal.email;
    const name = principal.name ?? (email ? email.split('@')[0] : null) ?? 'Student';
    const photo = principal.picture;
    const provider = principal.signInProvider;
    // Ensure user exists. Returned doc isn't used downstream because we
    // re-read at the bottom after ledger writes, but the call's side
    // effect (creating the row on first contact) is required.
    await deps.users.getOrCreate(principal.userId, { email, name, photoURL: photo, primaryProvider: provider });

    // Phone-verification mirror: if the Firebase ID token carries a verified
    // phone_number claim, sync it to the Firestore user doc. This is the
    // ONLY trusted source of phone identity -- the legacy /verify-phone
    // path also writes to user.phone via PATCH, but that field is
    // client-controlled and could be spoofed. Reading from the token here
    // means dashboard's "is this user phone-verified?" gate is anchored on
    // a Firebase Auth fact, not a self-asserted claim.
    //
    // Idempotent: if Firestore already has the same phone + verified=true
    // we skip the write. New users without a phone_number claim are left
    // as-is, so the dashboard guard correctly bounces them to /verify-phone.
    if (principal.phoneNumber) {
      try {
        const current = await deps.users.get(principal.userId);
        const needsUpdate =
          current && (current.phone !== principal.phoneNumber || current.phoneVerified !== true);
        if (needsUpdate) {
          await deps.users.update(principal.userId, {
            phone: principal.phoneNumber,
            phoneVerified: true,
          } as Partial<typeof current>);
          deps.logger.info('users.phone_verified_from_token', {
            userId: principal.userId,
            phoneSuffix: principal.phoneNumber.slice(-4),
          });
        }
      } catch (err) {
        deps.logger.error('users.phone_sync_error', {
          userId: principal.userId,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }

    // Compute streak first (this also persists currentStreak/bestStreak/lastDailyAt)
    // and figure out which milestones to award. The bumpStreak method itself
    // never touches credits anymore -- it just tells us what crossed.
    const bump = await deps.users.bumpStreak(principal.userId);

    // All credit grants are idempotent on `(userId, source[+ref])`. Calling
    // /me a thousand times never awards more than once for the same logical
    // event -- the ledger's idempotency layer collapses retries.
    const userId = asUserId(principal.userId);

    // 1. Sign-up bonus. Fired once per user, ever. Amount comes from
    //    platformConfig so admin can change the welcome bonus without a
    //    redeploy; default falls back to the locked PR-03 value via the
    //    config store.
    await deps.ledger.award({
      userId,
      source: 'signup_verified',
      amount: await deps.config.getEarnAmount('signup_verified'),
      idempotencyKey: `signup_verified:${principal.userId}`,
    });

    // 2. Daily login. Idempotency key includes the IST date so a fresh
    //    grant fires on the first /me call of each new IST day.
    let dailyAwarded = 0;
    if (bump.wasBumped) {
      const istDay = istDateKey(new Date().toISOString());
      const dailyResult = await deps.ledger.award({
        userId,
        source: 'daily_login',
        amount: await deps.config.getEarnAmount('daily_login'),
        idempotencyKey: `daily_login:${principal.userId}:${istDay}`,
      });
      if (dailyResult.kind === 'awarded') dailyAwarded = dailyResult.event.amount;

      // 3. Streak milestones. Each is single-shot per streak cycle; if the
      //    user breaks and re-builds the streak they earn it again on the
      //    new milestone day.
      if (bump.crossedSeven) {
        await deps.ledger.award({
          userId,
          source: 'streak_7d',
          amount: await deps.config.getEarnAmount('streak_7d'),
          idempotencyKey: `streak_7d:${principal.userId}:${istDay}`,
        });
      }
      if (bump.crossedThirty) {
        await deps.ledger.award({
          userId,
          source: 'streak_30d',
          amount: await deps.config.getEarnAmount('streak_30d'),
          idempotencyKey: `streak_30d:${principal.userId}:${istDay}`,
        });
      }
    }

    // Re-read after ledger writes so the returned `credits` cache reflects
    // the just-awarded amounts.
    const freshUser = await deps.users.get(principal.userId);
    return c.json({
      user: freshUser,
      dailyStreak: { streak: bump.streak, creditsEarned: dailyAwarded },
    });
  });

  app.patch('/me', async (c) => {
    const principal = requireAuth(c);
    const body = await c.req.json().catch(() => null);
    const parsed = patchSchema.safeParse(body);
    if (!parsed.success) throw new HTTPException(400, { message: parsed.error.issues[0]?.message ?? 'invalid body' });
    const user = await deps.users.update(principal.userId, parsed.data as any);
    deps.logger.info('users.profile_updated', { userId: principal.userId });
    return c.json({ user });
  });

  // DELETE /v1/users/me — permanently delete user account and all data
  app.delete('/me', async (c) => {
    const principal = requireAuth(c);
    try {
      // Delete user data from Firestore
      if (deps.db) {
        const batch = deps.db.batch();
        // Delete user doc
        batch.delete(deps.db.collection('users').doc(principal.userId));
        // Delete study progress
        const progressSnap = await deps.db.collection('studyProgress').where('userId', '==', principal.userId).get();
        progressSnap.docs.forEach(doc => batch.delete(doc.ref));
        // Delete chat sessions
        const chatSnap = await deps.db.collection('chatSessions').where('userId', '==', principal.userId).get();
        chatSnap.docs.forEach(doc => batch.delete(doc.ref));
        // Delete referral records
        const refSnap = await deps.db.collection('referrals').where('referrerId', '==', principal.userId).get();
        refSnap.docs.forEach(doc => batch.delete(doc.ref));
        await batch.commit();
      } else {
        // In-memory: mark as deleted (no delete method available)
        await deps.users.update(principal.userId, { name: '[deleted]', email: '', phone: null, credits: 0, plan: 'free' } as any);
      }
      deps.logger.info('users.account_deleted', { userId: principal.userId });
      return c.json({ success: true, message: 'Account deleted successfully' });
    } catch (err) {
      deps.logger.error('users.delete_error', { userId: principal.userId, error: err instanceof Error ? err.message : String(err) });
      throw new HTTPException(500, { message: 'Failed to delete account. Please contact support.' });
    }
  });

  app.post('/me/onboarding', async (c) => {
    const principal = requireAuth(c);
    const body = await c.req.json().catch(() => null);
    const parsed = onboardingSchema.safeParse(body);
    if (!parsed.success) throw new HTTPException(400, { message: parsed.error.issues[0]?.message ?? 'invalid body' });
    const d: Record<string, unknown> = {};
    if (parsed.data.language) d.language = parsed.data.language;
    if (parsed.data.targetExam) d.targetExam = asExamSlug(parsed.data.targetExam);
    if (parsed.data.name) d.name = parsed.data.name;
    if (parsed.data.email) d.email = parsed.data.email;
    if (parsed.data.phone) d.phone = parsed.data.phone;
    if (parsed.data.dob) d.dob = parsed.data.dob;
    if (parsed.data.classLevel) d.classLevel = parsed.data.classLevel;
    if (parsed.data.board) d.board = parsed.data.board;
    if (parsed.data.school) d.school = parsed.data.school;
    if (parsed.data.aim) d.aim = parsed.data.aim;
    const user = await deps.users.update(principal.userId, d as any);
    deps.logger.info('users.onboarding', { userId: principal.userId, ...d });
    return c.json({ user });
  });

  // POST /v1/users/me/onboarding/plan-chosen — flip the post-assessment
  // plan-selection gate on. The dashboard guard sends new users to
  // /onboarding/plan until this fires, so the step is mandatory without
  // making the page itself a hard wall (the user can still choose Free).
  // Idempotent: calling it twice with the same plan is a no-op.
  app.post('/me/onboarding/plan-chosen', async (c) => {
    const principal = requireAuth(c);
    const body = await c.req.json().catch(() => null);
    const parsed = planChosenSchema.safeParse(body);
    if (!parsed.success) {
      throw new HTTPException(400, { message: parsed.error.issues[0]?.message ?? 'invalid body' });
    }
    const user = await deps.users.update(principal.userId, {
      onboardingPlanChosen: true,
    } as never);
    deps.logger.info('users.onboarding_plan_chosen', {
      userId: principal.userId,
      chosenPlan: parsed.data.chosenPlan,
    });
    return c.json({ user, chosenPlan: parsed.data.chosenPlan });
  });

  // Session tracking — for admin "who's online" and time-on-platform analytics
  app.post('/me/session/start', async (c) => {
    const principal = requireAuth(c);
    // Update lastActiveAt on the user doc
    await deps.users.update(principal.userId, { lastActiveAt: new Date().toISOString() } as any);
    return c.json({ sessionId: crypto.randomUUID(), startedAt: new Date().toISOString() });
  });

  app.post('/me/session/ping', async (c) => {
    const principal = requireAuth(c);
    await deps.users.update(principal.userId, { lastActiveAt: new Date().toISOString() } as any);
    return c.json({ ok: true });
  });

  app.post('/me/session/end', async (c) => {
    const principal = requireAuth(c);
    deps.logger.info('users.session_end', { userId: principal.userId });
    return c.json({ ok: true });
  });

  // POST /v1/users/me/pwa-install — record PWA installation
  app.post('/me/pwa-install', async (c) => {
    const principal = requireAuth(c);
    if (deps.db) {
      try {
        const { FieldValue } = await import('firebase-admin/firestore');
        await deps.db.collection('platformConfig').doc('stats').set(
          { pwaInstalls: FieldValue.increment(1) },
          { merge: true }
        );
      } catch { /* non-critical */ }
    }
    deps.logger.info('users.pwa_install', { userId: principal.userId });
    return c.json({ ok: true });
  });

  // GET /v1/users/announcements — public: active announcements for current user
  app.get('/announcements', async (c) => {
    requireAuth(c);
    // Query active announcements from Firestore
    if (deps.db) {
      try {
        const now = new Date().toISOString();
        const snap = await deps.db.collection('announcements')
          .where('isActive', '==', true)
          .limit(10)
          .get();
        const announcements = snap.docs
          .map(d => d.data())
          .filter(a => !a.expiresAt || a.expiresAt > now)
          .sort((a, b) => (b.createdAt ?? '').localeCompare(a.createdAt ?? ''));
        return c.json({ announcements });
      } catch { /* fall through */ }
    }
    return c.json({ announcements: [] });
  });

  return app;
}
