/**
 * Difficulty-level progression (PR "adaptive learning core").
 *
 * The one-time onboarding assessment sets `user.onboardingLevel`. From then
 * on the student's *working* level should climb as they actually study —
 * read chapters, pass quizzes — so the content they're served gets harder
 * to match their growing ability. That climbing value lives in
 * `user.currentLevel`; this module is the single source of truth for both
 * reading the effective level and computing the next one.
 *
 * Design rules:
 *   - Effective level = currentLevel ?? onboardingLevel ?? 'intermediate'.
 *   - Promotion is evidence-based: it needs a minimum number of *completed*
 *     (passed) chapters AND a healthy average score, so a single lucky quiz
 *     can't jump a beginner to advanced.
 *   - Monotonic upward: we never demote. A bad day shouldn't knock a student
 *     back to easier content. We also never drop below the assessment
 *     baseline (`onboardingLevel`).
 */

export type Level = 'beginner' | 'intermediate' | 'advanced';

const RANK: Record<Level, number> = { beginner: 0, intermediate: 1, advanced: 2 };
const BY_RANK: Level[] = ['beginner', 'intermediate', 'advanced'];

/** Minimal user shape this module needs (keeps it decoupled from StoredUser). */
export interface LevelUser {
  onboardingLevel?: Level | null;
  currentLevel?: Level | null;
}

/** The level content/quiz generation should actually use right now. */
export function effectiveLevel(user: LevelUser | null | undefined): Level {
  return user?.currentLevel ?? user?.onboardingLevel ?? 'intermediate';
}

/**
 * Map raw study evidence → a candidate level.
 *
 *   - advanced     : ≥ 12 chapters passed AND average score ≥ 85%
 *   - intermediate : ≥  4 chapters passed AND average score ≥ 70%
 *   - beginner     : everything below that
 *
 * `passedChapters` = chapters scored ≥ 80% (the app-wide passing gate).
 * `avgScore` is the mean of all attempted chapter scores (0–100).
 */
export function computeProgressLevel(passedChapters: number, avgScore: number): Level {
  if (passedChapters >= 12 && avgScore >= 85) return 'advanced';
  if (passedChapters >= 4 && avgScore >= 70) return 'intermediate';
  return 'beginner';
}

/**
 * Resolve the level a user should be promoted TO, given fresh study evidence.
 * Returns the highest of {assessment baseline, current working level,
 * evidence-based candidate} — so it only ever ratchets up.
 */
export function nextLevel(user: LevelUser | null | undefined, passedChapters: number, avgScore: number): Level {
  const baseline = user?.onboardingLevel ?? 'beginner';
  const current = user?.currentLevel ?? baseline;
  const candidate = computeProgressLevel(passedChapters, avgScore);
  const topRank = Math.max(RANK[baseline], RANK[current], RANK[candidate]);
  return BY_RANK[topRank]!;
}

/** True when `next` is a strictly higher level than the user's current one. */
export function isPromotion(user: LevelUser | null | undefined, next: Level): boolean {
  const current = user?.currentLevel ?? user?.onboardingLevel ?? 'beginner';
  return RANK[next] > RANK[current];
}
