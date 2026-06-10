/**
 * In-app notification inbox store.
 *
 * Push tokens were already being registered (users/{uid}.fcmTokens) but there
 * was no inbox — tapping the bell did nothing. This persists notifications at
 * notifications/{uid}/items/{id} so the bell can show an unread count + a
 * dropdown list, independent of whether the user granted push permission.
 */

import type { Firestore } from 'firebase-admin/firestore';

export type NotificationType =
  | 'current_affairs'
  | 'quiz_result'
  | 'streak'
  | 'new_chapter'
  | 'low_credits'
  | 'plan_expiry'
  | 'announcement'
  | 'general';

export interface AppNotification {
  id: string;
  type: NotificationType;
  title: string;
  body: string;
  /** Optional in-app route to open on tap, e.g. "/current-affairs". */
  link?: string;
  isRead: boolean;
  createdAt: string;
}

export interface NewNotification {
  type: NotificationType;
  title: string;
  body: string;
  link?: string;
  /** Optional dedupe key — if an unread item with this key exists today, skip. */
  dedupeKey?: string;
}

export interface NotificationStore {
  create(userId: string, n: NewNotification): Promise<AppNotification | null>;
  list(userId: string, limit?: number): Promise<AppNotification[]>;
  unreadCount(userId: string): Promise<number>;
  markRead(userId: string, id: string): Promise<void>;
  markAllRead(userId: string): Promise<void>;
}

function newId(): string {
  return `n_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

/**
 * In-app notifications auto-expire from the bell 12 hours after creation.
 * Founder ask: "news ya notification 12 ghanta me hat jaye". We hide expired
 * items on read (list + unreadCount) so they vanish from the bell without
 * needing a scheduled cleanup job; the docs are harmless to leave behind.
 */
const NOTIFICATION_TTL_MS = 12 * 60 * 60 * 1000;

/** ISO timestamp of the oldest notification still allowed to show (now − 12h). */
function ttlCutoffIso(): string {
  return new Date(Date.now() - NOTIFICATION_TTL_MS).toISOString();
}

// ─── Firestore ─────────────────────────────────────────────────────────────

export class FirestoreNotificationStore implements NotificationStore {
  constructor(private readonly db: Firestore) {}

  private col(userId: string) {
    return this.db.collection('notifications').doc(userId).collection('items');
  }

  async create(userId: string, n: NewNotification): Promise<AppNotification | null> {
    // Dedupe: skip if an item with the same dedupeKey was created today.
    if (n.dedupeKey) {
      const since = new Date(); since.setHours(0, 0, 0, 0);
      // Equality-only filter (no composite index); filter the date in memory.
      const dup = await this.col(userId).where('dedupeKey', '==', n.dedupeKey).limit(5).get();
      if (dup.docs.some(d => ((d.data() as AppNotification).createdAt ?? '') >= since.toISOString())) return null;
    }
    const item: AppNotification = {
      id: newId(), type: n.type, title: n.title, body: n.body,
      ...(n.link ? { link: n.link } : {}), isRead: false, createdAt: new Date().toISOString(),
    };
    await this.col(userId).doc(item.id).set({ ...item, ...(n.dedupeKey ? { dedupeKey: n.dedupeKey } : {}) });
    return item;
  }

  async list(userId: string, limit = 20): Promise<AppNotification[]> {
    // Over-fetch a little, then drop items older than the 12h TTL so expired
    // notifications disappear from the bell automatically.
    const cutoff = ttlCutoffIso();
    const snap = await this.col(userId).orderBy('createdAt', 'desc').limit(limit + 20).get();
    return snap.docs
      .map(d => {
        const { dedupeKey, ...rest } = d.data() as AppNotification & { dedupeKey?: string };
        return rest as AppNotification;
      })
      .filter(n => (n.createdAt ?? '') >= cutoff)
      .slice(0, limit);
  }

  async unreadCount(userId: string): Promise<number> {
    // Count unread within the most recent 30 that are still within the 12h
    // TTL — enough for a "9+" badge without a count() index.
    const cutoff = ttlCutoffIso();
    const snap = await this.col(userId).orderBy('createdAt', 'desc').limit(30).get();
    return snap.docs.filter(d => {
      const data = d.data() as AppNotification;
      return data.isRead === false && (data.createdAt ?? '') >= cutoff;
    }).length;
  }

  async markRead(userId: string, id: string): Promise<void> {
    await this.col(userId).doc(id).set({ isRead: true }, { merge: true });
  }

  async markAllRead(userId: string): Promise<void> {
    const snap = await this.col(userId).where('isRead', '==', false).limit(100).get();
    const batch = this.db.batch();
    snap.docs.forEach(d => batch.set(d.ref, { isRead: true }, { merge: true }));
    await batch.commit();
  }
}

// ─── In-memory ──────────────────────────────────────────────────────────────

export class InMemoryNotificationStore implements NotificationStore {
  private readonly map = new Map<string, (AppNotification & { dedupeKey?: string })[]>();

  async create(userId: string, n: NewNotification): Promise<AppNotification | null> {
    const arr = this.map.get(userId) ?? [];
    if (n.dedupeKey) {
      const since = new Date(); since.setHours(0, 0, 0, 0);
      if (arr.some(x => x.dedupeKey === n.dedupeKey && x.createdAt >= since.toISOString())) return null;
    }
    const item: AppNotification & { dedupeKey?: string } = {
      id: newId(), type: n.type, title: n.title, body: n.body,
      ...(n.link ? { link: n.link } : {}), isRead: false, createdAt: new Date().toISOString(),
      ...(n.dedupeKey ? { dedupeKey: n.dedupeKey } : {}),
    };
    arr.unshift(item);
    this.map.set(userId, arr.slice(0, 100));
    const { dedupeKey, ...rest } = item;
    return rest as AppNotification;
  }

  async list(userId: string, limit = 20): Promise<AppNotification[]> {
    const cutoff = ttlCutoffIso();
    return (this.map.get(userId) ?? [])
      .filter(x => x.createdAt >= cutoff)
      .slice(0, limit)
      .map(({ dedupeKey, ...rest }) => rest as AppNotification);
  }

  async unreadCount(userId: string): Promise<number> {
    const cutoff = ttlCutoffIso();
    return (this.map.get(userId) ?? []).filter(x => !x.isRead && x.createdAt >= cutoff).length;
  }

  async markRead(userId: string, id: string): Promise<void> {
    const arr = this.map.get(userId); if (!arr) return;
    const item = arr.find(x => x.id === id); if (item) item.isRead = true;
  }

  async markAllRead(userId: string): Promise<void> {
    const arr = this.map.get(userId); if (!arr) return;
    arr.forEach(x => { x.isRead = true; });
  }
}
