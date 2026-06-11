/**
 * Notification dispatch helper.
 *
 * Creates an in-app inbox item AND (best-effort) sends a push to the user's
 * registered FCM devices. Both are non-throwing — a notification failure must
 * never break the flow that triggered it (cron, ingest, quiz submit, …).
 */

import type { Logger } from '../logger.js';
import type { UserStore } from './userStore.js';
import type { PushService } from './pushService.js';
import type { NotificationStore, NewNotification } from './notificationStore.js';
import type { NotificationLogStore } from './notificationLogStore.js';
import { asUserId } from '@nexigrate/shared';

export interface NotifyDeps {
  notifications: NotificationStore;
  users?: UserStore;
  push?: PushService;
  /**
   * Optional per-recipient audit log. When wired AND `opts.source` is set,
   * notifyUser records one row per dispatch (who got what, on which channel,
   * delivered or not, when) so the admin Push page can show the trail for
   * automatic / personalized nudges. Never blocks the send.
   */
  logs?: NotificationLogStore;
  logger: Logger;
}

export interface NotifyOpts {
  /** Also fire an FCM push to the user's registered devices. */
  push?: boolean;
  /**
   * Tag for the audit log (e.g. 'reengage' | 'streak' | 'daily-digest').
   * If omitted, no audit-log row is written (keeps high-frequency internal
   * notifications out of the log). The in-app inbox item is always created.
   */
  source?: string;
  /** Recipient identity for the log, if the caller already has it (saves a read). */
  userInfo?: { email?: string; name?: string };
}

/**
 * Create an in-app notification for one user and optionally push it.
 * Returns true if an in-app item was created (false if deduped/failed).
 */
export async function notifyUser(
  deps: NotifyDeps,
  userId: string,
  n: NewNotification,
  opts?: NotifyOpts,
): Promise<boolean> {
  let created = false;
  try {
    const item = await deps.notifications.create(userId, n);
    created = !!item;
  } catch (err) {
    deps.logger.warn('notify.create_failed', { userId, type: n.type, error: err instanceof Error ? err.message : String(err) });
  }

  let pushAttempted = false;
  let pushSuccess = 0;
  let pushFailure = 0;
  let info = opts?.userInfo;

  // Best-effort push (only if we actually created an item — respects dedupe).
  if (created && opts?.push && deps.push && deps.users) {
    try {
      const user = await deps.users.get(asUserId(userId));
      if (user && !info) info = { email: user.email, name: user.name };
      const tokens = (user?.fcmTokens ?? []).map(t => t.token).filter(Boolean);
      if (tokens.length > 0) {
        const res = await deps.push.sendToTokens(tokens, {
          title: n.title,
          body: n.body,
          ...(n.link ? { link: n.link } : {}),
        });
        pushAttempted = true;
        pushSuccess = res.successCount;
        pushFailure = res.failureCount;
      }
    } catch (err) {
      deps.logger.warn('notify.push_failed', { userId, error: err instanceof Error ? err.message : String(err) });
    }
  }

  // Per-recipient audit log — only for tagged (source) dispatches that
  // actually created an inbox item. Fire-and-forget; never breaks the send.
  if (created && opts?.source && deps.logs) {
    try {
      await deps.logs.record({
        userId,
        ...(info?.email ? { userEmail: info.email } : {}),
        ...(info?.name ? { userName: info.name } : {}),
        type: n.type,
        title: n.title,
        body: n.body,
        ...(n.link ? { link: n.link } : {}),
        channel: pushAttempted ? 'push' : 'in_app',
        ...(pushAttempted ? { pushDelivered: pushSuccess > 0, pushSuccess, pushFailure } : {}),
        source: opts.source,
      });
    } catch (err) {
      deps.logger.warn('notify.log_failed', { userId, error: err instanceof Error ? err.message : String(err) });
    }
  }

  return created;
}
