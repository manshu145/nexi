import type { Firestore } from 'firebase-admin/firestore';
import {
  asISODateTime,
  asMcqId,
  nowIso,
  type DraftStatus,
  type ISODateTime,
  type MCQ,
  type McqDraft,
  type UserId,
} from '@nexigrate/shared';

/**
 * Persistence layer for MCQ drafts (Phase 4 M5).
 *
 * Two implementations mirror the pattern used by mcqStore / userStore /
 * subscriptionStore: a Map-backed in-memory store for tests, and a
 * Firestore-backed store for production. Both implement the same interface
 * so callers (admin routes) don't care which backend is wired.
 */

export interface McqDraftStore {
  save(draft: McqDraft): Promise<void>;
  get(id: string): Promise<McqDraft | null>;
  list(opts?: { status?: DraftStatus; limit?: number }): Promise<McqDraft[]>;
  /**
   * Atomically mark a draft as approved AND copy the chosen candidate to
   * the live `mcqs` collection. Returns the published MCQ.
   */
  approve(id: string, reviewer: UserId, note: string | null): Promise<MCQ>;
  /** Mark a draft as rejected with a reviewer note. */
  reject(id: string, reviewer: UserId, note: string): Promise<McqDraft>;
}

const DRAFTS_COLLECTION = 'mcq_drafts';
const MCQS_COLLECTION = 'mcqs';

// ---------- In-memory ----------

export class InMemoryMcqDraftStore implements McqDraftStore {
  private readonly drafts = new Map<string, McqDraft>();
  private readonly mcqs = new Map<string, MCQ>();

  async save(draft: McqDraft): Promise<void> {
    this.drafts.set(draft.id, structuredClone(draft));
  }

  async get(id: string): Promise<McqDraft | null> {
    const d = this.drafts.get(id);
    return d ? structuredClone(d) : null;
  }

  async list(opts?: { status?: DraftStatus; limit?: number }): Promise<McqDraft[]> {
    const all = Array.from(this.drafts.values()).filter((d) =>
      opts?.status ? d.status === opts.status : true,
    );
    all.sort((a, b) => (a.requestedAt < b.requestedAt ? 1 : -1));
    return (opts?.limit ? all.slice(0, opts.limit) : all).map((d) => structuredClone(d));
  }

  async approve(id: string, reviewer: UserId, note: string | null): Promise<MCQ> {
    const draft = this.drafts.get(id);
    if (!draft) throw new Error(`draft not found: ${id}`);
    if (draft.status !== 'pending') throw new Error(`draft already ${draft.status}`);
    if (draft.chosenCandidateIndex === null)
      throw new Error('draft has no consensus candidate to publish');
    const chosen = draft.candidates[draft.chosenCandidateIndex];
    if (!chosen?.output) throw new Error('chosen candidate has no output');

    const mcq: MCQ = draftToMcq(draft, chosen.output, chosen.modelId, reviewer);

    const updated: McqDraft = {
      ...draft,
      status: 'approved',
      publishedMcqId: mcq.id,
      reviewedBy: reviewer,
      reviewedAt: nowIso(),
      reviewNote: note,
    };
    this.drafts.set(id, updated);
    this.mcqs.set(mcq.id, mcq);
    return mcq;
  }

  async reject(id: string, reviewer: UserId, note: string): Promise<McqDraft> {
    const draft = this.drafts.get(id);
    if (!draft) throw new Error(`draft not found: ${id}`);
    if (draft.status !== 'pending') throw new Error(`draft already ${draft.status}`);
    const updated: McqDraft = {
      ...draft,
      status: 'rejected',
      reviewedBy: reviewer,
      reviewedAt: nowIso(),
      reviewNote: note,
    };
    this.drafts.set(id, updated);
    return updated;
  }

  /** Test helper: peek at the published MCQ collection. */
  __publishedMcqs(): readonly MCQ[] {
    return Array.from(this.mcqs.values());
  }
}

// ---------- Firestore ----------

export class FirestoreMcqDraftStore implements McqDraftStore {
  constructor(private readonly db: Firestore) {}

  async save(draft: McqDraft): Promise<void> {
    await this.db.collection(DRAFTS_COLLECTION).doc(draft.id).set(draft);
  }

  async get(id: string): Promise<McqDraft | null> {
    const snap = await this.db.collection(DRAFTS_COLLECTION).doc(id).get();
    return snap.exists ? (snap.data() as McqDraft) : null;
  }

  async list(opts?: { status?: DraftStatus; limit?: number }): Promise<McqDraft[]> {
    let q = this.db
      .collection(DRAFTS_COLLECTION)
      .orderBy('requestedAt', 'desc')
      .limit(opts?.limit ?? 50);
    if (opts?.status) q = q.where('status', '==', opts.status);
    const snap = await q.get();
    return snap.docs.map((d) => d.data() as McqDraft);
  }

  async approve(id: string, reviewer: UserId, note: string | null): Promise<MCQ> {
    const draftRef = this.db.collection(DRAFTS_COLLECTION).doc(id);
    return await this.db.runTransaction(async (tx) => {
      const snap = await tx.get(draftRef);
      if (!snap.exists) throw new Error(`draft not found: ${id}`);
      const draft = snap.data() as McqDraft;
      if (draft.status !== 'pending') throw new Error(`draft already ${draft.status}`);
      if (draft.chosenCandidateIndex === null)
        throw new Error('draft has no consensus candidate to publish');
      const chosen = draft.candidates[draft.chosenCandidateIndex];
      if (!chosen?.output) throw new Error('chosen candidate has no output');

      const mcq = draftToMcq(draft, chosen.output, chosen.modelId, reviewer);
      const mcqRef = this.db.collection(MCQS_COLLECTION).doc(mcq.id);

      tx.set(mcqRef, mcq);
      tx.set(draftRef, {
        ...draft,
        status: 'approved' as const,
        publishedMcqId: mcq.id,
        reviewedBy: reviewer,
        reviewedAt: nowIso(),
        reviewNote: note,
      });
      return mcq;
    });
  }

  async reject(id: string, reviewer: UserId, note: string): Promise<McqDraft> {
    const ref = this.db.collection(DRAFTS_COLLECTION).doc(id);
    const snap = await ref.get();
    if (!snap.exists) throw new Error(`draft not found: ${id}`);
    const draft = snap.data() as McqDraft;
    if (draft.status !== 'pending') throw new Error(`draft already ${draft.status}`);
    const updated: McqDraft = {
      ...draft,
      status: 'rejected',
      reviewedBy: reviewer,
      reviewedAt: nowIso(),
      reviewNote: note,
    };
    await ref.set(updated);
    return updated;
  }
}

// ---------- Helpers ----------

function draftToMcq(
  draft: McqDraft,
  output: NonNullable<import('@nexigrate/shared').DraftCandidate['output']>,
  generatorModelId: string,
  reviewer: UserId,
): MCQ {
  const id = asMcqId(`mcq_${draft.id}`);
  const ts = nowIso();
  const verifierScores = draft.verifier
    ? [
        {
          modelId: draft.verifier.modelId,
          score: draft.verifier.confidence,
          reasoning: draft.verifier.reasoning,
          passedAt: ts,
        },
      ]
    : [];
  return {
    id,
    exam: draft.prompt.exam,
    subject: draft.prompt.subject,
    chapter: draft.prompt.chapter,
    question: output.question,
    options: output.options,
    correctOption: output.correctOption,
    explanation: output.explanation,
    difficulty: output.difficulty,
    source: draft.prompt.sourceCitation,
    verifiers: verifierScores,
    smeApprovedBy: reviewer,
    smeApprovedAt: ts,
    isPublished: true,
    createdAt: ts,
    updatedAt: ts,
  };
}

/** Re-exported helper so callers don't have to import from this file. */
export { draftToMcq };
