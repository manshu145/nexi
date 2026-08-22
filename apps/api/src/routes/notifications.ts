/**
 * In-app notification inbox routes.
 *
 *   GET  /v1/notifications            — recent notifications + unread count
 *   POST /v1/notifications/:id/read   — mark one read
 *   POST /v1/notifications/read-all   — mark all read
 *
 * (The cron POST /v1/notifications/streak-check lives on the root app with
 *  x-cron-secret auth, separate from this authed router.)
 */

import { Hono } from 'hono';
import { requireAuth } from '../auth.js';
import type { Logger } from '../logger.js';
import type { NotificationStore } from '../lib/notificationStore.js';

export interface NotificationRoutesDeps {
  notifications: NotificationStore;
  logger: Logger;
}

export function makeNotificationRoutes(deps: NotificationRoutesDeps): Hono {
  const app = new Hono();

  app.get('/', async (c) => {
    const principal = requireAuth(c);
    const [items, unread] = await Promise.all([
      deps.notifications.list(principal.userId, 20),
      deps.notifications.unreadCount(principal.userId),
    ]);
    return c.json({ notifications: items, unreadCount: unread });
  });

  app.post('/:id/read', async (c) => {
    const principal = requireAuth(c);
    await deps.notifications.markRead(principal.userId, c.req.param('id'));
    return c.json({ success: true });
  });

  app.post('/read-all', async (c) => {
    const principal = requireAuth(c);
    await deps.notifications.markAllRead(principal.userId);
    return c.json({ success: true });
  });

  return app;
}
