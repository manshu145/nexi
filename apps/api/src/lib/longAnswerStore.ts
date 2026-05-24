import type { Firestore } from 'firebase-admin/firestore';
import {
  asISODateTime,
  type ExamSlug,
  type ISODateTime,
  type LongAnswerAttempt,
  type LongAnswerAttemptId,
  type LongAnswerAttemptStatus,
  type LongAnswerGrade,
  type LongAnswerQuestion,
  type LongAnswerQuestionId,
  type UserId,
} from '@nexigrate/shared';

/**
 * Persistence for Phase 18 -- long-form descriptive questions and graded
 * attempts.
 *
 * Two separate collections:
 *   - long_answer_questions/{id}             admin-curated, read by students
 *   - long_answer_attempts/{id}              one row per submission
 *
 * Per-user attempt history is fetched by querying long_answer_attempts on
 * userId + submittedAt. We don't subcollect under users/{uid}/ because
 * admin analytics will want to read across users.
 */

// ---------- questions ------------------------------------------------------

export interface ListLongAnswerQuestionsOptions {
  exam?: ExamSlug;
  subject?: string;
  publishedOnly?: boolean;
  limit?: number;
}

export interface LongAnswerQuestionStore {
  put(q: LongAnswerQuestion): Promise<void>;
  get(id: LongAnswerQuestionId): Promise<LongAnswerQuestion | null>;
  getBySlug(slug: string): Promise<LongAnswerQuestion | null>;
  list(opts: ListLongAnswerQuestionsOptions): Promise<LongAnswerQuestion[]>;
  delete(id: LongAnswerQuestionId): Promise<boolean>;
}

const QUESTIONS_COLLECTION = 'long_answer_questions';

export class InMemoryLongAnswerQuestionStore implements LongAnswerQuestionStore {
  private map = new Map<LongAnswerQuestionId, LongAnswerQuestion>();

  async put(q: LongAnswerQuestion): Promise<void> {
    this.map.set(q.id, q);
  }

  async get(id: LongAnswerQuestionId): Promise<LongAnswerQuestion | null> {
    return this.map.get(id) ?? null;
  }

  async getBySlug(slug: string): Promise<LongAnswerQuestion | null> {
    for (const q of this.map.values()) if (q.slug === slug) return q;
    return null;
  }

  async list(opts: ListLongAnswerQuestionsOptions): Promise<LongAnswerQuestion[]> {
    const limit = Math.min(opts.limit ?? 100, 500);
    const publishedOnly = opts.publishedOnly !== false;
    const all = Array.from(this.map.values());
    const filtered = all.filter((q) => {
      if (publishedOnly && !q.isPublished) return false;
      if (opts.exam && q.exam !== opts.exam) return false;
      if (opts.subject && q.subject !== opts.subject) return false;
      return true;
    });
    filtered.sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
    return filtered.slice(0, limit);
  }

  async delete(id: LongAnswerQuestionId): Promise<boolean> {
    return this.map.delete(id);
  }
}

export class FirestoreLongAnswerQuestionStore implements LongAnswerQuestionStore {
  constructor(private readonly db: Firestore) {}

  async put(q: LongAnswerQuestion): Promise<void> {
    await this.db.collection(QUESTIONS_COLLECTION).doc(q.id).set(q);
  }

  async get(id: LongAnswerQuestionId): Promise<LongAnswerQuestion | null> {
    const snap = await this.db.collection(QUESTIONS_COLLECTION).doc(id).get();
    return snap.exists ? (snap.data() as LongAnswerQuestion) : null;
  }

  async getBySlug(slug: string): Promise<LongAnswerQuestion | null> {
    const snap = await this.db
      .collection(QUESTIONS_COLLECTION)
      .where('slug', '==', slug)
      .limit(1)
      .get();
    return snap.empty ? null : (snap.docs[0]!.data() as LongAnswerQuestion);
  }

  async list(opts: ListLongAnswerQuestionsOptions): Promise<LongAnswerQuestion[]> {
    const limit = Math.min(opts.limit ?? 100, 500);
    const publishedOnly = opts.publishedOnly !== false;
    let q = this.db
      .collection(QUESTIONS_COLLECTION)
      .orderBy('createdAt', 'desc')
      .limit(limit);
    if (publishedOnly) q = q.where('isPublished', '==', true);
    if (opts.exam) q = q.where('exam', '==', opts.exam);
    if (opts.subject) q = q.where('subject', '==', opts.subject);
    const snap = await q.get();
    return snap.docs.map((d) => d.data() as LongAnswerQuestion);
  }

  async delete(id: LongAnswerQuestionId): Promise<boolean> {
    const ref = this.db.collection(QUESTIONS_COLLECTION).doc(id);
    const snap = await ref.get();
    if (!snap.exists) return false;
    await ref.delete();
    return true;
  }
}

// ---------- attempts -------------------------------------------------------

export interface ListLongAnswerAttemptsOptions {
  userId?: UserId;
  questionId?: LongAnswerQuestionId;
  status?: LongAnswerAttemptStatus;
  limit?: number;
}

export interface LongAnswerAttemptStore {
  put(a: LongAnswerAttempt): Promise<void>;
  get(id: LongAnswerAttemptId): Promise<LongAnswerAttempt | null>;
  list(opts: ListLongAnswerAttemptsOptions): Promise<LongAnswerAttempt[]>;
  /**
   * Mark an existing attempt as graded (or failed). Idempotent on the
   * (id, status) pair: a second call with the same status is a no-op.
   */
  setGrade(
    id: LongAnswerAttemptId,
    grade: LongAnswerGrade | null,
    status: LongAnswerAttemptStatus,
    failureReason?: string | null,
  ): Promise<LongAnswerAttempt | null>;
}

const ATTEMPTS_COLLECTION = 'long_answer_attempts';

export class InMemoryLongAnswerAttemptStore implements LongAnswerAttemptStore {
  private map = new Map<LongAnswerAttemptId, LongAnswerAttempt>();

  async put(a: LongAnswerAttempt): Promise<void> {
    this.map.set(a.id, a);
  }

  async get(id: LongAnswerAttemptId): Promise<LongAnswerAttempt | null> {
    return this.map.get(id) ?? null;
  }

  async list(opts: ListLongAnswerAttemptsOptions): Promise<LongAnswerAttempt[]> {
    const limit = Math.min(opts.limit ?? 100, 500);
    const all = Array.from(this.map.values());
    const filtered = all.filter((a) => {
      if (opts.userId && a.userId !== opts.userId) return false;
      if (opts.questionId && a.questionId !== opts.questionId) return false;
      if (opts.status && a.status !== opts.status) return false;
      return true;
    });
    filtered.sort((a, b) => (a.submittedAt < b.submittedAt ? 1 : -1));
    return filtered.slice(0, limit);
  }

  async setGrade(
    id: LongAnswerAttemptId,
    grade: LongAnswerGrade | null,
    status: LongAnswerAttemptStatus,
    failureReason: string | null = null,
  ): Promise<LongAnswerAttempt | null> {
    const cur = this.map.get(id);
    if (!cur) return null;
    if (cur.status === status && cur.grade === grade) return cur;
    const now = asISODateTime(new Date().toISOString());
    const updated: LongAnswerAttempt = {
      ...cur,
      grade,
      status,
      failureReason,
      updatedAt: now,
    };
    this.map.set(id, updated);
    return updated;
  }
}

export class FirestoreLongAnswerAttemptStore implements LongAnswerAttemptStore {
  constructor(private readonly db: Firestore) {}

  async put(a: LongAnswerAttempt): Promise<void> {
    await this.db.collection(ATTEMPTS_COLLECTION).doc(a.id).set(a);
  }

  async get(id: LongAnswerAttemptId): Promise<LongAnswerAttempt | null> {
    const snap = await this.db.collection(ATTEMPTS_COLLECTION).doc(id).get();
    return snap.exists ? (snap.data() as LongAnswerAttempt) : null;
  }

  async list(opts: ListLongAnswerAttemptsOptions): Promise<LongAnswerAttempt[]> {
    const limit = Math.min(opts.limit ?? 100, 500);
    let q = this.db
      .collection(ATTEMPTS_COLLECTION)
      .orderBy('submittedAt', 'desc')
      .limit(limit);
    if (opts.userId) q = q.where('userId', '==', opts.userId);
    if (opts.questionId) q = q.where('questionId', '==', opts.questionId);
    if (opts.status) q = q.where('status', '==', opts.status);
    const snap = await q.get();
    return snap.docs.map((d) => d.data() as LongAnswerAttempt);
  }

  async setGrade(
    id: LongAnswerAttemptId,
    grade: LongAnswerGrade | null,
    status: LongAnswerAttemptStatus,
    failureReason: string | null = null,
  ): Promise<LongAnswerAttempt | null> {
    const ref = this.db.collection(ATTEMPTS_COLLECTION).doc(id);
    return this.db.runTransaction(async (tx) => {
      const snap = await tx.get(ref);
      if (!snap.exists) return null;
      const cur = snap.data() as LongAnswerAttempt;
      const now = asISODateTime(new Date().toISOString());
      const updated: LongAnswerAttempt = {
        ...cur,
        grade,
        status,
        failureReason,
        updatedAt: now,
      };
      tx.set(ref, updated);
      return updated;
    });
  }
}

// Helper: derive a grade-from-attempt summary used by /v1/users/me/long-answers.
export function summarizeAttempt(
  a: LongAnswerAttempt,
  q: LongAnswerQuestion | null,
): {
  id: LongAnswerAttemptId;
  questionId: LongAnswerQuestionId;
  questionPrompt: string;
  questionExam: ExamSlug;
  questionSubject: string;
  status: LongAnswerAttemptStatus;
  overall: number | null;
  wordCount: number;
  submittedAt: ISODateTime;
} {
  return {
    id: a.id,
    questionId: a.questionId,
    questionPrompt: q?.prompt ?? '(question removed)',
    questionExam: q?.exam ?? ('jee-main' as ExamSlug),
    questionSubject: q?.subject ?? 'general',
    status: a.status,
    overall: a.grade?.overall ?? null,
    wordCount: a.wordCount,
    submittedAt: a.submittedAt,
  };
}
