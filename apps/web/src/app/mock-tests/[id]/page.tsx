'use client';

/**
 * Mock test attempt page (lock §5.5).
 *
 * Single page with a state machine that handles BOTH phases of a mock
 * test attempt without forcing a route change:
 *
 *   status === 'in_progress'  -> question carousel + countdown timer +
 *                                navigate next/prev + submit. Server
 *                                strips correctOption + explanation
 *                                from this view, so no peek-via-network.
 *   status === 'submitted'    -> score banner + per-subject breakdown +
 *                                question review with correct answers +
 *                                explanations. Read-only, no edit path.
 *   status === 'expired'      -> friendly read-only fallback.
 *
 * Why one page rather than two: the data model is one attempt = one URL,
 * sharing the URL across phases means a user can bookmark it before
 * submitting and come back to the result later. Also avoids a route
 * flip mid-state-change which would lose any in-flight unsaved answers.
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { useAuth } from '~/lib/auth-context';
import { api } from '~/lib/api';
import { AILoader } from '~/components/ui/AILoader';

type Choice = 'A' | 'B' | 'C' | 'D' | null;
interface Question {
  id: string;
  question: string;
  options: { key: 'A' | 'B' | 'C' | 'D'; text: string }[];
  difficulty?: string;
  subject?: string;
  topic?: string;
  correctOption?: 'A' | 'B' | 'C' | 'D';
  explanation?: string;
}

type Attempt = Awaited<ReturnType<typeof api.getMockTest>>;

export default function MockTestAttemptPage() {
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const id = params?.id ?? '';
  const { user, loading: authLoading } = useAuth();

  const [attempt, setAttempt] = useState<Attempt | null>(null);
  const [loading, setLoading] = useState(true);
  const [idx, setIdx] = useState(0);
  const [answers, setAnswers] = useState<Record<string, Choice>>({});
  const [submitting, setSubmitting] = useState(false);
  const [secondsLeft, setSecondsLeft] = useState<number | null>(null);
  const submittedRef = useRef(false); // guard auto-submit from firing twice
  // PR-34a: lift the timer interval ref so the tick callback can clear
  // it the moment `remaining === 0`. Pre-PR-34a, if handleSubmit threw
  // (network blip / 5xx) it reset submittedRef to false to allow retry,
  // but the interval was still running and immediately re-fired
  // handleSubmit because remaining stays at 0 forever. Result: an
  // exponential cascade of submit attempts. Now the interval is killed
  // before handleSubmit, so on a server failure the user falls back to
  // pressing the manual Submit button.
  const tickIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Load the attempt.
  useEffect(() => {
    if (authLoading) return;
    if (!user) { router.replace('/signin'); return; }
    if (!id) return;
    (async () => {
      try {
        const a = await api.getMockTest(id);
        setAttempt(a);
        if (a.answers) setAnswers(a.answers);
      } catch (err) {
        toast.error(err instanceof Error ? err.message : 'Could not load attempt');
        router.replace('/mock-tests');
      } finally {
        setLoading(false);
      }
    })();
  }, [authLoading, user, id, router]);

  // Countdown timer for in-progress attempts. Recomputed off the
  // server-issued `startedAt` + `durationMinutes` so a refresh doesn't
  // give the user extra time.
  useEffect(() => {
    if (!attempt || attempt.status !== 'in_progress') return;
    const deadline = new Date(attempt.startedAt).getTime() + attempt.durationMinutes * 60_000;
    const tick = () => {
      const remaining = Math.max(0, Math.floor((deadline - Date.now()) / 1000));
      setSecondsLeft(remaining);
      if (remaining === 0 && !submittedRef.current) {
        submittedRef.current = true;
        // PR-34a: stop the timer BEFORE handleSubmit. If handleSubmit
        // throws and resets submittedRef to false to allow retry, we
        // don't want the next tick to re-fire handleSubmit immediately;
        // the user falls back to clicking the manual Submit button.
        if (tickIntervalRef.current) {
          clearInterval(tickIntervalRef.current);
          tickIntervalRef.current = null;
        }
        // Auto-submit when time hits zero. Don't toast a loading state -- it's
        // jarring; just submit silently and the result UI will appear.
        void handleSubmit(true);
      }
    };
    tick();
    tickIntervalRef.current = setInterval(tick, 1000);
    return () => {
      if (tickIntervalRef.current) {
        clearInterval(tickIntervalRef.current);
        tickIntervalRef.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [attempt?.id, attempt?.status]);

  const total = attempt?.total ?? 0;
  const answered = useMemo(() => Object.values(answers).filter(v => v !== null).length, [answers]);

  async function handleSubmit(auto = false) {
    if (!attempt || submitting) return;
    setSubmitting(true);
    const toastId = auto ? null : toast.loading('Submitting your answers...');
    try {
      const payload = (attempt.questions as Question[]).map(q => ({
        questionId: q.id,
        chosen: (answers[q.id] ?? null) as Choice,
      }));
      const result = await api.submitMockTest(attempt.id, payload);
      // Refresh the attempt with the full submitted view (questions now have correctOption + explanation).
      setAttempt({
        ...attempt,
        status: 'submitted',
        submittedAt: result.submittedAt,
        score: result.score,
        percentage: result.percentage,
        subjectBreakdown: result.subjectBreakdown,
        questions: result.questions,
        answers: result.answers,
      });
      setAnswers(result.answers);
      if (toastId) toast.success(`Score: ${result.score}/${result.total} (${result.percentage}%)`, { id: toastId });
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to submit';
      if (toastId) toast.error(msg, { id: toastId });
      else toast.error(msg);
      submittedRef.current = false; // allow retry
    } finally {
      setSubmitting(false);
    }
  }

  if (loading || !attempt) {
    return <main className="min-h-screen bg-paper-100"><AILoader context="quiz" /></main>;
  }

  // ─── SUBMITTED VIEW ─────────────────────────────────────────────────────
  if (attempt.status === 'submitted') {
    return <ResultView attempt={attempt} answers={answers} onBack={() => router.push('/mock-tests')} />;
  }

  // ─── IN-PROGRESS VIEW ───────────────────────────────────────────────────
  const q = (attempt.questions as Question[])[idx];
  if (!q) return null;
  const chosen = answers[q.id] ?? null;
  const mins = Math.floor((secondsLeft ?? 0) / 60);
  const secs = (secondsLeft ?? 0) % 60;
  const timerWarning = (secondsLeft ?? 999) <= 60;

  return (
    <main className="min-h-screen bg-paper-100 pb-24">
      {/* Sticky header: timer + progress */}
      <header className="sticky top-0 z-10 border-b border-line bg-paper-50/95 px-4 py-3 backdrop-blur">
        <div className="mx-auto flex max-w-2xl items-center justify-between gap-3">
          <div>
            <p className="text-xs font-medium text-muted-500">Question {idx + 1} of {total}</p>
            <p className="mt-0.5 text-[11px] text-muted-400">{answered}/{total} answered</p>
          </div>
          <div className={`rounded-lg px-3 py-1.5 text-center ${timerWarning ? 'bg-red-500/10 text-red-600' : 'bg-ember-500/10 text-ember-600'}`}>
            <p className="font-mono text-sm font-semibold tabular-nums">
              {String(mins).padStart(2, '0')}:{String(secs).padStart(2, '0')}
            </p>
            <p className="text-[10px] uppercase tracking-wider">left</p>
          </div>
        </div>
        {/* Slim progress bar */}
        <div className="mx-auto mt-2 h-1 max-w-2xl rounded-full bg-paper-300">
          <div className="h-full rounded-full bg-ember-500 transition-all" style={{ width: `${total > 0 ? (idx / total) * 100 : 0}%` }} />
        </div>
      </header>

      <section className="mx-auto max-w-2xl px-4 py-6">
        {/* Subject + difficulty pill row */}
        <div className="mb-3 flex flex-wrap gap-2 text-xs">
          {q.subject && <span className="rounded-full bg-paper-200 px-2 py-0.5 text-muted-600">{q.subject}</span>}
          <span className="rounded-full bg-gold-500/10 px-2 py-0.5 text-gold-700">{q.difficulty}</span>
        </div>

        {/* Question text */}
        <p className="font-serif text-lg leading-relaxed text-ink-900">{q.question}</p>

        {/* Options */}
        <div className="mt-5 space-y-2">
          {q.options.map(opt => {
            const isChosen = chosen === opt.key;
            return (
              <button
                key={opt.key}
                type="button"
                onClick={() => setAnswers(prev => ({ ...prev, [q.id]: opt.key }))}
                className={`w-full rounded-lg border p-3 text-left transition-colors ${
                  isChosen
                    ? 'border-ember-500 bg-ember-500/10 text-ink-900'
                    : 'border-line bg-paper-50 text-ink-800 hover:border-ember-500/40'
                }`}
              >
                <span className={`mr-2 inline-grid h-6 w-6 place-items-center rounded-full text-xs font-semibold ${isChosen ? 'bg-ember-500 text-paper-50' : 'bg-paper-200 text-muted-600'}`}>{opt.key}</span>
                <span className="text-sm">{opt.text}</span>
              </button>
            );
          })}
        </div>

        {/* Skip / clear answer */}
        {chosen !== null && (
          <button
            type="button"
            onClick={() => setAnswers(prev => ({ ...prev, [q.id]: null }))}
            className="mt-3 text-xs text-muted-500 hover:text-ink-900"
          >
            Clear answer
          </button>
        )}

        {/* Nav controls */}
        <div className="mt-6 flex gap-2">
          <button
            type="button"
            onClick={() => setIdx(i => Math.max(0, i - 1))}
            disabled={idx === 0}
            className="btn-ghost flex-1 disabled:opacity-50"
          >
            ← Previous
          </button>
          {idx < total - 1 ? (
            <button
              type="button"
              onClick={() => setIdx(i => Math.min(total - 1, i + 1))}
              className="btn-primary flex-1"
            >
              Next →
            </button>
          ) : (
            <button
              type="button"
              onClick={() => handleSubmit(false)}
              disabled={submitting}
              className="btn-primary flex-1"
            >
              {submitting ? 'Submitting…' : 'Submit test'}
            </button>
          )}
        </div>

        {/* Question-jump grid */}
        <details className="mt-6">
          <summary className="cursor-pointer text-xs text-muted-500 hover:text-ink-900">Jump to question</summary>
          <div className="mt-3 grid grid-cols-6 gap-1.5 sm:grid-cols-10">
            {(attempt.questions as Question[]).map((qq, i) => {
              const isAnswered = (answers[qq.id] ?? null) !== null;
              const isCurrent = i === idx;
              return (
                <button
                  key={qq.id}
                  type="button"
                  onClick={() => setIdx(i)}
                  className={`aspect-square rounded text-[11px] font-medium transition-colors ${
                    isCurrent
                      ? 'bg-ember-500 text-paper-50'
                      : isAnswered
                      ? 'bg-ember-500/15 text-ember-600'
                      : 'bg-paper-200 text-muted-600 hover:bg-paper-300'
                  }`}
                >
                  {i + 1}
                </button>
              );
            })}
          </div>
        </details>
      </section>
    </main>
  );
}

// ─── Result subview ───────────────────────────────────────────────────────

function ResultView({
  attempt,
  answers,
  onBack,
}: {
  attempt: Attempt;
  answers: Record<string, Choice>;
  onBack: () => void;
}) {
  const subjects = attempt.subjectBreakdown ?? {};
  const weakAreas = Object.entries(subjects)
    .map(([s, b]) => ({ subj: s, pct: b.total > 0 ? (b.correct / b.total) * 100 : 0 }))
    .filter(s => s.pct < 60)
    .sort((a, b) => a.pct - b.pct)
    .slice(0, 3);

  return (
    <main className="min-h-screen bg-paper-100 px-4 py-6 pb-24">
      <button type="button" onClick={onBack} className="btn-ghost-sm mx-auto mb-4 block max-w-2xl">← Back to Mock Tests</button>

      {/* Score banner */}
      <section className="mx-auto mb-6 max-w-2xl">
        <div className="paper-card p-6 text-center">
          <p className="text-xs font-medium uppercase tracking-wider text-muted-500">Final Score</p>
          <p className="mt-2 font-serif text-5xl font-bold text-ink-900">
            {attempt.percentage}<span className="text-2xl text-muted-500">%</span>
          </p>
          <p className="mt-1 text-sm text-muted-600">{attempt.score} of {attempt.total} correct</p>
          <p className="mt-3 text-xs text-muted-500">
            Submitted {attempt.submittedAt ? new Date(attempt.submittedAt).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' }) : ''}
          </p>
        </div>
      </section>

      {/* Subject breakdown */}
      {Object.keys(subjects).length > 0 && (
        <section className="mx-auto mb-6 max-w-2xl">
          <h2 className="mb-3 px-1 text-xs font-semibold uppercase tracking-wider text-muted-500">Subject breakdown</h2>
          <div className="space-y-2">
            {Object.entries(subjects).map(([subj, b]) => {
              const pct = b.total > 0 ? Math.round((b.correct / b.total) * 100) : 0;
              return (
                <div key={subj} className="paper-card p-3">
                  <div className="flex items-center justify-between text-sm">
                    <span className="font-medium text-ink-900 capitalize">{subj.replace(/-/g, ' ')}</span>
                    <span className="text-muted-600">{b.correct}/{b.total} <span className="text-muted-400">·</span> {pct}%</span>
                  </div>
                  <div className="mt-2 h-1.5 rounded-full bg-paper-200">
                    <div className={`h-full rounded-full ${pct >= 70 ? 'bg-ember-500' : pct >= 40 ? 'bg-gold-500' : 'bg-red-500/70'}`} style={{ width: `${pct}%` }} />
                  </div>
                </div>
              );
            })}
          </div>
          {weakAreas.length > 0 && (
            <p className="mt-3 px-1 text-xs text-muted-500">
              Weak areas to focus on: <span className="font-medium text-ink-900 capitalize">{weakAreas.map(w => w.subj.replace(/-/g, ' ')).join(', ')}</span>
            </p>
          )}
        </section>
      )}

      {/* Question review */}
      <section className="mx-auto max-w-2xl">
        <h2 className="mb-3 px-1 text-xs font-semibold uppercase tracking-wider text-muted-500">Review answers</h2>
        <div className="space-y-3">
          {(attempt.questions as Question[]).map((q, i) => {
            const userChoice = answers[q.id] ?? null;
            const isCorrect = userChoice === q.correctOption;
            const isSkipped = userChoice === null;
            return (
              <div key={q.id} className="paper-card p-4">
                <div className="flex items-start gap-2">
                  <span className={`mt-0.5 rounded-full px-2 py-0.5 text-xs font-medium ${
                    isSkipped ? 'bg-muted-500/10 text-muted-500'
                    : isCorrect ? 'bg-ember-500/10 text-ember-600'
                    : 'bg-red-500/10 text-red-600'
                  }`}>
                    Q{i + 1} · {isSkipped ? 'Skipped' : isCorrect ? 'Correct' : 'Wrong'}
                  </span>
                </div>
                <p className="mt-2 font-serif text-sm leading-relaxed text-ink-900">{q.question}</p>
                <div className="mt-3 space-y-1.5 text-xs">
                  {q.options.map(opt => {
                    const isUser = userChoice === opt.key;
                    const isAnswer = q.correctOption === opt.key;
                    return (
                      <div key={opt.key} className={`rounded-md px-2 py-1.5 ${
                        isAnswer ? 'bg-ember-500/10 text-ink-900' :
                        isUser ? 'bg-red-500/10 text-ink-900' :
                        'text-muted-600'
                      }`}>
                        <span className="mr-2 font-mono font-semibold">{opt.key}.</span>
                        {opt.text}
                        {isAnswer && <span className="ml-2 text-[10px] uppercase tracking-wider text-ember-600">✓ correct</span>}
                        {isUser && !isAnswer && <span className="ml-2 text-[10px] uppercase tracking-wider text-red-600">your answer</span>}
                      </div>
                    );
                  })}
                </div>
                {q.explanation && (
                  <details className="mt-3">
                    <summary className="cursor-pointer text-xs font-medium text-muted-500 hover:text-ink-900">Explanation</summary>
                    <p className="mt-2 text-xs text-muted-600 leading-relaxed">{q.explanation}</p>
                  </details>
                )}
              </div>
            );
          })}
        </div>
      </section>
    </main>
  );
}
