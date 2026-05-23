import {
  asISODateTime,
  STREAK_MILESTONES,
  type CreditEventId,
  type ISODateTime,
  type StreakBadge,
  type UserId,
} from '@nexigrate/shared';
import { award } from '@nexigrate/credits';
import type { LedgerStore } from '../routes/credits.js';
import type { Logger } from '../logger.js';
import type { StoredUser, UserStore } from './userStore.js';

/**
 * Award any streak-milestone badges the user has just qualified for.
 *
 * Called by the daily-MCQ session-complete handler AFTER bumpStreak() has
 * updated the user's currentStreak. We compare existing badges (by kind)
 * against STREAK_MILESTONES and award the bonus credits + persist the
 * badge for any milestone the user has crossed.
 *
 * Idempotent on (userId, badge.kind): the underlying credit award uses
 * `streak:${kind}` as its idempotencyKey so a re-run on the same day is a
 * no-op at the ledger AND the user-store layer.
 */
export interface AwardStreakBadgesDeps {
  users: UserStore;
  ledger: LedgerStore;
  logger: Logger;
  newId: () => CreditEventId;
  now: () => ISODateTime;
}

export interface AwardedBadge {
  badge: StreakBadge;
  newBalance: number;
}

export async function awardStreakBadges(
  user: StoredUser,
  deps: AwardStreakBadgesDeps,
): Promise<AwardedBadge[]> {
  const currentStreak = user.currentStreak ?? 0;
  if (currentStreak <= 0) return [];

  const earnedKinds = new Set((user.streakBadges ?? []).map((b) => b.kind));
  const newlyQualified = STREAK_MILESTONES.filter(
    (m) => currentStreak >= m.threshold && !earnedKinds.has(m.kind),
  );
  if (newlyQualified.length === 0) return [];

  const awarded: AwardedBadge[] = [];
  for (const milestone of newlyQualified) {
    const events = await deps.ledger.read(user.id);
    const result = award(
      {
        userId: user.id,
        source: 'streak_7d', // re-use the existing earn source for the ledger
        amount: milestone.bonusCredits,
        sourceRef: `streak_milestone:${milestone.kind}`,
        idempotencyKey: `streak:${milestone.kind}:${user.id}`,
      },
      events,
      { newId: deps.newId, now: deps.now },
    );

    let newBalance = 0;
    if (result.kind === 'awarded') {
      await deps.ledger.append(result.event);
      newBalance = result.newBalance;
    } else if (result.kind === 'duplicate') {
      newBalance = result.balance;
    }

    const badge: StreakBadge = {
      kind: milestone.kind,
      streak: currentStreak,
      bonusCredits: milestone.bonusCredits,
      earnedAt: deps.now(),
    };
    await deps.users.addStreakBadge(user.id, badge);

    deps.logger.info('streak.badge.awarded', {
      userId: user.id,
      kind: milestone.kind,
      streak: currentStreak,
      bonus: milestone.bonusCredits,
    });

    awarded.push({ badge, newBalance });
  }
  return awarded;
}

/** Cast helper used in places that need a date sentinel before the deps `now`. */
export function _now(): ISODateTime {
  return asISODateTime(new Date().toISOString());
}

/** No-op marker so the type for UserId stays exported in this file. */
export type _StreakBadgeUserId = UserId;
