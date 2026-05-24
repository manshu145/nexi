import type { ExamSlug, ISODateTime } from './brand.js';

/**
 * Phase 19 -- Current affairs daily digest.
 *
 * Use case: UPSC, SSC, Banking, RBI Grade B aspirants who need the day's
 * national + international + economy + S&T headlines summarised in
 * exam-relevant terms.
 *
 * Editorial stance:
 *   - Date-keyed: ONE digest per IST date. Doc id is `ca_<YYYY-MM-DD>` so
 *     idempotent regeneration is natural.
 *   - Multi-item: a digest contains 5-15 items, each with its own
 *     headline + 2-4 sentence summary + source citation + exam-relevance
 *     tags. Students scan, dive into the items they care about.
 *   - Source-cited from official Government of India publications (PIB,
 *     Ministry press releases, RBI bulletins, Supreme Court orders) or
 *     reputable Indian news outlets that link primary sources. NEVER
 *     unsourced commentary or opinion pieces.
 *   - Neutral political voice. The verifier explicitly flags partisan
 *     framing.
 *   - 3-AI pipeline same as Nexipedia: generator + 2 verifiers scoring
 *     factual / neutrality / clarity.
 *
 * Lifecycle:
 *   1. Admin pastes a raw-notes payload (PIB headlines, Ministry of
 *      Finance press releases, etc. from the day). One textarea, no
 *      structure required.
 *   2. Generator (gpt-4o-mini) converts raw notes into a structured
 *      CurrentAffairsDigest with items.
 *   3. Two verifiers (Gemini + Groq) score factual / neutrality / clarity
 *      and list specific issues.
 *   4. Draft lands in current_affairs_drafts/{id} with status='pending'.
 *   5. Admin reviews per-item, optionally edits wording, approves.
 *   6. On approve, copied into current_affairs_digests/{id} (id keyed
 *      by date so re-approval is idempotent).
 */

export type CurrentAffairsDigestId = string & {
  readonly __brand: 'CurrentAffairsDigestId';
};

export const asCurrentAffairsDigestId = (s: string): CurrentAffairsDigestId =>
  s as CurrentAffairsDigestId;

export const CURRENT_AFFAIRS_CATEGORIES = [
  'national',
  'international',
  'economy',
  'science-tech',
  'environment',
  'sports',
  'awards',
  'agreements',
  'reports',
  'other',
] as const;

export type CurrentAffairsCategory = (typeof CURRENT_AFFAIRS_CATEGORIES)[number];

export const CURRENT_AFFAIRS_CATEGORY_LABELS: Record<CurrentAffairsCategory, string> = {
  national: 'National',
  international: 'International',
  economy: 'Economy & Business',
  'science-tech': 'Science & Technology',
  environment: 'Environment',
  sports: 'Sports',
  awards: 'Awards & Honours',
  agreements: 'Agreements & Schemes',
  reports: 'Reports & Indices',
  other: 'Other',
};

export type CurrentAffairsDigestStatus = 'pending' | 'approved' | 'rejected';

export interface CurrentAffairsItem {
  id: string;
  headline: string;
  /** 2-4 sentence factual summary. Markdown bold + paragraph breaks only. */
  body: string;
  category: CurrentAffairsCategory;
  /** Free-form citations -- prefer PIB / RBI / official Ministry pages. */
  sources: string[];
  /** Exams this item is most relevant to. */
  relevantExams: ExamSlug[];
  /** 3-6 keywords used by search + the dashboard hint. */
  tags: string[];
}

export interface CurrentAffairsVerifierScore {
  modelId: string;
  /** All claims sourceable to PIB / official / reputable mainstream press. */
  factualAccuracy: number;
  /** Free of partisan framing, loaded language, opinion. */
  neutrality: number;
  /** Crisp summaries, no padding. */
  clarity: number;
  agreesAccurate: boolean;
  reasoning: string;
  factualErrors: string[];
  passedAt: ISODateTime;
}

/** Published digest a student reads. */
export interface CurrentAffairsDigest {
  id: CurrentAffairsDigestId;
  /** YYYY-MM-DD in IST. The digest covers events from this calendar day. */
  date: string;
  /** One-line tagline shown on /today. */
  summary: string;
  items: CurrentAffairsItem[];
  generatedBy: string;
  verifiers: CurrentAffairsVerifierScore[];
  verificationScore: number;
  smeApprovedBy: string | null;
  smeApprovedAt: ISODateTime | null;
  isPublished: boolean;
  createdAt: ISODateTime;
  updatedAt: ISODateTime;
}

/** Draft awaiting admin approval. */
export interface CurrentAffairsDigestDraft {
  id: CurrentAffairsDigestId;
  date: string;
  summary: string;
  items: CurrentAffairsItem[];
  generatedBy: string;
  verifiers: CurrentAffairsVerifierScore[];
  verificationScore: number;
  status: CurrentAffairsDigestStatus;
  reviewedBy: string | null;
  reviewedAt: ISODateTime | null;
  rejectionReason: string | null;
  /** The raw notes the admin pasted, kept for audit + regeneration. */
  rawNotes: string;
  createdAt: ISODateTime;
  updatedAt: ISODateTime;
}

/** Slim list shape for archive page. */
export interface CurrentAffairsDigestSummary {
  id: CurrentAffairsDigestId;
  date: string;
  summary: string;
  itemCount: number;
  publishedAt: ISODateTime | null;
}
