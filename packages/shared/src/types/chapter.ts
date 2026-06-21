import type { ChapterId, ExamSlug, ISODateTime } from './brand.js';

/**
 * AI-generated chapter content.
 *
 * Mirrors the MCQ pipeline: a Generator (OpenAI) produces a full chapter
 * draft, two Verifiers (Gemini + Groq) score it, an admin approves and
 * publishes. NO MANUAL DATA ENTRY -- the whole point is to leverage the
 * 3-AI pipeline that already powers MCQs and produce chapter content at
 * the same scale.
 *
 * Lifecycle:
 *   1. Admin POSTs (exam, subject, chapter slug, class level) ->
 *      /v1/admin/chapters/generate
 *   2. Generator emits a JSON draft with title, summary, sections[]
 *   3. Verifier 1 + Verifier 2 score it for factual accuracy + coverage
 *   4. Draft lands in `chapter_drafts/{id}` with status='pending'
 *   5. Admin reviews. Optional inline edits to section bodies.
 *      a. Approve -> publish into `chapters/{id}` with status='published'
 *      b. Reject  -> mark rejected, free to regenerate
 *      c. Regenerate -> creates a fresh draft with the same slot params
 *
 * Why a separate ChapterDraft type from Chapter: the published chapter is
 * what students read; the draft carries verifier metadata and the editorial
 * trail. Same id is reused on approve so re-approval is idempotent.
 */

export type ChapterDraftStatus = 'pending' | 'approved' | 'rejected';

/** A single section within a chapter, like a sub-heading + paragraphs. */
export interface ChapterSection {
  /** Stable id within the chapter (e.g. 'intro', 'derivation', 'examples'). */
  id: string;
  /** H2-level heading shown to the student. */
  heading: string;
  /** Markdown body. Supports basic formatting + math (LaTeX in $...$). */
  body: string;
  /** Display order within the chapter. */
  order: number;
}

/** Verifier verdict on a generated chapter draft. */
export interface ChapterVerifierScore {
  modelId: string;
  /** Factual accuracy: 0=multiple errors, 1=verified against NCERT/official. */
  factualAccuracy: number;
  /** Coverage: 0=skips key topics, 1=NCERT-comprehensive. */
  coverage: number;
  /** Pedagogical clarity: 0=confusing, 1=textbook clear. */
  clarity: number;
  /** True if verifier finds no material errors. */
  agreesAccurate: boolean;
  /** Free-form rationale captured for the review UI. */
  reasoning: string;
  /** Specific factual issues flagged by this verifier, if any. */
  factualErrors: string[];
  passedAt: ISODateTime;
}

/** A published chapter shown to students. */
export interface Chapter {
  id: ChapterId;
  exam: ExamSlug;
  subject: string;
  /** Stable kebab-case slug, e.g. 'units-and-measurements'. */
  slug: string;
  /** Class level: 'class-11', 'class-12', etc. */
  classLevel: string;
  title: string;
  /** 1-2 line description shown in chapter cards. */
  summary: string;
  sections: ChapterSection[];
  /** Approximate read time in minutes. */
  estimatedReadMinutes: number;
  /** Source citation, e.g. 'NCERT Class 11 Physics, Ch. 1'. */
  source: string;
  /** The model that generated this chapter (gpt-4o-mini, etc). */
  generatedBy: string;
  /** Verifier scores from the two verifier passes. */
  verifiers: ChapterVerifierScore[];
  /** Combined verification score in [0, 1]. */
  verificationScore: number;
  /** Admin who approved publication. */
  smeApprovedBy: string | null;
  smeApprovedAt: ISODateTime | null;
  isPublished: boolean;
  createdAt: ISODateTime;
  updatedAt: ISODateTime;
}

/** A generated chapter awaiting SME review. */
export interface ChapterDraft {
  id: ChapterId;
  exam: ExamSlug;
  subject: string;
  slug: string;
  classLevel: string;
  title: string;
  summary: string;
  sections: ChapterSection[];
  estimatedReadMinutes: number;
  source: string;
  generatedBy: string;
  verifiers: ChapterVerifierScore[];
  verificationScore: number;
  status: ChapterDraftStatus;
  reviewedBy: string | null;
  reviewedAt: ISODateTime | null;
  rejectionReason: string | null;
  createdAt: ISODateTime;
  updatedAt: ISODateTime;
}
