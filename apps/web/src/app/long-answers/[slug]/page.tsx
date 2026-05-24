'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import {
  LONG_ANSWER_LENGTH_HINTS,
  type LongAnswerAttempt,
  type LongAnswerQuestion,
} from '@nexigrate/shared';
import { Logo } from '~/components/Logo';
import { useAuth } from '~/lib/auth-context';
import { ApiError, api } from '~/lib/api';

/**
 * /long-answers/[slug] -- Phase 18 writing surface.
 *
 * Loads the question, lets the student write within the expected word
 * range, charges 30 credits on submit, runs the AI grader, and renders
 * the rubric breakdown + summary + improvement bullets when graded.
 *
 * The grader call is synchronous on the server (~10-20 seconds for a
 * 600-word answer); we show an inline "grading..." state and a friendly
 * error if the grader bombs.
 */
export default function LongAnswerWriterPage() {
  const params = useParams<{ slug: string }>();
  const slug = params?.slug ?? '';
  const { user, loading } = useAuth();
  const router = useRouter();

  const [question, setQuestion] = useState<LongAnswerQuestion | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [answer, setAnswer] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState<LongAnswerAttempt | null>(null);

  useEffect(() => {
    if (!loading && !user) router.replace('/signin');
  }, [user, loading, router]);

  useEffect(() => {
    if (!user || !slug) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await api.longAnswers.get(slug);
        if (!cancelled) setQuestion(res.question);
      } catch (e) {
        if (!cancelled) {
          setLoadError(e instanceof Error ? e.message : 'failed to load question');
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [user, slug]);

  const wordCount = useMemo(
    () => answer.trim().split(/\s+/).filter(Boolean).length,
    [answer],
  );

  const lengthHint = question
    ? LONG_ANSWER_LENGTH_HINTS[question.expectedLength]
    : null;

  const wordsState: 'too-short' | 'good' | 'too-long' = useMemo(() => {
    if (!lengthHint) return 'too-short';
    if (wordCount < lengthHint.minWords) return 'too-short';
    if (wordCount > lengthHint.maxWords) return 'too-long';
    return 'good';
  }, [lengthHint, wordCount]);

  async function handleSubmit() {
    if (!question || submitting) return;
    if (wordsState !== 'good') return;
    setSubmitting(true);
    setSubmitError(null);
    try {
      const res = await api.longAnswers.submit(question.id, { answer });
      setAttempt(res.attempt);
    } catch (e) {
      if (e instanceof ApiError && e.status === 402) {
        setSubmitError(`${e.message}. Top up credits or take the daily MCQ to earn more.`);
      } else {
        setSubmitError(e instanceof Error ? e.message : 'submission failed');
      }
    } finally {
      setSubmitting(false);
    }
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

  if (loadError) {
    return (
      <main className="mx-auto max-w-2xl px-6 pt-8">
        <Logo />
        <div className="banner banner-error mt-8">{loadError}</div>
        <Link href="/long-answers" className="btn-ghost mt-4 inline-flex">
          Back to questions
        </Link>
      </main>
    );
  }

  if (!question) {
    return (
      <main className="flex min-h-[60vh] items-center justify-center px-6">
        <span className="inline-flex items-center gap-2 text-sm text-muted-500">
          <span className="spinner" aria-hidden="true" />
          Loading question...
        </span>
      </main>
    );
  }

  // Graded view ------------------------------------------------------------
  if (attempt && attempt.status === 'graded' && attempt.grade) {
    const g = attempt.grade;
    return (
      <main className="mx-auto flex min-h-screen max-w-3xl flex-col px-6 pt-8 pb-16">
        <header className="flex items-start justify-between">
          <Logo />
          <Link href="/long-answers" className="btn-ghost-sm">
            Back to questions
          </Link>
        </header>

        <section className="mt-10">
          <p className="pill mb-3">Graded · {g.graderModelId}</p>
          <h1 className="font-serif text-3xl font-semibold leading-tight text-ink-900">
            {g.overall}
            <span className="text-muted-500">/10</span>
          </h1>
          <p className="mt-2 text-ink-800">{g.summary}</p>
        </section>

        <section className="paper-card mt-6 p-5">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-500">
            Rubric breakdown
          </p>
          <div className="mt-3 grid gap-3 sm:grid-cols-5">
            <RubricBar label="Relevance" value={g.rubric.relevance} />
            <RubricBar label="Structure" value={g.rubric.structure} />
            <RubricBar label="Content" value={g.rubric.content} />
            <RubricBar label="Clarity" value={g.rubric.clarity} />
            <RubricBar label="Examples" value={g.rubric.examples} />
          </div>
        </section>

        {g.strengths.length > 0 ? (
          <section className="paper-card mt-4 p-5">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-gold-600">
              Keep doing
            </p>
            <ul className="mt-3 list-disc space-y-1 pl-5 text-ink-800">
              {g.strengths.map((s, i) => (
                <li key={i}>{s}</li>
              ))}
            </ul>
          </section>
        ) : null}

        <section className="paper-card mt-4 p-5">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-ember-600">
            Fix next time
          </p>
          <ul className="mt-3 list-disc space-y-1 pl-5 text-ink-800">
            {g.improvements.map((s, i) => (
              <li key={i}>{s}</li>
            ))}
          </ul>
        </section>

        <section className="mt-6">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-500">
            Your answer ({attempt.wordCount} words)
          </p>
          <article className="reader mt-2">
            <div className="reader-body whitespace-pre-wrap">{attempt.answer}</div>
          </article>
        </section>

        <div className="mt-8 flex gap-3">
          <Link href="/long-answers" className="btn-ghost">
            Try another question
          </Link>
          <Link href="/dashboard" className="btn-ghost">
            Dashboard
          </Link>
        </div>
      </main>
    );
  }

  // Writer view -----------------------------------------------------------
  return (
    <main className="mx-auto flex min-h-screen max-w-3xl flex-col px-6 pt-8 pb-16">
      <header className="flex items-start justify-between">
        <Logo />
        <Link href="/long-answers" className="btn-ghost-sm">
          Cancel
        </Link>
      </header>

      <section className="mt-8">
        <p className="text-xs font-semibold uppercase tracking-[0.14em] text-ember-600">
          {question.source}
        </p>
        <h1 className="font-serif mt-2 text-2xl font-semibold leading-snug text-ink-900 sm:text-3xl">
          {question.prompt}
        </h1>
        {lengthHint ? (
          <p className="mt-3 text-sm text-muted-500">
            {lengthHint.label} · target {lengthHint.minWords}-{lengthHint.maxWords} words ·
            costs 30 credits
          </p>
        ) : null}
      </section>

      <section className="mt-6">
        <label className="block">
          <span className="sr-only">Your answer</span>
          <textarea
            value={answer}
            onChange={(e) => setAnswer(e.target.value)}
            disabled={submitting}
            placeholder="Write your answer here. Structure it like a marker would expect: a clear thesis, evidence, and a synthesis. Cite specific articles, cases, or events where they help."
            rows={20}
            className="input min-h-[60vh] w-full resize-y font-serif text-base leading-relaxed"
          />
        </label>
        <div className="mt-2 flex items-center justify-between text-xs text-muted-500">
          <span
            className={
              wordsState === 'good'
                ? 'text-gold-700'
                : wordsState === 'too-long'
                ? 'text-ember-600'
                : 'text-muted-500'
            }
          >
            {wordCount} words
            {lengthHint
              ? ` (target ${lengthHint.minWords}-${lengthHint.maxWords})`
              : ''}
          </span>
          {wordsState === 'too-short' && lengthHint ? (
            <span>
              Need {lengthHint.minWords - wordCount} more to submit
            </span>
          ) : null}
          {wordsState === 'too-long' && lengthHint ? (
            <span>
              {wordCount - lengthHint.maxWords} over the limit
            </span>
          ) : null}
        </div>
      </section>

      {submitting ? (
        <section className="paper-card mt-6 flex items-center gap-3 p-5">
          <span className="spinner" aria-hidden="true" />
          <div>
            <p className="text-sm font-medium text-ink-900">Grading...</p>
            <p className="text-xs text-muted-500">
              Usually 10-20 seconds. Don't refresh -- credits already charged.
            </p>
          </div>
        </section>
      ) : null}

      {submitError ? (
        <div className="banner banner-error mt-6" role="alert">
          {submitError}
        </div>
      ) : null}

      <div className="mt-8 flex gap-3">
        <button
          type="button"
          disabled={submitting || wordsState !== 'good'}
          onClick={handleSubmit}
          className="btn-primary disabled:opacity-50"
        >
          {submitting ? 'Grading...' : 'Submit for grading (30 credits)'}
        </button>
        <Link href="/long-answers" className="btn-ghost">
          Cancel
        </Link>
      </div>
    </main>
  );
}

function RubricBar({ label, value }: { label: string; value: number }) {
  const pct = Math.round((value / 10) * 100);
  return (
    <div>
      <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-500">
        {label}
      </p>
      <div className="mt-1 flex items-baseline gap-1">
        <span className="font-serif text-xl font-semibold tabular-nums text-ink-900">
          {value}
        </span>
        <span className="text-xs text-muted-500">/10</span>
      </div>
      <div className="mt-2 h-1.5 w-full overflow-hidden rounded bg-paper-300">
        <div
          className="h-full bg-ember-500"
          style={{ width: `${pct}%` }}
          aria-hidden="true"
        />
      </div>
    </div>
  );
}
