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
 *
 * ─── Why IDs are derived from question CONTENT (the "pool empty" fix) ───
 * The AI prompt asks for questions with ids "q1".."q10", so EVERY
 * generation returns the SAME ids. The pool-expansion step dedups new
 * questions by id (`existingIds.has(q.id)`), which meant freshly
 * generated questions ALWAYS collided with the originals → `uniqueNew`
 * was always empty → the pool could never grow past 10. Once a user had
 * seen all 10, regeneration added nothing, the unused set was empty, and
 * the route threw "MCQ pool empty ... AI may have returned 0 questions"
 * on every subsequent quiz for that chapter.
 *
 * The fix: ignore the AI's ids entirely and assign each question a
 * STABLE id hashed from its (normalized) question text. Two genuinely
 * different questions now get different ids (so the pool grows), while
 * an AI that happens to repeat a question collapses to one entry (so we
 * never store the same question twice). See `withStableIds` below.
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

  /**
   * Look up the authoritative `correctOption` for a set of question ids
   * straight from the stored pool. Used by the chapter-complete endpoint
   * to re-score a quiz SERVER-SIDE instead of trusting a client-sent
   * score. Returns a map id -> correctOption for every id found in the
   * pool; ids not present are simply omitted so the caller can fall back
   * safely (never punishes a legit student on a pool miss).
   */
  lookupCorrectOptions(
    examSlug: string,
    subjectSlug: string,
    chapterSlug: string,
    language: 'en' | 'hi',
    ids: string[],
  ): Promise<Map<string, 'A' | 'B' | 'C' | 'D'>>;
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
      const generated = await aiEngine.generateChapterMCQs(chapterSlug, subjectSlug, examSlug, language, 10, seed, chapterContent, userLevel);
      const questions = withStableIds(generated);
      pool = { questions, poolSize: questions.length, generatedAt: new Date().toISOString() };
      this.pools.set(pKey, pool);
      logger.info('mcqpool.created', { examSlug, subjectSlug, chapterSlug, poolSize: pool.poolSize });
    } else {
      // Backfill stable ids for pools created before the content-hash fix.
      const reIded = withStableIds(pool.questions);
      if (poolNeedsReId(pool.questions, reIded)) {
        pool.questions = reIded;
        pool.poolSize = reIded.length;
        this.pools.set(pKey, pool);
      }
    }

    // Get user's used question IDs
    const usedIds = new Set(this.usedMCQs.get(uKey) ?? []);

    // Filter unused questions
    let available = pool.questions.filter(q => !usedIds.has(q.id));

    // If not enough unused questions, generate more
    if (available.length < count) {
      const seed = crypto.randomUUID().slice(0, 8);
      const generated = await aiEngine.generateChapterMCQs(chapterSlug, subjectSlug, examSlug, language, 10, seed, chapterContent, userLevel);
      const newQuestions = withStableIds(generated);
      // Deduplicate by stable (content-derived) ID — genuinely new
      // questions survive, repeats collapse, so the pool actually grows.
      const existingIds = new Set(pool.questions.map(q => q.id));
      const uniqueNew = newQuestions.filter(q => !existingIds.has(q.id));
      if (uniqueNew.length) {
        pool.questions.push(...uniqueNew);
        pool.poolSize = pool.questions.length;
        this.pools.set(pKey, pool);
        logger.info('mcqpool.expanded', { examSlug, subjectSlug, chapterSlug, newPoolSize: pool.poolSize, added: uniqueNew.length });
      }
      available = pool.questions.filter(q => !usedIds.has(q.id));
    }

    // Randomly select `count` questions from available
    let selected = shuffleArray(available).slice(0, count);

    // Graceful recycle: the user has exhausted every UNIQUE question we
    // could generate for this chapter. Serve from the full pool (allowing
    // repeats) and restart their cycle — a repeated question beats a hard
    // error / blank quiz page.
    if (selected.length === 0 && pool.questions.length > 0) {
      logger.warn('mcqpool.recycled', { examSlug, subjectSlug, chapterSlug, language, poolSize: pool.questions.length });
      selected = shuffleArray(pool.questions).slice(0, count);
      this.usedMCQs.set(uKey, selected.map(q => q.id));
      return selected;
    }

    // Save selected IDs to user's used list
    const newUsedIds = [...Array.from(usedIds), ...selected.map(q => q.id)];
    this.usedMCQs.set(uKey, newUsedIds);

    return selected;
  }

  async lookupCorrectOptions(
    examSlug: string,
    subjectSlug: string,
    chapterSlug: string,
    language: 'en' | 'hi',
    ids: string[],
  ): Promise<Map<string, 'A' | 'B' | 'C' | 'D'>> {
    const map = new Map<string, 'A' | 'B' | 'C' | 'D'>();
    if (!ids.length) return map;
    const pool = this.pools.get(this.poolKey(examSlug, subjectSlug, chapterSlug, language));
    if (!pool) return map;
    // Match against stable ids (same transform the client received).
    const questions = withStableIds(pool.questions ?? []);
    const want = new Set(ids);
    for (const q of questions) {
      if (want.has(q.id) && q.correctOption) map.set(q.id, q.correctOption);
    }
    return map;
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
      const generated = await aiEngine.generateChapterMCQs(chapterSlug, subjectSlug, examSlug, language, 10, seed, chapterContent, userLevel);
      const questions = withStableIds(generated);
      pool = { questions, poolSize: questions.length, generatedAt: new Date().toISOString() };
      await poolRef.set(pool);
      logger.info('mcqpool.created', { examSlug, subjectSlug, chapterSlug, poolSize: pool.poolSize });
    } else {
      pool = poolSnap.data() as MCQPool;
      // Backfill stable ids for legacy pools (questions still carry the
      // colliding "q1".."q10" ids). Re-id in place so dedup + used-tracking
      // work going forward, and persist once so we don't redo it every load.
      const reIded = withStableIds(pool.questions ?? []);
      if (poolNeedsReId(pool.questions ?? [], reIded)) {
        pool.questions = reIded;
        pool.poolSize = reIded.length;
        await poolRef.set(pool).catch(() => {});
        logger.info('mcqpool.reided', { examSlug, subjectSlug, chapterSlug, poolSize: pool.poolSize });
      }
    }

    // Get user's used question IDs
    const usedSnap = await usedRef.get();
    const usedIds = new Set<string>(usedSnap.exists ? (usedSnap.data()?.questionIds ?? []) : []);

    // Filter unused questions
    let available = pool.questions.filter(q => !usedIds.has(q.id));

    // If not enough, generate more and expand pool
    if (available.length < count) {
      const seed = crypto.randomUUID().slice(0, 8);
      const generated = await aiEngine.generateChapterMCQs(chapterSlug, subjectSlug, examSlug, language, 10, seed, chapterContent, userLevel);
      const newQuestions = withStableIds(generated);
      // Dedup by stable (content-derived) id so genuinely-new questions
      // are added and the pool grows instead of forever collapsing to 10.
      const existingIds = new Set(pool.questions.map(q => q.id));
      const uniqueNew = newQuestions.filter(q => !existingIds.has(q.id));
      if (uniqueNew.length) {
        pool.questions.push(...uniqueNew);
        pool.poolSize = pool.questions.length;
        await poolRef.set(pool);
        logger.info('mcqpool.expanded', { examSlug, subjectSlug, chapterSlug, newPoolSize: pool.poolSize, added: uniqueNew.length });
      }
      available = pool.questions.filter(q => !usedIds.has(q.id));
    }

    // Randomly select `count` questions
    let selected = shuffleArray(available).slice(0, count);

    // Graceful recycle: the user has already seen every UNIQUE question we
    // can generate for this chapter. Rather than hard-failing with a blank
    // quiz, serve from the full pool (repeats allowed) and reset their used
    // list so the cycle restarts. A repeated question is strictly better
    // than a dead-end error page.
    if (selected.length === 0 && pool.questions.length > 0) {
      logger.warn('mcqpool.recycled', { examSlug, subjectSlug, chapterSlug, language, poolSize: pool.questions.length });
      selected = shuffleArray(pool.questions).slice(0, count);
      await usedRef.set({ questionIds: selected.map(q => q.id) });
      return selected;
    }

    // True failure: the AI genuinely produced nothing usable, so the pool
    // is empty. Delete the stale doc so the next attempt regenerates from
    // scratch, and surface a meaningful (retryable) error.
    if (selected.length === 0) {
      await poolRef.delete().catch(() => {});
      throw new Error(`MCQ pool empty for ${examSlug}/${subjectSlug}/${chapterSlug} (${language}). AI returned 0 questions — the stale cache has been cleared, please retry.`);
    }

    // Save selected IDs to user's used list
    const newUsedIds = [...Array.from(usedIds), ...selected.map(q => q.id)];
    await usedRef.set({ questionIds: newUsedIds });

    return selected;
  }

  async lookupCorrectOptions(
    examSlug: string,
    subjectSlug: string,
    chapterSlug: string,
    language: 'en' | 'hi',
    ids: string[],
  ): Promise<Map<string, 'A' | 'B' | 'C' | 'D'>> {
    const map = new Map<string, 'A' | 'B' | 'C' | 'D'>();
    if (!ids.length) return map;
    const poolDocId = this.poolDocId(examSlug, subjectSlug, chapterSlug, language);
    const snap = await this.db.collection('chapterMCQPool').doc(poolDocId).get();
    if (!snap.exists) return map;
    const pool = snap.data() as MCQPool;
    // Re-derive stable ids exactly as getChapterQuiz does, so the ids here
    // match the ones the client was served (legacy pools may still carry
    // the colliding q1..q10 ids on disk).
    const questions = withStableIds(pool.questions ?? []);
    const want = new Set(ids);
    for (const q of questions) {
      if (want.has(q.id) && q.correctOption) map.set(q.id, q.correctOption);
    }
    return map;
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

/** Normalize a question's text for stable hashing / dedup: lowercase,
 *  collapse whitespace, trim. Returns '' for missing text. */
function normalizeQuestionText(q: GeneratedMCQ): string {
  return (q?.question ?? '').toString().toLowerCase().replace(/\s+/g, ' ').trim();
}

/** Deterministic FNV-1a 32-bit hash → 8-char hex. Stable across runs and
 *  processes for the same input, so the same question text always maps to
 *  the same id (enabling content-level dedup) while different questions map
 *  to different ids (so the pool grows). */
function stableId(text: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  // Mix in the length to further reduce the (already tiny) collision odds
  // for the short pools we deal with.
  return `q_${(h >>> 0).toString(16).padStart(8, '0')}${text.length.toString(36)}`;
}

/** Basic structural validity check — drops malformed questions that would
 *  otherwise be stored and rendered as broken quiz items. */
function isUsableQuestion(q: GeneratedMCQ): boolean {
  if (!q || typeof q.question !== 'string' || q.question.trim().length === 0) return false;
  if (!Array.isArray(q.options) || q.options.length < 2) return false;
  if (!q.correctOption || !['A', 'B', 'C', 'D'].includes(q.correctOption)) return false;
  return true;
}

/**
 * Assign each question a stable, content-derived id and dedup within the
 * batch. Malformed questions are dropped. This is the single chokepoint
 * that fixes the "pool never grows / pool empty" bug: by deriving ids from
 * content we stop trusting the AI's repeated "q1".."q10" ids.
 */
function withStableIds(questions: GeneratedMCQ[]): GeneratedMCQ[] {
  const seen = new Set<string>();
  const out: GeneratedMCQ[] = [];
  for (const q of questions ?? []) {
    if (!isUsableQuestion(q)) continue;
    const id = stableId(normalizeQuestionText(q));
    if (seen.has(id)) continue; // collapse duplicate questions
    seen.add(id);
    out.push({ ...q, id });
  }
  return out;
}

/** True if the re-id'd list differs from the current pool (different count
 *  or any id changed), meaning a legacy pool needs persisting with stable
 *  ids. Avoids needless Firestore writes when the pool is already current. */
function poolNeedsReId(current: GeneratedMCQ[], reIded: GeneratedMCQ[]): boolean {
  if (current.length !== reIded.length) return true;
  for (let i = 0; i < current.length; i++) {
    if (current[i]?.id !== reIded[i]?.id) return true;
  }
  return false;
}
