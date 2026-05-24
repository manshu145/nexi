'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';
import { EXAM_BY_SLUG, type ProgressSnapshot } from '@nexigrate/shared';
import { Logo } from '~/components/Logo';
import { useAuth } from '~/lib/auth-context';
import { api } from '~/lib/api';

/**
 * /progress
 *
 * Phase 12 -- the student's progress dashboard.
 *
 * Shows, for the user's target exam:
 *   - Header counts: chapters read / published, MCQs attempted, mock tests
 *   - Per-subject mastery bars
 *   - 30-day accuracy trend (compact bar chart, no chart library)
 *   - Weak topics (chapters with <60% recent accuracy)
 *   - Per-chapter completion + best score grid
 *
 * Server does the heavy lifting (one /me/progress call returns
 * everything). The page renders data only -- no derived metrics.
 */
export default function ProgressPage() {
  const { user, loading } = useAuth();
  const router = useRouter();

  const [snapshot, setSnapshot] = useState<ProgressSnapshot | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!loading && !user) router.replace('/signin');
  }, [user, loading, router]);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    (async () => {
      try {
        const snap = await api.getProgress();
        if (!cancelled) setSnapshot(snap);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : 'failed to load progress');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [user]);

  const examName = useMemo(
    () => (snapshot ? (EXAM_BY_SLUG.get(snapshot.exam)?.name ?? snapshot.exam) : ''),
    [snapshot],
  );

  if (loading || !user) {
    return (
      <main className="flex min-h-[60vh] items-center justify-center px-6">
        <span className="inline-flex items-center gap-2 text-sm text-muted-500">
          <span className="spinner" aria-hidden="true" />
          Loading...
        </span>
      </main>
    );
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-3xl flex-col px-6 pt-8 pb-16">
      <header className="flex items-start justify-between">
        <Logo />
        <div className="flex items-center gap-2">
          <Link href="/chapters" className="btn-ghost-sm">
            Library
          </Link>
          <Link href="/dashboard" className="btn-ghost-sm">
            Dashboard
          </Link>
        </div>
      </header>

      <section className="mt-10">
        <p className="pill mb-3">Progress</p>
        <h1 className="font-serif text-3xl font-semibold leading-tight text-ink-900 sm:text-4xl">
          How you&apos;re doing
        </h1>
        {snapshot ? (
          <p className="mt-2 text-sm text-muted-500">
            Tracking <span className="font-medium text-ink-800">{examName}</span>
          </p>
        ) : null}
      </section>

      {error ? (
        <div className="banner banner-error mt-6" role="alert">
          <span>{error}</span>
        </div>
      ) : null}

      {!snapshot && !error ? (
        <p className="mt-8 text-sm text-muted-500">Crunching your numbers...</p>
      ) : null}

      {snapshot ? (
        <>
          {/* Counts header */}
          <section className="mt-8 grid gap-4 sm:grid-cols-4">
            <Stat
              label="MCQs attempted"
              value={snapshot.counts.mcqsAttempted}
              hint={`${pct(snapshot.counts.mcqsCorrect, snapshot.counts.mcqsAttempted)}% correct overall`}
            />
            <Stat
              label="Chapters read"
              value={`${snapshot.counts.chaptersRead} / ${snapshot.counts.chaptersPublished}`}
              hint={
                snapshot.counts.chaptersPublished === 0
                  ? 'No chapters published yet'
                  : `${pct(snapshot.counts.chaptersRead, snapshot.counts.chaptersPublished)}% of library`
              }
            />
            <Stat
              label="Daily MCQs"
              value={snapshot.counts.dailyMcqsCompleted}
              hint="completed sessions"
            />
            <Stat
              label="Chapter tests"
              value={snapshot.counts.chapterTestsCompleted}
              hint="completed sessions"
            />
          </section>

          {/* Subject mastery */}
          <section className="paper-card mt-8 p-6 sm:p-8">
            <h2 className="font-serif text-xl font-semibold text-ink-900">
              Subject mastery
            </h2>
            {snapshot.subjects.length === 0 ? (
              <p className="mt-3 text-sm text-muted-500">
                No MCQs attempted yet -- take today&apos;s daily MCQ to start
                building this picture.
              </p>
            ) : (
              <div className="mt-5 space-y-4">
                {snapshot.subjects.map((s) => (
                  <SubjectRow
                    key={s.subject}
                    subject={s.subject}
                    pctValue={s.masteryPct}
                    attempted={s.mcqsAttempted}
                    correct={s.mcqsCorrect}
                  />
                ))}
              </div>
            )}
          </section>

          {/* Accuracy trend */}
          <section className="paper-card mt-6 p-6 sm:p-8">
            <h2 className="font-serif text-xl font-semibold text-ink-900">
              Last 30 days accuracy
            </h2>
            <p className="mt-1 text-xs text-muted-500">
              One bar per day, taller = higher accuracy. Empty = no MCQs that day.
            </p>
            <TrendBars buckets={snapshot.accuracyTrend30d} />
          </section>

          {/* Weak topics */}
          <section className="paper-card mt-6 p-6 sm:p-8">
            <h2 className="font-serif text-xl font-semibold text-ink-900">
              Weak topics
            </h2>
            {snapshot.weakTopics.length === 0 ? (
              <p className="mt-3 text-sm text-muted-500">
                No weak chapters yet -- either you&apos;re crushing it, or you
                haven&apos;t attempted enough chapter tests in the last 30 days.
              </p>
            ) : (
              <ul className="mt-4 space-y-2">
                {snapshot.weakTopics.map((w) => (
                  <li key={w.chapterId}>
                    <Link
                      href={`/read/${encodeURIComponent(w.exam)}/${encodeURIComponent(w.subject)}/${encodeURIComponent(w.slug)}`}
                      className="flex items-center justify-between gap-3 rounded-lg border border-line bg-paper-50 px-4 py-3 transition hover:bg-paper-200/50"
                    >
                      <div className="min-w-0 flex-1">
                        <p className="font-serif text-base text-ink-900">
                          {w.title}
                        </p>
                        <p className="mt-0.5 text-xs text-muted-500">
                          {prettySubject(w.subject)} · {w.attempts} attempts
                        </p>
                      </div>
                      <span className="rounded-full bg-paper-300 px-3 py-1 text-xs font-semibold text-ember-700">
                        {w.accuracyPct}%
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </section>

          {/* Chapter completion grid */}
          <section className="paper-card mt-6 p-6 sm:p-8">
            <h2 className="font-serif text-xl font-semibold text-ink-900">
              Chapter completion
            </h2>
            {snapshot.chapters.length === 0 ? (
              <p className="mt-3 text-sm text-muted-500">
                No chapters published for {examName} yet. Editorial team is
                generating + verifying content.
              </p>
            ) : (
              <ul className="mt-4 space-y-2">
                {snapshot.chapters.map((c) => (
                  <li
                    key={c.chapterId}
                    className="flex items-center justify-between gap-3 rounded-lg border border-line bg-paper-50 px-4 py-3"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="text-xs uppercase tracking-wide text-muted-500">
                        {prettySubject(c.subject)}
                      </p>
                      <p className="font-serif mt-0.5 truncate text-base text-ink-900">
                        {c.title}
                      </p>
                    </div>
                    <div className="flex shrink-0 items-center gap-2 text-xs">
                      {c.isRead ? (
                        <span className="pill pill-success">read</span>
                      ) : (
                        <span className="pill pill-neutral">unread</span>
                      )}
                      {c.bestScorePct !== null ? (
                        <span className="pill pill-success">
                          {c.bestScorePct}%
                        </span>
                      ) : c.hasTested ? (
                        <span className="pill pill-warn">tested</span>
                      ) : (
                        <span className="pill pill-neutral">untested</span>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </>
      ) : null}
    </main>
  );
}

function Stat({
  label,
  value,
  hint,
}: {
  label: string;
  value: number | string;
  hint?: string;
}) {
  return (
    <div className="paper-card p-5">
      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-500">
        {label}
      </p>
      <p className="font-serif mt-2 text-3xl font-semibold tabular-nums text-ink-900">
        {value}
      </p>
      {hint ? <p className="mt-1 text-xs text-muted-500">{hint}</p> : null}
    </div>
  );
}

function SubjectRow({
  subject,
  pctValue,
  attempted,
  correct,
}: {
  subject: string;
  pctValue: number;
  attempted: number;
  correct: number;
}) {
  return (
    <div>
      <div className="flex items-baseline justify-between text-sm">
        <span className="font-medium text-ink-900">{prettySubject(subject)}</span>
        <span className="tabular-nums text-muted-500">
          {correct} / {attempted}{' '}
          <span className="ml-1 font-medium text-ink-800">{pctValue}%</span>
        </span>
      </div>
      <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-paper-300">
        <div
          className="h-full rounded-full bg-ember-600 transition-all"
          style={{ width: `${Math.max(2, pctValue)}%` }}
          aria-hidden="true"
        />
      </div>
    </div>
  );
}

function TrendBars({
  buckets,
}: {
  buckets: ProgressSnapshot['accuracyTrend30d'];
}) {
  return (
    <div className="mt-4 flex h-24 items-end gap-[2px]" role="img" aria-label="30-day accuracy trend">
      {buckets.map((b) => {
        const height = b.accuracyPct === null ? 4 : Math.max(4, (b.accuracyPct / 100) * 96);
        const dim = b.mcqsAttempted === 0;
        return (
          <div
            key={b.date}
            title={
              b.mcqsAttempted === 0
                ? `${b.date}: no MCQs`
                : `${b.date}: ${b.accuracyPct}% (${b.mcqsCorrect}/${b.mcqsAttempted})`
            }
            className="flex-1 rounded-sm transition-colors"
            style={{
              height: `${height}px`,
              backgroundColor: dim ? 'var(--color-paper-300)' : 'var(--color-ember-500)',
              opacity: dim ? 0.6 : 1,
            }}
          />
        );
      })}
    </div>
  );
}

function pct(num: number, den: number): number {
  if (den <= 0) return 0;
  return Math.round((num / den) * 100);
}

function prettySubject(s: string): string {
  return s
    .split('-')
    .map((w) => (w[0]?.toUpperCase() ?? '') + w.slice(1))
    .join(' ');
}
