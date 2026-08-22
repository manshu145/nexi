/**
 * Per-recipient notification audit log.
 *
 * The existing `pushLogs` collection (admin.ts) records ADMIN BROADCASTS at an
 * aggregate level ("sent to N of M devices"). It does NOT capture which
 * individual user received an AUTOMATIC, personalized nudge.
 *
 * Founder ask (re-engagement system):
 *   "iske logs mujhe admin me push vale me dikhna chahiye — kisko kya kaise
 *    kab gya" → I need a per-recipient trail of who got what, on which channel,
 *    whether it was delivered, and when.
 *
 * So this store records ONE row per (user, automatic notification) dispatched
 * through notifyUser() with a `source` (reengage / streak / daily-digest / …).
 * It is intentionally append-only and read by the admin Push page.
 *
 * Storage: flat collection `notificationLogs/{id}`, newest-first by createdAt.
 * Reads avoid composite indexes by ordering on createdAt only and filtering
 * source/userId in memory (same approach as notificationStore).
 */

import type { Firestore } from 'firebase-admin/firestore';

export interface NotificationLogEntry {
  id: string;
  /** Recipient user id. */
  userId: string;
  /** Recipient email/name captured at send time for the admin table. */
  userEmail?: string;
  userName?: string;
  /** Notification semantic type (mirrors NotificationType). */
  type: string;
  title: string;
  body: string;
  link?: string;
  /** Which channel actually fired: a push attempt, or in-app inbox only. */
  channel: 'push' | 'in_app';
  /** For push: did at least one device accept it? */
  pushDelivered?: boolean;
  pushSuccess?: number;
  pushFailure?: number;
  /** Where the notification came from: 'reengage' | 'streak' | 'daily-digest' | … */
  source: string;
  createdAt: string;
}

export type NewNotificationLog = Omit<NotificationLogEntry, 'id' | 'createdAt'>;

export interface NotificationLogListOpts {
  limit?: number;
  /** Filter by source (e.g. 'reengage'). Applied in memory. */
  source?: string;
  /** Filter by recipient. Applied in memory. */
  userId?: string;
}

export interface NotificationLogStore {
  record(entry: NewNotificationLog): Promise<void>;
  list(opts?: NotificationLogListOpts): Promise<NotificationLogEntry[]>;
}

function newId(): string {
  return `nl_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function stripUndefined<T extends Record<string, unknown>>(obj: T): T {
  // Firestore rejects `undefined` field values — drop them so optional
  // fields (userEmail, link, push counts) don't blow up the write.
  const out = {} as T;
  for (const [k, v] of Object.entries(obj)) {
    if (v !== undefined) (out as Record<string, unknown>)[k] = v;
  }
  return out;
}

// ─── Firestore ─────────────────────────────────────────────────────────────

const COLLECTION = 'notificationLogs';

export class FirestoreNotificationLogStore implements NotificationLogStore {
  constructor(private readonly db: Firestore) {}

  async record(entry: NewNotificationLog): Promise<void> {
    const doc: NotificationLogEntry = { id: newId(), ...entry, createdAt: new Date().toISOString() };
    await this.db.collection(COLLECTION).doc(doc.id).set(stripUndefined(doc as unknown as Record<string, unknown>));
  }

  async list(opts?: NotificationLogListOpts): Promise<NotificationLogEntry[]> {
    const limit = Math.min(500, Math.max(1, opts?.limit ?? 100));
    // Over-fetch so in-memory source/userId filtering can still return a full
    // page without needing a composite index.
    const fetchN = opts?.source || opts?.userId ? Math.min(1000, limit * 5) : limit;
    const snap = await this.db.collection(COLLECTION).orderBy('createdAt', 'desc').limit(fetchN).get();
    let rows = snap.docs.map(d => d.data() as NotificationLogEntry);
    if (opts?.source) rows = rows.filter(r => r.source === opts.source);
    if (opts?.userId) rows = rows.filter(r => r.userId === opts.userId);
    return rows.slice(0, limit);
  }
}

// ─── In-memory (tests + local dev) ──────────────────────────────────────────

export class InMemoryNotificationLogStore implements NotificationLogStore {
  private readonly rows: NotificationLogEntry[] = [];

  async record(entry: NewNotificationLog): Promise<void> {
    this.rows.unshift({ id: newId(), ...entry, createdAt: new Date().toISOString() });
    if (this.rows.length > 2000) this.rows.length = 2000;
  }

  async list(opts?: NotificationLogListOpts): Promise<NotificationLogEntry[]> {
    const limit = Math.min(500, Math.max(1, opts?.limit ?? 100));
    let rows = this.rows;
    if (opts?.source) rows = rows.filter(r => r.source === opts.source);
    if (opts?.userId) rows = rows.filter(r => r.userId === opts.userId);
    return rows.slice(0, limit);
  }
}
