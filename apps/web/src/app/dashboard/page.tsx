'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  EXAM_BY_SLUG,
  type CreditBalance,
  type ExamDate,
  type ProgressSnapshot,
} from '@nexigrate/shared';
import { Logo } from '~/components/Logo';
import { useAuth } from '~/lib/auth-context';
import { api, type MeResponse } from '~/lib/api';

/**
 * Student dashboard.
 *
 * Three things on screen, always:
 *   1. Today's MCQ card -- one tap to start
 *   2. Credits balance, plus an "expiring soon" hint when relevant
 *   3. Sign out (small, in the top-right)
 *
 * No nav, no notifications, no algorithmic feed. The whole product
 * principle is to keep this page calm.
 */
export default function DashboardPage() {
  const { user, loading, signOut } = useAuth();
  const router = useRouter();

  const [me, setMe] = useState<MeResponse['user'] | null>(null);
  const [balance, setBalance] = useState<CreditBalance | null>(null);
  const [progress, setProgress] = useState<ProgressSnapshot | null>(null);
  const [examDates, setExamDates] = useState<ExamDate[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!loading && !user) router.replace('/signin');
  }, [user, loading, router]);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    (async () => {
      try {
        const [meRes, balRes] = await Promise.all([api.me(), api.getBalance()]);
        if (cancelled) return;
        setMe(meRes.user);
        setBalance(balRes);
        if (!meRes.user.targetExam) {
          router.replace('/onboarding');
          return;
        }
        // Fire-and-forget the progress + dates loads; the cards render
        // their own placeholder until they arrive, so the dashboard
        // doesn't block on them.
        api
          .getProgress(meRes.user.targetExam)
          .then((p) => {
            if (!cancelled) setProgress(p);
          })
          .catch(() => {
            /* dashboard tolerates a missing progress card */
          });
        api
          .listExamDates(meRes.user.targetExam)
          .then((d) => {
            if (!cancelled) setExamDates(d.dates ?? []);
          })
          .catch(() => {
            /* same -- countdown is a nice-to-have */
          });
      } catch (e) {
        if (cancelled) return;
        setError(e instanceof Error ? e.message : 'failed to load');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [user, router]);

  // IMPORTANT: all hooks must be called on every render in the same order.
  // Keep these useMemos ABOVE any early return (the loading/!user guard
  // below) -- otherwise React throws error #310 ("Rendered more hooks
  // than during the previous render") on the first authenticated render.
  const upcoming = useMemo(() => examDates[0] ?? null, [examDates]);
  const daysToEvent = useMemo(() => daysUntil(upcoming?.eventDate ?? null), [upcoming]);
  const last7Accuracy = useMemo(() => last7DaysAccuracy(progress), [progress]);
  const topSubject = useMemo(
    () => (progress && progress.subjects.length > 0 ? progress.subjects[0] : null),
    [progress],
  );

  if (loading || !user) {
    return (
      <main className="flex min-h-[60vh] items-center justify-center px-6">
        <span className="inline-flex items-center gap-2 text-sm text-muted-500">
          <span className="spinner" aria-hidden="true" />
          Loading…
        </span>
      </main>
    );
  }

  const examName = me?.targetExam ? EXAM_BY_SLUG.get(me.targetExam)?.name : null;

  return (
    <main className="mx-auto flex min-h-screen max-w-2xl flex-col px-6 pt-8 pb-16">
      <header className="flex items-start justify-between">
        <Logo />
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => router.push('/progress')}
            className="btn-ghost-sm"
          >
            Progress
          </button>
          <button
            type="button"
            onClick={() => router.push('/upgrade')}
            className="btn-ghost-sm"
          >
            Upgrade
          </button>
          <button
            type="button"
            onClick={() => signOut().then(() => router.replace('/signin'))}
            className="btn-ghost-sm"
          >
            Sign out
          </button>
        </div>
      </header>

      <section className="mt-10">
        <p className="text-sm text-muted-500">
          {greeting()}, {firstName(me?.name ?? user.displayName ?? 'student')}
        </p>
        <h1 className="font-serif mt-1 text-3xl font-semibold leading-tight text-ink-900 sm:text-4xl">
          Today’s study slate
        </h1>
        {examName ? (
          <p className="mt-2 text-sm text-muted-500">
            Tracking <span className="font-medium text-ink-800">{examName}</span>
          </p>
        ) : null}
      </section>

      <section className="paper-card mt-8 p-6 sm:p-8">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-ember-600">
          Daily MCQ · 10 questions
        </p>
        <h2 className="font-serif mt-3 text-2xl font-semibold leading-snug text-ink-900">
          Take today’s questions, earn credits.
        </h2>
        <p className="mt-3 text-ink-800">
          Pass with 7/10 or more to earn <span className="font-medium">+50 credits</span>.
          Even a failed attempt earns +5 — nobody gets locked out.
        </p>
        <button
          type="button"
          onClick={() => router.push('/mcq')}
          className="btn-primary mt-6"
        >
          Start daily MCQ
        </button>
      </section>

      <section className="paper-card mt-6 p-6 sm:p-8">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-gold-600">
          Library · read first
        </p>
        <h2 className="font-serif mt-3 text-xl font-semibold leading-snug text-ink-900">
          Chapters, verified by 3 AIs.
        </h2>
        <p className="mt-3 text-ink-800">
          Every chapter is generated and verified by OpenAI, Gemini, and
          Groq. Read calmly, then take the test.
        </p>
        <button
          type="button"
          onClick={() => router.push('/chapters')}
          className="btn-ghost mt-6"
        >
          Open library
        </button>
      </section>

      <section className="paper-card mt-6 p-6 sm:p-8">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-ember-600">
          Mock tests · timed
        </p>
        <h2 className="font-serif mt-3 text-xl font-semibold leading-snug text-ink-900">
          Pressure-test yourself before exam day.
        </h2>
        <p className="mt-3 text-ink-800">
          Full-length mocks priced in credits. Score 60% or more and we
          refund the cost plus a bonus.
        </p>
        <button
          type="button"
          onClick={() => router.push('/mock-tests')}
          className="btn-ghost mt-6"
        >
          Browse mock tests
        </button>
      </section>

      <section className="mt-6 grid gap-4 sm:grid-cols-3">
        <div className="paper-card p-5">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-500">
            Credits balance
          </p>
          <p className="font-serif mt-2 text-3xl font-semibold tabular-nums text-ink-900">
            {balance ? balance.total : '\u2014'}
          </p>
          {balance && balance.expiringSoon > 0 ? (
            <p className="mt-1 text-xs text-ember-600">
              {balance.expiringSoon} expiring within 7 days
            </p>
          ) : (
            <p className="mt-1 text-xs text-muted-500">Earn more by taking the daily MCQ</p>
          )}
        </div>
        <div className="paper-card p-5">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-500">
            Daily streak
          </p>
          <p className="font-serif mt-2 text-3xl font-semibold tabular-nums text-ink-900">
            {(me?.currentStreak ?? 0) > 0 ? (
              <>
                {me?.currentStreak}
                <span className="ml-1 text-base text-muted-500">days</span>
              </>
            ) : (
              <span className="text-muted-500">—</span>
            )}
          </p>
          <p className="mt-1 text-xs text-muted-500">
            {(me?.bestStreak ?? 0) > 0
              ? `Best: ${me?.bestStreak} days`
              : 'Take today\u2019s MCQ to start a streak'}
          </p>
        </div>
        <div className="paper-card p-5">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-500">
            Verification
          </p>
          <p className="mt-2 text-ink-800">
            {me?.isVerified
              ? 'You\u2019re verified.'
              : 'You\u2019re in our private beta. Identity verification arrives by end of June.'}
          </p>
        </div>
      </section>

      {/* Phase 12: progress glance + exam date countdown. Both are
          tolerant of missing data -- the dashboard doesn't block on
          their loads. */}
      <section className="mt-6 grid gap-4 sm:grid-cols-3">
        <button
          type="button"
          onClick={() => router.push('/progress')}
          className="paper-card p-5 text-left transition hover:bg-paper-200/40"
        >
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-500">
            Last 7d accuracy
          </p>
          <p className="font-serif mt-2 text-3xl font-semibold tabular-nums text-ink-900">
            {last7Accuracy === null ? (
              <span className="text-muted-500">—</span>
            ) : (
              <>
                {last7Accuracy}
                <span className="ml-1 text-base text-muted-500">%</span>
              </>
            )}
          </p>
          <p className="mt-1 text-xs text-muted-500">Tap for full progress</p>
        </button>
        <button
          type="button"
          onClick={() => router.push('/progress')}
          className="paper-card p-5 text-left transition hover:bg-paper-200/40"
        >
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-500">
            Top subject
          </p>
          <p className="font-serif mt-2 text-2xl font-semibold leading-tight text-ink-900">
            {topSubject ? prettySubject(topSubject.subject) : (
              <span className="text-muted-500">—</span>
            )}
          </p>
          <p className="mt-1 text-xs text-muted-500">
            {topSubject
              ? `${topSubject.masteryPct}% across ${topSubject.mcqsAttempted} MCQs`
              : 'Attempt MCQs to see mastery'}
          </p>
        </button>
        <div className="paper-card p-5">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-500">
            Next exam
          </p>
          {upcoming ? (
            <>
              <p className="font-serif mt-2 text-3xl font-semibold tabular-nums text-ink-900">
                {daysToEvent ?? '\u2014'}
                <span className="ml-1 text-base text-muted-500">
                  {daysToEvent === 1 ? 'day' : 'days'}
                </span>
              </p>
              <p className="mt-1 truncate text-xs text-muted-500">
                {upcoming.eventName}
                {upcoming.isOfficial ? '' : ' (tentative)'}
              </p>
            </>
          ) : (
            <>
              <p className="font-serif mt-2 text-3xl font-semibold text-muted-500">—</p>
              <p className="mt-1 text-xs text-muted-500">No date set yet</p>
            </>
          )}
        </div>
      </section>

      {error ? (
        <p className="mt-8 text-sm text-ember-600" role="alert">
          {error}
        </p>
      ) : null}
    </main>
  );
}

function firstName(full: string): string {
  const trimmed = full.trim();
  const space = trimmed.indexOf(' ');
  return space < 0 ? trimmed : trimmed.slice(0, space);
}

function greeting(): string {
  // IST hour (rough)
  const istHour = (new Date().getUTCHours() + 5.5) % 24;
  if (istHour < 12) return 'Good morning';
  if (istHour < 17) return 'Good afternoon';
  return 'Good evening';
}

function prettySubject(s: string): string {
  return s
    .split('-')
    .map((w) => (w[0]?.toUpperCase() ?? '') + w.slice(1))
    .join(' ');
}

/** Days from today (UTC) until eventDate (YYYY-MM-DD). null if past or missing. */
function daysUntil(eventDate: string | null): number | null {
  if (!eventDate) return null;
  const today = new Date();
  const todayMs = Date.UTC(
    today.getUTCFullYear(),
    today.getUTCMonth(),
    today.getUTCDate(),
  );
  const eventMs = new Date(`${eventDate}T00:00:00.000Z`).getTime();
  if (Number.isNaN(eventMs)) return null;
  const days = Math.round((eventMs - todayMs) / 86400000);
  return days < 0 ? null : days;
}

/**
 * Compute "last 7 days accuracy" from a 30-bucket trend.
 * Returns null if no MCQs were attempted in the last 7 days.
 */
function last7DaysAccuracy(p: ProgressSnapshot | null): number | null {
  if (!p) return null;
  const last7 = p.accuracyTrend30d.slice(-7);
  let attempted = 0;
  let correct = 0;
  for (const b of last7) {
    attempted += b.mcqsAttempted;
    correct += b.mcqsCorrect;
  }
  if (attempted === 0) return null;
  return Math.round((correct / attempted) * 100);
}
