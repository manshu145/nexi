/**
 * Phase 21 — Stores for announcements, broadcasts, and support tickets.
 */
import type { Firestore } from 'firebase-admin/firestore';
import type {
  Announcement,
  AnnouncementSummary,
  Broadcast,
  BroadcastSummary,
  SupportTicket,
  TicketMessage,
  TicketWithMessages,
} from '@nexigrate/shared';

/* ═══════════════════════════════════════════════════════════════════════
   Announcement Store
   ═══════════════════════════════════════════════════════════════════════ */

export interface AnnouncementStore {
  create(a: Announcement): Promise<void>;
  get(id: string): Promise<Announcement | null>;
  list(opts: { limit?: number; onlyActive?: boolean }): Promise<AnnouncementSummary[]>;
  update(id: string, patch: Partial<Announcement>): Promise<void>;
  delete(id: string): Promise<void>;
  /** Active announcements for a specific user's targetExam. */
  listForStudent(targetExam: string): Promise<AnnouncementSummary[]>;
}

export class InMemoryAnnouncementStore implements AnnouncementStore {
  private items: Announcement[] = [];

  async create(a: Announcement) {
    this.items.push(a);
  }
  async get(id: string) {
    return this.items.find((x) => x.id === id) ?? null;
  }
  async list({ limit = 50, onlyActive }: { limit?: number; onlyActive?: boolean }) {
    let rows = [...this.items].sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
    );
    if (onlyActive) rows = rows.filter((r) => r.isActive);
    return rows.slice(0, limit).map(toSummary);
  }
  async update(id: string, patch: Partial<Announcement>) {
    const idx = this.items.findIndex((x) => x.id === id);
    if (idx >= 0) Object.assign(this.items[idx]!, patch);
  }
  async delete(id: string) {
    this.items = this.items.filter((x) => x.id !== id);
  }
  async listForStudent(targetExam: string) {
    const now = new Date().toISOString();
    return this.items
      .filter(
        (a) =>
          a.isActive &&
          (a.audience === 'all' || a.audienceExam === targetExam) &&
          (!a.expiresAt || a.expiresAt > now),
      )
      .sort((a, b) => new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime())
      .slice(0, 10)
      .map(toSummary);
  }
}

export class FirestoreAnnouncementStore implements AnnouncementStore {
  private col;
  constructor(private db: Firestore) {
    this.col = db.collection('announcements');
  }
  async create(a: Announcement) {
    await this.col.doc(a.id).set(a);
  }
  async get(id: string) {
    const doc = await this.col.doc(id).get();
    return doc.exists ? (doc.data() as Announcement) : null;
  }
  async list({ limit = 50, onlyActive }: { limit?: number; onlyActive?: boolean }) {
    let q: FirebaseFirestore.Query = this.col.orderBy('createdAt', 'desc').limit(limit);
    if (onlyActive) q = q.where('isActive', '==', true);
    const snap = await q.get();
    return snap.docs.map((d) => toSummary(d.data() as Announcement));
  }
  async update(id: string, patch: Partial<Announcement>) {
    await this.col.doc(id).update(patch);
  }
  async delete(id: string) {
    await this.col.doc(id).delete();
  }
  async listForStudent(targetExam: string) {
    // Fetch all active, filter client-side for audience + expiry.
    const snap = await this.col
      .where('isActive', '==', true)
      .orderBy('publishedAt', 'desc')
      .limit(20)
      .get();
    const now = new Date().toISOString();
    return snap.docs
      .map((d) => d.data() as Announcement)
      .filter(
        (a) =>
          (a.audience === 'all' || a.audienceExam === targetExam) &&
          (!a.expiresAt || a.expiresAt > now),
      )
      .slice(0, 10)
      .map(toSummary);
  }
}

function toSummary(a: Announcement): AnnouncementSummary {
  return {
    id: a.id,
    type: a.type,
    title: a.title,
    body: a.body,
    publishedAt: a.publishedAt,
    expiresAt: a.expiresAt,
    isActive: a.isActive,
  };
}

/* ═══════════════════════════════════════════════════════════════════════
   Broadcast Store
   ═══════════════════════════════════════════════════════════════════════ */

export interface BroadcastStore {
  create(b: Broadcast): Promise<void>;
  get(id: string): Promise<Broadcast | null>;
  list(opts: { limit?: number }): Promise<BroadcastSummary[]>;
  update(id: string, patch: Partial<Broadcast>): Promise<void>;
}

export class InMemoryBroadcastStore implements BroadcastStore {
  private items: Broadcast[] = [];

  async create(b: Broadcast) {
    this.items.push(b);
  }
  async get(id: string) {
    return this.items.find((x) => x.id === id) ?? null;
  }
  async list({ limit = 50 }) {
    return [...this.items]
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
      .slice(0, limit)
      .map(toBroadcastSummary);
  }
  async update(id: string, patch: Partial<Broadcast>) {
    const idx = this.items.findIndex((x) => x.id === id);
    if (idx >= 0) Object.assign(this.items[idx]!, patch);
  }
}

export class FirestoreBroadcastStore implements BroadcastStore {
  private col;
  constructor(private db: Firestore) {
    this.col = db.collection('broadcasts');
  }
  async create(b: Broadcast) {
    await this.col.doc(b.id).set(b);
  }
  async get(id: string) {
    const doc = await this.col.doc(id).get();
    return doc.exists ? (doc.data() as Broadcast) : null;
  }
  async list({ limit = 50 }) {
    const snap = await this.col.orderBy('createdAt', 'desc').limit(limit).get();
    return snap.docs.map((d) => toBroadcastSummary(d.data() as Broadcast));
  }
  async update(id: string, patch: Partial<Broadcast>) {
    await this.col.doc(id).update(patch);
  }
}

function toBroadcastSummary(b: Broadcast): BroadcastSummary {
  return {
    id: b.id,
    channel: b.channel,
    subject: b.subject,
    status: b.status,
    recipientCount: b.recipientCount,
    createdAt: b.createdAt,
  };
}

/* ═══════════════════════════════════════════════════════════════════════
   Ticket Store
   ═══════════════════════════════════════════════════════════════════════ */

export interface TicketStore {
  create(t: SupportTicket): Promise<void>;
  get(id: string): Promise<SupportTicket | null>;
  getWithMessages(id: string): Promise<TicketWithMessages | null>;
  listForUser(userId: string): Promise<SupportTicket[]>;
  listAll(opts: { status?: string; limit?: number }): Promise<SupportTicket[]>;
  update(id: string, patch: Partial<SupportTicket>): Promise<void>;
  addMessage(msg: TicketMessage): Promise<void>;
}

export class InMemoryTicketStore implements TicketStore {
  private tickets: SupportTicket[] = [];
  private messages: TicketMessage[] = [];

  async create(t: SupportTicket) {
    this.tickets.push(t);
  }
  async get(id: string) {
    return this.tickets.find((x) => x.id === id) ?? null;
  }
  async getWithMessages(id: string) {
    const t = this.tickets.find((x) => x.id === id);
    if (!t) return null;
    const msgs = this.messages
      .filter((m) => m.ticketId === id)
      .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
    return { ...t, messages: msgs };
  }
  async listForUser(userId: string) {
    return this.tickets
      .filter((t) => t.userId === userId)
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }
  async listAll({ status, limit = 50 }: { status?: string; limit?: number }) {
    let rows = [...this.tickets].sort(
      (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime(),
    );
    if (status) rows = rows.filter((t) => t.status === status);
    return rows.slice(0, limit);
  }
  async update(id: string, patch: Partial<SupportTicket>) {
    const idx = this.tickets.findIndex((x) => x.id === id);
    if (idx >= 0) Object.assign(this.tickets[idx]!, patch);
  }
  async addMessage(msg: TicketMessage) {
    this.messages.push(msg);
  }
}

export class FirestoreTicketStore implements TicketStore {
  private col;
  constructor(private db: Firestore) {
    this.col = db.collection('support_tickets');
  }
  async create(t: SupportTicket) {
    await this.col.doc(t.id).set(t);
  }
  async get(id: string) {
    const doc = await this.col.doc(id).get();
    return doc.exists ? (doc.data() as SupportTicket) : null;
  }
  async getWithMessages(id: string) {
    const t = await this.get(id);
    if (!t) return null;
    const snap = await this.col
      .doc(id)
      .collection('messages')
      .orderBy('createdAt', 'asc')
      .get();
    const messages = snap.docs.map((d) => d.data() as TicketMessage);
    return { ...t, messages };
  }
  async listForUser(userId: string) {
    const snap = await this.col
      .where('userId', '==', userId)
      .orderBy('createdAt', 'desc')
      .limit(20)
      .get();
    return snap.docs.map((d) => d.data() as SupportTicket);
  }
  async listAll({ status, limit = 50 }: { status?: string; limit?: number }) {
    let q: FirebaseFirestore.Query = this.col.orderBy('updatedAt', 'desc').limit(limit);
    if (status) q = q.where('status', '==', status);
    const snap = await q.get();
    return snap.docs.map((d) => d.data() as SupportTicket);
  }
  async update(id: string, patch: Partial<SupportTicket>) {
    await this.col.doc(id).update(patch);
  }
  async addMessage(msg: TicketMessage) {
    await this.col.doc(msg.ticketId).collection('messages').doc(msg.id).set(msg);
  }
}
