import type { StreakBadgeKind } from '../types/mcq.js';

/**
 * Streak-milestone configuration.
 *
 * Each milestone awards bonus credits the FIRST time the user's
 * `currentStreak` hits the threshold. Subsequent hits (after a streak break
 * and re-climb) do not re-award the bonus -- award is keyed off the badge
 * already being on the user's `streakBadges` array.
 */
export interface StreakMilestone {
  kind: StreakBadgeKind;
  threshold: number;
  bonusCredits: number;
  label: string;
  earnedCopy: string;
}

export const STREAK_MILESTONES: readonly StreakMilestone[] = [
  {
    kind: 'streak_3',
    threshold: 3,
    bonusCredits: 25,
    label: '3 days',
    earnedCopy: 'Three days in a row. Habit forming.',
  },
  {
    kind: 'streak_7',
    threshold: 7,
    bonusCredits: 100,
    label: '1 week',
    earnedCopy: 'A full week. This is the rhythm winners run.',
  },
  {
    kind: 'streak_30',
    threshold: 30,
    bonusCredits: 500,
    label: '30 days',
    earnedCopy: 'Thirty days. You are now part of the top 5% of beta users.',
  },
  {
    kind: 'streak_100',
    threshold: 100,
    bonusCredits: 2000,
    label: '100 days',
    earnedCopy: 'A hundred days. Most students never get here.',
  },
  {
    kind: 'streak_365',
    threshold: 365,
    bonusCredits: 10000,
    label: '1 year',
    earnedCopy: 'A full year. You changed your life one day at a time.',
  },
] as const;

/** Lookup helper for badge kind -> milestone config. */
export const STREAK_MILESTONE_BY_KIND: Readonly<Record<StreakBadgeKind, StreakMilestone>> =
  Object.fromEntries(STREAK_MILESTONES.map((m) => [m.kind, m])) as Readonly<
    Record<StreakBadgeKind, StreakMilestone>
  >;
