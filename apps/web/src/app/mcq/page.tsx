'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Logo } from '~/components/Logo';
import { useAuth } from '~/lib/auth-context';
import {
  api,
  type AnswerKey,
  type DailyMcqResponse,
  type CompleteSessionResponse,
} from '~/lib/api';

/**
 * Daily MCQ player.
 *
 * One question per page, with progress dots. The answers are kept in local
 * state until the student finishes the last question; we then submit the
 * whole session to the api in a single call. The api grades server-side
 * and awards credits idempotently (same sessionId on retry = no double award).
 *
 * After grade, we hand off to /mcq/result via sessionStorage so the result
 * screen can show explanations + new balance without an extra round-trip.
 */
export default function McqPage() {
  const { user, loading } = useAuth();
  const router = useRouter();

  const [data, setData] = useState<DailyMcqResponse | null>(null);
  const [answers, setAnswers] = useState<Record<string, AnswerKey | null>>({});
  const [idx, setIdx] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!loading && !user) router.replace('/signin');
  }, [user, loading, router]);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await api.getDaily();
        if (cancelled) return;
        setData(res);
        const seed: Record<string, AnswerKey | null> = {};
        for (const m of res.mcqs) seed[m.id] = null;
        setAnswers(seed);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : 'failed to load');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [user]);

  const total = data?.mcqs.length ?? 0;
  const current = data?.mcqs[idx];
  const allAnswered = useMemo(
    () => total > 0 && Object.values(answers).every((v) => v !== null),
    [answers, total],
  );

  function pick(key: AnswerKey) {
    if (!current) return;
    setAnswers((prev) => ({ ...prev, [current.id]: key }));
  }

  function next() {
    if (idx < total - 1) setIdx(idx + 1);
  }

  function prev() {
    if (idx > 0) setIdx(idx - 1);
  }

  async function submit() {
    if (!data) return;
    try {
      setError(null);
      setSubmitting(true);
      const res: CompleteSessionResponse = await api.completeSession(data.sessionId, {
        answers: data.mcqs.map((m) => ({ mcqId: m.id, chosen: answers[m.id] ?? null })),
      });
      sessionStorage.setItem(
        'nexigrate:lastResult',
        JSON.stringify({ result: res, mcqs: data.mcqs, picks: answers }),
      );
      router.replace('/mcq/result');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'failed to submit');
    } finally {
      setSubmitting(false);
    }
  }

  if (loading || !user || !data || !current) {
    return (
      <main className="flex min-h-[60vh] items-center justify-center px-6">
        <p className="text-muted-500 text-sm">{error ?? 'Loading today\u2019s MCQ\u2026'}</p>
      </main>
    );
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-2xl flex-col px-6 pt-8 pb-12">
      <header className="flex items-center justify-between">
        <Logo />
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-500">
          Question {idx + 1} of {total}
        </p>
      </header>

      <ProgressDots total={total} answers={answers} mcqIds={data.mcqs.map((m) => m.id)} current={idx} />

      <article className="paper-card mt-8 p-6 sm:p-8">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-ember-600">
          {current.subject}
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
                className={`flex w-full items-start gap-3 rounded-lg border px-4 py-3 text-left transition ${
                  chosen
                    ? 'border-ember-600 bg-paper-200'
                    : 'border-line bg-paper-50 hover:border-ember-500'
                }`}
              >
                <span className="font-serif font-semibold text-ember-600">{opt.key}.</span>
                <span className="text-ink-900">{opt.text}</span>
              </button>
            );
          })}
        </div>

        <p className="mt-5 text-xs text-muted-500">Source: {current.source}</p>
      </article>

      {error ? (
        <p className="mt-6 text-sm text-ember-600" role="alert">
          {error}
        </p>
      ) : null}

      <nav className="mt-8 flex items-center justify-between">
        <button type="button" onClick={prev} disabled={idx === 0} className="btn-ghost">
          Previous
        </button>
        {idx < total - 1 ? (
          <button type="button" onClick={next} className="btn-primary">
            Next
          </button>
        ) : (
          <button
            type="button"
            onClick={submit}
            disabled={submitting || !allAnswered}
            className="btn-primary"
          >
            {submitting ? 'Submitting\u2026' : allAnswered ? 'Submit answers' : 'Answer all to submit'}
          </button>
        )}
      </nav>
    </main>
  );
}

function ProgressDots({
  total,
  current,
  answers,
  mcqIds,
}: {
  total: number;
  current: number;
  answers: Record<string, AnswerKey | null>;
  mcqIds: string[];
}) {
  return (
    <div className="mt-5 flex flex-wrap gap-1.5" aria-label="progress">
      {Array.from({ length: total }, (_, i) => {
        const id = mcqIds[i];
        const answered = id ? answers[id] !== null : false;
        const isCurrent = i === current;
        return (
          <span
            key={i}
            className={`h-2 flex-1 rounded-full ${
              isCurrent
                ? 'bg-ember-600'
                : answered
                  ? 'bg-ink-900'
                  : 'bg-line'
            }`}
            style={{ minWidth: 16 }}
          />
        );
      })}
    </div>
  );
}
