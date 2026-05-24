'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { Logo } from '~/components/Logo';
import { useAuth } from '~/lib/auth-context';
import {
  api,
  type AnswerKey,
  type ChapterTestStartResponse,
  type CompleteSessionResponse,
} from '~/lib/api';

/**
 * /test/<exam>/<subject>/<slug> -- Phase 11
 *
 * Chapter MCQ test in exam mode.
 *
 *   - Countdown timer prominently displayed (60s per question).
 *   - One question per page, like /mcq, plus a question palette so the
 *     student can jump around.
 *   - "Mark for review" toggle per question (visual only -- the server
 *     scores plain answers).
 *   - Auto-submit when the timer hits 0.
 *   - Submit hands off to /mcq/result via sessionStorage so the result
 *     surface (explanations + credits + balance) is reused unchanged.
 *
 * Refresh behaviour: the server creates an idempotent session keyed by
 * (user, exam, chapter, IST day). A refresh re-fetches the same MCQs in
 * the same order. We intentionally do NOT persist answers across refreshes
 * -- this is exam mode, the timed pressure is the point.
 */
export default function ChapterTestPage() {
  const params = useParams<{ exam: string; subject: string; slug: string }>();
  const exam = params?.exam ?? '';
  const subject = params?.subject ?? '';
  const slug = params?.slug ?? '';

  const { user, loading } = useAuth();
  const router = useRouter();

  const [data, setData] = useState<ChapterTestStartResponse | null>(null);
  const [chapterTitle, setChapterTitle] = useState<string>('');
  const [answers, setAnswers] = useState<Record<string, AnswerKey | null>>({});
  const [marked, setMarked] = useState<Record<string, boolean>>({});
  const [idx, setIdx] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [secondsLeft, setSecondsLeft] = useState<number | null>(null);
  const submittedRef = useRef(false);

  // Auth gate.
  useEffect(() => {
    if (!loading && !user) router.replace('/signin');
  }, [user, loading, router]);

  // Bootstrap the test session + fetch the chapter title for the header.
  useEffect(() => {
    if (!user || !exam || !subject || !slug) return;
    let cancelled = false;
    (async () => {
      try {
        const [start, ch] = await Promise.all([
          api.startChapterTest({ exam, subject, chapterSlug: slug }),
          api.chapters.get(exam, subject, slug).catch(() => null),
        ]);
        if (cancelled) return;
        setData(start);
        if (ch?.chapter?.title) setChapterTitle(ch.chapter.title);
        const seed: Record<string, AnswerKey | null> = {};
        for (const m of start.mcqs) seed[m.id] = null;
        setAnswers(seed);
        setSecondsLeft(start.durationSeconds);
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : 'failed to start test');
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [user, exam, subject, slug]);

  // Submit -- shared by manual click + auto-submit on timer expiry.
  const submit = useCallback(async () => {
    if (!data) return;
    if (submittedRef.current) return;
    submittedRef.current = true;
    try {
      setError(null);
      setSubmitting(true);
      const res: CompleteSessionResponse = await api.completeSession(
        data.sessionId,
        {
          answers: data.mcqs.map((m) => ({
            mcqId: m.id,
            chosen: answers[m.id] ?? null,
          })),
        },
      );
      sessionStorage.setItem(
        'nexigrate:lastResult',
        JSON.stringify({
          result: res,
          mcqs: data.mcqs,
          picks: answers,
          context: { kind: 'chapter', exam, subject, slug, title: chapterTitle },
        }),
      );
      router.replace('/mcq/result');
    } catch (e) {
      submittedRef.current = false; // allow retry on failure
      setError(e instanceof Error ? e.message : 'failed to submit');
    } finally {
      setSubmitting(false);
    }
  }, [answers, data, exam, subject, slug, chapterTitle, router]);

  // Countdown timer. Ticks every second; auto-submits at 0.
  useEffect(() => {
    if (secondsLeft === null) return;
    if (secondsLeft <= 0) {
      // Trigger auto-submit once. submittedRef guards against double-fire.
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

  if (error && !data) {
    return (
      <main className="mx-auto max-w-2xl px-6 py-10">
        <div className="banner banner-error" role="alert">
          <span className="flex-1">{error}</span>
        </div>
        <Link href="/chapters" className="btn-ghost mt-4 inline-flex">
          Back to library
        </Link>
      </main>
    );
  }

  if (!data || !current) {
    return (
      <main className="flex min-h-[60vh] items-center justify-center px-6">
        <span className="inline-flex items-center gap-2 text-sm text-muted-500">
          <span className="spinner" aria-hidden="true" />
          Preparing your test...
        </span>
      </main>
    );
  }

  const lowOnTime = secondsLeft !== null && secondsLeft <= 30;

  return (
    <main className="mx-auto flex min-h-screen max-w-3xl flex-col px-6 pt-6 pb-12">
      <header className="flex items-center justify-between">
        <Logo />
        <Link href="/chapters" className="btn-ghost-sm">
          Library
        </Link>
      </header>

      <section className="mt-6">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-500">
          Chapter test
        </p>
        <h1 className="font-serif mt-1 text-2xl font-semibold leading-tight text-ink-900 sm:text-3xl">
          {chapterTitle || prettySlug(slug)}
        </h1>
        <p className="mt-1 text-sm text-muted-500">
          {data.exam} · {prettySubject(subject)} · {total} questions
        </p>
      </section>

      {/* Timer + counters bar. Sticky so it follows the question. */}
      <div
        className="sticky top-2 z-10 mt-5 flex items-center justify-between gap-3 rounded-full border border-line bg-paper-50/90 px-4 py-2 backdrop-blur"
        role="timer"
        aria-live="polite"
      >
        <span
          className={
            'font-serif tabular-nums text-lg font-semibold ' +
            (lowOnTime ? 'text-ember-700' : 'text-ink-900')
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
          {String(current.subject)} ·{' '}
          {String(current.difficulty).toUpperCase()}
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

      {/* Question palette -- click a number to jump. */}
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

function prettySubject(s: string): string {
  return s
    .split('-')
    .map((w) => (w[0]?.toUpperCase() ?? '') + w.slice(1))
    .join(' ');
}

function prettySlug(s: string): string {
  return s
    .split('-')
    .map((w) => (w[0]?.toUpperCase() ?? '') + w.slice(1))
    .join(' ');
}
