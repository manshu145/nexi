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
  get(id: McqId): Promise<MCQ | null>;
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

  async get(id: McqId): Promise<MCQ | null> {
    return SEED_MCQS.find((m) => m.id === id) ?? null;
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

  async get(id: McqId): Promise<MCQ | null> {
    const doc = await this.db.collection(COLLECTION).doc(id).get();
    if (!doc.exists) return this.fallback.get(id);
    return doc.data() as MCQ;
  }
}
