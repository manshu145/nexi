'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Logo } from '~/components/Logo';
import { useAuth } from '~/lib/auth-context';
import { api } from '~/lib/api';

interface DiagnosticMCQ {
  id: string;
  question: string;
  options: string[];
  difficulty: string;
  subject: string;
}

export default function AdaptiveTestPage() {
  const { user, loading } = useAuth();
  const router = useRouter();
  const [mcqs, setMcqs] = useState<DiagnosticMCQ[]>([]);
  const [correctAnswers, setCorrectAnswers] = useState<number[]>([]);
  const [answers, setAnswers] = useState<(number | null)[]>([]);
  const [currentQ, setCurrentQ] = useState(0);
  const [phase, setPhase] = useState<'loading' | 'test' | 'submitting' | 'result'>('loading');
  const [result, setResult] = useState<{
    score: number; correct: number; total: number;
    skillLevel: string; studyPlan: Record<string, unknown>;
  } | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!loading && !user) router.replace('/signin');
  }, [user, loading, router]);

  useEffect(() => {
    if (!user || phase !== 'loading') return;
    startTest();
  }, [user, phase]);

  async function startTest() {
    try {
      const res = await api.adaptiveTest.start();
      setMcqs(res.mcqs);
      setCorrectAnswers(res._answers);
      setAnswers(new Array(res.mcqs.length).fill(null));
      setPhase('test');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load test');
    }
  }

  async function submitTest() {
    setPhase('submitting');
    try {
      const res = await api.adaptiveTest.complete(answers as number[], correctAnswers);
      setResult(res);
      setPhase('result');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to submit');
      setPhase('test');
    }
  }

  function selectAnswer(idx: number) {
    const next = [...answers];
    next[currentQ] = idx;
    setAnswers(next);
  }

  if (loading || !user) {
    return (
      <main className="flex min-h-[60vh] items-center justify-center px-6">
        <span className="inline-flex items-center gap-2 text-sm text-muted-500">
          <span className="spinner" /> Loading…
        </span>
      </main>
    );
  }

  if (error) {
    return (
      <main className="mx-auto flex min-h-screen max-w-2xl flex-col items-center justify-center px-6">
        <div className="banner banner-error">{error}</div>
        <button className="btn-primary mt-4" onClick={() => router.push('/dashboard')}>
          Skip to Dashboard
        </button>
      </main>
    );
  }

  if (phase === 'loading' || phase === 'submitting') {
    return (
      <main className="flex min-h-screen flex-col items-center justify-center px-6">
        <span className="spinner" />
        <p className="mt-4 text-sm text-muted-500">
          {phase === 'loading' ? 'Preparing your diagnostic test...' : 'Analyzing your answers...'}
        </p>
      </main>
    );
  }

  if (phase === 'result' && result) {
    return (
      <main className="mx-auto flex min-h-screen max-w-2xl flex-col px-6 pt-10 pb-16">
        <Logo />
        <section className="mt-12 text-center">
          <h1 className="font-serif text-3xl font-semibold text-ink-900">
            Your Assessment Result
          </h1>
          <div className="mt-8 paper-card p-8 text-center">
            <p className="text-5xl font-bold text-ember-500">{result.score}%</p>
            <p className="mt-2 text-sm text-muted-500">
              {result.correct}/{result.total} correct
            </p>
            <div className="mt-4">
              <span className={`pill ${
                result.skillLevel === 'advanced' ? 'pill-success' :
                result.skillLevel === 'intermediate' ? 'pill-neutral' : 'pill-warn'
              }`}>
                Level: {result.skillLevel.charAt(0).toUpperCase() + result.skillLevel.slice(1)}
              </span>
            </div>
          </div>

          <div className="mt-8 paper-card p-6 text-left">
            <h2 className="font-serif text-xl font-semibold text-ink-900 mb-4">
              Your Personalized Study Plan
            </h2>
            <div className="space-y-3 text-sm text-ink-800">
              <p><strong>Recommended daily study:</strong> {(result.studyPlan as Record<string, unknown>).dailyHours} hours</p>
              <div>
                <strong>Focus areas:</strong>
                <ul className="mt-1 list-disc pl-5">
                  {((result.studyPlan as Record<string, unknown>).focusAreas as string[])?.map((area, i) => (
                    <li key={i}>{area}</li>
                  ))}
                </ul>
              </div>
              <div>
                <strong>Weekly goals:</strong>
                <ul className="mt-1 list-disc pl-5">
                  {((result.studyPlan as Record<string, unknown>).weeklyGoals as string[])?.map((goal, i) => (
                    <li key={i}>{goal}</li>
                  ))}
                </ul>
              </div>
            </div>
          </div>

          <button className="btn-primary mt-8 w-full" onClick={() => router.push('/dashboard')}>
            Start Learning
          </button>
        </section>
      </main>
    );
  }

  // Test phase
  const q = mcqs[currentQ];
  const answered = answers.filter((a) => a !== null).length;

  return (
    <main className="mx-auto flex min-h-screen max-w-2xl flex-col px-6 pt-10 pb-16">
      <div className="flex items-center justify-between">
        <Logo />
        <span className="pill">{answered}/{mcqs.length} answered</span>
      </div>

      <section className="mt-8">
        <div className="flex items-center justify-between mb-2">
          <p className="text-xs uppercase tracking-wide text-muted-500">
            Q{currentQ + 1} of {mcqs.length} · {q?.difficulty} · {q?.subject}
          </p>
        </div>

        {/* Progress */}
        <div className="h-1.5 w-full bg-paper-300 rounded-full mb-6">
          <div
            className="h-full bg-ember-500 rounded-full transition-all"
            style={{ width: `${((currentQ + 1) / mcqs.length) * 100}%` }}
          />
        </div>

        <div className="paper-card p-6">
          <h2 className="font-serif text-lg font-medium text-ink-900 leading-relaxed">
            {q?.question}
          </h2>
          <div className="mt-5 space-y-3">
            {q?.options.map((opt, i) => (
              <button
                key={i}
                onClick={() => selectAnswer(i)}
                className={`w-full text-left px-4 py-3 rounded-lg border transition-all ${
                  answers[currentQ] === i
                    ? 'border-ember-500 bg-paper-200 ring-2 ring-ember-500/30'
                    : 'border-line hover:border-muted-400'
                }`}
              >
                <span className="text-sm text-ink-900">{opt}</span>
              </button>
            ))}
          </div>
        </div>

        <div className="mt-6 flex gap-3">
          <button
            className="btn-ghost flex-1"
            onClick={() => setCurrentQ(Math.max(0, currentQ - 1))}
            disabled={currentQ === 0}
          >
            Previous
          </button>
          {currentQ < mcqs.length - 1 ? (
            <button
              className="btn-primary flex-1"
              onClick={() => setCurrentQ(currentQ + 1)}
            >
              Next
            </button>
          ) : (
            <button
              className="btn-primary flex-1"
              onClick={submitTest}
              disabled={answered < mcqs.length}
            >
              Submit Test
            </button>
          )}
        </div>

        {/* Quick nav dots */}
        <div className="mt-4 flex justify-center gap-2 flex-wrap">
          {mcqs.map((_, i) => (
            <button
              key={i}
              onClick={() => setCurrentQ(i)}
              className={`w-7 h-7 rounded-full text-xs font-medium transition-all ${
                i === currentQ
                  ? 'bg-ember-500 text-paper-50'
                  : answers[i] !== null
                    ? 'bg-paper-300 text-ink-900 border border-gold-500'
                    : 'bg-paper-200 text-muted-500 border border-line'
              }`}
            >
              {i + 1}
            </button>
          ))}
        </div>
      </section>
    </main>
  );
}
