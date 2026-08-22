/**
 * Cron job workers — the actual business logic behind each scheduled task.
 *
 * Previously this logic lived inline inside the HTTP cron endpoints in app.ts
 * and was only ever triggered by an EXTERNAL GitHub Actions scheduler. That
 * coupled a core product feature (automatic / re-engagement notifications) to
 * a GitHub workflow + a shared CRON_SECRET that had to match the deployed API.
 *
 * Founder ask: "jab mera app hai to mai GitHub pe kyun depend karu? sab kuch
 * admin panel se chalna chahiye." So each job is now a plain, dependency-bag
 * function that the in-process scheduler (scheduler.ts) calls directly — no
 * HTTP hop, no secret, no GitHub. The same functions also back the admin
 * "Run now" buttons and the (kept-for-compat) HTTP cron endpoints.
 *
 * Every function is non-throwing-by-design at the per-user level and returns a
 * small summary object for the admin status panel.
 */

import type { Firestore } from 'firebase-admin/firestore';
import type { Logger } from '../logger.js';
import type { Env } from '../env.js';
import type { UserStore } from './userStore.js';
import type { NotificationStore } from './notificationStore.js';
import type { NotificationLogStore } from './notificationLogStore.js';
import type { PushService } from './pushService.js';
import type { ExamDatesStore } from './examDatesStore.js';
import type { CurrentAffairsStore } from './currentAffairsStore.js';
import type { AIEngine } from './aiEngine.js';
import type { AIModelResolver } from './aiModelResolver.js';
import type { ChapterStore } from './chapterStore.js';
import type { ServiceKeyStore } from './serviceKeyStore.js';
import type { CouponStore } from './couponStore.js';
import { notifyUser } from './notificationService.js';
import { nearestUpcomingExam, buildReengageNotification } from './reengage.js';

/**
 * Everything the cron workers might need. Built once in buildApp() and shared
 * by the scheduler, the admin Run-now endpoint, and the HTTP cron endpoints.
 */
export interface CronJobDeps {
  fs: Firestore | null;
  logger: Logger;
  env: Env;
  users: UserStore;
  notifications: NotificationStore;
  notificationLogs: NotificationLogStore;
  push?: PushService;
  examDates: ExamDatesStore;
  currentAffairs: CurrentAffairsStore;
  aiEngine: AIEngine;
  modelResolver: AIModelResolver;
  chapters: ChapterStore;
  serviceKeys: ServiceKeyStore;
  /** Coupon store — needed so the payment-reconciliation job can grant plans
   *  (grantPlan records coupon usage). */
  coupons: CouponStore;
}

/** A user row shape (subset) read from the `users` collection. */
interface UserRow {
  email?: string;
  name?: string;
  language?: 'en' | 'hi';
  targetExam?: string | null;
  currentStreak?: number | null;
  lastDailyAt?: string | null;
}

// ─── Streak-at-risk reminder (daily ~19:00 IST) ─────────────────────────────

/**
 * Email + in-app/push nudge to users with an active streak who haven't
 * studied yet today, so they don't lose it.
 */
export async function runStreakCheck(deps: CronJobDeps): Promise<{ sent: number; skipped: number }> {
  const { fs, logger, env, users, notifications, notificationLogs, push, serviceKeys } = deps;
  logger.info('cron.streak_check_start');
  let sent = 0;
  let skipped = 0;
  if (!fs) return { sent, skipped };

  const { createEmailService } = await import('./emailService.js');
  const emailService = createEmailService(env, logger, serviceKeys);

  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  const todayISO = todayStart.toISOString();

  const snap = await fs.collection('users').where('currentStreak', '>', 0).limit(500).get();

  for (const doc of snap.docs) {
    const u = doc.data() as UserRow;
    // Skip if already active today, or no email to mail.
    if (u.lastDailyAt && u.lastDailyAt >= todayISO) { skipped++; continue; }
    if (!u.email) { skipped++; continue; }

    const success = await emailService.sendStreakReminder(
      u.email,
      u.name ?? 'Student',
      u.currentStreak ?? 0,
      (u.language as 'en' | 'hi') ?? 'en',
    );
    if (success) sent++;
    // Also drop an in-app inbox notification (+ push) so users who didn't
    // grant email but use the app still get nudged.
    await notifyUser({ notifications, users, push, logs: notificationLogs, logger }, doc.id, {
      type: 'streak',
      title: `🔥 ${u.currentStreak ?? 0}-day streak at risk!`,
      body: 'Study a little today to keep your streak alive.',
      link: '/dashboard',
      dedupeKey: 'streak-reminder',
    }, { push: true, source: 'streak', userInfo: { ...(u.email ? { email: u.email } : {}), ...(u.name ? { name: u.name } : {}) } });
  }

  logger.info('cron.streak_check_done', { sent, skipped });
  return { sent, skipped };
}

// ─── Daily current-affairs digest (daily ~07:00 IST) ────────────────────────

/**
 * Single in-app notification (+ push) about fresh current affairs to users
 * active in the last 7 days. Deduped once/day so it never spams.
 */
export async function runDailyDigest(deps: CronJobDeps): Promise<{ notified: number }> {
  const { fs, logger, users, notifications, notificationLogs, push } = deps;
  logger.info('cron.daily_digest_start');
  let notified = 0;
  if (!fs) return { notified };

  // Active in the last 7 days = worth nudging; cap the batch for cost.
  const since = new Date(Date.now() - 7 * 86_400_000).toISOString();
  const snap = await fs.collection('users').where('lastDailyAt', '>=', since).limit(1000).get();

  for (const doc of snap.docs) {
    const u = doc.data() as UserRow;
    const ok = await notifyUser({ notifications, users, push, logs: notificationLogs, logger }, doc.id, {
      type: 'current_affairs',
      title: "📰 Today's current affairs are ready",
      body: 'Fresh headlines + a quick quiz are waiting. Keep your prep current!',
      link: '/current-affairs',
      dedupeKey: 'current-affairs-daily',
    }, { push: true, source: 'daily-digest', userInfo: { ...(u.email ? { email: u.email } : {}), ...(u.name ? { name: u.name } : {}) } });
    if (ok) notified++;
  }

  logger.info('cron.daily_digest_done', { notified });
  return { notified };
}

// ─── Re-engagement nudge (hourly) ───────────────────────────────────────────

/**
 * Targets users who were active recently (real, engaged users) but have now
 * been idle for 5h+. Sends ONE personalized push (+ inbox) chosen from:
 * nearest exam countdown → streak at risk → generic come-back. Deduped
 * once/day (dedupeKey 'reengage') so the hourly run never over-nudges.
 */
export async function runReengage(deps: CronJobDeps): Promise<{ sent: number; skipped: number }> {
  const { fs, logger, users, notifications, notificationLogs, push, examDates } = deps;
  logger.info('cron.reengage_start');
  let sent = 0;
  let skipped = 0;
  if (!fs) return { sent, skipped };

  const now = new Date();
  // Idle window: last seen between 30h ago (lower) and 5h ago (upper).
  // >=5h idle = worth nudging; <=30h ago = still active, not dormant.
  const upperIso = new Date(now.getTime() - 5 * 60 * 60 * 1000).toISOString();
  const lowerIso = new Date(now.getTime() - 30 * 60 * 60 * 1000).toISOString();
  const snap = await fs.collection('users')
    .where('lastActiveAt', '>=', lowerIso)
    .where('lastActiveAt', '<=', upperIso)
    .limit(1000)
    .get();

  // Cache exam calendars per slug so we don't refetch for every user.
  const examCache = new Map<string, Awaited<ReturnType<typeof examDates.get>>>();

  for (const doc of snap.docs) {
    const u = doc.data() as UserRow;

    let exam = null;
    if (u.targetExam) {
      if (!examCache.has(u.targetExam)) {
        examCache.set(u.targetExam, await examDates.get(u.targetExam).catch(() => null));
      }
      exam = nearestUpcomingExam(examCache.get(u.targetExam) ?? null, now);
    }

    const notification = buildReengageNotification(
      { language: u.language ?? 'en', currentStreak: u.currentStreak ?? 0, lastDailyAt: u.lastDailyAt ?? null },
      exam,
      now,
    );
    if (!notification) { skipped++; continue; }

    const ok = await notifyUser(
      { notifications, users, push, logs: notificationLogs, logger },
      doc.id,
      notification,
      { push: true, source: 'reengage', userInfo: { ...(u.email ? { email: u.email } : {}), ...(u.name ? { name: u.name } : {}) } },
    );
    if (ok) sent++; else skipped++;
  }

  logger.info('cron.reengage_done', { sent, skipped });
  return { sent, skipped };
}

// ─── Current-affairs RSS ingestion (every 30 min) ───────────────────────────

/**
 * Pull the RSS sources → AI summary → Hindi, persisting fresh current-affairs
 * items. Records the last-ingested timestamp for the admin feeds page.
 */
export async function runCurrentAffairsIngest(deps: CronJobDeps): Promise<Record<string, unknown>> {
  const { currentAffairs, env, logger, aiEngine, modelResolver } = deps;
  logger.info('cron.ingest_start');
  const { ingestCurrentAffairs } = await import('./rssIngestion.js');
  const result = await ingestCurrentAffairs(currentAffairs, env, logger, aiEngine, modelResolver);
  await currentAffairs.setLastIngestedAt(new Date().toISOString());
  logger.info('cron.ingest_done', { ...result });
  return { ...result };
}

// ─── Daily Current-Affairs quiz (daily ~12:00 IST) ──────────────────────────

/**
 * Generate the ONE shared Current Affairs quiz for the day (30 MCQs, fact-
 * checked) in English + Hindi, store it keyed by the IST date, and push a
 * notification to ALL users that the quiz is live.
 *
 * Why once-a-day (founder plan): a single fixed daily quiz makes the
 * leaderboard a fair competition (everyone answers the same questions), and
 * generating once — instead of on every content change — means fewer AI calls,
 * lower cost, and one well-verified set instead of many shaky ones.
 */
export async function runDailyQuizGenerate(deps: CronJobDeps): Promise<Record<string, unknown>> {
  const { currentAffairs, aiEngine, users, push, logger } = deps;
  logger.info('cron.daily_quiz_start');

  const istKey = new Date(Date.now() + 5.5 * 60 * 60 * 1000).toISOString().split('T')[0]!;

  // Build headlines from today's current affairs (light dedup by headline).
  const raw = await currentAffairs.getTodayItems(istKey).catch(() => [] as Awaited<ReturnType<typeof currentAffairs.getTodayItems>>);
  const seen = new Set<string>();
  const items = raw.filter((it) => {
    const key = (it.headline || '').toLowerCase().replace(/[^a-z0-9\s]/g, '').split(/\s+/).filter(w => w.length > 2).slice(0, 8).join(' ');
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  if (items.length === 0) {
    logger.warn('cron.daily_quiz_no_content', { date: istKey });
    return { generated: 0, reason: 'no content' };
  }

  const count = items.length >= 10 ? 30 : Math.min(30, Math.max(10, items.length * 3));
  const headlines = items.map(it => `[${it.category}] ${it.headline}: ${it.summary}`).join('\n');

  let generated = 0;
  let enQuestions: Awaited<ReturnType<typeof aiEngine.generateCurrentAffairsQuiz>> | null = null;
  let hiQuestions: Awaited<ReturnType<typeof aiEngine.generateCurrentAffairsQuiz>> | null = null;
  try {
    const en = await aiEngine.generateCurrentAffairsQuiz(headlines, count, 'en');
    if (en?.length) { await currentAffairs.saveDailyQuiz(istKey, en); generated = en.length; enQuestions = en; }
  } catch (err) {
    logger.error('cron.daily_quiz_en_failed', { error: err instanceof Error ? err.message : String(err) });
  }
  try {
    const hi = await aiEngine.generateCurrentAffairsQuiz(headlines, count, 'hi');
    if (hi?.length) { await currentAffairs.saveDailyQuiz(`${istKey}-hi`, hi); hiQuestions = hi; }
  } catch (err) {
    logger.warn('cron.daily_quiz_hi_failed', { error: err instanceof Error ? err.message : String(err) });
  }

  if (generated === 0) {
    logger.error('cron.daily_quiz_failed', { date: istKey });
    return { generated: 0, reason: 'generation failed' };
  }

  // Persist a permanent, ISOLATED archive of the full Q&A (en+hi) + a
  // headline snapshot. Lives in `quizArchive/{date}`, untouched by the 24h
  // current-affairs content cleanup, so past quizzes stay reviewable forever.
  try {
    await currentAffairs.archiveQuiz(istKey, {
      ...(enQuestions ? { en: enQuestions } : {}),
      ...(hiQuestions ? { hi: hiQuestions } : {}),
      headlines: items.slice(0, 40).map(it => it.headline).filter(Boolean),
    });
  } catch (err) {
    logger.warn('cron.daily_quiz_archive_failed', { error: err instanceof Error ? err.message : String(err) });
  }

  // Push to ALL users that the quiz is live (en/hi split by token language).
  let pushed = 0;
  if (push) {
    try {
      const all = (await users.listAll?.()) ?? [];
      const enTokens: string[] = [];
      const hiTokens: string[] = [];
      for (const u of all) {
        const toks = (u as { fcmTokens?: Array<{ token: string; lang?: string }> }).fcmTokens;
        if (!Array.isArray(toks)) continue;
        for (const t of toks) {
          if (!t?.token) continue;
          if (t.lang === 'hi') hiTokens.push(t.token); else enTokens.push(t.token);
        }
      }
      if (enTokens.length) {
        const r = await push.sendToTokens(enTokens, {
          title: "📰 Today's Current Affairs Quiz is live!",
          body: 'Fresh 30-question quiz + leaderboard. Test yourself now!',
          link: 'https://app.nexigrate.com/current-affairs/quiz',
        });
        pushed += r.successCount;
      }
      if (hiTokens.length) {
        const r = await push.sendToTokens(hiTokens, {
          title: '📰 आज का करंट अफेयर्स क्विज़ आ गया!',
          body: '30 नए सवाल + लीडरबोर्ड। अभी खेलकर टॉप करें!',
          link: 'https://app.nexigrate.com/current-affairs/quiz',
        });
        pushed += r.successCount;
      }
    } catch (err) {
      logger.warn('cron.daily_quiz_push_failed', { error: err instanceof Error ? err.message : String(err) });
    }
  }

  logger.info('cron.daily_quiz_done', { date: istKey, generated, pushed });
  return { date: istKey, questions: generated, pushed };
}

// ─── Weekly stale-content refresh (Sun ~04:00 IST) ──────────────────────────

/**
 * Regenerate the stalest cached chapter content so study material stays
 * current with the latest syllabus. Honours optional days/limit overrides
 * (used by manual admin runs) else falls back to env-configured defaults.
 */
export async function runContentRefresh(
  deps: CronJobDeps,
  days?: number,
  limit?: number,
): Promise<{ scanned: number; refreshed: number; days: number; limit: number }> {
  const { aiEngine, chapters, logger, env } = deps;
  logger.info('cron.content_refresh_start');
  const { refreshStaleContent } = await import('./contentRefresh.js');
  const d = days ?? env.CONTENT_REFRESH_DAYS;
  const l = limit ?? env.CONTENT_REFRESH_BATCH;
  const result = await refreshStaleContent({ aiEngine, chapters, logger }, d, l);
  logger.info('cron.content_refresh_done', { ...result, days: d, limit: l });
  return { ...result, days: d, limit: l };
}
