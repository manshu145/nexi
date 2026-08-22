/**
 * Re-engagement nudge builder.
 *
 * Founder ask:
 *   "koi agar is app ko 5-6 hour tak nahi open karta hai to usko notification
 *    jaana chahiye uske personalized data ke aadhar par — kya karna bacha hua
 *    hai, ya exam ka data najdik hai, etc."
 *
 * Given a user + their exam calendar, this picks the single most motivating,
 * personalized message (in the user's language) for the hourly re-engagement
 * cron. Priority:
 *   1. Exam is near        → countdown ("your {exam} is ~N days away")
 *   2. Streak at risk      → "keep your N-day streak alive"
 *   3. Generic next step   → "your current affairs + today's quiz are waiting"
 *
 * Pure + dependency-free so it's trivially testable and keeps app.ts lean.
 */

import type { ExamDates } from './examDatesStore.js';
import type { NewNotification } from './notificationStore.js';

/** Only nudge about an exam if it's within this horizon (keeps it urgent). */
export const REENGAGE_EXAM_HORIZON_DAYS = 120;

const MONTHS: Record<string, number> = {
  jan: 0, january: 0, feb: 1, february: 1, mar: 2, march: 2, apr: 3, april: 3,
  may: 4, jun: 5, june: 5, jul: 6, july: 6, aug: 7, august: 7, sep: 8, sept: 8,
  september: 8, oct: 9, october: 9, nov: 10, november: 10, dec: 11, december: 11,
};

/**
 * Resolve an exam event to a concrete Date.
 *  - Confirmed events use the exact ISO `date`.
 *  - Otherwise we parse `estimatedMonth` ("May 2027", "September 2026") to the
 *    1st of that month. Free-text like "To be announced" → null (skipped).
 */
export function parseExamEventDate(date: string | null, estimatedMonth: string): Date | null {
  if (date) {
    const d = new Date(`${date}T00:00:00Z`);
    return Number.isNaN(d.getTime()) ? null : d;
  }
  const m = estimatedMonth.trim().toLowerCase().match(/^([a-z]+)\.?\s+(\d{4})$/);
  if (!m) return null;
  const monthIdx = MONTHS[m[1]!];
  const year = Number(m[2]);
  if (monthIdx === undefined || !Number.isFinite(year)) return null;
  return new Date(Date.UTC(year, monthIdx, 1));
}

export interface NearestExam {
  examName: string;
  eventName: string;
  days: number;
  isConfirmed: boolean;
}

/** Nearest upcoming exam event within the horizon, or null. */
export function nearestUpcomingExam(examDates: ExamDates | null, now: Date): NearestExam | null {
  if (!examDates?.events?.length) return null;
  let best: NearestExam | null = null;
  for (const ev of examDates.events) {
    const when = parseExamEventDate(ev.date, ev.estimatedMonth);
    if (!when) continue;
    const days = Math.ceil((when.getTime() - now.getTime()) / 86_400_000);
    if (days < 0 || days > REENGAGE_EXAM_HORIZON_DAYS) continue;
    if (!best || days < best.days) {
      best = { examName: examDates.examName, eventName: ev.name, days, isConfirmed: ev.isConfirmed };
    }
  }
  return best;
}

/** True if the user hasn't logged a daily activity yet today (IST). */
function notActiveTodayIST(lastDailyAt: string | null | undefined, now: Date): boolean {
  if (!lastDailyAt) return true;
  const istKey = (d: Date) => {
    const t = new Date(d.getTime() + 5.5 * 60 * 60 * 1000);
    return `${t.getUTCFullYear()}-${t.getUTCMonth()}-${t.getUTCDate()}`;
  };
  return istKey(new Date(lastDailyAt)) !== istKey(now);
}

export interface ReengageUser {
  language?: 'en' | 'hi' | null;
  currentStreak?: number | null;
  lastDailyAt?: string | null;
}

/**
 * Build the personalized re-engagement notification for a user, or null if we
 * decide not to nudge them (currently we always produce at least the generic
 * message, so this only returns null defensively).
 */
export function buildReengageNotification(
  user: ReengageUser,
  exam: NearestExam | null,
  now: Date,
): NewNotification | null {
  const hi = user.language === 'hi';
  const streak = user.currentStreak ?? 0;

  // 1. Exam is near — most motivating signal.
  if (exam) {
    const approx = exam.isConfirmed ? '' : hi ? 'लगभग ' : '~';
    return {
      type: 'general',
      title: hi
        ? `📚 ${exam.examName} में ${approx}${exam.days} दिन बाकी`
        : `📚 ${exam.examName} is ${approx}${exam.days} day${exam.days === 1 ? '' : 's'} away`,
      body: hi
        ? 'काफ़ी देर से आप दिखे नहीं — आज एक टॉपिक revise करके तैयारी पटरी पर रखें।'
        : "You've been away a while — revise one topic today to stay on track.",
      link: '/exam-calendar',
      dedupeKey: 'reengage',
    };
  }

  // 2. Streak at risk — only if they have a streak and haven't studied today.
  if (streak > 0 && notActiveTodayIST(user.lastDailyAt, now)) {
    return {
      type: 'streak',
      title: hi ? `🔥 ${streak}-दिन की streak बचाएँ` : `🔥 Keep your ${streak}-day streak alive`,
      body: hi
        ? 'आज आपने पढ़ाई नहीं की — एक छोटा session आपकी streak बनाए रखेगा।'
        : "You haven't studied today — a quick session keeps your streak going.",
      link: '/dashboard',
      dedupeKey: 'reengage',
    };
  }

  // 3. Generic come-back nudge.
  return {
    type: 'general',
    title: hi ? 'पढ़ाई फिर शुरू करें?' : 'Ready to pick up where you left off?',
    body: hi
      ? "आज के current affairs और एक quick quiz आपका इंतज़ार कर रहे हैं — वापस आइए!"
      : 'Your current affairs and today\'s quiz are waiting — jump back in!',
    link: '/current-affairs',
    dedupeKey: 'reengage',
  };
}
