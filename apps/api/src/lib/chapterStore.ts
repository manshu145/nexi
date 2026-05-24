/**
 * Chapter Store — Firestore + InMemory store for student progress,
 * chapters, chat history, and current affairs.
 *
 * Used by the AI-personalized learning routes to track student state.
 */

import type { ExamSlug } from '@nexigrate/shared';

// ─── Interfaces ──────────────────────────────────────────────────────────────

export interface StudentProgress {
  userId: string;
  exam: ExamSlug;
  skillLevel: 'beginner' | 'intermediate' | 'advanced';
  weakSubjects: string[];
  strongSubjects: string[];
  language: 'en' | 'hi';
  syllabus: SyllabusProgress[];
  overallScore: number;
  totalTopicsCompleted: number;
  totalTopics: number;
  createdAt: string;
  updatedAt: string;
}

export interface SyllabusProgress {
  subject: string;
  topics: TopicProgress[];
}

export interface TopicProgress {
  id: string;
  title: string;
  order: number;
  status: 'locked' | 'available' | 'in-progress' | 'mock-passed' | 'completed';
  mockScore?: number;
  completedAt?: string;
}

export interface ChatSession {
  id: string;
  userId: string;
  messages: ChatMessageRecord[];
  createdAt: string;
  updatedAt: string;
}

export interface ChatMessageRecord {
  role: 'user' | 'assistant';
  content: string;
  timestamp: string;
}

// ─── Store Interface ─────────────────────────────────────────────────────────

export interface StudentProgressStore {
  getProgress(userId: string): Promise<StudentProgress | null>;
  setProgress(userId: string, progress: StudentProgress): Promise<void>;
  updateProgress(userId: string, partial: Partial<StudentProgress>): Promise<void>;
}

export interface ChatHistoryStore {
  getHistory(userId: string): Promise<ChatMessageRecord[]>;
  addMessage(userId: string, message: ChatMessageRecord): Promise<void>;
  clearHistory(userId: string): Promise<void>;
}

// ─── InMemory Implementations ────────────────────────────────────────────────

export class InMemoryStudentProgressStore implements StudentProgressStore {
  private store = new Map<string, StudentProgress>();

  async getProgress(userId: string): Promise<StudentProgress | null> {
    return this.store.get(userId) ?? null;
  }

  async setProgress(userId: string, progress: StudentProgress): Promise<void> {
    this.store.set(userId, progress);
  }

  async updateProgress(userId: string, partial: Partial<StudentProgress>): Promise<void> {
    const existing = this.store.get(userId);
    if (existing) {
      this.store.set(userId, { ...existing, ...partial, updatedAt: new Date().toISOString() });
    }
  }
}

export class InMemoryChatHistoryStore implements ChatHistoryStore {
  private store = new Map<string, ChatMessageRecord[]>();

  async getHistory(userId: string): Promise<ChatMessageRecord[]> {
    return this.store.get(userId) ?? [];
  }

  async addMessage(userId: string, message: ChatMessageRecord): Promise<void> {
    const history = this.store.get(userId) ?? [];
    history.push(message);
    // Keep last 100 messages
    if (history.length > 100) history.splice(0, history.length - 100);
    this.store.set(userId, history);
  }

  async clearHistory(userId: string): Promise<void> {
    this.store.delete(userId);
  }
}

// ─── Firestore Implementations ──────────────────────────────────────────────

type Firestore = FirebaseFirestore.Firestore;

export class FirestoreStudentProgressStore implements StudentProgressStore {
  constructor(private db: Firestore) {}

  async getProgress(userId: string): Promise<StudentProgress | null> {
    const doc = await this.db.collection('student_progress').doc(userId).get();
    if (!doc.exists) return null;
    return doc.data() as StudentProgress;
  }

  async setProgress(userId: string, progress: StudentProgress): Promise<void> {
    await this.db.collection('student_progress').doc(userId).set(progress);
  }

  async updateProgress(userId: string, partial: Partial<StudentProgress>): Promise<void> {
    await this.db
      .collection('student_progress')
      .doc(userId)
      .update({ ...partial, updatedAt: new Date().toISOString() });
  }
}

export class FirestoreChatHistoryStore implements ChatHistoryStore {
  constructor(private db: Firestore) {}

  async getHistory(userId: string): Promise<ChatMessageRecord[]> {
    const doc = await this.db.collection('chat_history').doc(userId).get();
    if (!doc.exists) return [];
    const data = doc.data() as { messages: ChatMessageRecord[] };
    return data.messages ?? [];
  }

  async addMessage(userId: string, message: ChatMessageRecord): Promise<void> {
    const history = await this.getHistory(userId);
    history.push(message);
    // Keep last 100 messages
    if (history.length > 100) history.splice(0, history.length - 100);
    await this.db.collection('chat_history').doc(userId).set({ messages: history });
  }

  async clearHistory(userId: string): Promise<void> {
    await this.db.collection('chat_history').doc(userId).delete();
  }
}
