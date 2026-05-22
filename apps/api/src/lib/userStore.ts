import { Firestore } from 'firebase-admin/firestore';
import {
  asISODateTime,
  type ExamSlug,
  type User,
  type UserId,
} from '@nexigrate/shared';

/**
 * User persistence.
 *
 * The `getOrCreate` method is the side door used by `GET /v1/users/me`:
 * the very first time a freshly-signed-in user hits any v1 endpoint, the
 * user document is created from their Firebase token claims. We avoid
 * a separate "register" endpoint because the only authoritative identity
 * is the Firebase token; everything else is bookkeeping.
 */

export interface UserStoreInit {
  email: string;
  name: string;
  photoPath: string | null;
  primaryProvider: 'google' | 'phone';
}

/** A `User` with the additional `targetExam` field stored on the same doc. */
export type StoredUser = User & { targetExam?: ExamSlug | null };

export interface UserStore {
  getOrCreate(uid: UserId, init: UserStoreInit): Promise<StoredUser>;
  get(uid: UserId): Promise<StoredUser | null>;
  setTargetExam(uid: UserId, exam: ExamSlug): Promise<StoredUser>;
}

function newUser(uid: UserId, init: UserStoreInit, now: string): StoredUser {
  return {
    id: uid,
    firebaseUid: uid,
    email: init.email,
    phone: null,
    name: init.name,
    photoPath: init.photoPath,
    primaryProvider: init.primaryProvider,
    isAdmin: false,
    isVerified: false,
    isMinor: false,
    locale: 'en-IN',
    createdAt: asISODateTime(now),
    updatedAt: asISODateTime(now),
    deletedAt: null,
    targetExam: null,
  };
}

export class InMemoryUserStore implements UserStore {
  private users = new Map<UserId, StoredUser>();

  async getOrCreate(uid: UserId, init: UserStoreInit): Promise<StoredUser> {
    const existing = this.users.get(uid);
    if (existing) return existing;
    const u = newUser(uid, init, new Date().toISOString());
    this.users.set(uid, u);
    return u;
  }

  async get(uid: UserId): Promise<StoredUser | null> {
    return this.users.get(uid) ?? null;
  }

  async setTargetExam(uid: UserId, exam: ExamSlug): Promise<StoredUser> {
    const u = this.users.get(uid);
    if (!u) throw new Error(`user ${uid} not found`);
    const updated: StoredUser = {
      ...u,
      targetExam: exam,
      updatedAt: asISODateTime(new Date().toISOString()),
    };
    this.users.set(uid, updated);
    return updated;
  }
}

const COLLECTION = 'users';

export class FirestoreUserStore implements UserStore {
  constructor(private readonly db: Firestore) {}

  async getOrCreate(uid: UserId, init: UserStoreInit): Promise<StoredUser> {
    const ref = this.db.collection(COLLECTION).doc(uid);
    const snap = await ref.get();
    if (snap.exists) return snap.data() as StoredUser;
    const u = newUser(uid, init, new Date().toISOString());
    await ref.set(u);
    return u;
  }

  async get(uid: UserId): Promise<StoredUser | null> {
    const snap = await this.db.collection(COLLECTION).doc(uid).get();
    if (!snap.exists) return null;
    return snap.data() as StoredUser;
  }

  async setTargetExam(uid: UserId, exam: ExamSlug): Promise<StoredUser> {
    const ref = this.db.collection(COLLECTION).doc(uid);
    await ref.set(
      { targetExam: exam, updatedAt: new Date().toISOString() },
      { merge: true },
    );
    const snap = await ref.get();
    return snap.data() as StoredUser;
  }
}
