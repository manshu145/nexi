'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { Logo } from '~/components/Logo';
import { useAuth } from '~/lib/auth-context';
import {
  type AnswerKey,
  type MockTestCompleteResponse,
} from '~/lib/api';
import type { MCQ } from '@nexigrate/shared';

type CachedResult = {
  result: MockTestCompleteResponse;
  mcqs: Omit<MCQ, 'correctOption' | 'explanation'>[];
  picks: Record<string, AnswerKey | null>;
};

/**
 * /mock-test/[id]/result -- Phase 13
 *
 * Shows the score, pass/fail verdict, credits balance after grading,
 * a per-subject sectional breakdown, and a per-question review with
 * explanations. The page reads its data from sessionStorage that the
 * runner page wrote on submit, keyed by mock test id so two tabs don't
 * stomp on each other.
 *
 * If the user lands here directly without that session-storage handoff
 * (e.g. shared the URL with a friend, refreshed after sessionStorage
 * was wiped), we show a graceful "no result available" state with a
 * link back to /mock-tests.
 */
export default function MockTestResultPage() {
  const params = useParams<{ id: string }>();
  const id = params?.id ?? '';
  const { user, loading } = useAuth();
  const router = useRouter();

  const [cached, setCached] = useState<CachedResult | null>(null);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    if (!loading && !user) router.replace('/signin');
  }, [user, loading, router]);

  useEffect(() => {
    if (!id) return;
    try {
      const raw = sessionStorage.getItem(`nexigrate:mockResult:${id}`);
      if (raw) setCached(JSON.parse(raw) as CachedResult);
    } catch {
      /* tolerate corrupt cache */
    }
    setHydrated(true);
  }, [id]);

  // Per-subject breakdown so a NEET aspirant can see "Biology 8/10,
  // Chemistry 4/10, Physics 6/10" instead of one opaque total.
  const sections = useMemo(() => {
    if (!cached) return [];
    const map = new Map<string, { attempted: number; correct: number; total: number }>();
    const correctById = new Map<string, AnswerKey>();
    for (const e of cached.result.explanations) {
      correctById.set(e.mcqId, e.correctOption as AnswerKey);
    }
    for (const m of cached.mcqs) {
      const subject = String(m.subject || 'general');
      const cur = map.get(subject) ?? { attempted: 0, correct: 0, total: 0 };
      cur.total += 1;
      const pick = cached.picks[m.id] ?? null;
      if (pick) cur.attempted += 1;
      if (pick && correctById.get(m.id) === pick) cur.correct += 1;
      map.set(subject, cur);
    }
    return Array.from(map.entries())
      .map(([subject, v]) => ({
        subject,
        ...v,
        accuracyPct:
          v.attempted === 0 ? 0 : Math.round((v.correct / v.attempted) * 100),
      }))
      .sort((a, b) => b.total - a.total);
  }, [cached]);

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

  if (hydrated && !cached) {
    return (
      <main className="mx-auto max-w-2xl px-6 py-10">
        <p className="pill mb-3">Mock test result</p>
        <h1 className="font-serif text-2xl font-semibold text-ink-900">
          No result available on this device.
        </h1>
        <p className="mt-2 text-ink-800">
          Result data is held in this browser tab only and was cleared. Take
          the mock again or return to the list.
        </p>
        <div className="mt-4 flex gap-2">
          <Link href="/mock-tests" className="btn-primary">
            Back to mock tests
          </Link>
          <Link href={`/mock-test/${encodeURIComponent(id)}`} className="btn-ghost">
            Retake
          </Link>
        </div>
      </main>
    );
  }

  if (!cached) return null;

  const { result, mcqs, picks } = cached;
  const score = result.session.score;
  const total = result.session.total;
  const correctById = new Map<string, AnswerKey>();
  for (const e of result.explanations) correctById.set(e.mcqId, e.correctOption as AnswerKey);
  const explanationById = new Map<string, string>();
  for (const e of result.explanations) explanationById.set(e.mcqId, e.explanation);

  return (
    <main className="mx-auto flex min-h-screen max-w-3xl flex-col px-6 pt-8 pb-16">
      <header className="flex items-start justify-between">
        <Logo />
        <div className="flex items-center gap-2">
          <Link href="/mock-tests" className="btn-ghost-sm">
            Mock tests
          </Link>
          <Link href="/dashboard" className="btn-ghost-sm">
            Dashboard
          </Link>
        </div>
      </header>

      <section className="mt-10">
        <p className="pill mb-3">Mock test result</p>
        <h1 className="font-serif text-3xl font-semibold leading-tight text-ink-900 sm:text-4xl">
          {result.passed ? 'Passed.' : 'Practice run done.'}
        </h1>
        <p className="mt-2 text-ink-800">
          {result.passed
            ? `You scored ${score}/${total}. Cost is refunded plus a +${result.bonusAwarded - result.session.costCredits}\u00a0bonus.`
            : `You scored ${score}/${total}. Pass threshold is 60%. Spent credits aren\u2019t refunded, but you keep all the explanations.`}
        </p>
      </section>

      {/* Headline tiles -- score, balance, bonus. */}
      <section className="mt-6 grid gap-4 sm:grid-cols-3">
        <Stat label="Score" value={`${score} / ${total}`} hint={`${pct(score, total)}%`} />
        <Stat
          label="Credits awarded"
          value={`+${result.bonusAwarded}`}
          hint={result.passed ? 'cost + bonus' : 'pass to earn'}
        />
        <Stat
          label="Balance now"
          value={String(result.balance)}
          hint="across all buckets"
        />
      </section>

      {/* Sectional breakdown. */}
      <section className="paper-card mt-6 p-5 sm:p-6">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-500">
          Sectional breakdown
        </p>
        <h2 className="font-serif mt-2 text-xl font-semibold text-ink-900">
          By subject
        </h2>
        <div className="mt-4 space-y-3">
          {sections.map((s) => (
            <div key={s.subject}>
              <div className="flex items-center justify-between text-sm">
                <span className="font-medium text-ink-900">{prettySubject(s.subject)}</span>
                <span className="tabular-nums text-muted-500">
                  {s.correct}/{s.total} · {s.accuracyPct}%
                </span>
              </div>
              <div
                className="mt-1 h-2 w-full overflow-hidden rounded-full bg-paper-300"
                role="progressbar"
                aria-valuenow={s.accuracyPct}
                aria-valuemin={0}
                aria-valuemax={100}
              >
                <div
                  className="h-full bg-ember-600 transition-all"
                  style={{ width: `${s.accuracyPct}%` }}
                />
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Per-question review with explanations. */}
      <section className="mt-8">
        <h2 className="font-serif text-xl font-semibold text-ink-900">
          Question review
        </h2>
        <p className="mt-1 text-sm text-muted-500">
          Tap any option to expand. Explanations are written for the correct answer.
        </p>
        <div className="mt-4 space-y-4">
          {mcqs.map((m, i) => {
            const correct = correctById.get(m.id);
            const picked = picks[m.id] ?? null;
            const wasCorrect = picked !== null && picked === correct;
            const explanation = explanationById.get(m.id) ?? '';
            return (
              <article key={m.id} className="paper-card p-5 sm:p-6">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-500">
                    Q{i + 1} · {prettySubject(String(m.subject))}
                  </p>
                  <span
                    className={
                      'pill ' +
                      (picked === null
                        ? 'pill-warn'
                        : wasCorrect
                          ? 'pill-success'
                          : 'pill-neutral')
                    }
                  >
                    {picked === null
                      ? 'Skipped'
                      : wasCorrect
                        ? 'Correct'
                        : 'Incorrect'}
                  </span>
                </div>
                <h3 className="font-serif mt-2 text-base font-semibold leading-snug text-ink-900 sm:text-lg">
                  {m.question}
                </h3>
                <ul className="mt-3 space-y-2 text-sm">
                  {m.options.map((opt) => {
                    const isCorrect = correct === opt.key;
                    const isPicked = picked === opt.key;
                    return (
                      <li
                        key={opt.key}
                        className={
                          'flex items-start gap-2 rounded-md border px-3 py-2 ' +
                          (isCorrect
                            ? 'border-ember-600 bg-paper-200'
                            : isPicked
                              ? 'border-line bg-paper-100'
                              : 'border-line bg-paper-50')
                        }
                      >
                        <span className="font-serif font-semibold text-ember-600">
                          {opt.key}.
                        </span>
                        <span className="flex-1 text-ink-900">{opt.text}</span>
                        {isCorrect ? (
                          <span className="text-xs font-semibold text-ember-700">
                            Correct
                          </span>
                        ) : isPicked ? (
                          <span className="text-xs text-muted-500">Your pick</span>
                        ) : null}
                      </li>
                    );
                  })}
                </ul>
                {explanation ? (
                  <p className="mt-3 border-l-2 border-gold-500 pl-3 text-sm text-ink-800">
                    {explanation}
                  </p>
                ) : null}
              </article>
            );
          })}
        </div>
      </section>

      <div className="mt-8 flex flex-wrap gap-2">
        <Link href="/mock-tests" className="btn-primary">
          Back to mock tests
        </Link>
        <Link href="/progress" className="btn-ghost">
          View full progress
        </Link>
      </div>
    </main>
  );
}

function Stat({
  label,
  value,
  hint,
}: {
  label: string;
  value: string | number;
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

function pct(n: number, d: number): number {
  if (d <= 0) return 0;
  return Math.round((n / d) * 100);
}

function prettySubject(s: string): string {
  return s
    .split('-')
    .map((w) => (w[0]?.toUpperCase() ?? '') + w.slice(1))
    .join(' ');
}
