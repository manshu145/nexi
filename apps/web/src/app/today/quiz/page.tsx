'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Logo } from '~/components/Logo';
import { useAuth } from '~/lib/auth-context';
import { api } from '~/lib/api';

interface QuizQuestion {
  id: string;
  question: string;
  options: string[];
  category: string;
  source: string;
}

export default function CaQuizPage() {
  const { user, loading } = useAuth();
  const router = useRouter();
  const [questions, setQuestions] = useState<QuizQuestion[]>([]);
  const [answers, setAnswers] = useState<(number | null)[]>([]);
  const [currentQ, setCurrentQ] = useState(0);
  const [timeLeft, setTimeLeft] = useState(600); // 10 minutes
  const [phase, setPhase] = useState<'loading' | 'quiz' | 'submitting' | 'result'>('loading');
  const [result, setResult] = useState<{
    score: number; totalQuestions: number; timeTakenSeconds: number;
    rank: number; correctAnswers: number[];
  } | null>(null);
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const startTimeRef = useRef<number>(0);

  useEffect(() => {
    if (!loading && !user) router.replace('/signin');
  }, [user, loading, router]);

  useEffect(() => {
    if (!user || phase !== 'loading') return;
    loadQuiz();
  }, [user, phase]);

  useEffect(() => {
    if (phase !== 'quiz') return;
    timerRef.current = setInterval(() => {
      setTimeLeft((prev) => {
        if (prev <= 1) {
          clearInterval(timerRef.current!);
          handleSubmit();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [phase]);

  async function loadQuiz() {
    try {
      const res = await api.caQuiz.today();
      setQuestions(res.questions);
      setAnswers(new Array(res.questions.length).fill(null));
      setTimeLeft(res.timeLimitSeconds);
      startTimeRef.current = Date.now();
      setPhase('quiz');
    } catch {
      router.push('/today');
    }
  }

  async function handleSubmit() {
    if (phase === 'submitting' || phase === 'result') return;
    setPhase('submitting');
    if (timerRef.current) clearInterval(timerRef.current);

    const timeTaken = Math.round((Date.now() - startTimeRef.current) / 1000);
    try {
      const res = await api.caQuiz.submit(
        answers.map((a) => a ?? -1),
        timeTaken,
        user?.displayName || 'Student',
      );
      setResult(res);
      setPhase('result');
    } catch {
      setPhase('quiz');
    }
  }

  if (loading || !user || phase === 'loading') {
    return (
      <main className="flex min-h-screen items-center justify-center">
        <span className="spinner" />
      </main>
    );
  }

  if (phase === 'submitting') {
    return (
      <main className="flex min-h-screen flex-col items-center justify-center">
        <span className="spinner" />
        <p className="mt-4 text-sm text-muted-500">Calculating your score...</p>
      </main>
    );
  }

  if (phase === 'result' && result) {
    return (
      <main className="mx-auto max-w-2xl px-6 pt-10 pb-16">
        <Logo />
        <section className="mt-8 text-center">
          <h1 className="font-serif text-3xl font-semibold text-ink-900">Quiz Complete!</h1>
          <div className="mt-6 paper-card p-8">
            <p className="text-5xl font-bold text-ember-500">{result.score}/{result.totalQuestions}</p>
            <p className="mt-2 text-sm text-muted-500">
              Time: {formatTime(result.timeTakenSeconds)} · Rank: #{result.rank}
            </p>
          </div>

          {/* Review */}
          <div className="mt-8 space-y-3 text-left">
            {questions.map((q, i) => {
              const userAns = answers[i];
              const correct = result.correctAnswers[i];
              const isCorrect = userAns === correct;
              return (
                <div key={q.id} className={`paper-card p-4 border-l-4 ${isCorrect ? 'border-l-gold-500' : 'border-l-ember-500'}`}>
                  <p className="text-sm font-medium text-ink-900">{i + 1}. {q.question}</p>
                  <p className="mt-1 text-xs text-muted-500">
                    Your answer: {userAns !== null && userAns >= 0 ? q.options[userAns] : 'Not answered'}
                    {!isCorrect && <> · Correct: {q.options[correct]}</>}
                  </p>
                </div>
              );
            })}
          </div>

          <div className="mt-8 flex gap-3">
            <button className="btn-ghost flex-1" onClick={() => router.push('/today')}>
              Back to Current Affairs
            </button>
            <button className="btn-primary flex-1" onClick={() => router.push('/today/quiz/leaderboard')}>
              Leaderboard
            </button>
          </div>
        </section>
      </main>
    );
  }

  // Quiz phase
  const q = questions[currentQ];
  const answered = answers.filter((a) => a !== null).length;
  const isTimeLow = timeLeft <= 60;

  return (
    <main className="mx-auto max-w-2xl px-6 pt-6 pb-16">
      {/* Header */}
      <div className="flex items-center justify-between">
        <Logo />
        <div className={`pill font-mono ${isTimeLow ? 'pill-warn' : ''}`}>
          {formatTime(timeLeft)}
        </div>
      </div>

      {/* Progress */}
      <div className="mt-4 flex items-center gap-2">
        <div className="h-1.5 flex-1 bg-paper-300 rounded-full">
          <div
            className="h-full bg-ember-500 rounded-full transition-all"
            style={{ width: `${(answered / questions.length) * 100}%` }}
          />
        </div>
        <span className="text-xs text-muted-500">{answered}/{questions.length}</span>
      </div>

      {/* Question */}
      <div className="mt-6 paper-card p-6">
        <div className="flex items-center justify-between mb-3">
          <span className="text-xs uppercase tracking-wide text-muted-500">
            Q{currentQ + 1} · {q?.category}
          </span>
          <span className="text-xs text-muted-400">{q?.source}</span>
        </div>
        <h2 className="font-serif text-lg font-medium text-ink-900 leading-relaxed">
          {q?.question}
        </h2>
        <div className="mt-5 space-y-3">
          {q?.options.map((opt, i) => (
            <button
              key={i}
              onClick={() => {
                const next = [...answers];
                next[currentQ] = i;
                setAnswers(next);
              }}
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

      {/* Navigation */}
      <div className="mt-6 flex gap-3">
        <button
          className="btn-ghost flex-1"
          onClick={() => setCurrentQ(Math.max(0, currentQ - 1))}
          disabled={currentQ === 0}
        >
          Previous
        </button>
        {currentQ < questions.length - 1 ? (
          <button className="btn-primary flex-1" onClick={() => setCurrentQ(currentQ + 1)}>
            Next
          </button>
        ) : (
          <button className="btn-primary flex-1" onClick={handleSubmit}>
            Submit ({answered}/{questions.length})
          </button>
        )}
      </div>

      {/* Question palette */}
      <div className="mt-4 flex justify-center gap-1.5 flex-wrap">
        {questions.map((_, i) => (
          <button
            key={i}
            onClick={() => setCurrentQ(i)}
            className={`w-6 h-6 rounded-full text-[10px] font-medium ${
              i === currentQ ? 'bg-ember-500 text-paper-50' :
              answers[i] !== null ? 'bg-paper-300 text-ink-900 border border-gold-500' :
              'bg-paper-200 text-muted-500'
            }`}
          >
            {i + 1}
          </button>
        ))}
      </div>
    </main>
  );
}

function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}
