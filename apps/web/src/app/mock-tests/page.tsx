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
 */

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { useTranslations } from 'next-intl';
import { useAuth } from '~/lib/auth-context';
import { api } from '~/lib/api';
import { AILoader } from '~/components/ui/AILoader';

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

export default function MockTestsPage() {
  const router = useRouter();
  const { user, loading: authLoading } = useAuth();
  const tc = useTranslations('common');
  const [attempts, setAttempts] = useState<AttemptListItem[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(true);
  const [starting, setStarting] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);

  useEffect(() => {
    if (authLoading) return;
    if (!user) { router.replace('/signin'); return; }
    (async () => {
      try {
        const res = await api.getMockTestHistory();
        setAttempts(res.attempts);
      } catch {
        // history call failures are non-fatal — show empty list, the start path still works
        setAttempts([]);
      } finally {
        setLoadingHistory(false);
      }
    })();
  }, [authLoading, user, router]);

  const handleStart = async () => {
    if (starting) return;
    setStarting(true);
    setConfirmOpen(false);
    const toastId = toast.loading('Generating your mock test... this can take 30-60 seconds.');
    try {
      const meRes = await api.me();
      const examSlug = meRes.user.targetExam ?? 'upsc-cse';
      const language = meRes.user.language ?? 'en';
      const res = await api.startMockTest({ examSlug, language });
      toast.success(`${res.total} questions ready. ${res.durationMinutes} minutes on the clock.`, { id: toastId });
      router.push(`/mock-tests/${encodeURIComponent(res.attemptId)}`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Could not start mock test';
      toast.error(msg, { id: toastId });
      setStarting(false);
    }
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
              <p className="mt-1 text-xs text-muted-500">30 questions · 30 minutes · uses 20 credits · timer starts immediately</p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => setConfirmOpen(true)}
            disabled={starting}
            className="btn-primary mt-4 w-full"
          >
            {starting ? tc('loading') : 'Start Mock Test'}
          </button>
        </div>
      </section>

      {/* History */}
      <section className="mx-auto max-w-2xl">
        <h2 className="mb-3 px-1 text-xs font-semibold uppercase tracking-wider text-muted-500">Past attempts</h2>
        {attempts.length === 0 ? (
          <div className="paper-card p-8 text-center">
            <p className="text-sm text-muted-500">No attempts yet. Start your first mock test above to see your progress here.</p>
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
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink-900/50 p-4" onClick={() => setConfirmOpen(false)}>
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
