'use client';

/**
 * Mock test list + start page (lock §5.5).
 *
 * Two surfaces stacked vertically:
 *   1. "Start a new mock test" card -- quick presets (30q / 30min default)
 *      and a confirm-dialog explaining the credit cost before kicking off.
 *      The actual credit charge happens server-side inside POST /mock-tests/start.
 *   2. "Past attempts" list -- shows last 20 attempts. Click an attempt to
 *      jump into /mock-tests/<id> where the attempt page state-machine
 *      either resumes (status=in_progress) or shows the result (status=submitted).
 *
 * Built mobile-first using the brand-token palette (paper / ink / ember /
 * gold / muted) per apps/web/DESIGN.md. No raw amber/stone/hex.
 *
 * PR-32 — Mock-test long-poll fix:
 *   The founder reported that "Start Mock Test" sometimes fails with
 *   "failed to fetch" on mobile networks. Root cause is server-side:
 *   the /v1/mock-tests/start route can take 30-90 seconds when Groq is
 *   the only working provider (PR-18 batches 30 questions into 6×5 LLM
 *   calls). On flaky mobile connections the browser can drop the idle
 *   socket, which surfaces as a TypeError("Failed to fetch") with no
 *   useful context.
 *
 *   The fix is two-part:
 *     1. Progressive loading state — instead of one static "preparing"
 *        spinner, the message escalates at 8 / 25 / 45 second marks so
 *        the user knows the wait is normal and not a hang.
 *     2. AbortController + 90 sec ceiling — if the browser hasn't heard
 *        back by 90s we abort with a clean "took too long" message
 *        instead of an indefinite spinner. On any failure (timeout,
 *        network, 503) we render a retry card with the exact error
 *        message and a "Try Again" button.
 *
 *   Brand tokens only (paper / ink / ember / muted / line). NO new colours.
 */

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useAuth } from '~/lib/auth-context';
import { useUser } from '~/lib/userStore';
import { api } from '~/lib/api';
import { AILoader } from '~/components/ui/AILoader';
import { track } from '~/lib/analytics';

interface AttemptListItem {
  id: string;
  examSlug: string;
  language: 'en' | 'hi';
  status: 'in_progress' | 'submitted' | 'expired';
  startedAt: string;
  submittedAt: string | null;
  total: number;
  score: number | null;
  percentage: number | null;
  durationMinutes: number;
}

/**
 * 90-second client-side ceiling for the start-mock-test round trip. Beyond
 * this we abort and surface a clean error instead of letting the browser
 * spin forever. Tuned to comfortably exceed the 30-90s server-side worst
 * case observed in PR-18 production traces.
 */
const MOCK_TEST_TIMEOUT_MS = 90_000;

/**
 * Progressive loading messages. The mock-test generator can take 30-90s
 * on Groq-only days; a single static message makes that feel broken.
 * These re-key at 0 / 8 / 25 / 45 seconds so the user has a steady
 * reassuring narrative while the LLM batches finish.
 */
const LOADING_STAGES: ReadonlyArray<{ atMs: number; message: string }> = [
  { atMs: 0,      message: 'Preparing your mock test…' },
  { atMs: 8_000,  message: 'Generating questions tailored to your exam…' },
  { atMs: 25_000, message: 'Almost there — finalising your test…' },
  { atMs: 45_000, message: 'Taking longer than expected. Hang on…' },
];

function pickLoadingMessage(elapsedMs: number): string {
  let active = LOADING_STAGES[0]!.message;
  for (const stage of LOADING_STAGES) {
    if (elapsedMs >= stage.atMs) active = stage.message;
  }
  return active;
}

export default function MockTestsPage() {
  const router = useRouter();
  const { user, loading: authLoading } = useAuth();
  // PR-32: read targetExam + language from the shared user store. The
  // page used to fire api.me() on every Start click — replaced with a
  // one-line read that the dashboard already populated.
  const { user: me } = useUser();
  const tc = useTranslations('common');
  const [attempts, setAttempts] = useState<AttemptListItem[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(true);
  const [historyError, setHistoryError] = useState<string | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);

  // Start-flow state machine: 'idle' → 'starting' → 'error' (or success
  // navigates away). Kept as discriminated state instead of a plain
  // boolean so the loading + error UIs don't have to read multiple flags.
  const [startState, setStartState] = useState<
    | { kind: 'idle' }
    | { kind: 'starting'; startedAtMs: number }
    | { kind: 'error'; message: string }
  >({ kind: 'idle' });
  const [progressMessage, setProgressMessage] = useState<string>(LOADING_STAGES[0]!.message);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    if (authLoading) return;
    if (!user) { router.replace('/signin'); return; }
    (async () => {
      try {
        const res = await api.getMockTestHistory();
        setAttempts(res.attempts);
        setHistoryError(null);
      } catch (err) {
        // PR-36: founder reported "Past attempts nhi dikha raha hai".
        // Pre-PR-36 we silently swallowed errors and rendered an empty
        // list — indistinguishable from a genuinely-empty history. Now
        // we surface the failure so the founder can tell whether it's
        // "no data" vs "fetch broken".
        const msg = err instanceof Error ? err.message : 'Could not load past attempts';
        setHistoryError(msg);
        setAttempts([]);
      } finally {
        setLoadingHistory(false);
      }
    })();
  }, [authLoading, user, router]);

  // Progressive-loading driver. Re-keys progressMessage at the boundaries
  // defined in LOADING_STAGES while a start is in flight. Cleaned up on
  // unmount or whenever the start finishes (success or error).
  useEffect(() => {
    if (startState.kind !== 'starting') return;
    setProgressMessage(pickLoadingMessage(0));
    const id = window.setInterval(() => {
      const elapsed = Date.now() - startState.startedAtMs;
      setProgressMessage(pickLoadingMessage(elapsed));
    }, 1_000);
    return () => window.clearInterval(id);
  }, [startState]);

  // Cancel any in-flight start request when the page unmounts so a slow
  // generation doesn't write to component state after teardown.
  useEffect(() => {
    return () => { abortRef.current?.abort(); };
  }, []);

  /**
   * Translate any error into a user-readable string. The browser surfaces
   * a network drop as TypeError("Failed to fetch") which is the founder's
   * exact complaint — re-word it into something a student can act on.
   */
  function formatStartError(err: unknown): string {
    if (err instanceof DOMException && err.name === 'AbortError') {
      return 'Mock-test generation took longer than 90 seconds and was cancelled. Please try again — our AI provider may be slow right now.';
    }
    if (err instanceof TypeError && /failed to fetch/i.test(err.message)) {
      return 'Network error — your connection dropped while the mock test was generating. Check your internet and try again.';
    }
    if (err instanceof Error) {
      // Server-side errors come through ApiError as `${status}: ${body}`.
      // Surface the server message verbatim if it looks user-friendly.
      const msg = err.message || 'Could not start the mock test.';
      if (/503/.test(msg)) {
        return 'Our AI service is temporarily overloaded (HTTP 503). Please retry in a moment.';
      }
      return msg;
    }
    return 'Could not start the mock test. Please try again.';
  }

  const handleStart = async () => {
    if (startState.kind === 'starting') return;
    setConfirmOpen(false);

    if (!me?.targetExam) {
      setStartState({ kind: 'error', message: 'We could not detect your target exam. Please complete onboarding first.' });
      return;
    }

    // Client-owned attempt id: lets us recover the test by polling GET /:id
    // even if the start response is lost on a flaky connection.
    const attemptId = `mt_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`;

    // Set up the abort controller BEFORE flipping to `starting` so the
    // abort handle is available to the timeout closure.
    const controller = new AbortController();
    abortRef.current = controller;
    const timeoutId = window.setTimeout(() => controller.abort(), MOCK_TEST_TIMEOUT_MS);

    setStartState({ kind: 'starting', startedAtMs: Date.now() });
    try {
      const examSlug = me.targetExam;
      const language = me.language ?? 'en';
      const res = await api.startMockTest({ examSlug, language, attemptId }, { signal: controller.signal });
      window.clearTimeout(timeoutId);
      track('mock_test_start', { exam: examSlug });
      router.push(`/mock-tests/${encodeURIComponent(res.attemptId)}`);
    } catch (err) {
      window.clearTimeout(timeoutId);
      if (abortRef.current === controller) abortRef.current = null;
      // Recoverable failures (client timeout / dropped connection): the
      // server may still be generating under our attemptId. Navigate to
      // the attempt page, which polls until the test is ready (or shows a
      // clean failure if generation actually failed). This is the fix for
      // "network error" on otherwise-fine connections.
      const recoverable =
        (err instanceof DOMException && err.name === 'AbortError') ||
        (err instanceof TypeError && /failed to fetch|network/i.test(err.message));
      if (recoverable) {
        router.push(`/mock-tests/${encodeURIComponent(attemptId)}?pending=1`);
        return;
      }
      setStartState({ kind: 'error', message: formatStartError(err) });
    }
  };

  const handleRetry = () => {
    setStartState({ kind: 'idle' });
    void handleStart();
  };

  const handleDismissError = () => {
    setStartState({ kind: 'idle' });
  };

  if (authLoading || loadingHistory) {
    return <main className="min-h-screen bg-paper-100"><AILoader context="general" /></main>;
  }

  return (
    <main className="min-h-screen bg-paper-100 px-4 py-6 pb-24">
      <header className="mx-auto mb-6 max-w-2xl">
        <button type="button" onClick={() => router.back()} className="btn-ghost-sm mb-3">← {tc('back')}</button>
        <h1 className="font-serif text-2xl font-semibold text-ink-900">Mock Tests</h1>
        <p className="mt-1 text-sm text-muted-500">Realistic, AI-generated practice tests for your target exam. Server-timed, server-scored.</p>
      </header>

      {/* Start card */}
      <section className="mx-auto mb-8 max-w-2xl">
        <div className="paper-card p-5">
          <div className="flex items-start gap-4">
            <span aria-hidden className="grid h-12 w-12 place-items-center rounded-lg bg-ember-500/10 text-2xl">🧪</span>
            <div className="flex-1">
              <h2 className="font-serif text-lg font-semibold text-ink-900">Start a new mock test</h2>
              <p className="mt-1 text-xs text-muted-500">50 questions · 60 minutes · 3 sections (easy/medium/hard) · −0.25 negative marking · uses 20 credits · timer starts immediately</p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => setConfirmOpen(true)}
            disabled={startState.kind === 'starting'}
            className="btn-primary mt-4 w-full"
          >
            {startState.kind === 'starting' ? tc('loading') : 'Start Mock Test'}
          </button>
        </div>

        {/* Progressive loading card. Renders only while a start is in
            flight. The message escalates at 8 / 25 / 45 sec marks so the
            wait feels narrated, not stuck. The progress bar visualises
            the 90-second timeout ceiling. */}
        {startState.kind === 'starting' && (
          <div
            role="status"
            aria-live="polite"
            className="paper-card mt-4 p-5"
          >
            <div className="flex items-start gap-4">
              <span aria-hidden className="grid h-10 w-10 flex-shrink-0 place-items-center rounded-full bg-ember-500/10">
                <span className="h-3 w-3 rounded-full bg-ember-500 animate-pulse" />
              </span>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-ink-900">{progressMessage}</p>
                <p className="mt-1 text-xs text-muted-500">
                  Mock tests use multiple AI calls behind the scenes — this can take 30–90 seconds. We&apos;ll cancel automatically if it goes too long.
                </p>
                <ElapsedBar startedAtMs={startState.startedAtMs} ceilingMs={MOCK_TEST_TIMEOUT_MS} />
              </div>
            </div>
          </div>
        )}

        {/* Error card with retry. Replaces the old toast-only UX where
            "failed to fetch" left the user with no clear next step. */}
        {startState.kind === 'error' && (
          <div
            role="alert"
            className="paper-card mt-4 border border-ember-500/40 p-5"
          >
            <div className="flex items-start gap-3">
              <span aria-hidden className="grid h-9 w-9 flex-shrink-0 place-items-center rounded-full bg-ember-500/10 text-base">⚠️</span>
              <div className="flex-1 min-w-0">
                <h3 className="font-serif text-base font-semibold text-ink-900">Mock test could not start</h3>
                <p className="mt-1 text-sm text-muted-500">{startState.message}</p>
                <div className="mt-4 flex flex-col gap-2 sm:flex-row">
                  <button
                    type="button"
                    onClick={handleRetry}
                    className="btn-primary flex-1"
                  >
                    Try Again
                  </button>
                  <button
                    type="button"
                    onClick={handleDismissError}
                    className="btn-ghost flex-1"
                  >
                    Dismiss
                  </button>
                </div>
                <p className="mt-3 text-[11px] text-muted-500">
                  No credits were charged — the server only debits credits after the test is fully generated.
                </p>
              </div>
            </div>
          </div>
        )}
      </section>

      {/* History */}
      <section className="mx-auto max-w-2xl">
        <h2 className="mb-3 px-1 text-xs font-semibold uppercase tracking-wider text-muted-500">Past attempts</h2>
        {historyError ? (
          <div role="alert" className="paper-card border border-ember-500/40 p-5">
            <p className="text-sm font-medium text-ink-900">Could not load your past attempts</p>
            <p className="mt-1 text-xs text-muted-500">{historyError}</p>
            <button
              type="button"
              onClick={() => {
                setHistoryError(null);
                setLoadingHistory(true);
                void (async () => {
                  try {
                    const res = await api.getMockTestHistory();
                    setAttempts(res.attempts);
                  } catch (err) {
                    setHistoryError(err instanceof Error ? err.message : 'Retry failed');
                  } finally {
                    setLoadingHistory(false);
                  }
                })();
              }}
              className="btn-ghost-sm mt-3"
            >
              Retry
            </button>
          </div>
        ) : attempts.length === 0 ? (
          <div className="paper-card p-6 text-center">
            <p className="text-2xl mb-2">📋</p>
            <p className="text-sm font-medium text-ink-900">No past attempts</p>
            <p className="mt-1 text-xs text-muted-500">Your completed mock tests will appear here. Start one above — results are saved automatically when you submit.</p>
            <p className="mt-2 text-[11px] text-muted-400">Note: Tests that failed to generate (timeout/network error) or were abandoned without submitting don&apos;t appear here.</p>
          </div>
        ) : (
          <ul className="space-y-2">
            {attempts.map(a => (
              <li key={a.id}>
                <button
                  type="button"
                  onClick={() => router.push(`/mock-tests/${encodeURIComponent(a.id)}`)}
                  className="w-full rounded-lg border border-line bg-paper-50 p-4 text-left transition-colors hover:border-ember-500/40 hover:bg-ember-500/5"
                >
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-medium text-ink-900">{a.examSlug.replace(/-/g, ' ').toUpperCase()}</p>
                      <p className="mt-0.5 text-xs text-muted-500">
                        {new Date(a.startedAt).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' })}
                        {' · '}{a.total} q · {a.durationMinutes} min
                      </p>
                    </div>
                    <div className="text-right">
                      {a.status === 'submitted' && a.percentage !== null ? (
                        <>
                          <p className="font-serif text-lg font-semibold text-ink-900">{a.percentage}%</p>
                          <p className="text-xs text-muted-500">{a.score}/{a.total}</p>
                        </>
                      ) : a.status === 'in_progress' ? (
                        <span className="rounded-full bg-ember-500/10 px-2 py-0.5 text-xs font-medium text-ember-600">In progress</span>
                      ) : (
                        <span className="rounded-full bg-muted-500/10 px-2 py-0.5 text-xs font-medium text-muted-500">Expired</span>
                      )}
                    </div>
                  </div>
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* Confirm modal */}
      {confirmOpen && (
        <div className="fixed inset-0 z-[110] flex items-center justify-center bg-ink-900/50 p-4" onClick={() => setConfirmOpen(false)}>
          <div className="w-full max-w-sm rounded-xl bg-paper-50 p-5 shadow-xl" onClick={(e) => e.stopPropagation()}>
            <h3 className="font-serif text-lg font-semibold text-ink-900">Start mock test?</h3>
            <p className="mt-2 text-sm text-muted-500">
              Once you start, the timer is running and 20 credits will be charged. If our AI fails to generate the test, your credits are refunded automatically.
            </p>
            <div className="mt-5 flex gap-2">
              <button type="button" onClick={() => setConfirmOpen(false)} className="btn-ghost flex-1">Cancel</button>
              <button type="button" onClick={handleStart} className="btn-primary flex-1">Yes, start</button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}

/**
 * Animated horizontal progress bar that fills from 0 to the timeout
 * ceiling. Re-renders once a second; cheaper than a CSS keyframe because
 * we know the duration in advance and want it to stay in sync with the
 * progressive-message timer above.
 */
function ElapsedBar({ startedAtMs, ceilingMs }: { startedAtMs: number; ceilingMs: number }) {
  const [pct, setPct] = useState(0);
  useEffect(() => {
    const id = window.setInterval(() => {
      const elapsed = Date.now() - startedAtMs;
      setPct(Math.min(100, Math.round((elapsed / ceilingMs) * 100)));
    }, 500);
    return () => window.clearInterval(id);
  }, [startedAtMs, ceilingMs]);
  return (
    <div className="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-paper-300" aria-hidden>
      <div className="h-full rounded-full bg-ember-500 transition-[width] duration-500 ease-linear" style={{ width: `${pct}%` }} />
    </div>
  );
}
