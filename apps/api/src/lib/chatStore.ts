import type { Firestore } from 'firebase-admin/firestore';

export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
  timestamp: string;
}

export interface ChatSession {
  id: string;
  userId: string;
  title: string; // First user message, truncated to 50 chars
  messages: ChatMessage[];
  createdAt: string;
  updatedAt: string;
}

export interface ChatSessionSummary {
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  messageCount: number;
}

export interface ChatStore {
  createSession(userId: string, firstMessage: string): Promise<string>;
  addMessage(userId: string, sessionId: string, role: 'user' | 'assistant', content: string): Promise<void>;
  getSession(userId: string, sessionId: string): Promise<ChatSession | null>;
  getSessions(userId: string): Promise<ChatSessionSummary[]>;
  deleteSession(userId: string, sessionId: string): Promise<void>;
  deleteAllSessions(userId: string): Promise<void>;
}

// ---------- in-memory implementation ----------------------------------------

export class InMemoryChatStore implements ChatStore {
  private sessions = new Map<string, ChatSession>();

  async createSession(userId: string, firstMessage: string): Promise<string> {
    const id = crypto.randomUUID();
    const now = new Date().toISOString();
    const title = firstMessage.slice(0, 50);
    const session: ChatSession = {
      id,
      userId,
      title,
      messages: [],
      createdAt: now,
      updatedAt: now,
    };
    this.sessions.set(`${userId}:${id}`, session);
    return id;
  }

  async addMessage(userId: string, sessionId: string, role: 'user' | 'assistant', content: string): Promise<void> {
    const key = `${userId}:${sessionId}`;
    const session = this.sessions.get(key);
    if (!session) return;
    session.messages.push({ role, content, timestamp: new Date().toISOString() });
    session.updatedAt = new Date().toISOString();
  }

  async getSession(userId: string, sessionId: string): Promise<ChatSession | null> {
    return this.sessions.get(`${userId}:${sessionId}`) ?? null;
  }

  async getSessions(userId: string): Promise<ChatSessionSummary[]> {
    const results: ChatSessionSummary[] = [];
    for (const [key, session] of this.sessions) {
      if (key.startsWith(`${userId}:`)) {
        results.push({
          id: session.id,
          title: session.title,
          createdAt: session.createdAt,
          updatedAt: session.updatedAt,
          messageCount: session.messages.length,
        });
      }
    }
    return results.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  }

  async deleteSession(userId: string, sessionId: string): Promise<void> {
    this.sessions.delete(`${userId}:${sessionId}`);
  }

  async deleteAllSessions(userId: string): Promise<void> {
    for (const key of this.sessions.keys()) {
      if (key.startsWith(`${userId}:`)) {
        this.sessions.delete(key);
      }
    }
  }
}

// ---------- firestore implementation ----------------------------------------

/**
 * Chat persistence with subcollection messages (lock §3.7).
 *
 * Pre-PR-24 schema stored every message in a single `messages` array on
 * the parent doc via FieldValue.arrayUnion. That ran into Firestore's
 * 1MB hard cap at roughly 500-700 messages per session -- after that
 * chat would silently fail for that session, which is awful.
 *
 * Post-PR-24 schema:
 *   users/{uid}/chatHistory/{sessionId}                -- session metadata
 *     fields: id, userId, title, createdAt, updatedAt,
 *             messageCount (cached, for getSessions list)
 *             schemaVersion: 2 (lets the read path pick the right merge
 *                               strategy without an extra round-trip)
 *             messages? (LEGACY only -- read for backwards compat)
 *
 *   users/{uid}/chatHistory/{sessionId}/messages/{msgId}  -- one doc per message
 *     fields: role, content, timestamp, seq (monotonic per session)
 *
 * Backwards-compat read path: getSession() reads the parent doc, then if
 * schemaVersion=2 (or messageCount > messages.length) it ALSO reads the
 * subcollection and merges. Existing sessions with messages in the array
 * keep working until the user sends another message -- which writes to
 * the subcollection and bumps schemaVersion to 2 forever for that
 * session.
 *
 * No backfill required. The merge logic handles legacy + new in a single
 * read so deployment is non-disruptive.
 */
export class FirestoreChatStore implements ChatStore {
  constructor(private readonly db: Firestore) {}

  private sessionRef(userId: string, sessionId: string) {
    return this.db.collection('users').doc(userId).collection('chatHistory').doc(sessionId);
  }

  private sessionsCol(userId: string) {
    return this.db.collection('users').doc(userId).collection('chatHistory');
  }

  private messagesCol(userId: string, sessionId: string) {
    return this.sessionRef(userId, sessionId).collection('messages');
  }

  async createSession(userId: string, firstMessage: string): Promise<string> {
    const now = new Date().toISOString();
    const title = firstMessage.slice(0, 50);
    const ref = this.sessionsCol(userId).doc();
    await ref.set({
      id: ref.id,
      userId,
      title,
      messages: [],          // empty legacy array kept for backward-compat reads
      messageCount: 0,
      schemaVersion: 2,
      createdAt: now,
      updatedAt: now,
    });
    return ref.id;
  }

  async addMessage(userId: string, sessionId: string, role: 'user' | 'assistant', content: string): Promise<void> {
    // Write the message to the subcollection (1 doc per message, no 1MB
    // ceiling). Bump messageCount + updatedAt on the parent in the same
    // batch so getSessions() stays cheap.
    const sessionRef = this.sessionRef(userId, sessionId);
    const messagesCol = this.messagesCol(userId, sessionId);
    const now = new Date().toISOString();
    const { FieldValue } = await import('firebase-admin/firestore');

    const batch = this.db.batch();
    batch.create(messagesCol.doc(), {
      role,
      content,
      timestamp: now,
    });
    batch.update(sessionRef, {
      messageCount: FieldValue.increment(1),
      updatedAt: now,
      schemaVersion: 2,
    });
    await batch.commit();
  }

  async getSession(userId: string, sessionId: string): Promise<ChatSession | null> {
    const snap = await this.sessionRef(userId, sessionId).get();
    if (!snap.exists) return null;
    const data = snap.data() as ChatSession & { schemaVersion?: number; messageCount?: number };

    // Legacy in-array messages (pre-PR-24).
    const legacyMessages = Array.isArray(data.messages) ? data.messages : [];

    // New subcollection messages (post-PR-24). We always read the
    // subcollection because legacy sessions can also have new messages
    // appended to them (next call to addMessage flips schemaVersion=2).
    const msgsSnap = await this.messagesCol(userId, sessionId)
      .orderBy('timestamp', 'asc')
      .get();
    const subMessages: ChatMessage[] = msgsSnap.docs.map(d => {
      const m = d.data() as ChatMessage;
      return { role: m.role, content: m.content, timestamp: m.timestamp };
    });

    // Merge: legacy first (older), then subcollection (newer). They can't
    // overlap because legacy messages were never written to the
    // subcollection and new messages are never written to the array.
    const messages: ChatMessage[] = [...legacyMessages, ...subMessages];

    return {
      id: data.id,
      userId: data.userId,
      title: data.title,
      messages,
      createdAt: data.createdAt,
      updatedAt: data.updatedAt,
    };
  }

  async getSessions(userId: string): Promise<ChatSessionSummary[]> {
    const snap = await this.sessionsCol(userId).orderBy('updatedAt', 'desc').get();
    return snap.docs.map((d) => {
      const data = d.data() as ChatSession & { messageCount?: number };
      // Prefer the cached count (constant time); fall back to the legacy
      // array length for sessions that haven't written a new message
      // since the upgrade.
      const count = typeof data.messageCount === 'number'
        ? data.messageCount
        : (Array.isArray(data.messages) ? data.messages.length : 0);
      return {
        id: data.id,
        title: data.title,
        createdAt: data.createdAt,
        updatedAt: data.updatedAt,
        messageCount: count,
      };
    });
  }

  async deleteSession(userId: string, sessionId: string): Promise<void> {
    // Delete the messages subcollection in chunks of 400 (safe under the
    // 500-write Firestore batch cap), then the parent doc.
    const messagesCol = this.messagesCol(userId, sessionId);
    while (true) {
      const snap = await messagesCol.limit(400).get();
      if (snap.empty) break;
      const batch = this.db.batch();
      snap.docs.forEach(d => batch.delete(d.ref));
      await batch.commit();
      if (snap.size < 400) break;
    }
    await this.sessionRef(userId, sessionId).delete();
  }

  async deleteAllSessions(userId: string): Promise<void> {
    // Delete each session via deleteSession so the subcollection is
    // walked correctly. Capped read in chunks to avoid loading all
    // session metadata into memory at once.
    while (true) {
      const snap = await this.sessionsCol(userId).limit(50).get();
      if (snap.empty) break;
      for (const doc of snap.docs) {
        await this.deleteSession(userId, doc.id);
      }
      if (snap.size < 50) break;
    }
  }
}
