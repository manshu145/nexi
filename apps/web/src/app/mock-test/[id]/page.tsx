'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { Logo } from '~/components/Logo';
import { useAuth } from '~/lib/auth-context';
import {
  api,
  type AnswerKey,
  type MockTestStartResponse,
} from '~/lib/api';

/**
 * /mock-test/[id] -- Phase 13
 *
 * Full-length, timed mock test runner. Same UX vocabulary as the chapter
 * test (timer, palette, mark-for-review, auto-submit) but for a longer
 * format with a server-tracked deadline.
 *
 * Server-driven deadline:
 *   - The session has expiresAt = startedAt + durationMinutes.
 *   - On refresh we compute remaining seconds against the server's
 *     expiresAt, NOT a client-only timer. So a refresh near the end
 *     doesn't reset the clock and a wall-clock manipulation can't
 *     extend the test.
 *
 * Idempotency:
 *   - Starting the same mock twice on the same IST day returns the
 *     same session id with the original deadline preserved.
 *   - Submitting twice returns the original grading (alreadySubmitted).
 *
 * Failure modes the page handles cleanly:
 *   - 402 from /start when the user can't afford the test (insufficient
 *     credits) -- redirected message + "Top up" CTA.
 *   - 404 -- mock test was unpublished after the user landed.
 */
export default function MockTestRunnerPage() {
  const params = useParams<{ id: string }>();
  const id = params?.id ?? '';

  const { user, loading } = useAuth();
  const router = useRouter();

  const [data, setData] = useState<MockTestStartResponse | null>(null);
  const [answers, setAnswers] = useState<Record<string, AnswerKey | null>>({});
  const [marked, setMarked] = useState<Record<string, boolean>>({});
  const [idx, setIdx] = useState(0);
  const [secondsLeft, setSecondsLeft] = useState<number | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [needsTopUp, setNeedsTopUp] = useState(false);
  const submittedRef = useRef(false);

  // Auth gate.
  useEffect(() => {
    if (!loading && !user) router.replace('/signin');
  }, [user, loading, router]);

  // Bootstrap the session.
  useEffect(() => {
    if (!user || !id) return;
    let cancelled = false;
    (async () => {
      try {
        const start = await api.mockTests.start(id);
        if (cancelled) return;
        // If the user lands on the page after a previous submit (idempotent
        // start would have returned the same session id), skip straight to
        // the result page so we don't re-render the runner UI for a
        // closed session.
        if (start.session.status === 'submitted') {
          router.replace(`/mock-test/${encodeURIComponent(id)}/result`);
          return;
        }
        setData(start);
        const seed: Record<string, AnswerKey | null> = {};
        for (const m of start.mcqs) seed[m.id] = null;
        setAnswers(seed);
        // Compute remaining seconds from the server's expiresAt so a
        // refresh near the deadline doesn't extend the test.
        const expiresMs = new Date(start.session.expiresAt).getTime();
        const remainMs = expiresMs - Date.now();
        setSecondsLeft(Math.max(0, Math.floor(remainMs / 1000)));
      } catch (e) {
        if (cancelled) return;
        const msg = e instanceof Error ? e.message : 'failed to start mock test';
        if (/insufficient credits/i.test(msg)) {
          setNeedsTopUp(true);
          setError(msg);
        } else {
          setError(msg);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [user, id, router]);

  // Submit handler. Shared by manual click + auto-submit on timeout.
  const submit = useCallback(async () => {
    if (!data) return;
    if (submittedRef.current) return;
    submittedRef.current = true;
    try {
      setError(null);
      setSubmitting(true);
      const res = await api.mockTests.complete(data.session.id, {
        answers: data.mcqs.map((m) => ({
          mcqId: m.id,
          chosen: answers[m.id] ?? null,
        })),
      });
      sessionStorage.setItem(
        `nexigrate:mockResult:${id}`,
        JSON.stringify({
          result: res,
          mcqs: data.mcqs,
          picks: answers,
        }),
      );
      router.replace(`/mock-test/${encodeURIComponent(id)}/result`);
    } catch (e) {
      submittedRef.current = false;
      setError(e instanceof Error ? e.message : 'failed to submit');
    } finally {
      setSubmitting(false);
    }
  }, [answers, data, id, router]);

  // 1-second tick. Auto-submit at 0.
  useEffect(() => {
    if (secondsLeft === null) return;
    if (secondsLeft <= 0) {
      void submit();
      return;
    }
    const t = window.setTimeout(() => setSecondsLeft((n) => (n ?? 0) - 1), 1000);
    return () => window.clearTimeout(t);
  }, [secondsLeft, submit]);

  const total = data?.mcqs.length ?? 0;
  const current = data?.mcqs[idx];
  const answeredCount = useMemo(
    () => Object.values(answers).filter((v) => v !== null).length,
    [answers],
  );

  function pick(key: AnswerKey) {
    if (!current) return;
    setAnswers((prev) => ({ ...prev, [current.id]: key }));
  }

  function toggleMark() {
    if (!current) return;
    setMarked((prev) => ({ ...prev, [current.id]: !prev[current.id] }));
  }

  function jumpTo(i: number) {
    setIdx(Math.max(0, Math.min(total - 1, i)));
  }

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

  if (needsTopUp) {
    return (
      <main className="mx-auto max-w-2xl px-6 py-10">
        <div className="banner banner-error" role="alert">
          <span className="flex-1">{error}</span>
        </div>
        <div className="mt-4 flex gap-2">
          <Link href="/upgrade" className="btn-primary">
            Top up credits
          </Link>
          <Link href="/mock-tests" className="btn-ghost">
            Back to mock tests
          </Link>
        </div>
      </main>
    );
  }

  if (error && !data) {
    return (
      <main className="mx-auto max-w-2xl px-6 py-10">
        <div className="banner banner-error" role="alert">
          <span className="flex-1">{error}</span>
        </div>
        <Link href="/mock-tests" className="btn-ghost mt-4 inline-flex">
          Back to mock tests
        </Link>
      </main>
    );
  }

  if (!data || !current) {
    return (
      <main className="flex min-h-[60vh] items-center justify-center px-6">
        <span className="inline-flex items-center gap-2 text-sm text-muted-500">
          <span className="spinner" aria-hidden="true" />
          Preparing your mock test...
        </span>
      </main>
    );
  }

  const lowOnTime = secondsLeft !== null && secondsLeft <= 60;
  const danger = secondsLeft !== null && secondsLeft <= 30;

  return (
    <main className="mx-auto flex min-h-screen max-w-3xl flex-col px-6 pt-6 pb-12">
      <header className="flex items-center justify-between">
        <Logo />
        <Link href="/mock-tests" className="btn-ghost-sm">
          Exit
        </Link>
      </header>

      <section className="mt-6">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-500">
          Mock test
        </p>
        <h1 className="font-serif mt-1 text-2xl font-semibold leading-tight text-ink-900 sm:text-3xl">
          {prettyId(id)}
        </h1>
        <p className="mt-1 text-sm text-muted-500">
          {data.durationMinutes} min · {total} questions · {data.session.costCredits} credits
        </p>
      </section>

      {/* Sticky timer + counters bar. */}
      <div
        className="sticky top-2 z-10 mt-5 flex items-center justify-between gap-3 rounded-full border border-line bg-paper-50/90 px-4 py-2 backdrop-blur"
        role="timer"
        aria-live="polite"
      >
        <span
          className={
            'font-serif tabular-nums text-lg font-semibold ' +
            (danger ? 'text-ember-700' : lowOnTime ? 'text-ember-600' : 'text-ink-900')
          }
        >
          {formatTime(secondsLeft ?? 0)}
        </span>
        <span className="text-xs text-muted-500">
          Q {idx + 1} / {total} · answered {answeredCount}
        </span>
        <button
          type="button"
          onClick={submit}
          disabled={submitting}
          className="btn-ghost-sm"
        >
          {submitting ? 'Submitting...' : 'Submit'}
        </button>
      </div>

      <article className="paper-card mt-5 p-6 sm:p-8">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-ember-600">
          {String(current.subject)} · {String(current.difficulty).toUpperCase()}
        </p>
        <h2 className="font-serif mt-2 text-xl font-semibold leading-snug text-ink-900 sm:text-2xl">
          {current.question}
        </h2>

        <div className="mt-6 space-y-3">
          {current.options.map((opt) => {
            const chosen = answers[current.id] === opt.key;
            return (
              <button
                key={opt.key}
                type="button"
                onClick={() => pick(opt.key)}
                className={
                  'flex w-full items-start gap-3 rounded-lg border px-4 py-3 text-left transition ' +
                  (chosen
                    ? 'border-ember-600 bg-paper-200'
                    : 'border-line bg-paper-50 hover:border-ember-500')
                }
              >
                <span className="font-serif font-semibold text-ember-600">
                  {opt.key}.
                </span>
                <span className="text-ink-900">{opt.text}</span>
              </button>
            );
          })}
        </div>

        <div className="mt-5 flex flex-wrap items-center justify-between gap-3 text-xs text-muted-500">
          <span>Source: {current.source}</span>
          <button
            type="button"
            onClick={toggleMark}
            className="btn-ghost-sm"
            aria-pressed={!!marked[current.id]}
          >
            {marked[current.id] ? 'Unmark for review' : 'Mark for review'}
          </button>
        </div>
      </article>

      {error ? (
        <div className="banner banner-error mt-5" role="alert">
          <span>{error}</span>
        </div>
      ) : null}

      <nav className="mt-6 flex items-center justify-between">
        <button
          type="button"
          onClick={() => jumpTo(idx - 1)}
          disabled={idx === 0}
          className="btn-ghost"
        >
          Previous
        </button>
        {idx < total - 1 ? (
          <button
            type="button"
            onClick={() => jumpTo(idx + 1)}
            className="btn-primary"
          >
            Next
          </button>
        ) : (
          <button
            type="button"
            onClick={submit}
            disabled={submitting}
            className="btn-primary"
          >
            {submitting ? 'Submitting...' : 'Submit answers'}
          </button>
        )}
      </nav>

      {/* Question palette. */}
      <section className="mt-8">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-500">
          Question palette
        </p>
        <div className="mt-2 flex flex-wrap gap-1.5">
          {data.mcqs.map((m, i) => {
            const isCurrent = i === idx;
            const isAnswered = answers[m.id] !== null;
            const isMarked = !!marked[m.id];
            return (
              <button
                key={m.id}
                type="button"
                onClick={() => jumpTo(i)}
                className={paletteClass(isCurrent, isAnswered, isMarked)}
                aria-current={isCurrent ? 'step' : undefined}
                aria-label={
                  (isAnswered ? 'Answered' : 'Not answered') +
                  (isMarked ? ', marked for review' : '') +
                  `, question ${i + 1}`
                }
              >
                {i + 1}
              </button>
            );
          })}
        </div>
        <p className="mt-2 text-xs text-muted-500">
          <span className="inline-block h-2 w-2 rounded-full bg-ink-900 align-middle" />{' '}
          answered
          <span className="ml-3 inline-block h-2 w-2 rounded-full border border-line bg-paper-300 align-middle" />{' '}
          unanswered
          <span className="ml-3 inline-block h-2 w-2 rounded-full bg-ember-600 align-middle" />{' '}
          current
          <span className="ml-3 inline-block h-2 w-2 rounded-full border border-gold-500 bg-paper-300 align-middle" />{' '}
          marked
        </p>
      </section>
    </main>
  );
}

function paletteClass(current: boolean, answered: boolean, marked: boolean): string {
  const base =
    'inline-flex h-9 w-9 items-center justify-center rounded-full text-xs font-semibold tabular-nums border transition';
  if (current) return `${base} border-ember-600 bg-ember-600 text-paper-100`;
  if (answered && marked)
    return `${base} border-gold-500 bg-ink-900 text-paper-100`;
  if (answered) return `${base} border-ink-900 bg-ink-900 text-paper-100`;
  if (marked)
    return `${base} border-gold-500 bg-paper-300 text-ink-900`;
  return `${base} border-line bg-paper-300 text-muted-500 hover:bg-paper-200`;
}

function formatTime(s: number): string {
  const safe = Math.max(0, Math.floor(s));
  const mm = String(Math.floor(safe / 60)).padStart(2, '0');
  const ss = String(safe % 60).padStart(2, '0');
  return `${mm}:${ss}`;
}

function prettyId(id: string): string {
  // mock_jee_main_01 -> "Mock JEE Main 01"
  return id
    .replace(/^mock_/, '')
    .split('_')
    .map((w) => (w[0]?.toUpperCase() ?? '') + w.slice(1))
    .join(' ');
}
