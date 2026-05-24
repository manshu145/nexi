/**
 * Chapter persistence store.
 * 
 * Stores AI-generated chapters, syllabus, student progress, mock test results,
 * and chat history. Both in-memory (dev) and Firestore (prod) implementations.
 */

import type { Firestore } from 'firebase-admin/firestore';
import type { UserId, ExamSlug } from '@nexigrate/shared';
import type { GeneratedChapter, GeneratedMcq, SyllabusItem, AssessmentResult, CurrentAffairsItem, ChatMessage } from './aiEngine.js';

export interface StoredChapter extends GeneratedChapter {
  id: string;
  exam: string;
  generatedAt: string;
}

export interface StudentProgress {
  userId: string;
  exam: string;
  language: 'en' | 'hi';
  skillLevel: 'beginner' | 'intermediate' | 'advanced';
  weakSubjects: string[];
  strongSubjects: string[];
  syllabus: SyllabusItem[];
  completedTopics: string[]; // topic ids
  currentSubject: string;
  currentTopicIndex: number;
  chapterMockScores: Record<string, number>; // topicId -> best score percentage
  syllabusComplete: boolean;
  finalTestScore: number | null;
  assessmentResult: AssessmentResult | null;
}

export interface ChatSession {
  userId: string;
  messages: ChatMessage[];
  updatedAt: string;
}

export interface ChapterStore {
  // Progress
  getProgress(userId: UserId): Promise<StudentProgress | null>;
  saveProgress(userId: UserId, progress: StudentProgress): Promise<void>;

  // Chapters
  getChapter(userId: UserId, topicId: string): Promise<StoredChapter | null>;
  saveChapter(userId: UserId, topicId: string, chapter: StoredChapter): Promise<void>;

  // Chat
  getChatHistory(userId: UserId): Promise<ChatMessage[]>;
  saveChatHistory(userId: UserId, messages: ChatMessage[]): Promise<void>;

  // Current Affairs
  getCurrentAffairs(date: string, language: string): Promise<CurrentAffairsItem[] | null>;
  saveCurrentAffairs(date: string, language: string, items: CurrentAffairsItem[]): Promise<void>;
}

// ---------- In-Memory Implementation ----------

export class InMemoryChapterStore implements ChapterStore {
  private progress = new Map<string, StudentProgress>();
  private chapters = new Map<string, StoredChapter>();
  private chats = new Map<string, ChatMessage[]>();
  private affairs = new Map<string, CurrentAffairsItem[]>();

  async getProgress(userId: UserId): Promise<StudentProgress | null> {
    return this.progress.get(userId) ?? null;
  }

  async saveProgress(userId: UserId, progress: StudentProgress): Promise<void> {
    this.progress.set(userId, progress);
  }

  async getChapter(userId: UserId, topicId: string): Promise<StoredChapter | null> {
    return this.chapters.get(`${userId}:${topicId}`) ?? null;
  }

  async saveChapter(userId: UserId, topicId: string, chapter: StoredChapter): Promise<void> {
    this.chapters.set(`${userId}:${topicId}`, chapter);
  }

  async getChatHistory(userId: UserId): Promise<ChatMessage[]> {
    return this.chats.get(userId) ?? [];
  }

  async saveChatHistory(userId: UserId, messages: ChatMessage[]): Promise<void> {
    this.chats.set(userId, messages);
  }

  async getCurrentAffairs(date: string, language: string): Promise<CurrentAffairsItem[] | null> {
    return this.affairs.get(`${date}:${language}`) ?? null;
  }

  async saveCurrentAffairs(date: string, language: string, items: CurrentAffairsItem[]): Promise<void> {
    this.affairs.set(`${date}:${language}`, items);
  }
}

// ---------- Firestore Implementation ----------

export class FirestoreChapterStore implements ChapterStore {
  constructor(private readonly db: Firestore) {}

  async getProgress(userId: UserId): Promise<StudentProgress | null> {
    const snap = await this.db.collection('student_progress').doc(userId).get();
    return snap.exists ? (snap.data() as StudentProgress) : null;
  }

  async saveProgress(userId: UserId, progress: StudentProgress): Promise<void> {
    await this.db.collection('student_progress').doc(userId).set(progress, { merge: true });
  }

  async getChapter(userId: UserId, topicId: string): Promise<StoredChapter | null> {
    const snap = await this.db.collection('generated_chapters').doc(`${userId}_${topicId}`).get();
    return snap.exists ? (snap.data() as StoredChapter) : null;
  }

  async saveChapter(userId: UserId, topicId: string, chapter: StoredChapter): Promise<void> {
    await this.db.collection('generated_chapters').doc(`${userId}_${topicId}`).set(chapter);
  }

  async getChatHistory(userId: UserId): Promise<ChatMessage[]> {
    const snap = await this.db.collection('chat_history').doc(userId).get();
    if (!snap.exists) return [];
    const data = snap.data() as { messages: ChatMessage[] };
    return data.messages ?? [];
  }

  async saveChatHistory(userId: UserId, messages: ChatMessage[]): Promise<void> {
    // Keep last 100 messages max
    const trimmed = messages.slice(-100);
    await this.db.collection('chat_history').doc(userId).set({
      messages: trimmed,
      updatedAt: new Date().toISOString(),
    });
  }

  async getCurrentAffairs(date: string, language: string): Promise<CurrentAffairsItem[] | null> {
    const snap = await this.db.collection('current_affairs').doc(`${date}_${language}`).get();
    if (!snap.exists) return null;
    const data = snap.data() as { items: CurrentAffairsItem[] };
    return data.items ?? null;
  }

  async saveCurrentAffairs(date: string, language: string, items: CurrentAffairsItem[]): Promise<void> {
    await this.db.collection('current_affairs').doc(`${date}_${language}`).set({
      items,
      generatedAt: new Date().toISOString(),
    });
  }
}
