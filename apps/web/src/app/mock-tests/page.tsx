'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  EXAM_BY_SLUG,
  type CreditBalance,
  type ExamSlug,
  type MockTest,
} from '@nexigrate/shared';
import { Logo } from '~/components/Logo';
import { useAuth } from '~/lib/auth-context';
import { api, type MeResponse } from '~/lib/api';

/**
 * /mock-tests -- Phase 13
 *
 * List of full-length mock tests the student can attempt. Backend filters
 * by the user's target exam (or ?exam=...). Each card shows the cost in
 * credits and the duration; tapping it opens /mock-test/<id>.
 *
 * The page tolerates a brand-new user with no mock tests in their target
 * exam yet: we show a friendly empty state with a Coming-soon message
 * rather than an error banner.
 */
export default function MockTestsListPage() {
  const { user, loading } = useAuth();
  const router = useRouter();

  const [me, setMe] = useState<MeResponse['user'] | null>(null);
  const [balance, setBalance] = useState<CreditBalance | null>(null);
  const [tests, setTests] = useState<MockTest[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!loading && !user) router.replace('/signin');
  }, [user, loading, router]);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    (async () => {
      try {
        const [meRes, balRes, listRes] = await Promise.all([
          api.me(),
          api.getBalance(),
          api.mockTests.list(),
        ]);
        if (cancelled) return;
        setMe(meRes.user);
        setBalance(balRes);
        setTests(listRes.mockTests);
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : 'failed to load mock tests');
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [user]);

  const examName = useMemo(
    () => (me?.targetExam ? EXAM_BY_SLUG.get(me.targetExam)?.name : null),
    [me?.targetExam],
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
          <Link href="/dashboard" className="btn-ghost-sm">
            Dashboard
          </Link>
          <Link href="/progress" className="btn-ghost-sm">
            Progress
          </Link>
        </div>
      </header>

      <section className="mt-10">
        <p className="pill mb-3">Mock tests</p>
        <h1 className="font-serif text-3xl font-semibold leading-tight text-ink-900 sm:text-4xl">
          Full-length, timed.
        </h1>
        <p className="mt-2 text-ink-800">
          Mocks cost credits to attempt. Score 60%+ and we{'\u2019'}ll refund the
          cost plus a bonus, so a strong attempt actually pays for itself.
        </p>
        {examName ? (
          <p className="mt-1 text-sm text-muted-500">
            Tracking <span className="font-medium text-ink-800">{examName}</span>
          </p>
        ) : null}
      </section>

      {balance ? (
        <section className="paper-card mt-6 flex items-center justify-between p-5">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-500">
              Credits balance
            </p>
            <p className="font-serif mt-1 text-2xl font-semibold tabular-nums text-ink-900">
              {balance.total}
            </p>
          </div>
          <Link href="/upgrade" className="btn-ghost-sm">
            Top up
          </Link>
        </section>
      ) : null}

      {error ? (
        <div className="banner banner-error mt-6" role="alert">
          <span>{error}</span>
        </div>
      ) : null}

      {tests && tests.length === 0 ? (
        <section className="paper-card mt-6 p-6 sm:p-8">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-500">
            Coming soon
          </p>
          <h2 className="font-serif mt-2 text-xl font-semibold text-ink-900">
            No mock tests in your exam yet
          </h2>
          <p className="mt-2 text-ink-800">
            We{'\u2019'}re still authoring full-length mocks for {examName ?? 'your exam'}.
            For now, take the daily MCQ and read chapters to build mastery.
          </p>
          <div className="mt-4 flex gap-2">
            <Link href="/mcq" className="btn-primary">
              Daily MCQ
            </Link>
            <Link href="/chapters" className="btn-ghost">
              Library
            </Link>
          </div>
        </section>
      ) : null}

      {!tests && !error ? (
        <p className="mt-8 text-sm text-muted-500">Loading mock tests...</p>
      ) : null}

      {tests && tests.length > 0 ? (
        <section className="mt-6 grid gap-4">
          {tests.map((t) => (
            <MockTestCard
              key={t.id}
              test={t}
              affordable={
                balance ? balance.total >= t.costCredits : true
              }
            />
          ))}
        </section>
      ) : null}

      <p className="mt-8 text-xs text-muted-500">
        Pass threshold is 60%. Fail attempts spend credits but don{'\u2019'}t
        penalise streaks. Refresh during a test = same questions, same
        timer state on the server.
      </p>
    </main>
  );
}

interface MockTestCardProps {
  test: MockTest;
  affordable: boolean;
}

function MockTestCard({ test, affordable }: MockTestCardProps) {
  const router = useRouter();
  return (
    <article className="paper-card flex flex-col p-6 transition hover:bg-paper-200/40 sm:p-7">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-ember-600">
            {prettyExam(test.exam)}
          </p>
          <h3 className="font-serif mt-1 text-xl font-semibold leading-snug text-ink-900">
            {test.name}
          </h3>
        </div>
        <span className="pill">{test.mcqs.length} questions</span>
      </div>
      <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-3">
        <div>
          <dt className="text-xs uppercase tracking-[0.14em] text-muted-500">
            Duration
          </dt>
          <dd className="mt-1 font-serif text-lg font-semibold tabular-nums text-ink-900">
            {test.durationMinutes} min
          </dd>
        </div>
        <div>
          <dt className="text-xs uppercase tracking-[0.14em] text-muted-500">
            Cost
          </dt>
          <dd className="mt-1 font-serif text-lg font-semibold tabular-nums text-ink-900">
            {test.costCredits} credits
          </dd>
        </div>
        <div>
          <dt className="text-xs uppercase tracking-[0.14em] text-muted-500">
            Pass bonus
          </dt>
          <dd className="mt-1 font-serif text-lg font-semibold tabular-nums text-ink-900">
            +{test.costCredits + Math.round(test.costCredits * 0.5)} on 60%+
          </dd>
        </div>
      </dl>
      <div className="mt-5 flex items-center justify-between gap-3">
        {affordable ? (
          <button
            type="button"
            onClick={() => router.push(`/mock-test/${encodeURIComponent(test.id)}`)}
            className="btn-primary"
          >
            Start mock
          </button>
        ) : (
          <Link href="/upgrade" className="btn-primary">
            Top up to start
          </Link>
        )}
        <span className="text-xs text-muted-500">
          {affordable ? 'Refundable on a strong attempt' : 'Not enough credits'}
        </span>
      </div>
    </article>
  );
}

function prettyExam(slug: ExamSlug | string): string {
  return EXAM_BY_SLUG.get(slug as ExamSlug)?.name ?? String(slug);
}
