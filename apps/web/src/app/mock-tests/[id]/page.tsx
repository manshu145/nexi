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
import { useParams, useRouter, useSearchParams } from 'next/navigation';
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
  const searchParams = useSearchParams();
  const pending = searchParams?.get('pending') === '1';
  const { user, loading: authLoading } = useAuth();

  const [attempt, setAttempt] = useState<Attempt | null>(null);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [genError, setGenError] = useState<string | null>(null);
  const [idx, setIdx] = useState(0);
  const [answers, setAnswers] = useState<Record<string, Choice>>({});
  const [flagged, setFlagged] = useState<Record<string, boolean>>({});
  const [reviewOpen, setReviewOpen] = useState(false);
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

  // Load the attempt — with polling for the 'generating' phase. Mock-test
  // generation now happens server-side under a client-owned id; while it's
  // in flight (status 'generating') we poll until the test is ready, so a
  // dropped start-response still resolves into a playable test instead of a
  // dead "network error".
  useEffect(() => {
    if (authLoading) return;
    if (!user) { router.replace('/signin'); return; }
    if (!id) return;

    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;
    // When we arrived via ?pending=1 the start response was lost, so the
    // attempt doc may not exist for a beat — tolerate a few 404s before
    // giving up.
    let notFoundTries = 0;
    const MAX_NOT_FOUND = pending ? 8 : 1;
    const POLL_MS = 2500;

    const poll = async () => {
      try {
        const a = await api.getMockTest(id);
        if (cancelled) return;
        notFoundTries = 0;
        if (a.status === 'generating') {
          setGenerating(true);
          timer = setTimeout(poll, POLL_MS);
          return;
        }
        if (a.status === 'generation_failed') {
          setGenerating(false);
          setGenError(a.generationError || 'The mock test could not be generated. Your credits were refunded — please try again.');
          setLoading(false);
          return;
        }
        // ready (in_progress / submitted / expired)
        setGenerating(false);
        setAttempt(a);
        if (a.answers) setAnswers(a.answers);
        setLoading(false);
      } catch (err) {
        if (cancelled) return;
        const msg = err instanceof Error ? err.message : 'Could not load attempt';
        // Tolerate transient not-found / network blips while generation
        // is still spinning up or the connection is flaky.
        const isNotFound = /not found|404/i.test(msg);
        const isNetwork = err instanceof TypeError;
        if ((isNotFound && notFoundTries < MAX_NOT_FOUND) || isNetwork) {
          notFoundTries += isNotFound ? 1 : 0;
          setGenerating(true);
          timer = setTimeout(poll, POLL_MS);
          return;
        }
        if (isNotFound) {
          // Start request likely never reached the server.
          setGenError('We could not start this mock test — it may not have been created. No credits were charged. Please go back and try again.');
          setLoading(false);
          return;
        }
        toast.error(msg);
        router.replace('/mock-tests');
      }
    };

    void poll();
    return () => { cancelled = true; if (timer) clearTimeout(timer); };
  }, [authLoading, user, id, router, pending]);

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
        wrongCount: result.wrongCount ?? null,
        netMarks: result.netMarks ?? null,
        negativeMarkPerWrong: result.negativeMarkPerWrong ?? 0,
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

  // Generation failed (or could not start) — clean recoverable error.
  if (genError) {
    return (
      <main className="min-h-screen bg-paper-100 px-4 py-6">
        <div className="mx-auto max-w-md">
          <div role="alert" className="paper-card mt-10 border border-ember-500/40 p-6 text-center">
            <span aria-hidden className="mx-auto grid h-12 w-12 place-items-center rounded-full bg-ember-500/10 text-2xl">⚠️</span>
            <h1 className="mt-4 font-serif text-lg font-semibold text-ink-900">Mock test could not start</h1>
            <p className="mt-2 text-sm text-muted-500">{genError}</p>
            <p className="mt-3 text-[11px] text-muted-400">No credits lost — we only charge once a test is fully generated, and refund automatically on failure.</p>
            <button type="button" onClick={() => router.replace('/mock-tests')} className="btn-primary mt-5 w-full">
              Back to Mock Tests
            </button>
          </div>
        </div>
      </main>
    );
  }

  // Still generating — reassuring polling loader (recovers a dropped start).
  if (generating && !attempt) {
    return (
      <main className="min-h-screen bg-paper-100 px-4 py-6">
        <div className="mx-auto max-w-md">
          <div role="status" aria-live="polite" className="paper-card mt-10 p-6 text-center">
            <span aria-hidden className="mx-auto grid h-12 w-12 place-items-center rounded-full bg-ember-500/10">
              <span className="h-3.5 w-3.5 rounded-full bg-ember-500 animate-pulse" />
            </span>
            <h1 className="mt-4 font-serif text-lg font-semibold text-ink-900">Preparing your mock test…</h1>
            <p className="mt-2 text-sm text-muted-500">
              Our AI is generating 50 exam-pattern questions. This can take 30–90 seconds — it&apos;ll open automatically when ready, even if your connection blips.
            </p>
            <p className="mt-3 text-[11px] text-muted-400">Keep this screen open. You won&apos;t lose credits if generation fails.</p>
          </div>
        </div>
      </main>
    );
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

  const allQs = attempt.questions as Question[];
  const unansweredList = allQs.map((qq, i) => ({ qq, i })).filter(({ qq }) => (answers[qq.id] ?? null) === null);
  const flaggedList = allQs.map((qq, i) => ({ qq, i })).filter(({ qq }) => flagged[qq.id]);

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
        {/* Subject + difficulty pill row + flag toggle */}
        <div className="mb-3 flex flex-wrap items-center gap-2 text-xs">
          {q.subject && <span className="rounded-full bg-paper-200 px-2 py-0.5 text-muted-600">{q.subject}</span>}
          {q.difficulty && (
            <span className={`rounded-full px-2 py-0.5 capitalize ${
              q.difficulty === 'hard' ? 'bg-red-500/10 text-red-600'
              : q.difficulty === 'medium' ? 'bg-gold-500/10 text-gold-700'
              : 'bg-ember-500/10 text-ember-600'
            }`}>{q.difficulty}</span>
          )}
          <button
            type="button"
            onClick={() => setFlagged(prev => ({ ...prev, [q.id]: !prev[q.id] }))}
            className={`ml-auto rounded-full px-2.5 py-0.5 font-medium transition-colors ${
              flagged[q.id] ? 'bg-gold-500/20 text-gold-700' : 'bg-paper-200 text-muted-500 hover:bg-paper-300'
            }`}
            aria-pressed={!!flagged[q.id]}
          >
            {flagged[q.id] ? '🚩 Flagged' : '⚐ Flag for review'}
          </button>
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
              onClick={() => setReviewOpen(true)}
              disabled={submitting}
              className="btn-primary flex-1"
            >
              Review & Submit
            </button>
          )}
        </div>

        {/* Review & Submit available anytime */}
        <button
          type="button"
          onClick={() => setReviewOpen(true)}
          className="mt-3 w-full text-center text-xs font-medium text-ember-600 hover:text-ember-700"
        >
          Review flagged / unanswered & submit
        </button>

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

      {/* Review & Submit overlay — shows flagged + unanswered before final submit */}
      {reviewOpen && (
        <div className="fixed inset-0 z-[120] flex items-end justify-center bg-ink-900/50 p-0 sm:items-center sm:p-4" onClick={() => setReviewOpen(false)}>
          <div className="flex max-h-[85vh] w-full max-w-2xl flex-col overflow-hidden rounded-t-2xl bg-paper-50 sm:rounded-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="border-b border-line px-5 py-4">
              <h3 className="font-serif text-lg font-semibold text-ink-900">Review before submit</h3>
              <p className="mt-1 text-xs text-muted-500">
                {answered}/{total} answered · {unansweredList.length} unanswered · {flaggedList.length} flagged
              </p>
              <p className="mt-1 text-[11px] text-muted-400">Negative marking: −0.25 per wrong answer. Unanswered = no penalty.</p>
            </div>

            <div className="flex-1 space-y-4 overflow-y-auto px-5 py-4">
              {unansweredList.length > 0 && (
                <div>
                  <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-500">Unanswered ({unansweredList.length})</p>
                  <div className="grid grid-cols-6 gap-1.5 sm:grid-cols-10">
                    {unansweredList.map(({ qq, i }) => (
                      <button key={qq.id} type="button"
                        onClick={() => { setIdx(i); setReviewOpen(false); }}
                        className="aspect-square rounded bg-paper-200 text-[11px] font-medium text-muted-600 hover:bg-paper-300">
                        {i + 1}
                      </button>
                    ))}
                  </div>
                </div>
              )}
              {flaggedList.length > 0 && (
                <div>
                  <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-500">🚩 Flagged ({flaggedList.length})</p>
                  <div className="grid grid-cols-6 gap-1.5 sm:grid-cols-10">
                    {flaggedList.map(({ qq, i }) => (
                      <button key={qq.id} type="button"
                        onClick={() => { setIdx(i); setReviewOpen(false); }}
                        className="aspect-square rounded bg-gold-500/15 text-[11px] font-medium text-gold-700 hover:bg-gold-500/25">
                        {i + 1}
                      </button>
                    ))}
                  </div>
                </div>
              )}
              {unansweredList.length === 0 && flaggedList.length === 0 && (
                <p className="py-6 text-center text-sm text-muted-500">All questions answered and nothing flagged. You&apos;re good to go! 🎉</p>
              )}
            </div>

            <div className="flex gap-2 border-t border-line px-5 py-4">
              <button type="button" onClick={() => setReviewOpen(false)} className="btn-ghost flex-1">Keep working</button>
              <button type="button" onClick={() => { setReviewOpen(false); void handleSubmit(false); }} disabled={submitting} className="btn-primary flex-1">
                {submitting ? 'Submitting…' : 'Submit Now'}
              </button>
            </div>
          </div>
        </div>
      )}
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
          {typeof attempt.netMarks === 'number' && attempt.netMarks !== null && (attempt.negativeMarkPerWrong ?? 0) > 0 && (
            <div className="mx-auto mt-3 max-w-xs rounded-lg bg-paper-200 px-4 py-2 text-xs text-muted-600">
              <span className="font-semibold text-ink-900">{attempt.netMarks}</span> / {attempt.total} net marks
              <span className="mx-1.5 text-muted-400">·</span>
              {attempt.wrongCount ?? 0} wrong × −{attempt.negativeMarkPerWrong}
            </div>
          )}
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
