import { Firestore } from 'firebase-admin/firestore';
import type {
  Chapter,
  ChapterId,
  ChapterStatus,
  ExamSlug,
  SubjectId,
} from '@nexigrate/shared';

/**
 * Persistence for the `chapters/{chapterDocId}` collection introduced in
 * Phase 9. Two implementations behind one interface so the API works the
 * same way in tests (in-memory) and production (Firestore).
 *
 * The doc id is deterministic -- `{exam}-{subject}-{chapterSlug}` -- and
 * is computed by `buildChapterDocId()` so callers don't have to remember
 * the formula.
 */

export interface ListChaptersOptions {
  exam?: ExamSlug;
  subject?: SubjectId;
  status?: ChapterStatus;
  /** Maximum number of chapters to return. Default 50, hard cap 200. */
  limit?: number;
}

export interface ChapterStore {
  /** Upsert by `chapter.id`. */
  put(chapter: Chapter): Promise<void>;
  /** Read by doc id. */
  get(id: string): Promise<Chapter | null>;
  /** List with optional filters, always ordered by `order` ASC then `title`. */
  list(opts: ListChaptersOptions): Promise<Chapter[]>;
  /**
   * Delete is intentionally not supported; admins archive instead. This
   * preserves audit trail and lets us re-publish if a chapter is taken
   * down by mistake.
   */
}

const COLLECTION = 'chapters';

/**
 * Build the deterministic chapter doc id for a (exam, subject, chapterSlug)
 * triple. All three components are kebab-case slugs, so the joined id is
 * unambiguous and URL-safe.
 */
export function buildChapterDocId(
  exam: ExamSlug,
  subject: SubjectId,
  chapterSlug: ChapterId,
): string {
  return `${exam}-${subject}-${chapterSlug}`;
}

// ---------- in-memory --------------------------------------------------------

export class InMemoryChapterStore implements ChapterStore {
  private map = new Map<string, Chapter>();

  async put(chapter: Chapter): Promise<void> {
    this.map.set(chapter.id, chapter);
  }

  async get(id: string): Promise<Chapter | null> {
    return this.map.get(id) ?? null;
  }

  async list(opts: ListChaptersOptions): Promise<Chapter[]> {
    const limit = Math.min(opts.limit ?? 50, 200);
    const all = Array.from(this.map.values()).filter((c) => {
      if (opts.exam && c.exam !== opts.exam) return false;
      if (opts.subject && c.subject !== opts.subject) return false;
      if (opts.status && c.status !== opts.status) return false;
      return true;
    });
    all.sort((a, b) => {
      if (a.order !== b.order) return a.order - b.order;
      return a.title.localeCompare(b.title);
    });
    return all.slice(0, limit);
  }
}

// ---------- firestore --------------------------------------------------------

export class FirestoreChapterStore implements ChapterStore {
  constructor(private readonly db: Firestore) {}

  async put(chapter: Chapter): Promise<void> {
    await this.db.collection(COLLECTION).doc(chapter.id).set(chapter);
  }

  async get(id: string): Promise<Chapter | null> {
    const snap = await this.db.collection(COLLECTION).doc(id).get();
    return snap.exists ? (snap.data() as Chapter) : null;
  }

  async list(opts: ListChaptersOptions): Promise<Chapter[]> {
    const limit = Math.min(opts.limit ?? 50, 200);
    let q = this.db
      .collection(COLLECTION)
      .orderBy('order', 'asc')
      .limit(limit);
    if (opts.exam) q = q.where('exam', '==', opts.exam);
    if (opts.subject) q = q.where('subject', '==', opts.subject);
    if (opts.status) q = q.where('status', '==', opts.status);
    const snap = await q.get();
    return snap.docs.map((d) => d.data() as Chapter);
  }
}

/**
 * Estimate reading time in minutes from raw section bodies.
 *
 * Uses 200 words per minute (a common reading-speed default for adult
 * non-fiction; high-school-level prose is somewhere between 180 and 230
 * wpm). Always rounds up to the nearest minute and clamps to the [1,
 * 120] range so a 30-second blurb still claims 1 min and a runaway
 * generation can't claim 8 hours.
 */
export function estimateReadingTimeMinutes(sections: { body: string }[]): number {
  const words = sections.reduce((sum, s) => {
    return sum + s.body.trim().split(/\s+/).filter(Boolean).length;
  }, 0);
  const raw = Math.ceil(words / 200);
  return Math.max(1, Math.min(120, raw));
}
