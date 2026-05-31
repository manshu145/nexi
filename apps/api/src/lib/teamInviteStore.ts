/**
 * Team invite store (PR-40 — admin RBAC scaffolding).
 *
 * Founder lock (one of the original 5-phase decisions, §3.6):
 *   "abhi koi team nhi hai sirf mai hu ek hi rahega. ab access dene
 *    ka option de dena"
 *
 * The founder is solo today but wants the OPTION to delegate access to
 * future co-founders, content moderators, support agents, and finance
 * admins. This file stores pending invitations that haven't yet been
 * accepted by signing in. Once the invitee signs in (first time or
 * any future time), the /me handler checks for a matching pending
 * invite by email and auto-applies the admin role.
 *
 * Schema:
 *   teamInvites/{email}  → {
 *     email, adminRole, invitedBy, invitedAt, expiresAt,
 *     status: 'pending' | 'accepted' | 'revoked',
 *     acceptedAt?, acceptedByUid?
 *   }
 *
 * The doc id IS the lower-cased email so duplicate invites for the
 * same email collapse into a single row (most-recent wins). Easier to
 * reason about than a uuid + email-index combo.
 *
 * Trust model: only `super_admin` callers can write to this store.
 * The /me handler reads it via the admin SDK (server-side) so a
 * malicious client can't poke at someone else's invite status.
 */

import type { Firestore } from 'firebase-admin/firestore';

/**
 * Granular admin roles. `super_admin` is the founder / co-founders —
 * full god-mode. The other three are scoped views for future delegation.
 *
 * Today the route handlers don't enforce per-route permissions; any
 * admin role passes the binary admin gate. Per-role enforcement is a
 * follow-up — this PR ships the data shape so future route handlers
 * can check `principal.adminRole === 'finance'` etc. without a schema
 * migration.
 */
export type AdminRole = 'super_admin' | 'content' | 'support' | 'finance';

export const ADMIN_ROLE_LABELS: Record<AdminRole, string> = {
  super_admin: 'Super Admin (full access)',
  content: 'Content Admin (blog / news / announcements)',
  support: 'Support Admin (users / support tickets)',
  finance: 'Finance Admin (billing / coupons / plans)',
};

export interface TeamInvite {
  email: string;
  adminRole: AdminRole;
  invitedBy: string;
  invitedAt: string;
  expiresAt: string;
  status: 'pending' | 'accepted' | 'revoked';
  acceptedAt?: string;
  acceptedByUid?: string;
}

export interface TeamInviteStore {
  /** List all invites (any status) sorted by most-recently invited. */
  list(): Promise<TeamInvite[]>;
  /** Fetch the most recent invite for a given email (lower-cased). */
  getByEmail(email: string): Promise<TeamInvite | null>;
  /**
   * Create OR update an invite. Same email overwrites the previous
   * entry — the most recent role + invitation timestamp wins. Returns
   * the persisted invite.
   */
  upsert(invite: TeamInvite): Promise<TeamInvite>;
  /** Mark an invite as accepted. Called from the /me handler. */
  markAccepted(email: string, uid: string): Promise<TeamInvite | null>;
  /** Mark an invite as revoked. Called when admin removes a team member. */
  revoke(email: string): Promise<void>;
}

const COLLECTION = 'teamInvites';

/**
 * In-memory implementation — only used in tests + local dev when
 * Firestore is unavailable.
 */
export class InMemoryTeamInviteStore implements TeamInviteStore {
  private docs = new Map<string, TeamInvite>();

  async list(): Promise<TeamInvite[]> {
    return [...this.docs.values()].sort((a, b) => (b.invitedAt ?? '').localeCompare(a.invitedAt ?? ''));
  }

  async getByEmail(email: string): Promise<TeamInvite | null> {
    return this.docs.get(email.toLowerCase().trim()) ?? null;
  }

  async upsert(invite: TeamInvite): Promise<TeamInvite> {
    const key = invite.email.toLowerCase().trim();
    const next = { ...invite, email: key };
    this.docs.set(key, next);
    return next;
  }

  async markAccepted(email: string, uid: string): Promise<TeamInvite | null> {
    const key = email.toLowerCase().trim();
    const existing = this.docs.get(key);
    if (!existing) return null;
    const next: TeamInvite = {
      ...existing,
      status: 'accepted',
      acceptedAt: new Date().toISOString(),
      acceptedByUid: uid,
    };
    this.docs.set(key, next);
    return next;
  }

  async revoke(email: string): Promise<void> {
    const key = email.toLowerCase().trim();
    const existing = this.docs.get(key);
    if (existing) {
      this.docs.set(key, { ...existing, status: 'revoked' });
    }
  }
}

export class FirestoreTeamInviteStore implements TeamInviteStore {
  constructor(private readonly db: Firestore) {}

  private collection() {
    return this.db.collection(COLLECTION);
  }

  async list(): Promise<TeamInvite[]> {
    // No orderBy to dodge the composite-index pitfall (PR-35 lesson) —
    // team invite count is bounded (a handful of admins for the
    // foreseeable future), so JS sort is fine.
    const snap = await this.collection().limit(200).get();
    return snap.docs
      .map(d => d.data() as TeamInvite)
      .sort((a, b) => (b.invitedAt ?? '').localeCompare(a.invitedAt ?? ''));
  }

  async getByEmail(email: string): Promise<TeamInvite | null> {
    const snap = await this.collection().doc(email.toLowerCase().trim()).get();
    return snap.exists ? (snap.data() as TeamInvite) : null;
  }

  async upsert(invite: TeamInvite): Promise<TeamInvite> {
    const key = invite.email.toLowerCase().trim();
    const next = { ...invite, email: key };
    await this.collection().doc(key).set(next, { merge: false });
    return next;
  }

  async markAccepted(email: string, uid: string): Promise<TeamInvite | null> {
    const key = email.toLowerCase().trim();
    const ref = this.collection().doc(key);
    const snap = await ref.get();
    if (!snap.exists) return null;
    const existing = snap.data() as TeamInvite;
    if (existing.status === 'accepted') return existing; // idempotent
    if (existing.status === 'revoked') return existing; // never auto-elevate after revoke
    const next: TeamInvite = {
      ...existing,
      status: 'accepted',
      acceptedAt: new Date().toISOString(),
      acceptedByUid: uid,
    };
    await ref.set(next);
    return next;
  }

  async revoke(email: string): Promise<void> {
    const key = email.toLowerCase().trim();
    await this.collection().doc(key).set({ status: 'revoked' }, { merge: true });
  }
}
