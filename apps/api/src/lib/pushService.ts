/**
 * Push notification service via Firebase Cloud Messaging (FCM) Admin SDK.
 *
 * PR-38 — closes the founder's "push notification system" lock:
 *   "ek push notification vala system bnana hai taki current affais ko
 *    bhej ske ham ya automatic chala jaye user personlized notioficaion?
 *    firebase to hai hi already?"
 *
 * Architecture:
 *   - Per-user device tokens are persisted on `users/{uid}.fcmTokens[]`
 *     (an array of { token, platform, createdAt, lastSeenAt } records).
 *     Stored on the user doc itself, not a separate collection, so the
 *     existing right-to-erasure walk in lib/userData.ts wipes them
 *     automatically when a user deletes their account.
 *   - The send helper accepts a list of user IDs OR a topic. For
 *     audience='all'|'free'|'paid' we look up matching users from
 *     userStore and fan out by 500-token chunks (FCM limit).
 *   - Returns aggregate success/failure counts so the admin UI can
 *     surface "delivered to N out of M devices" instead of a blind 200.
 *
 * Credential resolution:
 *   - First tries the FCM service-account JSON saved in
 *     serviceKeys/fcm (PR-37). This is the admin-rotatable path.
 *   - Falls back to the same service account that powers
 *     getFirebaseAdminAuth() — the FIREBASE_SERVICE_ACCOUNT_JSON env
 *     var that's already configured in production. So push works on
 *     day one without admin config IF the existing service account
 *     has Cloud Messaging API enabled.
 *
 * Failure mode:
 *   - All public methods log + return rather than throw, so a missing
 *     credential or quota exhaustion never crashes a user-facing
 *     request that happened to also try to fire a push.
 */

import type { Env } from '../env.js';
import type { Logger } from '../logger.js';
import type { ServiceKeyStore } from './serviceKeyStore.js';

export interface FcmDeviceToken {
  token: string;
  platform?: 'web' | 'android' | 'ios';
  createdAt: string;
  lastSeenAt: string;
}

export interface PushNotificationPayload {
  title: string;
  body: string;
  /** Optional click-through URL — opens when the user taps the notification. */
  link?: string;
  /** Optional data payload (string-only per FCM contract). */
  data?: Record<string, string>;
  /** Optional image URL for rich notifications. */
  imageUrl?: string;
}

export interface PushSendResult {
  successCount: number;
  failureCount: number;
  invalidTokens: string[];
}

export interface PushService {
  isConfigured(): Promise<boolean>;
  /** Send to specific device tokens (deduplicated, batched at 500). */
  sendToTokens(tokens: string[], payload: PushNotificationPayload): Promise<PushSendResult>;
  /** Send to a topic (e.g. 'current-affairs', 'streak-reminder'). */
  sendToTopic(topic: string, payload: PushNotificationPayload): Promise<PushSendResult>;
}

const TOKEN_BATCH_SIZE = 500;

/** Public web origin used to turn relative notification links (e.g.
 *  "/dashboard", "/current-affairs") into the absolute HTTPS URLs that
 *  FCM web push requires. A relative link in webpush.fcmOptions.link is
 *  rejected by FCM — which is why the AUTOMATIC notifications (streak,
 *  daily digest) silently failed while the admin test (already absolute)
 *  appeared to "send". Mirrors the constant used in emailService. */
const APP_BASE_URL = 'https://app.nexigrate.com';

function toAbsoluteLink(link?: string): string | undefined {
  if (!link) return undefined;
  if (/^https?:\/\//i.test(link)) return link;
  return `${APP_BASE_URL}${link.startsWith('/') ? '' : '/'}${link}`;
}

/**
 * Build the FCM message payload from our PushNotificationPayload shape.
 *
 * DATA-ONLY by design. Previously we sent a top-level `notification`
 * payload; for FCM web push that makes the SDK auto-display the message
 * AND (depending on SDK version) also invoke onBackgroundMessage — giving
 * either a duplicate or, combined with the service-worker scope clash, no
 * notification at all. Sending data-only means the service worker's
 * onBackgroundMessage ALWAYS fires exactly once and renders a single,
 * branded notification with full control over the icon + click target.
 *
 * All display fields therefore travel in `data` (FCM requires every data
 * value to be a string), and the click URL is normalised to an absolute
 * HTTPS link the service worker reads from `click_action` / `url`.
 */
function buildMessage(payload: PushNotificationPayload, target: { token: string } | { topic: string }): Record<string, unknown> {
  const link = toAbsoluteLink(payload.link);
  const data: Record<string, string> = {
    ...(payload.data ?? {}),
    title: payload.title,
    body: payload.body,
    ...(link ? { click_action: link, url: link } : {}),
    ...(payload.imageUrl ? { image: payload.imageUrl } : {}),
  };
  return {
    ...target,
    data,
    // High urgency + 1-day TTL so time-sensitive nudges (streak at risk,
    // today's current affairs) are delivered promptly rather than coalesced.
    webpush: { headers: { Urgency: 'high', TTL: '86400' } },
  };
}

/**
 * Real FCM-backed implementation. Lazy-initialises the messaging
 * instance because firebase-admin's getMessaging() requires the
 * default app to be initialised first (which getFirebaseAuth()
 * already does).
 */
export class FirebasePushService implements PushService {
  constructor(
    private readonly env: Env,
    private readonly logger: Logger,
    private readonly serviceKeys?: ServiceKeyStore,
  ) {}

  /**
   * Verify that we can mint an FCM messaging instance. Returns null
   * (and logs) if the underlying Firebase Admin app couldn't be
   * initialised — callers downgrade gracefully to "no push delivered".
   */
  private async getMessaging() {
    try {
      // Always go through getFirebaseAuth() so we share the same
      // initialised default app. If FIREBASE_SERVICE_ACCOUNT_JSON is
      // missing, this throws the same way every other Firebase Admin
      // path throws — we log and fall through rather than crashing
      // the whole request.
      const { getFirebaseAuth } = await import('./firebaseAdmin.js');
      getFirebaseAuth(this.env); // ensure app initialised
      const { getMessaging } = await import('firebase-admin/messaging');
      return getMessaging();
    } catch (err) {
      this.logger.warn('push.messaging_init_failed', {
        error: err instanceof Error ? err.message : String(err),
      });
      return null;
    }
  }

  async isConfigured() {
    // Either the dedicated FCM service-key doc has data OR the existing
    // Firebase Admin credentials (FIREBASE_CLIENT_EMAIL + FIREBASE_PRIVATE_KEY)
    // are present. We check both so the admin UI can show the right
    // "configured / use admin to enable" state.
    if (this.serviceKeys) {
      const cfg = await this.serviceKeys.get('fcm');
      if (cfg && cfg.fields['serviceAccountJson']) return true;
    }
    return !!(this.env.FIREBASE_CLIENT_EMAIL && this.env.FIREBASE_PRIVATE_KEY);
  }

  async sendToTokens(tokens: string[], payload: PushNotificationPayload): Promise<PushSendResult> {
    if (tokens.length === 0) {
      return { successCount: 0, failureCount: 0, invalidTokens: [] };
    }
    const unique = [...new Set(tokens)];
    const messaging = await this.getMessaging();
    if (!messaging) {
      return { successCount: 0, failureCount: unique.length, invalidTokens: [] };
    }

    let successCount = 0;
    let failureCount = 0;
    const invalidTokens: string[] = [];

    for (let i = 0; i < unique.length; i += TOKEN_BATCH_SIZE) {
      const batch = unique.slice(i, i + TOKEN_BATCH_SIZE);
      try {
        // sendEach returns per-token success / error so we can prune
        // invalid (revoked / unregistered) tokens from user docs.
        const messages = batch.map(token => buildMessage(payload, { token }));
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const res = await (messaging as any).sendEach(messages);
        successCount += res.successCount ?? 0;
        failureCount += res.failureCount ?? 0;
        if (Array.isArray(res.responses)) {
          res.responses.forEach((r: { success: boolean; error?: { code?: string } }, idx: number) => {
            if (!r.success && r.error?.code && /registration-token-not-registered|invalid-registration-token/i.test(r.error.code)) {
              const tok = batch[idx];
              if (tok) invalidTokens.push(tok);
            }
          });
        }
      } catch (err) {
        this.logger.error('push.batch_send_failed', {
          batchSize: batch.length,
          error: err instanceof Error ? err.message : String(err),
        });
        failureCount += batch.length;
      }
    }
    this.logger.info('push.send_result', {
      totalRequested: unique.length,
      successCount,
      failureCount,
      invalidTokensCount: invalidTokens.length,
    });
    return { successCount, failureCount, invalidTokens };
  }

  async sendToTopic(topic: string, payload: PushNotificationPayload): Promise<PushSendResult> {
    const messaging = await this.getMessaging();
    if (!messaging) {
      return { successCount: 0, failureCount: 1, invalidTokens: [] };
    }
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (messaging as any).send(buildMessage(payload, { topic }));
      return { successCount: 1, failureCount: 0, invalidTokens: [] };
    } catch (err) {
      this.logger.error('push.topic_send_failed', {
        topic,
        error: err instanceof Error ? err.message : String(err),
      });
      return { successCount: 0, failureCount: 1, invalidTokens: [] };
    }
  }
}

/**
 * Factory used in app.ts. Returns a FirebasePushService bound to the
 * current env + logger + serviceKeyStore. Always returns an instance
 * (never null) so call sites don't have to null-check — at-call-time
 * checks via isConfigured() expose whether sends will actually fire.
 */
export function createPushService(env: Env, logger: Logger, serviceKeys?: ServiceKeyStore): PushService {
  return new FirebasePushService(env, logger, serviceKeys);
}
