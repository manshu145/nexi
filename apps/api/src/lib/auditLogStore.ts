import type { Firestore } from 'firebase-admin/firestore';
import { asISODateTime, type ISODateTime } from '@nexigrate/shared';

/**
 * Phase 20 -- admin action audit log.
 *
 * Append-only collection that captures every admin-side write:
 * grant-credits, suspend-user, revoke-admin, etc. The log is the only
 * trail of who-did-what-when so it has to be writable by every admin
 * route AND inspectable in one place.
 *
 * Storage layout:
 *   audit_log/{eventId}    -- one row per admin action
 *
 * Index: (occurredAt DESC) + (action ASC, occurredAt DESC) +
 *        (actorUid ASC, occurredAt DESC) for filtered views.
 *
 * The log is opinionated about what gets logged: state-changing admin
 * actions only. Read calls (listing users, viewing analytics) are NOT
 * logged because the volume would crowd out the signal.
 */
export type AuditAction =
  | 'admin.users.grant_credits'
  | 'admin.users.revoke_credits'
  | 'admin.users.suspend'
  | 'admin.users.unsuspend'
  | 'admin.team.add_admin'
  | 'admin.team.revoke_admin'
  | 'admin.content.approve'
  | 'admin.content.reject';

export interface AuditLogEntry {
  /** UUID, also doc id. */
  id: string;
  /** When the action happened, server-clock. Used for ordering. */
  occurredAt: ISODateTime;
  /** Firebase uid of the admin who performed the action. */
  actorUid: string;
  /** Email of the admin (denormalised so the log doesn't require a join). */
  actorEmail: string | null;
  /** What happened (see AuditAction). */
  action: AuditAction;
  /**
   * The user/admin/content row this action operated on. Free-form so
   * different actions can use different identifier shapes (uid, draftId,
   * etc.). null when the action isn't tied to a single target row.
   */
  targetId: string | null;
  /**
   * Free-form metadata for the action -- credit amount + reason for a
   * grant, draft slug + verifier scores for an approval, etc.
   * MUST be JSON-serialisable; we don't persist functions / Maps.
   */
  metadata: Record<string, unknown>;
}

export interface ListAuditLogOptions {
  action?: AuditAction;
  actorUid?: string;
  /** Default 50, capped at 200. */
  limit?: number;
  /** Page through older entries. ISO datetime returned by previous page. */
  beforeOccurredAt?: ISODateTime;
}

export interface AuditLogStore {
  append(entry: AuditLogEntry): Promise<void>;
  list(opts?: ListAuditLogOptions): Promise<AuditLogEntry[]>;
}

const COLLECTION = 'audit_log';

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 200;

function clampLimit(n?: number): number {
  if (!n || n <= 0) return DEFAULT_LIMIT;
  return Math.min(n, MAX_LIMIT);
}

export class InMemoryAuditLogStore implements AuditLogStore {
  private rows: AuditLogEntry[] = [];

  async append(entry: AuditLogEntry): Promise<void> {
    this.rows.push({ ...entry });
  }

  async list(opts: ListAuditLogOptions = {}): Promise<AuditLogEntry[]> {
    let rows = this.rows.slice();
    if (opts.action) rows = rows.filter((r) => r.action === opts.action);
    if (opts.actorUid) rows = rows.filter((r) => r.actorUid === opts.actorUid);
    if (opts.beforeOccurredAt) {
      rows = rows.filter((r) => r.occurredAt < (opts.beforeOccurredAt as string));
    }
    rows.sort((a, b) => (a.occurredAt < b.occurredAt ? 1 : -1));
    return rows.slice(0, clampLimit(opts.limit));
  }
}

export class FirestoreAuditLogStore implements AuditLogStore {
  constructor(private readonly db: Firestore) {}

  async append(entry: AuditLogEntry): Promise<void> {
    await this.db.collection(COLLECTION).doc(entry.id).set(entry);
  }

  async list(opts: ListAuditLogOptions = {}): Promise<AuditLogEntry[]> {
    let q = this.db
      .collection(COLLECTION)
      .orderBy('occurredAt', 'desc') as FirebaseFirestore.Query;
    if (opts.action) q = q.where('action', '==', opts.action);
    if (opts.actorUid) q = q.where('actorUid', '==', opts.actorUid);
    if (opts.beforeOccurredAt) q = q.where('occurredAt', '<', opts.beforeOccurredAt);
    const snap = await q.limit(clampLimit(opts.limit)).get();
    return snap.docs.map((d) => d.data() as AuditLogEntry);
  }
}

/** Convenience constructor used by routes. */
export function newAuditEntry(
  newId: () => string,
  now: () => ISODateTime,
  input: {
    actorUid: string;
    actorEmail: string | null;
    action: AuditAction;
    targetId: string | null;
    metadata?: Record<string, unknown>;
  },
): AuditLogEntry {
  return {
    id: newId(),
    occurredAt: now(),
    actorUid: input.actorUid,
    actorEmail: input.actorEmail,
    action: input.action,
    targetId: input.targetId,
    metadata: input.metadata ?? {},
  };
}

/** Helper used by InMemoryAuditLogStore tests. */
export const _internal = { asISODateTime };
