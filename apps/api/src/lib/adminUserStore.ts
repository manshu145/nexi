import type { Firestore } from 'firebase-admin/firestore';
import { asISODateTime, type ISODateTime } from '@nexigrate/shared';

/**
 * Admin RBAC -- persistence and role definitions.
 *
 * `super_admin` is bootstrapped via env.SUPER_ADMIN_EMAIL and is NOT stored
 * here (so it can never be accidentally revoked). Every other admin lives
 * in Firestore `admin_users/{uid}` with one of the roles below.
 *
 * Role hierarchy (higher includes lower):
 *
 *   super_admin    Manage admins, refund subscriptions, delete users.
 *   admin          Full panel except admin management.
 *   content_admin  MCQ drafts approve/reject + content CMS.
 *   support_admin  Read-only user search, refund credits.
 *
 * The hierarchy is enforced by `roleAtLeast`: a route that requires
 * `content_admin` accepts `content_admin`, `admin`, or `super_admin`.
 */

export type AdminRole = 'super_admin' | 'admin' | 'content_admin' | 'support_admin';

const ROLE_RANK: Record<AdminRole, number> = {
  support_admin: 10,
  content_admin: 20,
  admin: 30,
  super_admin: 40,
};

export function roleAtLeast(have: AdminRole, want: AdminRole): boolean {
  return ROLE_RANK[have] >= ROLE_RANK[want];
}

export function isAdminRole(s: string): s is AdminRole {
  return s === 'super_admin' || s === 'admin' || s === 'content_admin' || s === 'support_admin';
}

export interface AdminUser {
  uid: string;
  email: string;
  role: AdminRole;
  isActive: boolean;
  /** uid of the super_admin who minted this admin; null for env-bootstrapped. */
  createdBy: string | null;
  createdAt: ISODateTime;
  /** Last refresh of an authenticated request that resolved to this admin. */
  lastSeenAt: ISODateTime | null;
}

const COLLECTION = 'admin_users';

export interface AdminUserStore {
  get(uid: string): Promise<AdminUser | null>;
  getByEmail(email: string): Promise<AdminUser | null>;
  put(user: AdminUser): Promise<void>;
  list(): Promise<AdminUser[]>;
  /** Soft delete: marks isActive=false. Returns updated record. */
  disable(uid: string): Promise<AdminUser | null>;
  /** Best-effort touch of lastSeenAt; no-op on missing or in-flight failures. */
  touchSeen(uid: string): Promise<void>;
}

export class InMemoryAdminUserStore implements AdminUserStore {
  private readonly byUid = new Map<string, AdminUser>();

  async get(uid: string): Promise<AdminUser | null> {
    return this.byUid.get(uid) ?? null;
  }

  async getByEmail(email: string): Promise<AdminUser | null> {
    const e = email.toLowerCase();
    for (const u of this.byUid.values()) {
      if (u.email.toLowerCase() === e) return u;
    }
    return null;
  }

  async put(user: AdminUser): Promise<void> {
    this.byUid.set(user.uid, { ...user, email: user.email.toLowerCase() });
  }

  async list(): Promise<AdminUser[]> {
    return Array.from(this.byUid.values()).map((u) => ({ ...u }));
  }

  async disable(uid: string): Promise<AdminUser | null> {
    const u = this.byUid.get(uid);
    if (!u) return null;
    const updated: AdminUser = { ...u, isActive: false };
    this.byUid.set(uid, updated);
    return updated;
  }

  async touchSeen(uid: string): Promise<void> {
    const u = this.byUid.get(uid);
    if (!u) return;
    u.lastSeenAt = asISODateTime(new Date().toISOString());
  }
}

export class FirestoreAdminUserStore implements AdminUserStore {
  constructor(private readonly db: Firestore) {}

  async get(uid: string): Promise<AdminUser | null> {
    const snap = await this.db.collection(COLLECTION).doc(uid).get();
    return snap.exists ? (snap.data() as AdminUser) : null;
  }

  async getByEmail(email: string): Promise<AdminUser | null> {
    const e = email.toLowerCase();
    const snap = await this.db.collection(COLLECTION).where('email', '==', e).limit(1).get();
    return snap.empty ? null : (snap.docs[0]!.data() as AdminUser);
  }

  async put(user: AdminUser): Promise<void> {
    await this.db
      .collection(COLLECTION)
      .doc(user.uid)
      .set({ ...user, email: user.email.toLowerCase() });
  }

  async list(): Promise<AdminUser[]> {
    const snap = await this.db.collection(COLLECTION).orderBy('createdAt', 'desc').get();
    return snap.docs.map((d) => d.data() as AdminUser);
  }

  async disable(uid: string): Promise<AdminUser | null> {
    const ref = this.db.collection(COLLECTION).doc(uid);
    return await this.db.runTransaction(async (tx) => {
      const snap = await tx.get(ref);
      if (!snap.exists) return null;
      const cur = snap.data() as AdminUser;
      const updated: AdminUser = { ...cur, isActive: false };
      tx.set(ref, updated);
      return updated;
    });
  }

  async touchSeen(uid: string): Promise<void> {
    try {
      await this.db
        .collection(COLLECTION)
        .doc(uid)
        .update({ lastSeenAt: new Date().toISOString() });
    } catch {
      // best-effort; never throw on a hot-path
    }
  }
}
