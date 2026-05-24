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
import { ThemeToggle } from '~/components/ThemeToggle';
import { useAuth } from '~/lib/auth-context';
import { api, type MeResponse } from '~/lib/api';

/**
 * Student dashboard — redesigned.
 *
 * Layout hierarchy:
 *   1. Top stats strip (4 KPIs)
 *   2. Hero MCQ card
 *   3. Numbered sections: Practice / Library / Daily / Earn
 *
 * Wider container (max-w-5xl), proper grouping, less visual noise.
 */
export default function DashboardPage() {
  const { user, loading, signOut } = useAuth();
  const router = useRouter();

  const [me, setMe] = useState<MeResponse['user'] | null>(null);
  const [balance, setBalance] = useState<CreditBalance | null>(null);
  const [progress, setProgress] = useState<ProgressSnapshot | null>(null);
  const [examDates, setExamDates] = useState<ExamDate[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [recs, setRecs] = useState<{
    skillLevel: string;
    focusAreas: string[];
    recommendations: Array<{ type: string; title: string; description: string; action: string; priority: string; reason: string }>;
    dailyGoal: { mcqs: number; readMinutes: number; mockTests: number };
    motivationalMessage: string;
  } | null>(null);

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
        api
          .getProgress(meRes.user.targetExam)
          .then((p) => {
            if (!cancelled) setProgress(p);
          })
          .catch(() => {});
        api
          .listExamDates(meRes.user.targetExam)
          .then((d) => {
            if (!cancelled) setExamDates(d.dates ?? []);
          })
          .catch(() => {});
        // Fetch personalized recommendations (AI as teacher)
        api
          .getRecommendations()
          .then((r) => {
            if (!cancelled) setRecs(r);
          })
          .catch(() => {});

        // Phase 16: apply stashed referral code
        try {
          const refCode = sessionStorage.getItem('nexigrate.refCode');
          if (refCode) {
            api.referrals
              .attribute(refCode)
              .catch(() => {})
              .finally(() => {
                try {
                  sessionStorage.removeItem('nexigrate.refCode');
                } catch {}
              });
          }
        } catch {}
      } catch (e) {
        if (cancelled) return;
        setError(e instanceof Error ? e.message : 'failed to load');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [user, router]);

  // Keep all hooks above early returns (React #310 fix)
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
    <main className="mx-auto flex min-h-screen max-w-5xl flex-col px-4 pt-6 pb-24 sm:px-6 sm:pt-8 sm:pb-16">
      {/* ─── Header ─── */}
      <header className="flex items-start justify-between">
        <Logo />
        <div className="flex items-center gap-2">
          <ThemeToggle />
          <button type="button" onClick={() => router.push('/progress')} className="btn-ghost-sm">
            Progress
          </button>
          <button type="button" onClick={() => router.push('/upgrade')} className="btn-ghost-sm">
            Upgrade
          </button>
          <button type="button" onClick={() => router.push("/profile")} className="btn-ghost-sm">Profile</button>
          <button
            type="button"
            onClick={() => signOut().then(() => router.replace('/signin'))}
            className="btn-ghost-sm"
          >
            Sign out
          </button>
        </div>
      </header>

      {/* ─── Greeting ─── */}
      <section className="mt-10">
        <p className="text-sm text-muted-500">
          {greeting()}, {firstName(me?.name ?? user.displayName ?? 'student')}
        </p>
        <h1 className="font-serif mt-1 text-3xl font-semibold leading-tight text-ink-900 sm:text-4xl">
          Today&apos;s study slate
        </h1>
        {examName ? (
          <p className="mt-2 text-sm text-muted-500">
            Tracking <span className="font-medium text-ink-800">{examName}</span>
          </p>
        ) : null}
      </section>

      {/* ─── Stats strip ─── */}
      <section className="mt-8 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div className="paper-card p-4">
          <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-500">
            Credits
          </p>
          <p className="font-serif mt-1.5 text-2xl font-semibold tabular-nums text-ink-900">
            {balance ? fmtNum(balance.total) : '\u2014'}
          </p>
          {balance && balance.expiringSoon > 0 ? (
            <p className="mt-0.5 text-[11px] text-ember-600">
              {fmtNum(balance.expiringSoon)} expiring soon
            </p>
          ) : null}
        </div>
        <div className="paper-card p-4">
          <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-500">
            Streak
          </p>
          <p className="font-serif mt-1.5 text-2xl font-semibold tabular-nums text-ink-900">
            {(me?.currentStreak ?? 0) > 0 ? (
              <>
                {me?.currentStreak}
                <span className="ml-0.5 text-sm text-muted-500">d</span>
              </>
            ) : (
              '\u2014'
            )}
          </p>
          {(me?.bestStreak ?? 0) > 0 ? (
            <p className="mt-0.5 text-[11px] text-muted-500">Best: {me?.bestStreak}d</p>
          ) : null}
        </div>
        <button
          type="button"
          onClick={() => router.push('/progress')}
          className="paper-card p-4 text-left transition hover:bg-paper-200/40"
        >
          <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-500">
            7d accuracy
          </p>
          <p className="font-serif mt-1.5 text-2xl font-semibold tabular-nums text-ink-900">
            {last7Accuracy !== null ? (
              <>
                {last7Accuracy}
                <span className="ml-0.5 text-sm text-muted-500">%</span>
              </>
            ) : (
              '\u2014'
            )}
          </p>
          {topSubject ? (
            <p className="mt-0.5 truncate text-[11px] text-muted-500">
              Top: {prettySubject(topSubject.subject)}
            </p>
          ) : null}
        </button>
        <div className="paper-card p-4">
          <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-500">
            Next exam
          </p>
          {upcoming ? (
            <>
              <p className="font-serif mt-1.5 text-2xl font-semibold tabular-nums text-ink-900">
                {daysToEvent ?? '\u2014'}
                <span className="ml-0.5 text-sm text-muted-500">
                  {daysToEvent === 1 ? 'day' : 'days'}
                </span>
              </p>
              <p className="mt-0.5 truncate text-[11px] text-muted-500">
                {upcoming.eventName}
                {upcoming.isOfficial ? '' : ' (tent.)'}
              </p>
            </>
          ) : (
            <p className="font-serif mt-1.5 text-2xl font-semibold text-muted-500">&mdash;</p>
          )}
        </div>
      </section>

      {/* ─── AI Recommendations (Personalized) ─── */}
      {recs && recs.recommendations.length > 0 && (
        <section className="mt-8">
          <div className="flex items-center justify-between">
            <h2 className="text-xs font-semibold uppercase tracking-[0.18em] text-ember-600">
              Recommended for you
            </h2>
            {recs.skillLevel !== 'new' && (
              <span className="pill text-[10px]">
                {recs.skillLevel} level
              </span>
            )}
          </div>
          {recs.motivationalMessage && (
            <p className="mt-2 text-sm text-ink-800 italic">{recs.motivationalMessage}</p>
          )}
          {recs.focusAreas.length > 0 && (
            <p className="mt-1 text-xs text-muted-500">
              Focus: {recs.focusAreas.join(' · ')}
            </p>
          )}
          <div className="mt-3 grid gap-2 sm:grid-cols-2">
            {recs.recommendations.slice(0, 4).map((rec, i) => (
              <button
                key={i}
                type="button"
                onClick={() => router.push(rec.action)}
                className="paper-card p-4 text-left hover:border-ember-500 transition"
              >
                <p className={`text-[10px] font-semibold uppercase tracking-[0.14em] ${
                  rec.priority === 'high' ? 'text-ember-600' : 'text-muted-500'
                }`}>
                  {rec.type === 'chapter' ? '📖' : rec.type === 'mcq' ? '✏️' : rec.type === 'mock_test' ? '📝' : '💡'} {rec.type}
                </p>
                <p className="mt-1 text-sm font-medium text-ink-900">{rec.title}</p>
                <p className="mt-0.5 text-xs text-muted-500 line-clamp-2">{rec.reason}</p>
              </button>
            ))}
          </div>
          {/* Daily goal */}
          <div className="mt-3 flex items-center gap-4 text-xs text-muted-500">
            <span>Daily goal: {recs.dailyGoal.mcqs} MCQs</span>
            <span>·</span>
            <span>{recs.dailyGoal.readMinutes} min reading</span>
            {recs.dailyGoal.mockTests > 0 && <><span>·</span><span>{recs.dailyGoal.mockTests} mock test</span></>}
          </div>
        </section>
      )}

      {/* ─── 01 · Practice ─── */}
      <section className="mt-10">
        <h2 className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-500">
          01 &middot; Practice
        </h2>

        {/* Hero MCQ */}
        <div className="paper-card mt-4 flex flex-col justify-between gap-4 p-6 sm:flex-row sm:items-center sm:p-8">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-ember-600">
              Daily MCQ &middot; 10 questions
            </p>
            <h3 className="font-serif mt-2 text-2xl font-semibold leading-snug text-ink-900">
              Take today&apos;s questions, earn credits.
            </h3>
            <p className="mt-2 text-sm text-ink-800">
              Pass 7/10+ → <span className="font-medium">+50 credits</span>. Even a failed attempt → +5.
            </p>
          </div>
          <button type="button" onClick={() => router.push('/mcq')} className="btn-primary shrink-0">
            Start daily MCQ
          </button>
        </div>

        {/* Practice tiles */}
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <Tile
            label="Mock tests"
            color="ember"
            desc="Full-length timed mocks. AI generates 30 questions at your level."
            onClick={() => router.push('/mock-tests')}
            cta="Start mock test"
          />
          <Tile
            label="AI Practice"
            color="gold"
            desc="Generate practice questions on any topic — AI grades instantly."
            onClick={() => router.push('/long-answers')}
            cta="Practice now"
          />
        </div>
      </section>

      {/* ─── 02 · Library & reference ─── */}
      <section className="mt-10">
        <h2 className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-500">
          02 &middot; Library &amp; reference
        </h2>
        <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Tile
            label="AI Chapters"
            color="ember"
            desc="Type any topic — AI writes a full chapter at your level."
            onClick={() => router.push('/chapters')}
            cta="Generate chapter"
          />
          <Tile
            label="AI Nexipedia"
            color="ember"
            desc="Search anything — AI creates a Wikipedia-like article instantly."
            onClick={() => router.push('/nexipedia')}
            cta="Explore"
          />
          <Tile
            label="Exam guides"
            color="gold"
            desc="Cited prep how-tos for JEE, NEET, UPSC."
            onClick={() => router.push('/guides')}
            cta="Browse guides"
          />
          <Tile
            label="Learning tips"
            color="gold"
            desc="Evidence-backed study techniques."
            onClick={() => router.push('/learn')}
            cta="Read tips"
          />
        </div>
      </section>

      {/* ─── 03 · Daily ─── */}
      <section className="mt-10">
        <h2 className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-500">
          03 &middot; Daily
        </h2>
        <div className="paper-card mt-4 flex flex-col justify-between gap-4 p-6 sm:flex-row sm:items-center sm:p-8">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-ember-600">
              Today&apos;s current affairs
            </p>
            <h3 className="font-serif mt-2 text-xl font-semibold leading-snug text-ink-900">
              The day&apos;s news, exam-ready.
            </h3>
            <p className="mt-2 text-sm text-ink-800">
              PIB, RBI &amp; Ministry sources. No partisan spin — just facts UPSC/SSC/Banking
              aspirants need.
            </p>
          </div>
          <button
            type="button"
            onClick={() => router.push('/today')}
            className="btn-ghost shrink-0"
          >
            Read today&apos;s digest
          </button>
        </div>
      </section>

      {/* ─── 04 · Earn credits ─── */}
      <section className="mt-10">
        <h2 className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-500">
          04 &middot; Earn credits
        </h2>
        <div className="paper-card mt-4 flex flex-col justify-between gap-4 p-6 sm:flex-row sm:items-center sm:p-8">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-ember-600">
              Refer a friend
            </p>
            <h3 className="font-serif mt-2 text-xl font-semibold leading-snug text-ink-900">
              Bring someone you study with.
            </h3>
            <p className="mt-2 text-sm text-ink-800">
              Both of you get bonus credits on sign-up + another bonus 7 days later.
            </p>
          </div>
          <button
            type="button"
            onClick={() => router.push('/refer')}
            className="btn-ghost shrink-0"
          >
            Get referral code
          </button>
        </div>
      </section>

      {/* ─── Error ─── */}
      {error ? (
        <p className="mt-8 text-sm text-ember-600" role="alert">
          {error}
        </p>
      ) : null}
    </main>
  );
}

/* ─── Tile component ─── */
function Tile({
  label,
  color,
  desc,
  onClick,
  cta,
}: {
  label: string;
  color: 'ember' | 'gold';
  desc: string;
  onClick: () => void;
  cta: string;
}) {
  const colorCls = color === 'ember' ? 'text-ember-600' : 'text-gold-600';
  return (
    <button
      type="button"
      onClick={onClick}
      className="paper-card flex flex-col justify-between p-5 text-left transition hover:bg-paper-200/40"
    >
      <div>
        <p className={`text-[11px] font-semibold uppercase tracking-[0.16em] ${colorCls}`}>
          {label}
        </p>
        <p className="mt-2 text-sm text-ink-800">{desc}</p>
      </div>
      <p className="mt-4 text-xs font-medium text-ink-900 underline decoration-ink-900/20 underline-offset-2">
        {cta} &rarr;
      </p>
    </button>
  );
}

/* ─── Utility fns ─── */

function fmtNum(n: number): string {
  return n.toLocaleString('en-IN');
}

function firstName(full: string): string {
  const trimmed = full.trim();
  const space = trimmed.indexOf(' ');
  return space < 0 ? trimmed : trimmed.slice(0, space);
}

function greeting(): string {
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

function daysUntil(eventDate: string | null): number | null {
  if (!eventDate) return null;
  const today = new Date();
  const todayMs = Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate());
  const eventMs = new Date(`${eventDate}T00:00:00.000Z`).getTime();
  if (Number.isNaN(eventMs)) return null;
  const days = Math.round((eventMs - todayMs) / 86400000);
  return days < 0 ? null : days;
}

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
