/**
 * 4-Tier Content Personalization System.
 *
 * Maps from the internal 3-level assessment (beginner/intermediate/advanced)
 * to a 4-tier content depth system that controls chapter generation prompts.
 *
 * The DB continues to store `onboardingLevel` as beginner/intermediate/advanced.
 * The 4-tier is a CONTENT GENERATION refinement that gives finer granularity
 * in what depth of material each student sees.
 *
 * Tier resolution:
 *   - beginner  → foundation  (score 0-29%)
 *   - beginner  → building    (score 30-49%) — via quiz performance upgrade
 *   - intermediate → strengthening (score 50-74%)
 *   - advanced  → mastery     (score 75-100%)
 *
 * The effective tier is computed from: assessment score + ongoing quiz
 * performance. A student can progress UP within their level band without
 * needing a full reassessment.
 */

export type StudentTier = 'foundation' | 'building' | 'strengthening' | 'mastery';

export interface TierConfig {
  /** Internal tier identifier. */
  id: StudentTier;
  /** English display label. */
  label: string;
  /** Hindi display label. */
  labelHi: string;
  /** Assessment score range that maps to this tier. */
  minScore: number;
  maxScore: number;
  /** Target word count range for AI-generated chapter content. */
  wordCountMin: number;
  wordCountMax: number;
  /** Content generation tone/depth descriptor for the AI prompt. */
  promptGuidance: string;
  /** Maps to the legacy 3-level system for backward compat. */
  legacyLevel: 'beginner' | 'intermediate' | 'advanced';
}

export const TIER_CONFIG: Readonly<Record<StudentTier, TierConfig>> = {
  foundation: {
    id: 'foundation',
    label: 'Foundation',
    labelHi: 'शुरुआत',
    minScore: 0,
    maxScore: 29,
    wordCountMin: 600,
    wordCountMax: 800,
    promptGuidance: 'Explain like the student is encountering this topic for the first time. Use daily-life analogies, simple Hindi/English mix, and ZERO jargon. Focus on "what is this" and "why does it matter". End with 3 easy memory tricks.',
    legacyLevel: 'beginner',
  },
  building: {
    id: 'building',
    label: 'Building',
    labelHi: 'निर्माण',
    minScore: 30,
    maxScore: 49,
    wordCountMin: 800,
    wordCountMax: 1000,
    promptGuidance: 'Explain each concept clearly with examples. Connect to NCERT textbook language. Include some exam-focused facts and formulae. End with a key-facts list the student can revise quickly.',
    legacyLevel: 'beginner',
  },
  strengthening: {
    id: 'strengthening',
    label: 'Strengthening',
    labelHi: 'मजबूती',
    minScore: 50,
    maxScore: 74,
    wordCountMin: 1000,
    wordCountMax: 1200,
    promptGuidance: 'Assume basic understanding exists. Go deeper: PYQ patterns, inter-topic connections, important numbers/dates/formulae. Include previous-year question insights. End with exam strategy notes.',
    legacyLevel: 'intermediate',
  },
  mastery: {
    id: 'mastery',
    label: 'Mastery',
    labelHi: 'विशेषज्ञता',
    minScore: 75,
    maxScore: 100,
    wordCountMin: 1200,
    wordCountMax: 1500,
    promptGuidance: 'Expert-level analysis. Critical thinking, recent developments, common examiner traps. Comparative analysis with related topics. Advanced problem-solving approaches. End with scoring strategy and edge-case awareness.',
    legacyLevel: 'advanced',
  },
} as const;

/** Ordered array of tiers from lowest to highest. */
export const TIERS_ORDERED: readonly StudentTier[] = ['foundation', 'building', 'strengthening', 'mastery'];

/**
 * Resolve the content tier from an assessment score percentage (0-100).
 */
export function tierFromScore(scorePercent: number): StudentTier {
  if (scorePercent >= 75) return 'mastery';
  if (scorePercent >= 50) return 'strengthening';
  if (scorePercent >= 30) return 'building';
  return 'foundation';
}

/**
 * Map from the legacy 3-level system to the default 4-tier.
 * Used when a user has no score data but has an `onboardingLevel`.
 */
export function tierFromLevel(level: 'beginner' | 'intermediate' | 'advanced' | null | undefined): StudentTier {
  switch (level) {
    case 'advanced': return 'mastery';
    case 'intermediate': return 'strengthening';
    case 'beginner': return 'building';
    default: return 'building';
  }
}

/**
 * Map from 4-tier back to the legacy 3-level for DB storage and existing
 * code paths that still read `onboardingLevel`.
 */
export function levelFromTier(tier: StudentTier): 'beginner' | 'intermediate' | 'advanced' {
  return TIER_CONFIG[tier].legacyLevel;
}

/**
 * Compute effective tier from a user's study evidence.
 * Uses quiz performance to allow intra-level progression.
 *
 * @param baseLevel - The user's onboarding assessment level
 * @param avgScore - Average chapter quiz score (0-100), or null if no quizzes yet
 * @param passedChapters - Number of chapters passed (score >= 80%)
 */
export function computeEffectiveTier(
  baseLevel: 'beginner' | 'intermediate' | 'advanced' | null | undefined,
  avgScore: number | null,
  passedChapters: number,
): StudentTier {
  // If no quiz data, use the level → tier mapping
  if (avgScore === null || passedChapters === 0) {
    return tierFromLevel(baseLevel);
  }

  // With evidence: use the score-based tier, but never go BELOW the base level's
  // minimum tier (monotonic progression principle).
  const evidenceTier = tierFromScore(avgScore);
  const baseTier = tierFromLevel(baseLevel);

  const tierRank: Record<StudentTier, number> = { foundation: 0, building: 1, strengthening: 2, mastery: 3 };

  return tierRank[evidenceTier] >= tierRank[baseTier] ? evidenceTier : baseTier;
}

/**
 * Get the tier display label in the user's language.
 */
export function tierDisplayName(tier: StudentTier, language: 'en' | 'hi' = 'en'): string {
  return language === 'hi' ? TIER_CONFIG[tier].labelHi : TIER_CONFIG[tier].label;
}
