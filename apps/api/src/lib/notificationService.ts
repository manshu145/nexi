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
import { asUserId } from '@nexigrate/shared';

export interface NotifyDeps {
  notifications: NotificationStore;
  users?: UserStore;
  push?: PushService;
  logger: Logger;
}

/**
 * Create an in-app notification for one user and optionally push it.
 * Returns true if an in-app item was created (false if deduped/failed).
 */
export async function notifyUser(
  deps: NotifyDeps,
  userId: string,
  n: NewNotification,
  opts?: { push?: boolean },
): Promise<boolean> {
  let created = false;
  try {
    const item = await deps.notifications.create(userId, n);
    created = !!item;
  } catch (err) {
    deps.logger.warn('notify.create_failed', { userId, type: n.type, error: err instanceof Error ? err.message : String(err) });
  }

  // Best-effort push (only if we actually created an item — respects dedupe).
  if (created && opts?.push && deps.push && deps.users) {
    try {
      const user = await deps.users.get(asUserId(userId));
      const tokens = (user?.fcmTokens ?? []).map(t => t.token).filter(Boolean);
      if (tokens.length > 0) {
        await deps.push.sendToTokens(tokens, {
          title: n.title,
          body: n.body,
          ...(n.link ? { link: n.link } : {}),
        });
      }
    } catch (err) {
      deps.logger.warn('notify.push_failed', { userId, error: err instanceof Error ? err.message : String(err) });
    }
  }
  return created;
}
