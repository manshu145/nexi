'use client';

/**
 * Exam calendar — upcoming exam dates / countdowns so students know how
 * much prep time they have. The user's primary exam is pinned to the top.
 * When an exact date isn't confirmed we show the estimate, clearly labelled.
 */

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '~/lib/auth-context';
import { useUser } from '~/lib/userStore';
import { api, type ExamDates } from '~/lib/api';
import { AILoader } from '~/components/ui/AILoader';

/** Whole days from today (UTC midnight) to an ISO date, or null. */
export function daysUntil(iso: string | null): number | null {
  if (!iso) return null;
  const target = new Date(iso).getTime();
  if (Number.isNaN(target)) return null;
  const today = new Date(); today.setHours(0, 0, 0, 0);
  return Math.ceil((target - today.getTime()) / 86_400_000);
}

export default function ExamCalendarPage() {
  const router = useRouter();
  const { user, loading: authLoading } = useAuth();
  const { user: me } = useUser();
  const [exams, setExams] = useState<ExamDates[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (authLoading) return;
    if (!user) { router.replace('/signin'); return; }
    (async () => {
      try {
        const res = await api.getExamDates();
        setExams(res.exams);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Could not load exam calendar');
      } finally { setLoading(false); }
    })();
  }, [authLoading, user, router]);

  // Pin the user's primary exam first.
  const ordered = useMemo(() => {
    const primary = me?.targetExam;
    return [...exams].sort((a, b) => {
      if (a.examSlug === primary) return -1;
      if (b.examSlug === primary) return 1;
      return a.examName.localeCompare(b.examName);
    });
  }, [exams, me?.targetExam]);

  if (authLoading || loading) return <main className="min-h-screen bg-paper-100"><AILoader context="general" /></main>;

  return (
    <main className="min-h-screen bg-paper-100 px-4 py-6 pb-24">
      <header className="mx-auto mb-6 max-w-2xl">
        <button type="button" onClick={() => router.back()} className="btn-ghost-sm mb-3">← Back</button>
        <h1 className="font-serif text-2xl font-semibold text-ink-900">Exam Calendar</h1>
        <p className="mt-1 text-sm text-muted-500">Upcoming exam dates and countdowns. Estimated dates update when official notifications are released.</p>
      </header>

      {error ? (
        <div className="mx-auto max-w-2xl"><div role="alert" className="paper-card border border-ember-500/40 p-5"><p className="text-sm text-ink-900">{error}</p></div></div>
      ) : ordered.length === 0 ? (
        <div className="mx-auto max-w-2xl"><div className="paper-card p-6 text-center"><p className="text-2xl">📅</p><p className="mt-2 text-sm text-muted-500">No exam dates available yet.</p></div></div>
      ) : (
        <div className="mx-auto max-w-2xl space-y-4">
          {ordered.map((exam) => {
            const isPrimary = exam.examSlug === me?.targetExam;
            return (
              <section key={exam.examSlug} className={`paper-card p-5 ${isPrimary ? 'border border-ember-500/40' : ''}`}>
                <div className="flex items-center justify-between">
                  <h2 className="font-serif text-lg font-semibold text-ink-900">{exam.examName}</h2>
                  {isPrimary && <span className="rounded-full bg-ember-500/10 px-2 py-0.5 text-[11px] font-medium text-ember-600">Your exam</span>}
                </div>
                <div className="mt-3 space-y-3">
                  {exam.events.length === 0 && <p className="text-xs text-muted-500">Dates to be announced.</p>}
                  {exam.events.map((evt, i) => {
                    const dleft = daysUntil(evt.date);
                    return (
                      <div key={i} className="flex items-start gap-3 border-l-2 border-line pl-3">
                        <div className="flex-1">
                          <p className="text-sm font-medium text-ink-900">{evt.name}</p>
                          <p className="mt-0.5 text-xs text-muted-500">
                            {evt.isConfirmed && evt.date
                              ? new Date(evt.date).toLocaleDateString('en-IN', { dateStyle: 'long' })
                              : `Estimated: ${evt.estimatedMonth || 'TBA'}`}
                            {!evt.isConfirmed && <span className="ml-1.5 rounded-full bg-gold-500/10 px-1.5 py-0.5 text-[10px] text-gold-700">estimate</span>}
                          </p>
                          {(evt.registrationStart || evt.registrationEnd) && (
                            <p className="mt-1 text-[11px] text-red-600">
                              Registration: {evt.registrationStart ? new Date(evt.registrationStart).toLocaleDateString('en-IN', { dateStyle: 'medium' }) : '—'}
                              {' → '}{evt.registrationEnd ? new Date(evt.registrationEnd).toLocaleDateString('en-IN', { dateStyle: 'medium' }) : '—'}
                            </p>
                          )}
                          {evt.sourceUrl && (
                            <a href={evt.sourceUrl} target="_blank" rel="noopener noreferrer" className="mt-1 inline-block text-[11px] text-ember-600 underline">Official notification ↗</a>
                          )}
                        </div>
                        {dleft !== null && dleft >= 0 && (
                          <div className="text-right">
                            <p className="font-serif text-xl font-bold text-ink-900">{dleft}</p>
                            <p className="text-[10px] uppercase tracking-wider text-muted-400">days left</p>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </section>
            );
          })}
        </div>
      )}
    </main>
  );
}
