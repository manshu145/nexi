import type { ISODateTime, UserId } from './brand.js';

/**
 * Append-only audit log of admin and high-trust actions.
 *
 * Used for incident review, DPDP data-subject access requests, and
 * to satisfy the platform principle that nothing happens to a user
 * without a recorded reason.
 */

export type AuditAction =
  | 'verification.approve'
  | 'verification.reject'
  | 'user.suspend'
  | 'user.unsuspend'
  | 'user.delete'
  | 'mcq.publish'
  | 'mcq.unpublish'
  | 'credits.grant'
  | 'credits.revoke'
  | 'subscription.refund'
  | 'announcement.broadcast';

export interface AuditLogEntry {
  id: string;
  /** Admin user who performed the action. */
  actorUid: string;
  /** Affected user, if applicable. */
  targetUserId: UserId | null;
  action: AuditAction;
  /** Free-form, human-readable description. */
  reason: string;
  /** Action-specific structured payload (JSON-safe). */
  metadata: Record<string, unknown>;
  /** Source IP hash (we do not store raw IPs). */
  actorIpHash: string;
  occurredAt: ISODateTime;
}
