/**
 * Public types for the @nexigrate/ai-pipeline verification layer.
 *
 * The pipeline is generator-agnostic: it accepts already-generated
 * content + the request context, asks a second model to fact-check
 * against the official syllabus and a few hard rules, and emits a
 * confidence verdict the caller can use to decide between "ship",
 * "regenerate with this feedback", or "log + ship anyway".
 */

/** Reason an output was flagged. Free-form so verifier prompts can evolve. */
export type VerificationIssueKind =
  | 'factual_error'
  | 'syllabus_mismatch'
  | 'unsupported_claim'
  | 'language_mismatch'
  | 'level_mismatch'
  | 'safety'
  | 'other';

export interface VerificationIssue {
  /** Coarse category for log/metric grouping. */
  kind: VerificationIssueKind;
  /** Human-readable description of the specific issue, in English. */
  message: string;
  /** Optional excerpt from the content that triggered the flag. */
  excerpt?: string;
}

export interface VerificationVerdict {
  /**
   * `true` only when the verifier is confident the content is shippable.
   * Callers should also check `confidence` for a tunable threshold:
   * a `verified=true` with `confidence=0.7` may still be acceptable for
   * a free-tier user but not for a paid chapter, depending on policy.
   */
  verified: boolean;
  /**
   * 0..1 score. Calibrated by the verifier prompt's instruction to use
   * tight bands (0.95 = clean, 0.7 = minor concerns, <0.6 = regenerate).
   * The verifier rounds to two decimals to keep it stable across runs.
   */
  confidence: number;
  /** Empty array when verified=true with high confidence. */
  issues: readonly VerificationIssue[];
  /** Wall time in ms the verifier took. Useful for the admin dashboard. */
  latencyMs: number;
  /** Provider that performed the check (for debug + cost attribution). */
  verifier: 'gemini-flash' | 'gpt-4o-mini' | 'groq-llama' | 'fallback';
  /** Verifier raw text -- preserved for the admin "see why this was flagged" view. */
  rawResponse?: string;
}

/** Context the verifier needs to know what to compare against. */
export interface ChapterVerificationContext {
  /** Exam slug, e.g. 'upsc-cse'. The verifier uses this to ground its checks. */
  exam: string;
  /** Subject within the exam, e.g. 'polity'. */
  subject: string;
  /** Chapter title, e.g. 'Fundamental Rights'. */
  chapter: string;
  /** Target language of the content -- used to detect drift mid-output. */
  language: 'en' | 'hi';
  /** User level the content was written for. */
  level?: 'beginner' | 'intermediate' | 'advanced';
}

/**
 * Function signature for any verifier implementation. Lets callers
 * swap providers (Gemini Flash today, swap to a fine-tuned model
 * tomorrow) without touching the call sites.
 */
export type VerifyChapterFn = (
  content: string,
  context: ChapterVerificationContext,
) => Promise<VerificationVerdict>;
