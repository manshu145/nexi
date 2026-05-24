'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Logo } from '~/components/Logo';
import { useAuth } from '~/lib/auth-context';
import { api } from '~/lib/api';

/**
 * Phase C — Adaptive diagnostic test.
 * Shows after onboarding Step 4. AI generates 10 MCQs to assess level.
 */

interface TestQuestion {
  id: string;
  question: string;
  options: { A: string; B: string; C: string; D: string };
  difficulty: string;
  subject: string;
}

interface TestResult {
  id: string;
  question: string;
  options: { A: string; B: string; C: string; D: string };
  correctOption: string;
  yourAnswer: string | null;
  isCorrect: boolean;
  explanation: string;
  subject: string;
  difficulty: string;
}

interface StudyPlan {
  overallLevel: string;
  score: number;
  strengths: string[];
  weaknesses: string[];
  weeklyPlan: Array<{
    week: number;
    focus: string;
    dailyHours: number;
    topics: string[];
    practiceGoal: string;
  }>;
  motivationalNote: string;
}

type Phase = 'loading' | 'test' | 'submitting' | 'results';

export default function AdaptiveTestPage() {
  const { user, loading: authLoading } = useAuth();
  const router = useRouter();

  const [phase, setPhase] = useState<Phase>('loading');
  const [questions, setQuestions] = useState<TestQuestion[]>([]);
  const [currentQ, setCurrentQ] = useState(0);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [results, setResults] = useState<TestResult[]>([]);
  const [plan, setPlan] = useState<StudyPlan | null>(null);
  const [score, setScore] = useState(0);
  const [total, setTotal] = useState(0);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!authLoading && !user) router.replace('/signin');
  }, [user, authLoading, router]);

  // Start the test on mount
  useEffect(() => {
    if (!user) return;
    (async () => {
      try {
        const auth = await import('~/lib/firebase').then((m) => m.getFirebaseAuthClient());
        const token = await auth.currentUser?.getIdToken();
        if (!token) return;
        const baseUrl = process.env['NEXT_PUBLIC_API_BASE_URL'] ?? 'http://localhost:9090';
        const res = await fetch(`${baseUrl}/v1/users/me/adaptive-test/start`, {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
          body: '{}',
        });
        if (!res.ok) {
          setError('Failed to generate test. You can skip and continue.');
          setPhase('results');
          return;
        }
        const data = await res.json();
        setQuestions(data.questions);
        setTotal(data.totalQuestions);
        setPhase('test');
      } catch {
        setError('Failed to connect. You can skip.');
        setPhase('results');
      }
    })();
  }, [user]);

  const selectAnswer = (qId: string, option: string) => {
    setAnswers((prev) => ({ ...prev, [qId]: option }));
  };

  const submitTest = async () => {
    setPhase('submitting');
    try {
      const auth = await import('~/lib/firebase').then((m) => m.getFirebaseAuthClient());
      const token = await auth.currentUser?.getIdToken();
      if (!token) return;
      const baseUrl = process.env['NEXT_PUBLIC_API_BASE_URL'] ?? 'http://localhost:9090';
      const res = await fetch(`${baseUrl}/v1/users/me/adaptive-test/complete`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ answers }),
      });
      if (!res.ok) {
        setError('Failed to grade test.');
        setPhase('results');
        return;
      }
      const data = await res.json();
      setScore(data.score);
      setTotal(data.totalQuestions);
      setResults(data.results);
      setPlan(data.studyPlan);
      setPhase('results');
    } catch {
      setError('Network error.');
      setPhase('results');
    }
  };

  if (authLoading || !user) {
    return (
      <main className="flex min-h-[60vh] items-center justify-center px-6">
        <span className="inline-flex items-center gap-2 text-sm text-muted-500">
          <span className="spinner" aria-hidden="true" />
          Loading…
        </span>
      </main>
    );
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-3xl flex-col px-6 pt-10 pb-16">
      <Logo />

      {/* Loading / Generating */}
      {phase === 'loading' && (
        <section className="mt-12 text-center">
          <div className="inline-flex items-center gap-3 rounded-full border border-line bg-paper-50 px-5 py-3">
            <span className="spinner" aria-hidden="true" />
            <span className="text-sm text-ink-800">
              AI is preparing your diagnostic test…
            </span>
          </div>
          <p className="mt-4 text-sm text-muted-500">
            This takes 10-15 seconds. We&apos;re generating personalized questions for your exam.
          </p>
        </section>
      )}

      {/* Test in progress */}
      {phase === 'test' && questions.length > 0 && (
        <section className="mt-8">
          {/* Progress */}
          <div className="flex items-center justify-between">
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-500">
              Diagnostic test
            </p>
            <p className="text-sm text-ink-800">
              {currentQ + 1} / {questions.length}
            </p>
          </div>
          <div className="mt-2 h-1.5 w-full rounded-full bg-paper-300">
            <div
              className="h-full rounded-full bg-ember-500 transition-all"
              style={{ width: `${((currentQ + 1) / questions.length) * 100}%` }}
            />
          </div>

          {/* Question */}
          <div className="paper-card mt-6 p-6">
            <p className="flex items-center gap-2">
              <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${
                questions[currentQ]!.difficulty === 'easy' ? 'bg-gold-100 text-gold-700' :
                questions[currentQ]!.difficulty === 'hard' ? 'bg-ember-100 text-ember-700' :
                'bg-paper-200 text-ink-800'
              }`}>
                {questions[currentQ]!.difficulty}
              </span>
              <span className="text-[11px] text-muted-500">{questions[currentQ]!.subject}</span>
            </p>
            <h2 className="font-serif mt-3 text-lg font-semibold leading-snug text-ink-900">
              {questions[currentQ]!.question}
            </h2>

            <div className="mt-5 space-y-2">
              {(['A', 'B', 'C', 'D'] as const).map((opt) => (
                <button
                  key={opt}
                  type="button"
                  onClick={() => selectAnswer(questions[currentQ]!.id, opt)}
                  className={`w-full rounded-lg border p-3 text-left text-sm transition ${
                    answers[questions[currentQ]!.id] === opt
                      ? 'border-ember-500 bg-ember-50 text-ink-900 ring-1 ring-ember-500'
                      : 'border-line bg-paper-50 text-ink-800 hover:bg-paper-200'
                  }`}
                >
                  <span className="font-semibold">{opt}.</span>{' '}
                  {questions[currentQ]!.options[opt]}
                </button>
              ))}
            </div>
          </div>

          {/* Navigation */}
          <div className="mt-6 flex items-center justify-between">
            <button
              type="button"
              onClick={() => setCurrentQ(Math.max(0, currentQ - 1))}
              disabled={currentQ === 0}
              className="btn-ghost"
            >
              Previous
            </button>
            {currentQ < questions.length - 1 ? (
              <button
                type="button"
                onClick={() => setCurrentQ(currentQ + 1)}
                className="btn-primary"
              >
                Next
              </button>
            ) : (
              <button
                type="button"
                onClick={submitTest}
                disabled={Object.keys(answers).length === 0}
                className="btn-primary"
              >
                Submit test
              </button>
            )}
          </div>

          {/* Quick nav dots */}
          <div className="mt-4 flex flex-wrap gap-1.5 justify-center">
            {questions.map((q, i) => (
              <button
                key={q.id}
                type="button"
                onClick={() => setCurrentQ(i)}
                className={`h-7 w-7 rounded-full text-xs font-medium transition ${
                  i === currentQ
                    ? 'bg-ink-900 text-paper-100'
                    : answers[q.id]
                      ? 'bg-gold-200 text-ink-900'
                      : 'bg-paper-200 text-muted-500'
                }`}
              >
                {i + 1}
              </button>
            ))}
          </div>
        </section>
      )}

      {/* Submitting */}
      {phase === 'submitting' && (
        <section className="mt-12 text-center">
          <div className="inline-flex items-center gap-3 rounded-full border border-line bg-paper-50 px-5 py-3">
            <span className="spinner" aria-hidden="true" />
            <span className="text-sm text-ink-800">
              AI is analyzing your answers and building your study plan…
            </span>
          </div>
        </section>
      )}

      {/* Results */}
      {phase === 'results' && (
        <section className="mt-8">
          {error ? (
            <div className="paper-card p-6 text-center">
              <p className="text-sm text-ember-600">{error}</p>
              <button
                type="button"
                onClick={() => router.replace('/dashboard')}
                className="btn-primary mt-4"
              >
                Skip and go to dashboard
              </button>
            </div>
          ) : plan ? (
            <>
              {/* Score card */}
              <div className="paper-card p-6 text-center">
                <p className="text-xs font-semibold uppercase tracking-wider text-muted-500">
                  Your diagnostic score
                </p>
                <p className="font-serif mt-2 text-5xl font-semibold text-ink-900">
                  {score}/{total}
                </p>
                <p className="mt-2 text-sm text-ink-800">
                  Level: <span className="font-semibold capitalize text-ember-600">{plan.overallLevel}</span>
                </p>
              </div>

              {/* Strengths + Weaknesses */}
              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                <div className="paper-card p-4">
                  <p className="text-xs font-semibold uppercase tracking-wider text-gold-600">Strengths</p>
                  <ul className="mt-2 space-y-1">
                    {plan.strengths.map((s) => (
                      <li key={s} className="text-sm text-ink-800 capitalize">{s}</li>
                    ))}
                    {plan.strengths.length === 0 && <li className="text-sm text-muted-500">Will improve with practice</li>}
                  </ul>
                </div>
                <div className="paper-card p-4">
                  <p className="text-xs font-semibold uppercase tracking-wider text-ember-600">Focus areas</p>
                  <ul className="mt-2 space-y-1">
                    {plan.weaknesses.map((w) => (
                      <li key={w} className="text-sm text-ink-800 capitalize">{w}</li>
                    ))}
                    {plan.weaknesses.length === 0 && <li className="text-sm text-muted-500">Looking good!</li>}
                  </ul>
                </div>
              </div>

              {/* Weekly plan */}
              <h3 className="mt-6 text-xs font-semibold uppercase tracking-wider text-muted-500">
                Your 4-week personalized plan
              </h3>
              <div className="mt-3 space-y-3">
                {plan.weeklyPlan.map((w) => (
                  <div key={w.week} className="paper-card p-4">
                    <div className="flex items-center justify-between">
                      <p className="font-serif font-semibold text-ink-900">Week {w.week}</p>
                      <span className="text-xs text-muted-500">{w.dailyHours}h/day</span>
                    </div>
                    <p className="mt-1 text-sm text-ink-800">{w.focus}</p>
                    <p className="mt-1 text-xs text-muted-500">
                      Goal: {w.practiceGoal}
                    </p>
                  </div>
                ))}
              </div>

              {/* Motivation */}
              {plan.motivationalNote && (
                <div className="mt-4 rounded-lg bg-gold-50 border border-gold-200 p-4">
                  <p className="text-sm text-ink-800 italic">&ldquo;{plan.motivationalNote}&rdquo;</p>
                </div>
              )}

              <button
                type="button"
                onClick={() => router.replace('/dashboard')}
                className="btn-primary mt-8 w-full"
              >
                Start studying with your plan
              </button>
            </>
          ) : (
            <div className="paper-card p-6 text-center">
              <button
                type="button"
                onClick={() => router.replace('/dashboard')}
                className="btn-primary"
              >
                Continue to dashboard
              </button>
            </div>
          )}
        </section>
      )}
    </main>
  );
}
