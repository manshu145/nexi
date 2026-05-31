import { Hono } from 'hono';
import { HTTPException } from 'hono/http-exception';
import { z } from 'zod';
import { asExamSlug, asISODateTime, asUserId, isExamSlug } from '@nexigrate/shared';
import { requireAuth } from '../auth.js';
import type { Logger } from '../logger.js';
import type { UserStore } from '../lib/userStore.js';
import type { Firestore } from 'firebase-admin/firestore';
import type { CreditLedger } from '../lib/creditLedger.js';
import type { PlatformConfigStore } from '../lib/platformConfigStore.js';
import { exportUserData, eraseUserData } from '../lib/userData.js';
import type { Auth } from 'firebase-admin/auth';

export interface UsersRoutesDeps {
  users: UserStore;
  logger: Logger;
  db?: Firestore | null;
  ledger: CreditLedger;
  /** Live earn amounts read from platformConfig (admin-editable). */
  config: PlatformConfigStore;
  /**
   * PR-38: Firebase Admin Auth — used by DELETE /me to tear down the
   * Auth record alongside the Firestore data, so a deleted account
   * doesn't leave an orphan Firebase Auth user that the founder sees
   * as a "ghost" entry in admin/users.
   */
  firebaseAuth?: Auth;
  /**
   * PR-40: team-invite store. /me handler reads it on every call and
   * auto-elevates the user to admin if a pending invite for their
   * email exists. Optional in test fixtures.
   */
  teamInvites?: import('../lib/teamInviteStore.js').TeamInviteStore;
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

    // PR-40: pending team-invite auto-elevation.
    // If a super_admin has pre-invited this email via /admin/team/invite,
    // this is the moment we promote the user to admin + apply the role.
    // Idempotent: a previously-accepted invite is recognised by status
    // and skipped. Fully gated on email match (case-insensitive).
    if (deps.teamInvites && email) {
      try {
        const invite = await deps.teamInvites.getByEmail(email);
        if (invite && invite.status === 'pending') {
          // Sanity check expiry — invites past their TTL are ignored
          // (admin can re-issue from /admin/team).
          const stillValid = !invite.expiresAt || new Date(invite.expiresAt) > new Date();
          if (stillValid) {
            await deps.users.update(principal.userId, {
              role: 'admin',
              adminRole: invite.adminRole,
            } as never);
            await deps.teamInvites.markAccepted(email, principal.userId);
            deps.logger.info('users.team_invite_accepted', {
              userId: principal.userId,
              email,
              adminRole: invite.adminRole,
            });
          }
        }
      } catch (err) {
        // Non-fatal: just log. Invite acceptance is a nice-to-have on /me;
        // a failure here doesn't block the rest of the response.
        deps.logger.warn('users.team_invite_check_failed', {
          userId: principal.userId,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }

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

  /**
   * GET /v1/users/streak-leaderboard
   *
   * Lock §5.4 streak leaderboard. Returns up to 50 rows sorted by
   * currentStreak desc + bestStreak desc as tiebreak. Sanitised:
   * email + phone never leak; only name, photo, target exam, streak
   * counts are returned.
   */
  app.get('/streak-leaderboard', async (c) => {
    requireAuth(c);
    const limit = Math.min(50, Math.max(5, parseInt(c.req.query('limit') ?? '20', 10)));
    if (!deps.users.getStreakLeaderboard) {
      return c.json({ leaderboard: [] });
    }
    const leaderboard = await deps.users.getStreakLeaderboard(limit);
    return c.json({ leaderboard });
  });

  // DELETE /v1/users/me — permanently delete user account and all data
  app.delete('/me', async (c) => {
    const principal = requireAuth(c);
    try {
      if (deps.db) {
        // DPDP §3.4 right-to-erasure: walk every user-scoped collection
        // via the central USER_DATA_COLLECTIONS map. The user doc is
        // deleted last, so a partial downstream failure doesn't leave
        // the user signed in with phantom data — they can retry.
        const result = await eraseUserData(deps.db, principal.userId, deps.logger);
        // PR-38: also tear down the Firebase Auth user. Pre-PR-38 we
        // only deleted the Firestore docs, which left the Auth record
        // stranded — same email could re-sign-up but produce a different
        // uid, and the admin /users list ended up with "ghost" entries
        // (the old uid was unreachable but the dedup-by-email kept
        // collapsing them visually). Founder report 31 May 2026:
        //   "ek hi email jo maine test kiye the vo alg alg dikha rahe???
        //    aisa nhi hona chahiye na ak bar koi account delete hua to
        //    usko yaha nhi rhna chhaiye"
        // Fix: also call Firebase Admin's deleteUser so the Auth side
        // is fully cleaned up. Failure is non-fatal — Firestore data
        // is the legal source of truth for DPDP, and the auth record
        // can be cleaned up out of band by an admin if this fails.
        if (deps.firebaseAuth) {
          try {
            await deps.firebaseAuth.deleteUser(principal.userId);
            deps.logger.info('users.firebase_auth_deleted', { userId: principal.userId });
          } catch (err) {
            deps.logger.warn('users.firebase_auth_delete_failed', {
              userId: principal.userId,
              error: err instanceof Error ? err.message : String(err),
            });
          }
        }
        deps.logger.info('users.account_deleted', {
          userId: principal.userId,
          collectionsDeleted: result.collectionsDeleted,
          totalDocs: result.totalDocs,
          failedCollections: result.failedCollections,
        });
        const success = result.failedCollections.length === 0;
        return c.json({
          success,
          partial: !success,
          collectionsDeleted: result.collectionsDeleted,
          failedCollections: result.failedCollections,
          totalDocs: result.totalDocs,
          message: success
            ? 'Account and all associated data deleted.'
            : 'Account partially deleted. Some collections failed — please contact support to complete.',
        });
      }
      // In-memory: mark as deleted (no delete method available)
      await deps.users.update(principal.userId, { name: '[deleted]', email: '', phone: null, credits: 0, plan: 'free' } as any);
      deps.logger.info('users.account_deleted_inmemory', { userId: principal.userId });
      return c.json({ success: true, partial: false, collectionsDeleted: ['users'], failedCollections: [], totalDocs: 1, message: 'Account deleted.' });
    } catch (err) {
      deps.logger.error('users.delete_error', { userId: principal.userId, error: err instanceof Error ? err.message : String(err) });
      throw new HTTPException(500, { message: 'Failed to delete account. Please contact support.' });
    }
  });

  /**
   * GET /v1/users/me/export-data — DPDP §3.4 right-to-access.
   *
   * Returns a JSON dump of every user-scoped document across the schema:
   * the user doc itself plus all top-level collections + subcollections
   * listed in USER_DATA_COLLECTIONS. Sent as a downloadable file with
   * Content-Disposition so the browser triggers a save dialog rather
   * than rendering a 5MB JSON in the tab.
   *
   * Errors per-collection are surfaced in `failedCollections` rather
   * than failing the whole request — DPDP "right to access" should
   * always return SOMETHING the user can download, even if a single
   * Firestore index is briefly unavailable.
   */
  app.get('/me/export-data', async (c) => {
    const principal = requireAuth(c);
    if (!deps.db) {
      throw new HTTPException(503, { message: 'Export is only available with Firestore persistence.' });
    }
    try {
      const payload = await exportUserData(deps.db, principal.userId, deps.logger);
      deps.logger.info('users.data_exported', {
        userId: principal.userId,
        collectionsIncluded: Object.keys(payload.data).length,
        failedCollections: payload.failedCollections,
      });
      const filename = `nexigrate-data-${new Date().toISOString().slice(0, 10)}.json`;
      return new Response(JSON.stringify(payload, null, 2), {
        status: 200,
        headers: {
          'Content-Type': 'application/json; charset=utf-8',
          'Content-Disposition': `attachment; filename="${filename}"`,
          'Cache-Control': 'no-store',
        },
      });
    } catch (err) {
      deps.logger.error('users.export_error', { userId: principal.userId, error: err instanceof Error ? err.message : String(err) });
      throw new HTTPException(500, { message: 'Failed to export your data. Please try again or contact support.' });
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

  // ━━━ PUSH NOTIFICATIONS (PR-38) ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // Device token registration + revoke. Tokens are stored on the user
  // doc itself (StoredUser.fcmTokens[]) so the right-to-erasure walk in
  // lib/userData.ts wipes them automatically when an account is deleted.
  //
  // Web clients fetch their FCM token via firebase/messaging in the
  // browser SDK then POST it here. We dedupe by token value so refreshing
  // the page doesn't grow the array unboundedly.

  /**
   * POST /v1/users/me/push-tokens
   * Body: { token: string, platform?: 'web'|'android'|'ios' }
   * Idempotent — repeated calls with the same token just bump
   * lastSeenAt without growing the array.
   */
  app.post('/me/push-tokens', async (c) => {
    const principal = requireAuth(c);
    const body = (await c.req.json().catch(() => null)) as { token?: string; platform?: 'web' | 'android' | 'ios' } | null;
    const token = body?.token?.trim();
    if (!token || token.length < 20) {
      throw new HTTPException(400, { message: 'token required (FCM device token, min 20 chars)' });
    }
    const platform = body?.platform === 'android' || body?.platform === 'ios' || body?.platform === 'web'
      ? body.platform
      : 'web';
    const me = await deps.users.get(principal.userId);
    if (!me) throw new HTTPException(404, { message: 'User not found' });
    const now = asISODateTime(new Date().toISOString());
    const existing = me.fcmTokens ?? [];
    const idx = existing.findIndex(t => t.token === token);
    let nextTokens;
    if (idx >= 0) {
      // Bump lastSeenAt only — don't shuffle position so creation timestamps stay stable.
      nextTokens = [...existing];
      nextTokens[idx] = { ...nextTokens[idx]!, platform, lastSeenAt: now };
    } else {
      nextTokens = [...existing, { token, platform, createdAt: now, lastSeenAt: now }];
    }
    // Cap at 10 most-recent tokens so a user with 50 reinstalls doesn't
    // bloat the doc. Drop the oldest by createdAt.
    if (nextTokens.length > 10) {
      nextTokens.sort((a, b) => (b.createdAt ?? '').localeCompare(a.createdAt ?? ''));
      nextTokens = nextTokens.slice(0, 10);
    }
    await deps.users.update(principal.userId, { fcmTokens: nextTokens });
    deps.logger.info('push.token_registered', {
      userId: principal.userId,
      platform,
      tokenCount: nextTokens.length,
    });
    return c.json({ success: true, tokenCount: nextTokens.length });
  });

  /**
   * DELETE /v1/users/me/push-tokens
   * Body: { token?: string }
   * If token specified, only that one is revoked. If omitted, all tokens
   * for the current user are removed (e.g. "disable notifications" toggle).
   */
  app.delete('/me/push-tokens', async (c) => {
    const principal = requireAuth(c);
    const body = (await c.req.json().catch(() => ({}))) as { token?: string };
    const me = await deps.users.get(principal.userId);
    if (!me) throw new HTTPException(404, { message: 'User not found' });
    const existing = me.fcmTokens ?? [];
    const next = body.token
      ? existing.filter(t => t.token !== body.token)
      : [];
    await deps.users.update(principal.userId, { fcmTokens: next });
    deps.logger.info('push.token_revoked', {
      userId: principal.userId,
      revoked: existing.length - next.length,
    });
    return c.json({ success: true, tokenCount: next.length });
  });

  return app;
}
