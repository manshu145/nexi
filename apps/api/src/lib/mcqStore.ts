import { Firestore } from 'firebase-admin/firestore';
import type { ExamSlug, MCQ, McqId } from '@nexigrate/shared';
import { SEED_MCQS } from '../data/seed-mcqs.js';

/**
 * MCQ persistence layer.
 *
 * Two implementations:
 *   - InMemoryMcqStore: hand-curated seed bank baked into the binary.
 *     Used in dev, in tests, and (for now) in prod until Phase 2.9 lands
 *     the AI verification pipeline that writes verified MCQs to Firestore.
 *   - FirestoreMcqStore: reads from the `mcqs` collection. Falls back to
 *     the seed bank when the collection is empty so freshly-deployed
 *     environments still have content for the daily MCQ flow.
 */

export interface McqStore {
  pickDaily(exam: ExamSlug, count: number, seed: string): Promise<MCQ[]>;
  /**
   * Phase 11: pick MCQs scoped to a single chapter, used by the chapter-
   * specific test the student takes after reading. The chapter slug is
   * matched against `mcq.chapter` after slugifying both sides so seed
   * banks (which use kebab-case already) and AI-generated MCQs (which
   * may use the human-readable chapter title) both work.
   */
  pickByChapter(
    exam: ExamSlug,
    chapterSlug: string,
    count: number,
    seed: string,
  ): Promise<MCQ[]>;
  get(id: McqId): Promise<MCQ | null>;
  /**
   * Publish a freshly-approved MCQ. Used by the admin draft-approval flow.
   * The InMemory store is read-only seeded data so put() is a no-op there;
   * the Firestore store appends to the `mcqs` collection.
   */
  put(mcq: MCQ): Promise<void>;
}

/** Convert a chapter title or slug into the canonical kebab-case slug. */
function slugify(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/**
 * Deterministic seeded shuffle so the same user gets the same daily set on
 * the same calendar day, but different sets across users / days. Mulberry32
 * is fast, well-distributed, and tiny.
 */
function seededShuffle<T>(arr: readonly T[], seed: string): T[] {
  const out = [...arr];
  const seedInt = hashString(seed);
  let s = seedInt || 1;
  const rand = () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [out[i], out[j]] = [out[j]!, out[i]!];
  }
  return out;
}

function hashString(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) {
    h = (Math.imul(31, h) + s.charCodeAt(i)) | 0;
  }
  return h >>> 0;
}

export class InMemoryMcqStore implements McqStore {
  async pickDaily(exam: ExamSlug, count: number, seed: string): Promise<MCQ[]> {
    const pool = SEED_MCQS.filter((m) => m.exam === exam && m.isPublished);
    if (pool.length === 0) {
      return seededShuffle(
        SEED_MCQS.filter((m) => m.isPublished),
        seed,
      ).slice(0, count);
    }
    return seededShuffle(pool, seed).slice(0, count);
  }

  async pickByChapter(
    exam: ExamSlug,
    chapterSlug: string,
    count: number,
    seed: string,
  ): Promise<MCQ[]> {
    const target = slugify(chapterSlug);
    const pool = SEED_MCQS.filter(
      (m) =>
        m.exam === exam && m.isPublished && slugify(String(m.chapter)) === target,
    );
    return seededShuffle(pool, seed).slice(0, count);
  }

  async get(id: McqId): Promise<MCQ | null> {
    return SEED_MCQS.find((m) => m.id === id) ?? null;
  }

  async put(_mcq: MCQ): Promise<void> {
    // The seed bank is read-only at runtime. In dev/test this just means
    // approved drafts won't show up in pickDaily until the API is running
    // against Firestore.
    return;
  }
}

const COLLECTION = 'mcqs';

export class FirestoreMcqStore implements McqStore {
  constructor(
    private readonly db: Firestore,
    private readonly fallback: McqStore = new InMemoryMcqStore(),
  ) {}

  async pickDaily(exam: ExamSlug, count: number, seed: string): Promise<MCQ[]> {
    const snap = await this.db
      .collection(COLLECTION)
      .where('exam', '==', exam)
      .where('isPublished', '==', true)
      .limit(200)
      .get();
    if (snap.empty) {
      return this.fallback.pickDaily(exam, count, seed);
    }
    const pool = snap.docs.map((d) => d.data() as MCQ);
    return seededShuffle(pool, seed).slice(0, count);
  }

  async pickByChapter(
    exam: ExamSlug,
    chapterSlug: string,
    count: number,
    seed: string,
  ): Promise<MCQ[]> {
    // We can't push the slugified comparison down into Firestore (it would
    // need a denormalized field) so we filter client-side. With <=200 docs
    // per exam this is cheap. If the prod corpus grows past that we'll
    // backfill an explicit `chapterSlug` field and add an index.
    const target = slugify(chapterSlug);
    const snap = await this.db
      .collection(COLLECTION)
      .where('exam', '==', exam)
      .where('isPublished', '==', true)
      .limit(500)
      .get();
    const all = snap.docs.map((d) => d.data() as MCQ);
    const filtered = all.filter((m) => slugify(String(m.chapter)) === target);
    if (filtered.length === 0) {
      return this.fallback.pickByChapter(exam, chapterSlug, count, seed);
    }
    return seededShuffle(filtered, seed).slice(0, count);
  }

  async get(id: McqId): Promise<MCQ | null> {
    const doc = await this.db.collection(COLLECTION).doc(id).get();
    if (!doc.exists) return this.fallback.get(id);
    return doc.data() as MCQ;
  }

  async put(mcq: MCQ): Promise<void> {
    await this.db.collection(COLLECTION).doc(mcq.id).set(mcq);
  }
}
