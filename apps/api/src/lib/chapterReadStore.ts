import type { Firestore } from 'firebase-admin/firestore';
import type {
  ChapterId,
  ChapterRead,
  ExamSlug,
  ISODateTime,
  UserId,
} from '@nexigrate/shared';

/**
 * Tracks "I have read this chapter" events.
 *
 * Stored as a subcollection on the user document so Firestore security
 * rules can scope reads to `request.auth.uid == uid` cheaply:
 *
 *   users/{userId}/chapter_reads/{chapterId}
 *
 * The doc id is the chapter id, so re-tapping "Mark as read" is a no-op
 * on the database side (latest readAt wins for the timestamp).
 */
export interface ChapterReadStore {
  put(read: ChapterRead): Promise<void>;
  get(userId: UserId, chapterId: ChapterId): Promise<ChapterRead | null>;
  list(userId: UserId, exam?: ExamSlug): Promise<ChapterRead[]>;
}

export class InMemoryChapterReadStore implements ChapterReadStore {
  private map = new Map<string, ChapterRead>();
  private key(userId: UserId, chapterId: string): string {
    return `${userId}::${chapterId}`;
  }

  async put(read: ChapterRead): Promise<void> {
    this.map.set(this.key(read.userId, read.id), read);
  }

  async get(userId: UserId, chapterId: ChapterId): Promise<ChapterRead | null> {
    return this.map.get(this.key(userId, chapterId)) ?? null;
  }

  async list(userId: UserId, exam?: ExamSlug): Promise<ChapterRead[]> {
    const out: ChapterRead[] = [];
    for (const r of this.map.values()) {
      if (r.userId !== userId) continue;
      if (exam && r.exam !== exam) continue;
      out.push(r);
    }
    return out;
  }
}

export class FirestoreChapterReadStore implements ChapterReadStore {
  constructor(private readonly db: Firestore) {}

  private subcol(userId: UserId) {
    return this.db.collection('users').doc(userId).collection('chapter_reads');
  }

  async put(read: ChapterRead): Promise<void> {
    await this.subcol(read.userId).doc(read.id).set(read);
  }

  async get(userId: UserId, chapterId: ChapterId): Promise<ChapterRead | null> {
    const snap = await this.subcol(userId).doc(chapterId).get();
    return snap.exists ? (snap.data() as ChapterRead) : null;
  }

  async list(userId: UserId, exam?: ExamSlug): Promise<ChapterRead[]> {
    // Fetch the subcollection without combining `where` and `orderBy`
    // on different fields -- that combination needs a composite
    // subcollection index. The set of chapter_reads for a single user
    // is small (bounded by chapters published), so we sort/filter
    // client-side to keep this endpoint working without a manual
    // index deploy. See the same pattern in FirestoreChapterStore.list.
    const snap = await this.subcol(userId).get();
    let rows = snap.docs.map((d) => d.data() as ChapterRead);
    if (exam) rows = rows.filter((r) => r.exam === exam);
    rows.sort((a, b) => (a.readAt < b.readAt ? 1 : -1));
    return rows;
  }
}

// Tiny helper used by the API to construct a ChapterRead doc.
export function makeChapterRead(
  userId: UserId,
  chapterId: ChapterId,
  exam: ExamSlug,
  subject: string,
  slug: string,
  readAt: ISODateTime,
): ChapterRead {
  return {
    id: chapterId,
    userId,
    exam,
    subject,
    slug,
    readAt,
  };
}
