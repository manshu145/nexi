import type { Firestore } from 'firebase-admin/firestore';
import type { ISODateTime } from '@nexigrate/shared';
import { asISODateTime } from '@nexigrate/shared';

export interface TeamInvite {
  id: string;
  email: string;
  role: 'admin' | 'editor' | 'viewer';
  invitedBy: string;
  acceptedAt?: ISODateTime | null;
  createdAt: ISODateTime;
}

export interface TeamInviteStore {
  list(): Promise<TeamInvite[]>;
  create(invite: Omit<TeamInvite, 'id' | 'createdAt'>): Promise<TeamInvite>;
  revoke(id: string): Promise<void>;
  findByEmail(email: string): Promise<TeamInvite | null>;
}

export class InMemoryTeamInviteStore implements TeamInviteStore {
  private invites: TeamInvite[] = [];

  async list() { return this.invites; }

  async create(invite: Omit<TeamInvite, 'id' | 'createdAt'>) {
    const entry: TeamInvite = {
      ...invite,
      id: crypto.randomUUID(),
      createdAt: asISODateTime(new Date().toISOString()),
    };
    this.invites.push(entry);
    return entry;
  }

  async revoke(id: string) {
    this.invites = this.invites.filter(i => i.id !== id);
  }

  async findByEmail(email: string) {
    return this.invites.find(i => i.email.toLowerCase() === email.toLowerCase() && !i.acceptedAt) ?? null;
  }
}

export class FirestoreTeamInviteStore implements TeamInviteStore {
  constructor(private readonly db: Firestore) {}

  async list() {
    const snap = await this.db.collection('teamInvites').orderBy('createdAt', 'desc').limit(100).get();
    return snap.docs.map(d => ({ id: d.id, ...d.data() }) as TeamInvite);
  }

  async create(invite: Omit<TeamInvite, 'id' | 'createdAt'>) {
    const entry: Omit<TeamInvite, 'id'> = {
      ...invite,
      createdAt: asISODateTime(new Date().toISOString()),
    };
    const ref = await this.db.collection('teamInvites').add(entry);
    return { id: ref.id, ...entry };
  }

  async revoke(id: string) {
    await this.db.collection('teamInvites').doc(id).delete();
  }

  async findByEmail(email: string) {
    const snap = await this.db.collection('teamInvites')
      .where('email', '==', email.toLowerCase())
      .limit(1)
      .get();
    if (snap.empty) return null;
    const doc = snap.docs[0]!;
    const data = doc.data() as Omit<TeamInvite, 'id'>;
    if (data.acceptedAt) return null;
    return { id: doc.id, ...data };
  }
}
