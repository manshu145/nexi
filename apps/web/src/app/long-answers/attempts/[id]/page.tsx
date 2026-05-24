'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import type { LongAnswerAttempt, LongAnswerQuestion } from '@nexigrate/shared';
import { Logo } from '~/components/Logo';
import { useAuth } from '~/lib/auth-context';
import { api } from '~/lib/api';

/**
 * /long-answers/attempts/[id] -- read-only view of a previously graded
 * attempt. Same render as the writer's "graded" state, but pulled from
 * the user's own attempt history.
 */
export default function AttemptDetailPage() {
  const params = useParams<{ id: string }>();
  const id = params?.id ?? '';
  const { user, loading } = useAuth();
  const router = useRouter();

  const [attempt, setAttempt] = useState<LongAnswerAttempt | null>(null);
  const [question, setQuestion] = useState<LongAnswerQuestion | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!loading && !user) router.replace('/signin');
  }, [user, loading, router]);

  useEffect(() => {
    if (!user || !id) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await api.longAnswers.myAttempt(id);
        if (cancelled) return;
        setAttempt(res.attempt);
        setQuestion(res.question);
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : 'failed to load attempt');
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [user, id]);

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

  if (error) {
    return (
      <main className="mx-auto max-w-2xl px-6 pt-8">
        <Logo />
        <div className="banner banner-error mt-8">{error}</div>
        <Link href="/long-answers" className="btn-ghost mt-4 inline-flex">
          Back to questions
        </Link>
      </main>
    );
  }

  if (!attempt) {
    return (
      <main className="flex min-h-[60vh] items-center justify-center px-6">
        <span className="inline-flex items-center gap-2 text-sm text-muted-500">
          <span className="spinner" aria-hidden="true" />
          Loading attempt...
        </span>
      </main>
    );
  }

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
        {question ? (
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-ember-600">
            {question.source}
          </p>
        ) : null}
        <h1 className="font-serif mt-2 text-xl font-semibold leading-snug text-ink-900 sm:text-2xl">
          {question?.prompt ?? '(question removed)'}
        </h1>
      </section>

      {attempt.status === 'failed' ? (
        <div className="banner banner-error mt-6">
          Grading failed: {attempt.failureReason ?? 'unknown error'}.
          Contact support if this persists.
        </div>
      ) : null}

      {attempt.status === 'pending' ? (
        <div className="paper-card mt-6 flex items-center gap-3 p-5">
          <span className="spinner" aria-hidden="true" />
          <p className="text-sm text-ink-800">
            Still grading. Refresh in a moment.
          </p>
        </div>
      ) : null}

      {attempt.status === 'graded' && g ? (
        <>
          <section className="mt-8">
            <p className="pill mb-3">Graded · {g.graderModelId}</p>
            <p className="font-serif text-3xl font-semibold leading-tight text-ink-900">
              {g.overall}
              <span className="text-muted-500">/10</span>
            </p>
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
        </>
      ) : null}

      <section className="mt-6">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-500">
          Your answer ({attempt.wordCount} words)
        </p>
        <article className="reader mt-2">
          <div className="reader-body whitespace-pre-wrap">{attempt.answer}</div>
        </article>
      </section>
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
