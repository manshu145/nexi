'use client';

import { useEffect, useMemo, useState, type ReactNode } from 'react';
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
 * Layout (top → bottom):
 *
 *   1. Sticky top bar -- Logo + Progress / Upgrade / Sign-out actions
 *   2. Greeting + hero strip ("Good morning, Manshu" + "Today's study slate")
 *   3. Compact 4-up stats strip -- Credits, Streak, Last-7d accuracy, Next exam
 *      (clickable where it makes sense; tolerant of missing data)
 *   4. Daily MCQ hero card -- the primary daily action
 *   5. Section "Practice" -- Mock tests + Long-form practice (2-up grid)
 *   6. Section "Library & Reference" -- Chapters, Nexipedia, Exam guides,
 *      Learning tips (4-up grid on lg, 2-up on md, 1-up on small)
 *   7. Section "Daily" -- Today's current affairs (single wide card)
 *   8. Section "Earn credits" -- Refer-a-friend (single card)
 *   9. Verification footnote when isVerified === false
 *
 * Compared to the previous all-stacked layout this:
 *   - cuts vertical scroll by roughly half on a typical viewport
 *   - groups cards by intent (Practice / Library / Daily / Earn) with
 *     section headers, so the page is scannable
 *   - uses the wider 5xl container so the desktop layout stops feeling
 *     like a phone webpage centred on a desktop screen
 *   - keeps every existing data-load + effect (auth gate, /me, /balance,
 *     /progress, /exam-dates, referral attribution) byte-for-byte; only
 *     the JSX changed
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

        // Phase 16: apply a stashed referral code from /signin?ref=CODE.
        // Self-referral, unknown-code, and already-attributed are all
        // handled server-side; we just fire-and-forget and clear the
        // sessionStorage key on either success or terminal failure so we
        // don't keep retrying on every dashboard load.
        try {
          const refCode = sessionStorage.getItem('nexigrate.refCode');
          if (refCode) {
            api.referrals
              .attribute(refCode)
              .catch(() => {
                /* surfaced server-side; user UX shouldn't block on this */
              })
              .finally(() => {
                try {
                  sessionStorage.removeItem('nexigrate.refCode');
                } catch {
                  /* best-effort */
                }
              });
          }
        } catch {
          /* sessionStorage blocked */
        }
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
  // PR #13 lesson; do not reintroduce.
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
  const displayName = firstName(me?.name ?? user.displayName ?? 'student');

  return (
    <main className="mx-auto flex min-h-screen max-w-5xl flex-col px-4 pt-6 pb-20 sm:px-6 sm:pt-8">
      {/* ---------- Top bar ---------- */}
      <header className="flex items-center justify-between">
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

      {/* ---------- Greeting ---------- */}
      <section className="mt-8 sm:mt-10">
        <p className="text-sm text-muted-500">
          {greeting()}, {displayName}
        </p>
        <h1 className="font-serif mt-1 text-3xl font-semibold leading-tight text-ink-900 sm:text-4xl">
          Today’s study slate
        </h1>
        {examName ? (
          <p className="mt-2 text-sm text-muted-500">
            Tracking <span className="font-medium text-ink-800">{examName}</span>
            {me?.isVerified ? null : (
              <span className="ml-2 text-muted-400">· private beta</span>
            )}
          </p>
        ) : null}
      </section>

      {/* ---------- Stats strip ---------- */}
      <section
        className="mt-6 grid gap-3 sm:mt-8 sm:grid-cols-2 lg:grid-cols-4"
        aria-label="At a glance"
      >
        <StatTile
          label="Credits"
          value={balance ? formatNum(balance.total) : '—'}
          hint={
            balance && balance.expiringSoon > 0
              ? `${balance.expiringSoon} expire within 7 days`
              : 'Earn more on the daily MCQ'
          }
          hintTone={balance && balance.expiringSoon > 0 ? 'warn' : 'muted'}
          onClick={() => router.push('/upgrade')}
        />
        <StatTile
          label="Streak"
          value={
            (me?.currentStreak ?? 0) > 0 ? (
              <>
                {me?.currentStreak}
                <span className="ml-1 text-base text-muted-500">days</span>
              </>
            ) : (
              '—'
            )
          }
          hint={
            (me?.bestStreak ?? 0) > 0
              ? `Best ${me?.bestStreak} days`
              : 'Take today’s MCQ to start one'
          }
        />
        <StatTile
          label="Last 7d accuracy"
          value={
            last7Accuracy === null ? (
              '—'
            ) : (
              <>
                {last7Accuracy}
                <span className="ml-1 text-base text-muted-500">%</span>
              </>
            )
          }
          hint={
            topSubject
              ? `Top: ${prettySubject(topSubject.subject)} (${topSubject.masteryPct}%)`
              : 'Tap to open progress'
          }
          onClick={() => router.push('/progress')}
        />
        <StatTile
          label="Next exam"
          value={
            upcoming && daysToEvent !== null ? (
              <>
                {daysToEvent}
                <span className="ml-1 text-base text-muted-500">
                  {daysToEvent === 1 ? 'day' : 'days'}
                </span>
              </>
            ) : (
              '—'
            )
          }
          hint={
            upcoming
              ? `${upcoming.eventName}${upcoming.isOfficial ? '' : ' (tentative)'}`
              : 'No date set yet'
          }
        />
      </section>

      {/* ---------- Hero: Daily MCQ ---------- */}
      <section className="paper-card mt-8 overflow-hidden p-6 sm:p-8">
        <div className="flex flex-col gap-6 sm:flex-row sm:items-center sm:justify-between">
          <div className="max-w-xl">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-ember-600">
              Daily MCQ · 10 questions
            </p>
            <h2 className="font-serif mt-3 text-2xl font-semibold leading-snug text-ink-900 sm:text-[1.7rem]">
              Take today’s questions, earn credits.
            </h2>
            <p className="mt-3 text-ink-800">
              Pass with 7/10 or more to earn{' '}
              <span className="font-medium">+50 credits</span>. Even a failed
              attempt earns +5 — nobody gets locked out.
            </p>
          </div>
          <div className="flex shrink-0 flex-col items-start gap-2 sm:items-end">
            <button
              type="button"
              onClick={() => router.push('/mcq')}
              className="btn-primary"
            >
              Start daily MCQ
            </button>
            <span className="text-xs text-muted-500">
              ~ 5 minutes · resets at midnight IST
            </span>
          </div>
        </div>
      </section>

      {/* ---------- Section: Practice ---------- */}
      <SectionHeader
        eyebrow="01"
        title="Practice"
        sub="Pressure-test your prep with timed and graded surfaces."
      />
      <div className="grid gap-4 sm:grid-cols-2">
        <FeatureCard
          accent="ember"
          eyebrow="Mock tests · timed"
          title="Pressure-test before exam day."
          body="Full-length mocks priced in credits. Score 60% or more and we refund the cost plus a bonus."
          ctaLabel="Browse mock tests"
          onClick={() => router.push('/mock-tests')}
        />
        <FeatureCard
          accent="gold"
          eyebrow="Long-form · AI graded"
          title="Write descriptive answers, get marked."
          body="Real exam questions, AI-graded on a 5-axis rubric (relevance, structure, content, clarity, examples) with concrete feedback. 30 credits per submission."
          ctaLabel="Browse questions"
          onClick={() => router.push('/long-answers')}
        />
      </div>

      {/* ---------- Section: Library & Reference ---------- */}
      <SectionHeader
        eyebrow="02"
        title="Library & reference"
        sub="Read first, take the test second. Every claim is cited."
      />
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <TileCard
          accent="ember"
          eyebrow="Chapters"
          title="Verified by 3 AIs."
          body="Generated and cross-checked by OpenAI, Gemini, and Groq."
          onClick={() => router.push('/chapters')}
        />
        <TileCard
          accent="gold"
          eyebrow="Nexipedia"
          title="Wikipedia, but only verified facts."
          body="Encyclopedia articles for Indian students. NCERT and GoI sourced."
          onClick={() => router.push('/nexipedia')}
        />
        <TileCard
          accent="ember"
          eyebrow="Exam guides"
          title="Practical, no-noise prep."
          body="Step-by-step guides for JEE, NEET, UPSC, SSC and CBSE boards."
          onClick={() => router.push('/guides')}
        />
        <TileCard
          accent="gold"
          eyebrow="Learning tips"
          title="Techniques that actually work."
          body="Spaced repetition, retrieval practice, interleaving — all evidence-backed."
          onClick={() => router.push('/learn')}
        />
      </div>

      {/* ---------- Section: Daily ---------- */}
      <SectionHeader
        eyebrow="03"
        title="Daily"
        sub="A short read for the commute."
      />
      <section className="paper-card p-6 sm:p-7">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="max-w-2xl">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-ember-600">
              Today’s current affairs
            </p>
            <h3 className="font-serif mt-2 text-xl font-semibold leading-snug text-ink-900">
              The day’s news, exam-ready.
            </h3>
            <p className="mt-2 text-ink-800">
              Editor-approved daily digest. Sourced from PIB, RBI, Ministry
              press releases, and reputable mainstream press. No partisan
              spin — just what UPSC / SSC / Banking aspirants need to know.
            </p>
          </div>
          <button
            type="button"
            onClick={() => router.push('/today')}
            className="btn-ghost shrink-0 self-start sm:self-auto"
          >
            Read today’s digest
          </button>
        </div>
      </section>

      {/* ---------- Section: Earn ---------- */}
      <SectionHeader
        eyebrow="04"
        title="Earn credits"
        sub="Bring someone you study with."
      />
      <section className="paper-card p-6 sm:p-7">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="max-w-2xl">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-gold-600">
              Refer a friend
            </p>
            <h3 className="font-serif mt-2 text-xl font-semibold leading-snug text-ink-900">
              You both get bonus credits.
            </h3>
            <p className="mt-2 text-ink-800">
              Earn credits when they sign up with your code, and another bonus
              once they’re still around 7 days later.
            </p>
          </div>
          <button
            type="button"
            onClick={() => router.push('/refer')}
            className="btn-ghost shrink-0 self-start sm:self-auto"
          >
            Get my referral code
          </button>
        </div>
      </section>

      {/* ---------- Verification footnote ---------- */}
      {me && !me.isVerified ? (
        <p className="mt-10 text-center text-xs text-muted-500">
          You’re in the private beta. Identity verification arrives by end of June.
        </p>
      ) : null}

      {error ? (
        <div className="banner banner-error mt-8" role="alert">
          {error}
        </div>
      ) : null}
    </main>
  );
}

/* --------------------------------------------------------------------------
 * Local presentational components.
 *
 * Kept inline (rather than promoted to ~/components) so the dashboard remains
 * the only consumer of these specific shapes; if a second page wants the same
 * card later we'll lift then.
 * ----------------------------------------------------------------------- */

function StatTile(props: {
  label: string;
  value: ReactNode;
  hint: string;
  hintTone?: 'muted' | 'warn';
  onClick?: () => void;
}) {
  const inner = (
    <>
      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-500">
        {props.label}
      </p>
      <p className="font-serif mt-2 text-2xl font-semibold leading-none tabular-nums text-ink-900 sm:text-[1.65rem]">
        {props.value}
      </p>
      <p
        className={
          'mt-2 truncate text-xs ' +
          (props.hintTone === 'warn' ? 'text-ember-600' : 'text-muted-500')
        }
      >
        {props.hint}
      </p>
    </>
  );
  if (props.onClick) {
    return (
      <button
        type="button"
        onClick={props.onClick}
        className="paper-card p-4 text-left transition hover:bg-paper-200/40 sm:p-5"
      >
        {inner}
      </button>
    );
  }
  return <div className="paper-card p-4 sm:p-5">{inner}</div>;
}

function SectionHeader(props: { eyebrow: string; title: string; sub: string }) {
  return (
    <div className="mb-4 mt-10 flex items-end justify-between gap-4">
      <div>
        <p className="text-xs font-semibold uppercase tracking-[0.22em] text-gold-600">
          {props.eyebrow} · {props.title}
        </p>
        <p className="mt-1 text-sm text-muted-500">{props.sub}</p>
      </div>
    </div>
  );
}

function FeatureCard(props: {
  accent: 'ember' | 'gold';
  eyebrow: string;
  title: string;
  body: string;
  ctaLabel: string;
  onClick: () => void;
}) {
  const eyebrowColour =
    props.accent === 'ember' ? 'text-ember-600' : 'text-gold-600';
  return (
    <section className="paper-card flex flex-col p-6">
      <p
        className={
          'text-xs font-semibold uppercase tracking-[0.18em] ' + eyebrowColour
        }
      >
        {props.eyebrow}
      </p>
      <h3 className="font-serif mt-3 text-xl font-semibold leading-snug text-ink-900">
        {props.title}
      </h3>
      <p className="mt-3 text-ink-800">{props.body}</p>
      <div className="mt-6 flex">
        <button type="button" onClick={props.onClick} className="btn-ghost">
          {props.ctaLabel}
        </button>
      </div>
    </section>
  );
}

function TileCard(props: {
  accent: 'ember' | 'gold';
  eyebrow: string;
  title: string;
  body: string;
  onClick: () => void;
}) {
  const eyebrowColour =
    props.accent === 'ember' ? 'text-ember-600' : 'text-gold-600';
  return (
    <button
      type="button"
      onClick={props.onClick}
      className="paper-card flex flex-col p-5 text-left transition hover:bg-paper-200/40 hover:shadow-lg focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ember-500"
    >
      <p
        className={
          'text-xs font-semibold uppercase tracking-[0.18em] ' + eyebrowColour
        }
      >
        {props.eyebrow}
      </p>
      <h3 className="font-serif mt-2 text-base font-semibold leading-snug text-ink-900">
        {props.title}
      </h3>
      <p className="mt-2 text-sm leading-relaxed text-ink-800">{props.body}</p>
      <span
        className="mt-auto pt-4 text-xs font-medium text-muted-500"
        aria-hidden="true"
      >
        Open →
      </span>
    </button>
  );
}

/* --------------------------------------------------------------------------
 * Helpers (unchanged)
 * ----------------------------------------------------------------------- */

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

function formatNum(n: number): string {
  // Indian-locale grouping reads more naturally for credits balance.
  // Fallback to the unformatted number on environments without
  // toLocaleString options.
  try {
    return n.toLocaleString('en-IN');
  } catch {
    return String(n);
  }
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
