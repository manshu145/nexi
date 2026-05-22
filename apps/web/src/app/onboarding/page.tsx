'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { LIVE_EXAMS, SOON_EXAMS, type ExamSlug } from '@nexigrate/shared';
import { Logo } from '~/components/Logo';
import { useAuth } from '~/lib/auth-context';
import { api } from '~/lib/api';

/**
 * One-screen onboarding: pick a target exam.
 *
 * After this we send to /dashboard. Phase 2.4 keeps onboarding minimal so
 * the 10-user pilot has the absolute shortest path to the daily MCQ flow;
 * full onboarding (school, class, parent contact, verification) lands in
 * Phase 2.3.
 */
export default function OnboardingPage() {
  const { user, loading } = useAuth();
  const router = useRouter();
  const [selected, setSelected] = useState<ExamSlug | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!loading && !user) router.replace('/signin');
  }, [user, loading, router]);

  async function onContinue() {
    if (!selected) return;
    try {
      setError(null);
      setSubmitting(true);
      await api.setOnboarding(selected);
      router.replace('/dashboard');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'failed to save');
    } finally {
      setSubmitting(false);
    }
  }

  if (loading || !user) {
    return (
      <main className="flex min-h-[60vh] items-center justify-center px-6">
        <p className="text-muted-500 text-sm">Loading\u2026</p>
      </main>
    );
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-2xl flex-col px-6 pt-10 pb-16">
      <Logo />

      <section className="mt-12">
        <p className="pill mb-5">Step 1 of 1</p>
        <h1 className="font-serif text-3xl font-semibold leading-tight text-ink-900 sm:text-4xl">
          Which exam are you preparing for?
        </h1>
        <p className="mt-3 max-w-lg text-ink-800">
          We tailor the daily MCQ, syllabus map, and current affairs to your
          target exam. You can change this later from your dashboard.
        </p>

        <div className="mt-7">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-ember-600">
            Available now
          </p>
          <div className="mt-3 grid gap-2 sm:grid-cols-2">
            {LIVE_EXAMS.map((exam) => (
              <button
                key={exam.id}
                type="button"
                onClick={() => setSelected(exam.id)}
                className={`paper-card px-4 py-3 text-left transition hover:-translate-y-0.5 ${
                  selected === exam.id
                    ? 'ring-2 ring-ember-600 ring-offset-2 ring-offset-paper-100'
                    : ''
                }`}
              >
                <span className="font-serif text-base font-semibold text-ink-900">
                  {exam.name}
                </span>
              </button>
            ))}
          </div>
        </div>

        <div className="mt-6">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-500">
            Coming soon
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            {SOON_EXAMS.map((exam) => (
              <span
                key={exam.id}
                className="pill"
                style={{ borderStyle: 'dashed', color: 'var(--color-muted-500)' }}
              >
                {exam.name}
              </span>
            ))}
          </div>
        </div>

        {error ? (
          <p className="mt-6 text-sm text-ember-600" role="alert">
            {error}
          </p>
        ) : null}

        <button
          type="button"
          onClick={onContinue}
          disabled={!selected || submitting}
          className="btn-primary mt-9 w-full sm:w-auto"
        >
          {submitting ? 'Saving\u2026' : 'Continue to dashboard'}
        </button>
      </section>
    </main>
  );
}
