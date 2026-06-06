/**
 * Email mailbox — threaded two-way conversations.
 *
 * Outbound emails (admin → user) and inbound replies (user → support@,
 * delivered via a Resend Inbound webhook) are grouped into THREADS so the
 * admin can hold a real conversation, not just blast one-way emails.
 *
 * Firestore layout:
 *   emailThreads/{threadId}                     -- thread metadata
 *   emailThreads/{threadId}/messages/{msgId}    -- each message
 *   emailMsgIndex/{providerMessageId}           -- {threadId,msgId} reverse
 *                                                  lookup so a delivery
 *                                                  webhook can update the
 *                                                  right message without a
 *                                                  collectionGroup index.
 */

import type { Firestore } from 'firebase-admin/firestore';

export type MessageDirection = 'inbound' | 'outbound';
export type MessageStatus = 'sent' | 'delivered' | 'opened' | 'clicked' | 'bounced' | 'failed';
export type ThreadStatus = 'open' | 'closed';

export interface EmailMessage {
  id: string;
  direction: MessageDirection;
  from: string;
  to: string;
  subject: string;
  text: string;
  html?: string;
  /** Provider (Resend) message id for outbound; Message-ID header for inbound. */
  messageId?: string;
  status?: MessageStatus;
  /** Admin email that sent an outbound reply (audit). */
  authorAdminEmail?: string;
  createdAt: string;
}

export interface EmailThread {
  id: string;
  participantEmail: string;
  participantName?: string;
  subject: string;
  status: ThreadStatus;
  /** True when the latest inbound message hasn't been opened by an admin. */
  unreadByAdmin: boolean;
  lastMessageAt: string;
  lastDirection: MessageDirection;
  preview: string;
  createdAt: string;
}

export interface EmailThreadStore {
  listThreads(opts?: { status?: ThreadStatus; limit?: number }): Promise<EmailThread[]>;
  getThread(threadId: string): Promise<{ thread: EmailThread; messages: EmailMessage[] } | null>;
  createThread(input: { participantEmail: string; participantName?: string; subject: string }): Promise<EmailThread>;
  findOpenThreadByEmail(email: string): Promise<EmailThread | null>;
  appendMessage(threadId: string, msg: Omit<EmailMessage, 'id' | 'createdAt'>): Promise<EmailMessage>;
  markRead(threadId: string): Promise<void>;
  setStatus(threadId: string, status: ThreadStatus): Promise<void>;
  unreadCount(): Promise<number>;
  /** Update a message's delivery status via its provider messageId (webhook). */
  updateMessageStatusByMessageId(messageId: string, status: MessageStatus): Promise<void>;
}

function id(prefix: string): string {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function previewOf(text: string): string {
  return (text || '').replace(/\s+/g, ' ').trim().slice(0, 140);
}

// ─── Firestore ──────────────────────────────────────────────────────────────

export class FirestoreEmailThreadStore implements EmailThreadStore {
  constructor(private readonly db: Firestore) {}

  async listThreads(opts?: { status?: ThreadStatus; limit?: number }): Promise<EmailThread[]> {
    let q = this.db.collection('emailThreads').orderBy('lastMessageAt', 'desc').limit(opts?.limit ?? 50);
    // status filter applied in-memory to avoid a composite index (status + order).
    const snap = await q.get();
    let rows = snap.docs.map(d => d.data() as EmailThread);
    if (opts?.status) rows = rows.filter(t => t.status === opts.status);
    return rows;
  }

  async getThread(threadId: string): Promise<{ thread: EmailThread; messages: EmailMessage[] } | null> {
    const doc = await this.db.collection('emailThreads').doc(threadId).get();
    if (!doc.exists) return null;
    const msgs = await this.db.collection('emailThreads').doc(threadId).collection('messages').orderBy('createdAt', 'asc').limit(200).get();
    return { thread: doc.data() as EmailThread, messages: msgs.docs.map(d => d.data() as EmailMessage) };
  }

  async createThread(input: { participantEmail: string; participantName?: string; subject: string }): Promise<EmailThread> {
    const now = new Date().toISOString();
    const thread: EmailThread = {
      id: id('th'),
      participantEmail: input.participantEmail.toLowerCase(),
      ...(input.participantName ? { participantName: input.participantName } : {}),
      subject: input.subject,
      status: 'open',
      unreadByAdmin: false,
      lastMessageAt: now,
      lastDirection: 'outbound',
      preview: '',
      createdAt: now,
    };
    await this.db.collection('emailThreads').doc(thread.id).set(thread);
    return thread;
  }

  async findOpenThreadByEmail(email: string): Promise<EmailThread | null> {
    const snap = await this.db.collection('emailThreads')
      .where('participantEmail', '==', email.toLowerCase())
      .limit(10).get();
    if (snap.empty) return null;
    // Newest open thread first.
    const rows = snap.docs.map(d => d.data() as EmailThread)
      .filter(t => t.status === 'open')
      .sort((a, b) => b.lastMessageAt.localeCompare(a.lastMessageAt));
    return rows[0] ?? null;
  }

  async appendMessage(threadId: string, msg: Omit<EmailMessage, 'id' | 'createdAt'>): Promise<EmailMessage> {
    const now = new Date().toISOString();
    const message: EmailMessage = { ...msg, id: id('msg'), createdAt: now };
    const threadRef = this.db.collection('emailThreads').doc(threadId);
    await threadRef.collection('messages').doc(message.id).set(message);
    await threadRef.set({
      lastMessageAt: now,
      lastDirection: message.direction,
      preview: previewOf(message.text),
      // Inbound message => unread for admin; outbound (admin reply) clears it.
      unreadByAdmin: message.direction === 'inbound',
      status: 'open', // any new activity re-opens
    }, { merge: true });
    if (message.messageId) {
      await this.db.collection('emailMsgIndex').doc(message.messageId).set({ threadId, msgId: message.id });
    }
    return message;
  }

  async markRead(threadId: string): Promise<void> {
    await this.db.collection('emailThreads').doc(threadId).set({ unreadByAdmin: false }, { merge: true });
  }

  async setStatus(threadId: string, status: ThreadStatus): Promise<void> {
    await this.db.collection('emailThreads').doc(threadId).set({ status }, { merge: true });
  }

  async unreadCount(): Promise<number> {
    const snap = await this.db.collection('emailThreads').where('unreadByAdmin', '==', true).limit(50).get();
    return snap.size;
  }

  async updateMessageStatusByMessageId(messageId: string, status: MessageStatus): Promise<void> {
    const idx = await this.db.collection('emailMsgIndex').doc(messageId).get();
    if (!idx.exists) return;
    const { threadId, msgId } = idx.data() as { threadId: string; msgId: string };
    await this.db.collection('emailThreads').doc(threadId).collection('messages').doc(msgId).set({ status }, { merge: true });
  }
}

// ─── In-memory ────────────────────────────────────────────────────────────

export class InMemoryEmailThreadStore implements EmailThreadStore {
  private threads = new Map<string, EmailThread>();
  private messages = new Map<string, EmailMessage[]>();
  private msgIndex = new Map<string, { threadId: string; msgId: string }>();

  async listThreads(opts?: { status?: ThreadStatus; limit?: number }): Promise<EmailThread[]> {
    let rows = Array.from(this.threads.values()).sort((a, b) => b.lastMessageAt.localeCompare(a.lastMessageAt));
    if (opts?.status) rows = rows.filter(t => t.status === opts.status);
    return rows.slice(0, opts?.limit ?? 50);
  }

  async getThread(threadId: string) {
    const thread = this.threads.get(threadId);
    if (!thread) return null;
    return { thread, messages: (this.messages.get(threadId) ?? []).slice() };
  }

  async createThread(input: { participantEmail: string; participantName?: string; subject: string }): Promise<EmailThread> {
    const now = new Date().toISOString();
    const thread: EmailThread = {
      id: id('th'), participantEmail: input.participantEmail.toLowerCase(),
      ...(input.participantName ? { participantName: input.participantName } : {}),
      subject: input.subject, status: 'open', unreadByAdmin: false,
      lastMessageAt: now, lastDirection: 'outbound', preview: '', createdAt: now,
    };
    this.threads.set(thread.id, thread);
    this.messages.set(thread.id, []);
    return thread;
  }

  async findOpenThreadByEmail(email: string): Promise<EmailThread | null> {
    return Array.from(this.threads.values())
      .filter(t => t.participantEmail === email.toLowerCase() && t.status === 'open')
      .sort((a, b) => b.lastMessageAt.localeCompare(a.lastMessageAt))[0] ?? null;
  }

  async appendMessage(threadId: string, msg: Omit<EmailMessage, 'id' | 'createdAt'>): Promise<EmailMessage> {
    const now = new Date().toISOString();
    const message: EmailMessage = { ...msg, id: id('msg'), createdAt: now };
    const arr = this.messages.get(threadId) ?? [];
    arr.push(message);
    this.messages.set(threadId, arr);
    const t = this.threads.get(threadId);
    if (t) {
      t.lastMessageAt = now; t.lastDirection = message.direction;
      t.preview = previewOf(message.text); t.unreadByAdmin = message.direction === 'inbound'; t.status = 'open';
    }
    if (message.messageId) this.msgIndex.set(message.messageId, { threadId, msgId: message.id });
    return message;
  }

  async markRead(threadId: string): Promise<void> { const t = this.threads.get(threadId); if (t) t.unreadByAdmin = false; }
  async setStatus(threadId: string, status: ThreadStatus): Promise<void> { const t = this.threads.get(threadId); if (t) t.status = status; }
  async unreadCount(): Promise<number> { return Array.from(this.threads.values()).filter(t => t.unreadByAdmin).length; }
  async updateMessageStatusByMessageId(messageId: string, status: MessageStatus): Promise<void> {
    const ref = this.msgIndex.get(messageId); if (!ref) return;
    const arr = this.messages.get(ref.threadId) ?? [];
    const m = arr.find(x => x.id === ref.msgId); if (m) m.status = status;
  }
}
