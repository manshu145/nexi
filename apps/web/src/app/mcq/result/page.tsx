'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import type { MCQ } from '@nexigrate/shared';
import { Logo } from '~/components/Logo';
import type { AnswerKey, CompleteSessionResponse } from '~/lib/api';

interface StoredResult {
  result: CompleteSessionResponse;
  mcqs: Omit<MCQ, 'correctOption' | 'explanation'>[];
  picks: Record<string, AnswerKey | null>;
}

export default function McqResultPage() {
  const router = useRouter();
  const [stored, setStored] = useState<StoredResult | null>(null);
  const [missing, setMissing] = useState(false);

  useEffect(() => {
    const raw = sessionStorage.getItem('nexigrate:lastResult');
    if (!raw) {
      setMissing(true);
      return;
    }
    try {
      setStored(JSON.parse(raw) as StoredResult);
    } catch {
      setMissing(true);
    }
  }, []);

  if (missing) {
    return (
      <main className="mx-auto flex min-h-screen max-w-2xl flex-col px-6 pt-10 pb-16">
        <Logo />
        <section className="paper-card mt-12 p-7">
          <h1 className="font-serif text-2xl font-semibold text-ink-900">
            No recent result
          </h1>
          <p className="mt-3 text-ink-800">
            We don’t have a recent MCQ session in this browser. Take today’s MCQ first.
          </p>
          <button
            type="button"
            onClick={() => router.replace('/dashboard')}
            className="btn-primary mt-6"
          >
            Back to dashboard
          </button>
        </section>
      </main>
    );
  }

  if (!stored) {
    return (
      <main className="flex min-h-[60vh] items-center justify-center px-6">
        <span className="inline-flex items-center gap-2 text-sm text-muted-500">
          <span className="spinner" aria-hidden="true" />
          Loading result…
        </span>
      </main>
    );
  }

  const { result, mcqs, picks } = stored;
  const correctMap = new Map(result.explanations.map((e) => [e.mcqId, e]));

  return (
    <main className="mx-auto flex min-h-screen max-w-2xl flex-col px-6 pt-8 pb-16">
      <header className="flex items-start justify-between">
        <Logo />
        <button
          type="button"
          onClick={() => router.replace('/dashboard')}
          className="btn-ghost-sm"
        >
          Done
        </button>
      </header>

      <section className="paper-card mt-10 p-7 text-center sm:p-9">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-ember-600">
          {result.passed ? 'Passed' : 'Attempted'}
        </p>
        <p className="font-serif mt-3 text-5xl font-semibold tabular-nums text-ink-900 sm:text-6xl">
          {result.score}
          <span className="text-muted-500">/{result.total}</span>
        </p>
        <p className="mt-4 text-ink-800">
          {result.passed ? 'Beautiful work today.' : 'You showed up. That counts.'}
        </p>
        <p className="mt-3 inline-flex items-center gap-2 text-sm text-ember-600">
          +{result.creditsAwarded} credits
          <span className="text-muted-500">
            · balance now <span className="font-medium text-ink-900">{result.balance}</span>
          </span>
        </p>
      </section>

      <section className="mt-10">
        <h2 className="font-serif text-xl font-semibold text-ink-900">Review</h2>
        <div className="mt-4 space-y-4">
          {mcqs.map((m, i) => {
            const exp = correctMap.get(m.id);
            const pick = picks[m.id] ?? null;
            const correct = exp?.correctOption ?? null;
            const isRight = pick && correct && pick === correct;
            const status = isRight ? 'correct' : pick ? 'incorrect' : 'skipped';
            const pillClass =
              status === 'correct'
                ? 'pill pill-success'
                : status === 'incorrect'
                  ? 'pill pill-warn'
                  : 'pill pill-neutral';
            return (
              <article key={m.id} className="paper-card p-5 sm:p-6">
                <div className="flex items-start justify-between gap-3">
                  <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-500">
                    Q{i + 1} · {m.subject}
                  </p>
                  <span className={pillClass}>
                    {status === 'correct'
                      ? 'Correct'
                      : status === 'incorrect'
                        ? 'Incorrect'
                        : 'Skipped'}
                  </span>
                </div>
                <p className="font-serif mt-3 text-base font-semibold leading-snug text-ink-900">
                  {m.question}
                </p>
                <ul className="mt-3 space-y-1.5">
                  {m.options.map((opt) => {
                    const isCorrect = correct === opt.key;
                    const isPick = pick === opt.key;
                    return (
                      <li
                        key={opt.key}
                        className={`rounded border px-3 py-2 text-sm ${
                          isCorrect
                            ? 'border-2 border-ember-600 bg-paper-300 text-ink-900'
                            : isPick
                              ? 'border-line bg-paper-50 text-ink-800'
                              : 'border-line bg-transparent text-ink-800'
                        }`}
                      >
                        <span className="font-serif font-semibold text-ember-600">{opt.key}.</span>{' '}
                        {opt.text}
                        {isCorrect ? (
                          <span className="ml-2 text-xs font-semibold uppercase tracking-wider text-ember-600">
                            ✓ correct
                          </span>
                        ) : null}
                      </li>
                    );
                  })}
                </ul>
                {exp ? (
                  <p className="mt-3 text-sm leading-relaxed text-ink-800">
                    <span className="font-medium">Why:</span> {exp.explanation}
                  </p>
                ) : null}
                <p className="mt-3 text-xs text-muted-500">Source: {m.source}</p>
              </article>
            );
          })}
        </div>
      </section>
    </main>
  );
}
