/**
 * Jobs & Eligibility — canonical domain model.
 *
 * This file defines the vocabulary the whole Jobs feature speaks: the
 * candidate's Career Profile, the canonical Job record, and the structured
 * eligibility rules that the deterministic engine evaluates.
 *
 * ── Core product principle ────────────────────────────────────────────────
 * For government / PSU vacancies, eligibility is NOT an AI opinion. AI may
 * read a notification PDF and PROPOSE a structured `EligibilityRules` object,
 * but the final ELIGIBLE / NOT_ELIGIBLE decision is produced by a pure,
 * deterministic function (see `evaluateEligibility`). That keeps the answer
 * explainable, reproducible, auditable against the source document, and free
 * of per-user LLM cost.
 *
 * ── Two different questions ───────────────────────────────────────────────
 * Government/PSU  → "Do I legally satisfy the statutory criteria?"  (hard)
 * Private         → "Do I clear the mandatory bar, and how well do I fit?"
 *
 * Those are deliberately modelled differently. A private job must never mark
 * a candidate NOT_ELIGIBLE for lacking a *preferred* skill; it reports a
 * mandatory-requirement verdict AND a separate explainable fit score.
 */

// ─────────────────────────────────────────────────────────────────────────
// Sectors & source trust
// ─────────────────────────────────────────────────────────────────────────

/** Broad sector of the recruiting organisation. Drives which rule set applies. */
export type JobSector =
  | 'CENTRAL_GOVT'
  | 'STATE_GOVT'
  | 'UT_GOVT'
  | 'PSU'
  | 'BANKING'
  | 'RAILWAY'
  | 'DEFENCE'
  | 'JUDICIARY'
  | 'UNIVERSITY'
  | 'PRIVATE'
  | 'STARTUP'
  | 'MNC'
  | 'INTERNSHIP'
  | 'OTHER';

/**
 * Sectors whose eligibility is statutory and must be evaluated with the
 * hard-rule engine (no "preferred" leniency, no fit-score substitution).
 */
export const STATUTORY_SECTORS: readonly JobSector[] = [
  'CENTRAL_GOVT', 'STATE_GOVT', 'UT_GOVT', 'PSU',
  'BANKING', 'RAILWAY', 'DEFENCE', 'JUDICIARY', 'UNIVERSITY',
];

export function isStatutorySector(sector: JobSector): boolean {
  return STATUTORY_SECTORS.includes(sector);
}

/**
 * Provenance trust ladder. The ingestion pipeline must never let a lower
 * level overwrite eligibility rules sourced from a higher one — a news
 * article cannot silently change a statutory age limit.
 */
export type SourceTrustLevel =
  /** Official government / recruiter notification (PDF or notice page). */
  | 'LEVEL_1'
  /** Official company careers page or its ATS. */
  | 'LEVEL_2'
  /** Trusted authorised partner feed. */
  | 'LEVEL_3'
  /** Third-party discovery source — display only, verify before trusting. */
  | 'LEVEL_4';

/** Numeric precedence for trust comparison (higher wins). */
export const TRUST_PRECEDENCE: Record<SourceTrustLevel, number> = {
  LEVEL_1: 4,
  LEVEL_2: 3,
  LEVEL_3: 2,
  LEVEL_4: 1,
};

// ─────────────────────────────────────────────────────────────────────────
// Candidate categories
// ─────────────────────────────────────────────────────────────────────────

/**
 * Reservation / relaxation categories recognised by Indian recruitment.
 * Collected only with consent and used solely to compute relaxations.
 */
export type CandidateCategory =
  | 'GENERAL'
  | 'EWS'
  | 'OBC'
  | 'OBC_NCL'
  | 'SC'
  | 'ST';

/** Additional statuses that can independently attract relaxation. */
export type CandidateFlag =
  | 'PWBD'
  | 'EX_SERVICEMAN'
  | 'WOMEN'
  | 'DEPARTMENTAL'
  | 'SPORTS_QUOTA'
  | 'NCC'
  | 'DOMICILE_LOCAL';

// ─────────────────────────────────────────────────────────────────────────
// Qualifications
// ─────────────────────────────────────────────────────────────────────────

/** Ordered qualification ladder. Order matters for "at least" comparisons. */
export type QualificationLevel =
  | 'CLASS_8'
  | 'CLASS_10'
  | 'CLASS_12'
  | 'ITI'
  | 'DIPLOMA'
  | 'BACHELORS'
  | 'MASTERS'
  | 'PROFESSIONAL'
  | 'PHD'
  | 'OTHER';

/**
 * Rank used for "Bachelor's degree or higher" style checks.
 *
 * ITI / DIPLOMA / PROFESSIONAL / OTHER are deliberately NOT placed on a
 * clean linear scale with academic degrees, because a Diploma is not
 * universally "less than" a Bachelor's for statutory purposes — many
 * notifications accept "Diploma OR Degree" explicitly. We give them ranks
 * for ordering convenience but the engine only uses `>=` comparisons when
 * the requirement explicitly opts in via `orHigher`.
 */
export const QUALIFICATION_RANK: Record<QualificationLevel, number> = {
  CLASS_8: 1,
  CLASS_10: 2,
  CLASS_12: 3,
  ITI: 4,
  DIPLOMA: 5,
  BACHELORS: 6,
  PROFESSIONAL: 7,
  MASTERS: 8,
  PHD: 9,
  OTHER: 0,
};

/** A single qualification the candidate holds. */
export interface EducationRecord {
  id: string;
  level: QualificationLevel;
  /** Raw degree name as the user entered it, e.g. "B.Tech". */
  degree?: string;
  /**
   * Canonical degree family resolved by the normaliser, e.g. "BE_BTECH".
   * Statutory matching uses this, never the raw string.
   */
  degreeFamily?: string;
  /** Raw discipline as entered, e.g. "Computer Science & Engineering". */
  discipline?: string;
  /** Canonical discipline slug, e.g. "computer-science". */
  disciplineSlug?: string;
  institution?: string;
  boardOrUniversity?: string;
  /** Calendar year of result. */
  graduationYear?: number;
  /** ISO date the result was declared — some notifications gate on this. */
  resultDate?: string;
  percentage?: number;
  cgpa?: number;
  /** CGPA→% conversion divisor the university uses (commonly 9.5 or 10). */
  cgpaScale?: number;
  /** True when the qualification is fully awarded. */
  completed: boolean;
  /** True when the candidate is awaiting the final result. */
  resultAwaited?: boolean;
  /** Subjects studied at this level — used for "Maths at 12th" style rules. */
  subjects?: string[];
}

// ─────────────────────────────────────────────────────────────────────────
// Experience, skills, exams
// ─────────────────────────────────────────────────────────────────────────

export type EmploymentType =
  | 'FULL_TIME'
  | 'PART_TIME'
  | 'CONTRACT'
  | 'INTERNSHIP'
  | 'APPRENTICESHIP'
  | 'FREELANCE'
  | 'GOVERNMENT';

export interface ExperienceRecord {
  id: string;
  role: string;
  company?: string;
  /** ISO date. */
  startDate: string;
  /** ISO date; omit when `current` is true. */
  endDate?: string;
  current?: boolean;
  employmentType: EmploymentType;
  /** Canonical skill slugs demonstrated in this role. */
  skills?: string[];
  /** Free-text sector tag, used for "experience in banking" style rules. */
  sector?: string;
  /** True when the role carried managerial responsibility. */
  managerial?: boolean;
}

/** A qualifying exam / certification result. */
export interface ExamRecord {
  id: string;
  /** Canonical exam code, e.g. "GATE", "UGC_NET", "CTET". */
  exam: string;
  score?: number;
  /** Percentile where the exam reports one. */
  percentile?: number;
  rank?: number;
  year?: number;
  /** ISO date after which the score is no longer accepted. */
  validUntil?: string;
  qualified?: boolean;
}

/** Optional measurable attributes, collected only via progressive profiling. */
export interface PhysicalAttributes {
  heightCm?: number;
  weightKg?: number;
  chestCm?: number;
  chestExpandedCm?: number;
}

/** Optional skill-test speeds required by clerical / stenographer posts. */
export interface SkillSpeeds {
  typingWpmEnglish?: number;
  typingWpmHindi?: number;
  shorthandWpm?: number;
}

// ─────────────────────────────────────────────────────────────────────────
// Career Profile
// ─────────────────────────────────────────────────────────────────────────

export type WorkPreference = 'ONSITE' | 'HYBRID' | 'REMOTE';

/**
 * The candidate's reusable profile. Filled once, reused for every vacancy.
 *
 * IMPORTANT: age is never stored. Only `dateOfBirth` is persisted, because
 * every recruitment computes age against its OWN cutoff date. Storing a
 * derived age would silently rot and produce wrong statutory verdicts.
 */
export interface CareerProfile {
  userId: string;

  /** ISO date (YYYY-MM-DD). The single source for every age computation. */
  dateOfBirth?: string;
  nationality?: string;
  gender?: 'MALE' | 'FEMALE' | 'TRANSGENDER' | 'PREFER_NOT_TO_SAY';

  /** Where the candidate currently lives (state slug). */
  currentState?: string;
  /** Legal domicile state slug — distinct from `currentState`. */
  domicileState?: string;
  domicileDistrict?: string;

  preferredLocations?: string[];
  willingToRelocate?: boolean;
  workPreference?: WorkPreference[];

  category?: CandidateCategory;
  flags?: CandidateFlag[];
  /** PwBD sub-category / disability percentage where relevant. */
  disabilityPercentage?: number;

  education: EducationRecord[];
  experience: ExperienceRecord[];
  /** Canonical skill slugs. */
  skills: string[];
  exams: ExamRecord[];

  physical?: PhysicalAttributes;
  speeds?: SkillSpeeds;

  /** Languages the candidate can read/write, as ISO-ish codes or slugs. */
  languages?: string[];
  hasDrivingLicence?: boolean;
  drivingLicenceClasses?: string[];
  employmentExchangeRegistered?: boolean;
  /** Currently employed in government service (affects some age relaxations). */
  inGovernmentService?: boolean;

  /**
   * Monotonically increasing version, bumped on every mutation. Combined
   * with `Job.version` it forms the eligibility cache key, so a profile
   * edit invalidates exactly the affected cached verdicts and nothing else.
   */
  profileVersion: number;

  /** Consent record for processing reservation / disability data. */
  sensitiveDataConsent?: {
    granted: boolean;
    grantedAt?: string;
    purpose: string;
  };

  createdAt: string;
  updatedAt: string;
}

// ─────────────────────────────────────────────────────────────────────────
// Eligibility rules — structured, AND/OR/NOT composable
// ─────────────────────────────────────────────────────────────────────────

/**
 * Pointer back to the exact place in the official document that a rule came
 * from. This is what makes the "Why this result?" UI trustworthy — every
 * statutory verdict can be traced to a quotable line in a source PDF.
 */
export interface SourceEvidence {
  /** Verbatim snippet from the notification. */
  sourceText: string;
  /** URL of the document the snippet came from. */
  sourceDocument?: string;
  /** 1-based page number within that document. */
  page?: number;
  /** Extraction confidence 0-1, set by the AI extractor. */
  confidence?: number;
}

/** Age limits, always anchored to an explicit cutoff date. */
export interface AgeRule {
  minYears?: number;
  maxYears?: number;
  /**
   * ISO date the age is reckoned on. Mandatory in practice — without it the
   * engine cannot produce a defensible verdict and will flag MANUAL_REVIEW.
   */
  cutoffDate?: string;
  /**
   * Upper-age relaxation in years, keyed by category or flag.
   *
   * Keys may be a single token ("SC") or an explicit combination
   * ("SC+PWBD"). The engine prefers an exact combination key when present
   * and otherwise takes the single largest applicable relaxation. It never
   * blindly sums, because real notifications do not always stack.
   */
  relaxationYears?: Record<string, number>;
  /**
   * Set true when the notification's relaxation text is too complex to model
   * (e.g. serving-employee slabs). Forces CONDITIONALLY_ELIGIBLE instead of
   * a confidently wrong pass/fail.
   */
  relaxationComplex?: boolean;
  evidence?: SourceEvidence;
}

/**
 * A composable education requirement tree.
 *
 * `ALL_OF` / `ANY_OF` / `NOT` give the AND / OR / NOT composition the spec
 * requires, so a rule like
 *   "Bachelor's degree AND Mathematics at 12th"
 * or
 *   "B.Tech Electrical OR B.E. Electrical OR recognised equivalent"
 * is representable without bespoke code per notification.
 */
export type EducationRule =
  | {
      kind: 'QUALIFICATION';
      level: QualificationLevel;
      /** Accept any qualification ranked at or above `level`. */
      orHigher?: boolean;
      /** Acceptable canonical degree families; empty = any. */
      degreeFamilies?: string[];
      /** Acceptable canonical discipline slugs; empty = any. */
      disciplines?: string[];
      minPercentage?: number;
      minCgpa?: number;
      /** Require a completed/awarded qualification (rejects result-awaited). */
      mustBeCompleted?: boolean;
      /** Result must be declared on or before this ISO date. */
      completedBefore?: string;
      /**
       * Notification explicitly allows equivalent qualifications. When the
       * candidate's degree family does not match exactly but this is true,
       * the engine reports CONDITIONAL rather than FAIL.
       */
      equivalentAllowed?: boolean;
      evidence?: SourceEvidence;
    }
  | {
      kind: 'SUBJECT_AT_LEVEL';
      level: QualificationLevel;
      /** Canonical subject slug that must appear at that level. */
      subject: string;
      evidence?: SourceEvidence;
    }
  | { kind: 'ALL_OF'; of: EducationRule[] }
  | { kind: 'ANY_OF'; of: EducationRule[] }
  | { kind: 'NOT'; of: EducationRule };

export interface ExperienceRule {
  /** Minimum total experience in months, across all roles. */
  minTotalMonths?: number;
  /** Minimum experience in months matching `relevantSkills`/`relevantSectors`. */
  minRelevantMonths?: number;
  /** Only count experience accrued AFTER the qualifying degree was awarded. */
  postQualificationOnly?: boolean;
  /** Minimum months in a managerial capacity. */
  minManagerialMonths?: number;
  relevantSkills?: string[];
  relevantSectors?: string[];
  evidence?: SourceEvidence;
}

export type DomicileMode =
  /** No residence restriction. */
  | 'ANY'
  /** Must be a domicile of the specified state. */
  | 'STATE_ONLY'
  /** Must be a domicile of the specified district. */
  | 'DISTRICT_ONLY'
  /** Local candidates get reserved seats; others may still apply. */
  | 'LOCAL_RESERVATION'
  /** Domicile is a preference/tie-breaker, not a bar. */
  | 'PREFERENCE_ONLY';

export interface DomicileRule {
  mode: DomicileMode;
  /** Required state slug when mode is STATE_ONLY / DISTRICT_ONLY. */
  state?: string;
  district?: string;
  evidence?: SourceEvidence;
}

export interface ExamScoreRule {
  /** Canonical exam code, e.g. "GATE". */
  exam: string;
  minScore?: number;
  minPercentile?: number;
  maxRank?: number;
  /** Score must be from one of these years. */
  acceptedYears?: number[];
  /** Score must still be valid on this ISO date. */
  validOn?: string;
  evidence?: SourceEvidence;
}

export interface PhysicalRule {
  minHeightCm?: Partial<Record<'MALE' | 'FEMALE' | 'TRANSGENDER', number>>;
  minChestCm?: number;
  minChestExpansionCm?: number;
  evidence?: SourceEvidence;
}

export interface SpeedRule {
  minTypingWpmEnglish?: number;
  minTypingWpmHindi?: number;
  minShorthandWpm?: number;
  evidence?: SourceEvidence;
}

/**
 * The full structured rule set for one vacancy.
 *
 * Every field is optional: a notification that says nothing about domicile
 * simply omits `domicile`, and the engine reports that rule as
 * NOT_APPLICABLE rather than inventing a restriction.
 */
export interface EligibilityRules {
  age?: AgeRule;
  education?: EducationRule;
  experience?: ExperienceRule;
  domicile?: DomicileRule;
  /** Allowed nationalities; omit for "no stated restriction". */
  nationalities?: string[];
  /** Categories the vacancy is restricted to (rare; e.g. a backlog drive). */
  restrictedToCategories?: CandidateCategory[];
  /** Gender restriction where the notification legally specifies one. */
  restrictedToGender?: Array<'MALE' | 'FEMALE' | 'TRANSGENDER'>;
  examScores?: ExamScoreRule[];
  physical?: PhysicalRule;
  speeds?: SpeedRule;
  requiresDrivingLicence?: boolean;
  drivingLicenceClasses?: string[];
  /** Languages the candidate must know. */
  requiredLanguages?: string[];
  requiresEmploymentExchangeRegistration?: boolean;
  /** Maximum permitted number of prior attempts at this exam. */
  maxAttempts?: number;

  /** Mandatory skills for private roles. */
  mandatorySkills?: string[];
  /** Preferred (nice-to-have) skills — NEVER a basis for NOT_ELIGIBLE. */
  preferredSkills?: string[];

  /**
   * Set by the extractor when the notification could not be modelled with
   * acceptable confidence. Forces MANUAL_REVIEW so the product never asserts
   * a statutory verdict it cannot defend.
   */
  needsManualReview?: boolean;
  manualReviewReason?: string;
}

// ─────────────────────────────────────────────────────────────────────────
// Canonical Job
// ─────────────────────────────────────────────────────────────────────────

export type JobStatus =
  | 'UPCOMING'
  | 'OPEN'
  | 'CLOSING_SOON'
  | 'CLOSED'
  | 'CANCELLED'
  | 'ON_HOLD'
  | 'RESULT_STAGE';

export interface SalaryRange {
  min?: number;
  max?: number;
  currency?: string;
  period?: 'MONTH' | 'YEAR';
  /** 7th CPC pay level or equivalent grade string. */
  payLevel?: string;
}

export interface SourceDocument {
  kind: 'NOTIFICATION' | 'CORRIGENDUM' | 'ADDENDUM' | 'RESULT' | 'OTHER';
  url: string;
  title?: string;
  publishedAt?: string;
  /** SHA-256 of the fetched bytes — the reprocess guard. */
  contentHash?: string;
}

export interface SelectionStage {
  order: number;
  name: string;
  description?: string;
}

export interface ApplicationFee {
  general?: number;
  obc?: number;
  scSt?: number;
  women?: number;
  pwbd?: number;
  currency?: string;
  notes?: string;
}

/** Category-wise vacancy split where the notification publishes one. */
export interface VacancyBreakdown {
  total?: number;
  byCategory?: Partial<Record<CandidateCategory | 'PWBD' | 'EWS', number>>;
}

/**
 * One vacancy, normalised from whatever source it came from.
 *
 * `version` + `sourceHash` are the backbone of the cost-safety design:
 * ingestion re-parses (and therefore spends AI tokens) only when the hash
 * changes. A corrigendum produces version N+1 rather than silently
 * overwriting history, so affected users can be re-notified.
 */
export interface Job {
  jobId: string;
  sector: JobSector;
  organization: string;
  /** Parent ministry / department, for PSUs and government bodies. */
  parentOrganization?: string;
  title: string;
  /** Official advertisement / notice number, a strong dedup key. */
  advertisementNumber?: string;

  description?: string;
  locations: string[];
  /** State slug when the posting is state-specific. */
  state?: string | null;

  employmentType: EmploymentType;
  workPreference?: WorkPreference;
  vacancies?: VacancyBreakdown;

  /** ISO datetimes. */
  applicationOpen?: string;
  applicationDeadline?: string;
  examDate?: string;

  officialJobUrl: string;
  officialApplyUrl?: string;

  salary?: SalaryRange;
  eligibilityRules: EligibilityRules;
  selectionProcess?: SelectionStage[];
  applicationFee?: ApplicationFee;
  sourceDocuments?: SourceDocument[];

  /** Registry id of the connector that produced this record. */
  sourceId: string;
  sourceTrustLevel: SourceTrustLevel;
  /** Stable id assigned by the source, for cross-run dedup. */
  sourceJobId?: string;
  canonicalUrl?: string;
  /** SHA-256 over the normalised source payload. Unchanged hash = skip. */
  sourceHash: string;

  publishedAt?: string;
  /** Last time ingestion confirmed this record still reflects the source. */
  lastVerifiedAt?: string;
  lastSeenAt?: string;

  /** Bumped whenever eligibility-relevant content changes. */
  version: number;
  status: JobStatus;

  createdAt: string;
  updatedAt: string;
}

// ─────────────────────────────────────────────────────────────────────────
// Eligibility results
// ─────────────────────────────────────────────────────────────────────────

export type EligibilityStatus =
  /** Every mandatory criterion demonstrably passes. */
  | 'ELIGIBLE'
  /** At least one hard requirement demonstrably fails. */
  | 'NOT_ELIGIBLE'
  /** Depends on a condition the engine cannot settle automatically. */
  | 'CONDITIONALLY_ELIGIBLE'
  /** A required candidate attribute is missing from the profile. */
  | 'PROFILE_INCOMPLETE'
  /** Notification too ambiguous to decide — needs a human. */
  | 'MANUAL_REVIEW';

export type RuleStatus =
  | 'PASS'
  | 'FAIL'
  /** Cannot decide: candidate data missing. */
  | 'UNKNOWN'
  /** Passes only if an external condition holds. */
  | 'CONDITIONAL'
  /** The vacancy states no such requirement. */
  | 'NOT_APPLICABLE';

export type RuleCode =
  | 'AGE'
  | 'EDUCATION'
  | 'EXPERIENCE'
  | 'DOMICILE'
  | 'NATIONALITY'
  | 'CATEGORY'
  | 'GENDER'
  | 'EXAM_SCORE'
  | 'PHYSICAL'
  | 'SPEED'
  | 'DRIVING_LICENCE'
  | 'LANGUAGE'
  | 'EMPLOYMENT_EXCHANGE'
  | 'MANDATORY_SKILLS';

/** One line of the "Why this result?" table. */
export interface RuleEvaluation {
  rule: RuleCode;
  /** Short human label, e.g. "Age". */
  label: string;
  /** What the vacancy demands, human readable. */
  required: string;
  /** What the candidate has, human readable. */
  candidate: string;
  status: RuleStatus;
  /** Extra explanation shown under the row when present. */
  detail?: string;
  /** Profile field names that would resolve an UNKNOWN. */
  missingFields?: string[];
  /** Traceability back to the official document. */
  evidence?: SourceEvidence;
}

export interface EligibilityResult {
  status: EligibilityStatus;
  /** Per-rule breakdown, always populated — never just a bare verdict. */
  rules: RuleEvaluation[];
  /** Human-readable reasons the candidate is barred. */
  blockingReasons: string[];
  /** Profile fields to collect, for progressive profiling prompts. */
  missingProfileFields: string[];
  /** Non-blocking caveats (e.g. "domicile is a preference only"). */
  warnings: string[];
  evaluatedAt: string;
  /** Cache-key inputs, echoed so a stale verdict is detectable. */
  jobVersion: number;
  profileVersion: number;
}

// ─────────────────────────────────────────────────────────────────────────
// Private-sector fit
// ─────────────────────────────────────────────────────────────────────────

export type FitBand = 'STRONG' | 'GOOD' | 'POSSIBLE' | 'WEAK';

/** Configurable component weights; must sum to 1. */
export interface FitWeights {
  mandatory: number;
  skills: number;
  experience: number;
  education: number;
  location: number;
  preferred: number;
}

export const DEFAULT_FIT_WEIGHTS: FitWeights = {
  mandatory: 0.5,
  skills: 0.2,
  experience: 0.15,
  education: 0.05,
  location: 0.05,
  preferred: 0.05,
};

export interface FitComponent {
  component: keyof FitWeights;
  label: string;
  /** 0-1 score for this component. */
  score: number;
  weight: number;
  detail?: string;
}

/**
 * Private-job outcome. Note the deliberate separation: `canApply` answers the
 * mandatory-requirement question, while `score` answers "how well do I fit".
 * A missing *preferred* skill lowers the score but never blocks applying.
 */
export interface FitResult {
  /** Whether every mandatory requirement is satisfied. */
  canApply: boolean;
  /** 0-100, rounded. */
  score: number;
  band: FitBand;
  matched: string[];
  missing: string[];
  /** Missing but explicitly preferred-only — shown separately, never a bar. */
  preferredMissing: string[];
  components: FitComponent[];
  /** Mandatory gaps that make `canApply` false. */
  blockingReasons: string[];
  missingProfileFields: string[];
}

// ─────────────────────────────────────────────────────────────────────────
// Saved jobs & application tracking
// ─────────────────────────────────────────────────────────────────────────

/**
 * Application funnel state.
 *
 * NOTE: 'INTERVIEW' here is purely a tracking status the user sets on their
 * own application — it is unrelated to the removed Live Interview feature.
 */
export type ApplicationStatus =
  | 'SAVED'
  | 'STARTED_APPLICATION'
  | 'APPLIED'
  | 'EXAM_SCHEDULED'
  | 'INTERVIEW'
  | 'OFFER'
  | 'REJECTED'
  | 'WITHDRAWN'
  | 'NOT_INTERESTED';

export interface JobApplicationRecord {
  jobId: string;
  userId: string;
  status: ApplicationStatus;
  savedAt?: string;
  appliedAt?: string;
  notes?: string;
  createdAt: string;
  updatedAt: string;
}
