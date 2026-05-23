import type { ChapterId, ExamSlug, ISODateTime, McqId, SubjectId, UserId } from './brand.js';
import type { McqDifficulty } from './mcq.js';

/**
 * MCQ generation draft, produced by the 3-AI pipeline before SME approval.
 *
 * The flow:
 *   1. Admin (or scheduled job) calls POST /v1/admin/mcq-drafts/generate
 *      with a chapter section and target exam.
 *   2. The orchestrator asks 3 LLMs (OpenAI + Gemini + Groq) to produce an
 *      MCQ from the same source material, in parallel.
 *   3. A 4th "verifier" LLM call cross-checks the three drafts: do they
 *      agree on the answer? Are the options factually correct? Does the
 *      explanation cite the source faithfully?
 *   4. Result is persisted as a McqDraft in Firestore with status='pending'.
 *   5. Admin reviews the draft + verifier output in the admin panel and
 *      either approves (published to /mcqs collection) or rejects.
 *
 * Once approved, a McqDraft becomes an MCQ. The draft document is kept
 * indefinitely for audit/compliance.
 */

export type DraftStatus = 'pending' | 'approved' | 'rejected';

/**
 * Output shape every LLMClient returns for a single MCQ-generation prompt.
 * Strict subset of the MCQ type so we can promote a draft to an MCQ with
 * minimal mapping later.
 */
export interface McqGenerationOutput {
  question: string;
  options: { key: 'A' | 'B' | 'C' | 'D'; text: string }[];
  correctOption: 'A' | 'B' | 'C' | 'D';
  explanation: string;
  difficulty: McqDifficulty;
  /** Reasoning trace from the model (for debugging / auditing). */
  reasoning: string;
}

export interface DraftCandidate {
  /** Identifier of the model that produced this draft, e.g. 'gpt-4o-mini'. */
  modelId: string;
  /** The model's output, or null if the call failed. */
  output: McqGenerationOutput | null;
  /** If output is null, the error captured here. */
  errorMessage: string | null;
  /** Wallclock duration of the model call. */
  durationMs: number;
  generatedAt: ISODateTime;
}

export interface VerifierResult {
  modelId: string; // verifier model
  /** Did the verifier agree with the draft consensus? */
  approved: boolean;
  /** 0..1 confidence the consensus is correct. */
  confidence: number;
  /** Free-form rationale captured for the audit trail. */
  reasoning: string;
  /** Specific issues flagged (factual, ambiguity, source mismatch). */
  issues: string[];
  ranAt: ISODateTime;
}

export interface McqDraft {
  id: string; // generated UUID (not branded -- drafts aren't MCQs yet)
  /** Source material the draft was generated from. */
  prompt: {
    exam: ExamSlug;
    subject: SubjectId;
    chapter: ChapterId;
    /** Free-form context paragraph or NCERT excerpt. */
    sourceText: string;
    /** URL or citation pointing to the original. */
    sourceCitation: string;
    requestedDifficulty: McqDifficulty;
  };
  /** Three parallel candidate drafts, one per LLM. */
  candidates: DraftCandidate[];
  /** Output of the verifier model that cross-checked the candidates. */
  verifier: VerifierResult | null;
  /**
   * The chosen draft -- by default the first candidate that the verifier
   * approved, but admin can override on review.
   */
  chosenCandidateIndex: number | null;

  status: DraftStatus;
  /** Set when status='approved'; references the generated MCQ. */
  publishedMcqId: McqId | null;

  /** Who triggered the generation. */
  requestedBy: UserId;
  requestedAt: ISODateTime;
  /** Last admin action (approve/reject); null if still pending. */
  reviewedBy: UserId | null;
  reviewedAt: ISODateTime | null;
  reviewNote: string | null;
}
