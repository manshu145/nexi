import { Firestore } from 'firebase-admin/firestore';
import { asISODateTime, type ExamSlug, type ISODateTime, type UserId, type StudyProgress } from '@nexigrate/shared';

/**
 * Chapter content store + progress tracking.
 *
 * Chapter content is AI-generated on first request, then cached in Firestore.
 * Progress is stored per user per exam.
 */

export interface ChapterContent {
  exam: ExamSlug;
  subject: string;
  chapter: string;
  language: 'en' | 'hi';
  content: string; // markdown
  generatedAt: ISODateTime;
  generatedBy: string; // model id
}

export interface ChapterStore {
  getChapter(exam: string, subject: string, chapter: string, language: 'en' | 'hi'): Promise<ChapterContent | null>;
  saveChapter(content: ChapterContent): Promise<void>;
  getProgress(userId: UserId, exam: string): Promise<StudyProgress>;
  saveProgress(userId: UserId, exam: string, subject: string, chapter: string, score: number): Promise<StudyProgress>;
}

// ---------- in-memory --------------------------------------------------------

export class InMemoryChapterStore implements ChapterStore {
  private chapters = new Map<string, ChapterContent>();
  private progress = new Map<string, StudyProgress>();

  private chapterKey(exam: string, subject: string, chapter: string, lang: string) {
    return `${exam}:${subject}:${chapter}:${lang}`;
  }

  private progressKey(userId: string, exam: string) {
    return `${userId}:${exam}`;
  }

  async getChapter(exam: string, subject: string, chapter: string, language: 'en' | 'hi') {
    return this.chapters.get(this.chapterKey(exam, subject, chapter, language)) ?? null;
  }

  async saveChapter(content: ChapterContent) {
    this.chapters.set(this.chapterKey(content.exam, content.subject, content.chapter, content.language), content);
  }

  async getProgress(userId: UserId, exam: string): Promise<StudyProgress> {
    const key = this.progressKey(userId, exam);
    return this.progress.get(key) ?? {
      userId, exam: exam as ExamSlug, completedChapters: [], chapterScores: {},
      currentChapter: null, overallPercent: 0,
    };
  }

  async saveProgress(userId: UserId, exam: string, subject: string, chapter: string, score: number): Promise<StudyProgress> {
    const key = this.progressKey(userId, exam);
    const prev = await this.getProgress(userId, exam);
    const chapterKey = `${subject}/${chapter}`;
    const completedChapters = score >= 80 && !prev.completedChapters.includes(chapterKey)
      ? [...prev.completedChapters, chapterKey]
      : prev.completedChapters;
    const chapterScores = { ...prev.chapterScores, [chapterKey]: Math.max(prev.chapterScores[chapterKey] ?? 0, score) };
    const updated: StudyProgress = {
      ...prev,
      completedChapters,
      chapterScores,
      currentChapter: chapterKey,
      overallPercent: Math.round((completedChapters.length / Math.max(1, Object.keys(chapterScores).length + 5)) * 100),
    };
    this.progress.set(key, updated);
    return updated;
  }
}

// ---------- firestore --------------------------------------------------------

export class FirestoreChapterStore implements ChapterStore {
  constructor(private readonly db: Firestore) {}

  private chapterDocId(exam: string, subject: string, chapter: string, lang: string) {
    return `${exam}_${subject}_${chapter}_${lang}`;
  }

  async getChapter(exam: string, subject: string, chapter: string, language: 'en' | 'hi') {
    const snap = await this.db.collection('chapter_content')
      .doc(this.chapterDocId(exam, subject, chapter, language)).get();
    return snap.exists ? (snap.data() as ChapterContent) : null;
  }

  async saveChapter(content: ChapterContent) {
    const docId = this.chapterDocId(content.exam, content.subject, content.chapter, content.language);
    await this.db.collection('chapter_content').doc(docId).set(content);
  }

  async getProgress(userId: UserId, exam: string): Promise<StudyProgress> {
    const snap = await this.db.collection('users').doc(userId)
      .collection('progress').doc(exam).get();
    if (snap.exists) return snap.data() as StudyProgress;
    return { userId, exam: exam as ExamSlug, completedChapters: [], chapterScores: {}, currentChapter: null, overallPercent: 0 };
  }

  async saveProgress(userId: UserId, exam: string, subject: string, chapter: string, score: number): Promise<StudyProgress> {
    const ref = this.db.collection('users').doc(userId).collection('progress').doc(exam);
    return this.db.runTransaction(async (tx) => {
      const snap = await tx.get(ref);
      const prev: StudyProgress = snap.exists
        ? (snap.data() as StudyProgress)
        : { userId, exam: exam as ExamSlug, completedChapters: [], chapterScores: {}, currentChapter: null, overallPercent: 0 };

      const chapterKey = `${subject}/${chapter}`;
      const completedChapters = score >= 80 && !prev.completedChapters.includes(chapterKey)
        ? [...prev.completedChapters, chapterKey]
        : prev.completedChapters;
      const chapterScores = { ...prev.chapterScores, [chapterKey]: Math.max(prev.chapterScores[chapterKey] ?? 0, score) };
      const updated: StudyProgress = {
        ...prev,
        completedChapters,
        chapterScores,
        currentChapter: chapterKey,
        overallPercent: Math.round((completedChapters.length / Math.max(1, Object.keys(chapterScores).length + 5)) * 100),
      };
      tx.set(ref, updated);
      return updated;
    });
  }
}
