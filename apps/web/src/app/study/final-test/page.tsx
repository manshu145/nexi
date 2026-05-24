'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useAuth } from '~/lib/auth-context';
import { api } from '~/lib/api';

interface McqOption {
  key: string;
  text: string;
}

interface Mcq {
  question: string;
  options: McqOption[];
  correctOption: string;
  explanation: string;
  subject: string;
  difficulty: string;
}

export default function FinalTestPage() {
  const { user, loading } = useAuth();
  const router = useRouter();

  const [mcqs, setMcqs] = useState<Mcq[]>([]);
  const [answers, setAnswers] = useState<(string | null)[]>([]);
  const [currentQ, setCurrentQ] = useState(0);
  const [submitted, setSubmitted] = useState(false);
  const [score, setScore] = useState(0);
  const [loadingTest, setLoadingTest] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!loading && !user) router.replace('/signin');
  }, [user, loading, router]);

  useEffect(() => {
    if (!user) return;
    loadFinalTest();
  }, [user]);

  async function loadFinalTest() {
    try {
      setLoadingTest(true);
      const res = await api.ai.generateFinalTest(50);
      setMcqs(res.mcqs);
      setAnswers(new Array(res.mcqs.length).fill(null));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to generate final test');
    } finally {
      setLoadingTest(false);
    }
  }

  function selectAnswer(key: string) {
    if (submitted) return;
    const newAnswers = [...answers];
    newAnswers[currentQ] = key;
    setAnswers(newAnswers);
  }

  async function handleSubmit() {
    setSubmitting(true);
    let correct = 0;
    for (let i = 0; i < mcqs.length; i++) {
      if (answers[i] === mcqs[i]?.correctOption) correct++;
    }
    const pct = Math.round((correct / mcqs.length) * 100);
    setScore(pct);
    setSubmitted(true);
    setSubmitting(false);
  }

  if (loading || loadingTest) {
    return (
      <main className="flex min-h-screen items-center justify-center">
        <div className="text-center">
          <span className="spinner" aria-hidden="true" />
          <p className="mt-3 text-sm text-muted-500">Generating final comprehensive test (50 questions)...</p>
          <p className="mt-1 text-xs text-muted-400">This may take 10-15 seconds</p>
        </div>
      </main>
    );
  }

  if (error) {
    return (
      <main className="mx-auto max-w-3xl px-4 py-12 text-center">
        <div className="banner banner-error">{error}</div>
        <Link href="/study" className="btn-ghost mt-4 inline-block">Back to Study</Link>
      </main>
    );
  }

  if (mcqs.length === 0) return null;

  const currentMcq = mcqs[currentQ]!;
  const answeredCount = answers.filter((a) => a !== null).length;

  return (
    <main className="mx-auto min-h-screen max-w-3xl px-4 pb-24 pt-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <Link href="/study" className="text-sm text-ember-600 hover:underline">
          &larr; Back
        </Link>
        <span className="pill">
          {submitted ? `Final Score: ${score}%` : `${answeredCount}/${mcqs.length}`}
        </span>
      </div>

      <h1 className="mt-4 font-serif text-xl font-semibold text-ink-900">
        Final Comprehensive Test
      </h1>
      <p className="mt-1 text-xs text-muted-500">
        50 questions across all subjects
      </p>

      {/* Result banner */}
      {submitted && (
        <div className={`mt-4 rounded-lg border p-4 ${
          score >= 70
            ? 'border-green-200 bg-green-50 text-green-800'
            : score >= 50
              ? 'border-amber-200 bg-amber-50 text-amber-800'
              : 'border-red-200 bg-red-50 text-red-800'
        }`}>
          <p className="text-lg font-bold">{score}%</p>
          <p className="text-sm">
            {score >= 70 && 'Excellent! You are well-prepared for the exam.'}
            {score >= 50 && score < 70 && 'Good effort. Review weak areas and retake.'}
            {score < 50 && 'Keep studying! Focus on your weak subjects and try again.'}
          </p>
        </div>
      )}

      {/* Question grid */}
      <div className="mt-4 flex flex-wrap gap-1.5">
        {mcqs.map((_, i) => {
          let bg = 'bg-paper-200 text-ink-600';
          if (submitted) {
            bg = answers[i] === mcqs[i]?.correctOption
              ? 'bg-green-100 text-green-800'
              : answers[i] !== null
                ? 'bg-red-100 text-red-800'
                : 'bg-paper-200 text-ink-600';
          } else if (i === currentQ) {
            bg = 'bg-ember-500 text-white';
          } else if (answers[i] !== null) {
            bg = 'bg-ember-100 text-ember-700';
          }
          return (
            <button
              key={i}
              onClick={() => setCurrentQ(i)}
              className={`h-7 w-7 rounded text-[10px] font-medium ${bg}`}
            >
              {i + 1}
            </button>
          );
        })}
      </div>

      {/* Current question */}
      <div className="mt-5 paper-card p-5">
        <p className="text-xs text-muted-500 mb-2">
          {currentMcq.subject} &middot; {currentMcq.difficulty}
        </p>
        <p className="text-sm font-medium text-ink-900">
          Q{currentQ + 1}. {currentMcq.question}
        </p>
        <div className="mt-4 space-y-2">
          {currentMcq.options.map((opt) => {
            let optClass = 'border-paper-300 hover:border-ember-300';
            if (submitted) {
              if (opt.key === currentMcq.correctOption) {
                optClass = 'border-green-500 bg-green-50';
              } else if (opt.key === answers[currentQ] && opt.key !== currentMcq.correctOption) {
                optClass = 'border-red-500 bg-red-50';
              }
            } else if (answers[currentQ] === opt.key) {
              optClass = 'border-ember-500 bg-ember-50';
            }
            return (
              <button
                key={opt.key}
                onClick={() => selectAnswer(opt.key)}
                disabled={submitted}
                className={`w-full rounded-lg border px-4 py-3 text-left text-sm transition-colors ${optClass}`}
              >
                <span className="font-medium">{opt.key}.</span> {opt.text}
              </button>
            );
          })}
        </div>

        {submitted && (
          <div className="mt-4 rounded-lg bg-blue-50 p-3 text-sm text-blue-800">
            <p className="font-medium">Explanation:</p>
            <p className="mt-1">{currentMcq.explanation}</p>
          </div>
        )}
      </div>

      {/* Navigation + Submit */}
      <div className="mt-6 flex items-center justify-between">
        <button
          onClick={() => setCurrentQ((q) => Math.max(0, q - 1))}
          disabled={currentQ === 0}
          className="btn-ghost px-4 py-2 text-sm disabled:opacity-40"
        >
          &larr; Prev
        </button>

        {!submitted ? (
          <button
            onClick={handleSubmit}
            disabled={submitting}
            className="btn-primary px-6 py-2"
          >
            {submitting ? 'Submitting...' : `Submit (${answeredCount}/${mcqs.length})`}
          </button>
        ) : (
          <Link href="/study" className="btn-primary px-4 py-2 text-sm">
            Back to Study Plan
          </Link>
        )}

        <button
          onClick={() => setCurrentQ((q) => Math.min(mcqs.length - 1, q + 1))}
          disabled={currentQ === mcqs.length - 1}
          className="btn-ghost px-4 py-2 text-sm disabled:opacity-40"
        >
          Next &rarr;
        </button>
      </div>
    </main>
  );
}
