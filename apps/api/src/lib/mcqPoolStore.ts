import { Firestore } from 'firebase-admin/firestore';
import type { UserId } from '@nexigrate/shared';
import type { GeneratedMCQ, AIEngine } from './aiEngine.js';
import type { Logger } from '../logger.js';

/**
 * MCQ Pool Store — ensures students never see the same question twice.
 *
 * Architecture:
 * - Pool: chapterMCQPool/{examSlug}_{subjectSlug}_{chapterSlug} → { questions: MCQ[], poolSize, generatedAt }
 * - Used: users/{uid}/usedMCQs/{chapterKey} → { questionIds: string[] }
 *
 * On quiz request:
 * 1. Load pool for this chapter
 * 2. Load user's used question IDs for this chapter
 * 3. Pick `count` questions NOT in usedMCQs (random selection)
 * 4. If remaining unused < count: generate more via AI, add to pool
 * 5. Save selected IDs to user's usedMCQs
 */

export interface MCQPool {
  questions: GeneratedMCQ[];
  poolSize: number;
  generatedAt: string;
}

export interface MCQPoolStore {
  getChapterQuiz(
    examSlug: string,
    subjectSlug: string,
    chapterSlug: string,
    uid: UserId,
    language: 'en' | 'hi',
    count: number,
    aiEngine: AIEngine,
    logger: Logger,
    chapterContent?: string,
    userLevel?: 'beginner' | 'intermediate' | 'advanced',
  ): Promise<GeneratedMCQ[]>;
}

// ─── In-Memory Implementation ─────────────────────────────────────────────────

export class InMemoryMCQPoolStore implements MCQPoolStore {
  private pools = new Map<string, MCQPool>();
  private usedMCQs = new Map<string, string[]>();

  private poolKey(exam: string, subject: string, chapter: string, language: 'en' | 'hi' = 'en') {
    return `${exam}_${subject}_${chapter}_${language}`;
  }

  private usedKey(uid: string, exam: string, subject: string, chapter: string) {
    return `${uid}:${exam}_${subject}_${chapter}`;
  }

  async getChapterQuiz(
    examSlug: string,
    subjectSlug: string,
    chapterSlug: string,
    uid: UserId,
    language: 'en' | 'hi',
    count: number,
    aiEngine: AIEngine,
    logger: Logger,
    chapterContent?: string,
    userLevel?: 'beginner' | 'intermediate' | 'advanced',
  ): Promise<GeneratedMCQ[]> {
    const pKey = this.poolKey(examSlug, subjectSlug, chapterSlug, language);
    const uKey = this.usedKey(uid, examSlug, subjectSlug, chapterSlug);

    // Get or create pool
    let pool = this.pools.get(pKey);
    if (!pool) {
      const seed = crypto.randomUUID().slice(0, 8);
      const questions = await aiEngine.generateChapterMCQs(chapterSlug, subjectSlug, examSlug, language, 10, seed, chapterContent, userLevel);
      pool = { questions, poolSize: questions.length, generatedAt: new Date().toISOString() };
      this.pools.set(pKey, pool);
      logger.info('mcqpool.created', { examSlug, subjectSlug, chapterSlug, poolSize: pool.poolSize });
    }

    // Get user's used question IDs
    const usedIds = new Set(this.usedMCQs.get(uKey) ?? []);

    // Filter unused questions
    let available = pool.questions.filter(q => !usedIds.has(q.id));

    // If not enough unused questions, generate more
    if (available.length < count) {
      const seed = crypto.randomUUID().slice(0, 8);
      const newQuestions = await aiEngine.generateChapterMCQs(chapterSlug, subjectSlug, examSlug, language, 10, seed, chapterContent, userLevel);
      // Deduplicate by ID
      const existingIds = new Set(pool.questions.map(q => q.id));
      const uniqueNew = newQuestions.filter(q => !existingIds.has(q.id));
      pool.questions.push(...uniqueNew);
      pool.poolSize = pool.questions.length;
      this.pools.set(pKey, pool);
      available = pool.questions.filter(q => !usedIds.has(q.id));
      logger.info('mcqpool.expanded', { examSlug, subjectSlug, chapterSlug, newPoolSize: pool.poolSize, added: uniqueNew.length });
    }

    // Randomly select `count` questions from available
    const selected = shuffleArray(available).slice(0, count);

    // Save selected IDs to user's used list
    const newUsedIds = [...Array.from(usedIds), ...selected.map(q => q.id)];
    this.usedMCQs.set(uKey, newUsedIds);

    return selected;
  }
}

// ─── Firestore Implementation ─────────────────────────────────────────────────

export class FirestoreMCQPoolStore implements MCQPoolStore {
  constructor(private readonly db: Firestore) {}

  private poolDocId(exam: string, subject: string, chapter: string, language: 'en' | 'hi' = 'en') {
    return `${exam}_${subject}_${chapter}_${language}`;
  }

  async getChapterQuiz(
    examSlug: string,
    subjectSlug: string,
    chapterSlug: string,
    uid: UserId,
    language: 'en' | 'hi',
    count: number,
    aiEngine: AIEngine,
    logger: Logger,
    chapterContent?: string,
    userLevel?: 'beginner' | 'intermediate' | 'advanced',
  ): Promise<GeneratedMCQ[]> {
    const poolDocId = this.poolDocId(examSlug, subjectSlug, chapterSlug, language);
    const poolRef = this.db.collection('chapterMCQPool').doc(poolDocId);
    const usedRef = this.db.collection('users').doc(uid).collection('usedMCQs').doc(poolDocId);

    // Get or create pool
    let poolSnap = await poolRef.get();
    let pool: MCQPool;

    if (!poolSnap.exists) {
      const seed = crypto.randomUUID().slice(0, 8);
      const questions = await aiEngine.generateChapterMCQs(chapterSlug, subjectSlug, examSlug, language, 10, seed, chapterContent, userLevel);
      pool = { questions, poolSize: questions.length, generatedAt: new Date().toISOString() };
      await poolRef.set(pool);
      logger.info('mcqpool.created', { examSlug, subjectSlug, chapterSlug, poolSize: pool.poolSize });
    } else {
      pool = poolSnap.data() as MCQPool;
    }

    // Get user's used question IDs
    const usedSnap = await usedRef.get();
    const usedIds = new Set<string>(usedSnap.exists ? (usedSnap.data()?.questionIds ?? []) : []);

    // Filter unused questions
    let available = pool.questions.filter(q => !usedIds.has(q.id));

    // If not enough, generate more and expand pool
    if (available.length < count) {
      const seed = crypto.randomUUID().slice(0, 8);
      const newQuestions = await aiEngine.generateChapterMCQs(chapterSlug, subjectSlug, examSlug, language, 10, seed, chapterContent, userLevel);
      const existingIds = new Set(pool.questions.map(q => q.id));
      const uniqueNew = newQuestions.filter(q => !existingIds.has(q.id));
      pool.questions.push(...uniqueNew);
      pool.poolSize = pool.questions.length;
      await poolRef.set(pool);
      available = pool.questions.filter(q => !usedIds.has(q.id));
      logger.info('mcqpool.expanded', { examSlug, subjectSlug, chapterSlug, newPoolSize: pool.poolSize, added: uniqueNew.length });
    }

    // Randomly select `count` questions
    const selected = shuffleArray(available).slice(0, count);

    // PR-48: If pool is empty after regeneration, throw so the user sees
    // a meaningful error instead of a blank "Quiz not available" page.
    // Also delete the stale pool doc so next attempt gets fresh generation.
    if (selected.length === 0) {
      await poolRef.delete().catch(() => {});
      throw new Error(`MCQ pool empty for ${examSlug}/${subjectSlug}/${chapterSlug} (${language}). AI may have returned 0 questions. Retry — the stale cache has been cleared.`);
    }

    // Save selected IDs to user's used list
    const newUsedIds = [...Array.from(usedIds), ...selected.map(q => q.id)];
    await usedRef.set({ questionIds: newUsedIds });

    return selected;
  }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function shuffleArray<T>(arr: T[]): T[] {
  const shuffled = [...arr];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j]!, shuffled[i]!];
  }
  return shuffled;
}
