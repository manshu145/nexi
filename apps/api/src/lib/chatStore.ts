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

export class FirestoreChatStore implements ChatStore {
  constructor(private readonly db: Firestore) {}

  private sessionRef(userId: string, sessionId: string) {
    return this.db.collection('users').doc(userId).collection('chatHistory').doc(sessionId);
  }

  private sessionsCol(userId: string) {
    return this.db.collection('users').doc(userId).collection('chatHistory');
  }

  async createSession(userId: string, firstMessage: string): Promise<string> {
    const now = new Date().toISOString();
    const title = firstMessage.slice(0, 50);
    const ref = this.sessionsCol(userId).doc();
    await ref.set({
      id: ref.id,
      userId,
      title,
      messages: [],
      createdAt: now,
      updatedAt: now,
    });
    return ref.id;
  }

  async addMessage(userId: string, sessionId: string, role: 'user' | 'assistant', content: string): Promise<void> {
    const ref = this.sessionRef(userId, sessionId);
    const now = new Date().toISOString();
    const { FieldValue } = await import('firebase-admin/firestore');
    await ref.update({
      messages: FieldValue.arrayUnion({ role, content, timestamp: now }),
      updatedAt: now,
    });
  }

  async getSession(userId: string, sessionId: string): Promise<ChatSession | null> {
    const snap = await this.sessionRef(userId, sessionId).get();
    if (!snap.exists) return null;
    return snap.data() as ChatSession;
  }

  async getSessions(userId: string): Promise<ChatSessionSummary[]> {
    const snap = await this.sessionsCol(userId).orderBy('updatedAt', 'desc').get();
    return snap.docs.map((d) => {
      const data = d.data() as ChatSession;
      return {
        id: data.id,
        title: data.title,
        createdAt: data.createdAt,
        updatedAt: data.updatedAt,
        messageCount: data.messages?.length ?? 0,
      };
    });
  }

  async deleteSession(userId: string, sessionId: string): Promise<void> {
    await this.sessionRef(userId, sessionId).delete();
  }

  async deleteAllSessions(userId: string): Promise<void> {
    const snap = await this.sessionsCol(userId).get();
    const batch = this.db.batch();
    snap.docs.forEach(doc => batch.delete(doc.ref));
    await batch.commit();
  }
}
