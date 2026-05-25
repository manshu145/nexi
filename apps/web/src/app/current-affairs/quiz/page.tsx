'use client';
import { useEffect, useState, useRef, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '~/lib/auth-context';
import { api, type GeneratedMCQ } from '~/lib/api';
import { Logo } from '~/components/Logo';

type Phase = 'rules' | 'loading' | 'quiz' | 'submitting' | 'result';

export default function CurrentAffairsQuizPage() {
  const { user, loading } = useAuth();
  const router = useRouter();
  const [phase, setPhase] = useState<Phase>('rules');
  const [questions, setQuestions] = useState<GeneratedMCQ[]>([]);
  const [idx, setIdx] = useState(0);
  const [answers, setAnswers] = useState<number[]>([]);
  const [timeLeft, setTimeLeft] = useState(600); // 10 minutes = 600 seconds
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{ score: number; correct: number; total: number; rank: number; timeTaken: number } | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const startTimeRef = useRef<number>(0);

  useEffect(() => { if (!loading && !user) router.replace('/signin'); }, [user, loading, router]);

  const startQuiz = async () => {
    setPhase('loading');
    try {
      const res = await api.getCurrentAffairsQuiz();
      setQuestions(res.questions);
      setAnswers(new Array(res.questions.length).fill(-1));
      setPhase('quiz');
      startTimeRef.current = Date.now();
      setTimeLeft(600);
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Failed to load quiz';
      setError(msg === 'Failed to fetch' ? 'Server is generating quiz questions. Please wait 10 seconds and try again.' : msg);
      setPhase('rules');
    }
  };

  const submitQuiz = useCallback(async () => {
    if (timerRef.current) clearInterval(timerRef.current);
    setPhase('submitting');
    const timeTaken = Math.round((Date.now() - startTimeRef.current) / 1000);
    try {
      const res = await api.submitCurrentAffairsQuiz(answers, timeTaken);
      setResult(res);
      setPhase('result');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Submit failed');
      setPhase('quiz');
    }
  }, [answers]);

  // Global timer
  useEffect(() => {
    if (phase !== 'quiz') return;
    timerRef.current = setInterval(() => {
      setTimeLeft(prev => {
        if (prev <= 1) { submitQuiz(); return 0; }
        return prev - 1;
      });
    }, 1000);
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [phase, submitQuiz]);

  if (loading || !user) return <main className="flex min-h-dvh items-center justify-center"><span className="spinner" /></main>;

  // RULES screen
  if (phase === 'rules') return (
    <main className="mx-auto flex min-h-dvh max-w-lg flex-col items-center justify-center px-5 py-12">
      <span className="text-5xl">📝</span>
      <h1 className="font-serif mt-6 text-2xl font-bold text-ink-900">Daily Current Affairs Quiz</h1>
      <div className="paper-card mt-6 w-full p-5 space-y-3">
        <div className="flex items-center gap-3"><span className="text-lg">📋</span><p className="text-sm text-ink-800">20 questions from today's news</p></div>
        <div className="flex items-center gap-3"><span className="text-lg">⏱️</span><p className="text-sm text-ink-800">10 minutes total time</p></div>
        <div className="flex items-center gap-3"><span className="text-lg">🚫</span><p className="text-sm text-ink-800">No going back once you move forward</p></div>
        <div className="flex items-center gap-3"><span className="text-lg">🏆</span><p className="text-sm text-ink-800">Compete on the daily leaderboard</p></div>
      </div>
      {error && <div className="banner banner-error mt-4 w-full">{error}</div>}
      <button onClick={startQuiz} className="btn-primary mt-6 w-full">Start Quiz →</button>
      <button onClick={() => router.back()} className="btn-ghost mt-3 w-full">← Back</button>
    </main>
  );

  // LOADING
  if (phase === 'loading') return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-3">
      <span className="spinner" />
      <p className="text-sm text-muted-500">Loading today's quiz...</p>
    </main>
  );

  // SUBMITTING
  if (phase === 'submitting') return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-3">
      <span className="spinner" />
      <p className="text-sm text-muted-500">Calculating results...</p>
    </main>
  );

  // RESULT
  if (phase === 'result' && result) return (
    <main className="mx-auto flex min-h-dvh max-w-lg flex-col items-center justify-center px-5 py-12">
      <div className="flex h-20 w-20 items-center justify-center rounded-full bg-paper-200 border-2 border-gold-500">
        <span className="text-3xl">{result.score >= 70 ? '🎉' : result.score >= 40 ? '👍' : '📖'}</span>
      </div>
      <h1 className="font-serif mt-6 text-2xl font-bold text-ink-900">Quiz Complete!</h1>
      <p className="mt-3 text-lg text-ink-800">
        Score: <span className="font-bold text-ember-600">{result.score}%</span> ({result.correct}/{result.total})
      </p>
      <p className="mt-1 text-sm text-muted-500">
        Time: {Math.floor(result.timeTaken / 60)}:{String(result.timeTaken % 60).padStart(2, '0')} · Rank: #{result.rank}
      </p>
      <div className="mt-8 flex w-full flex-col gap-3">
        <button onClick={() => router.push('/current-affairs')} className="btn-primary w-full">← Back to Current Affairs</button>
        <button onClick={() => router.push('/dashboard')} className="btn-ghost w-full">Dashboard</button>
      </div>

      {/* Answer review */}
      <section className="mt-10 w-full">
        <h2 className="font-serif text-lg font-semibold text-ink-900">Review</h2>
        <div className="mt-4 space-y-3">
          {questions.map((q, i) => {
            const userAns = answers[i];
            const ansKeys = ['A', 'B', 'C', 'D'];
            const isCorrect = ansKeys[userAns ?? -1] === q.correctOption;
            return (
              <div key={q.id} className="paper-card p-4">
                <div className="flex items-start gap-2">
                  <span className={`flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full text-xs font-bold ${isCorrect ? 'bg-gold-500 text-paper-50' : 'bg-ember-500 text-paper-50'}`}>
                    {isCorrect ? '✓' : '✗'}
                  </span>
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-ink-900">{q.question}</p>
                    <p className="mt-1 text-xs text-muted-500">
                      Your: {userAns != null && userAns >= 0 ? ansKeys[userAns] : 'Skipped'} · Correct: {q.correctOption}
                    </p>
                    <p className="mt-1 text-xs text-ink-700">{q.explanation}</p>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </section>
    </main>
  );

  // QUIZ phase
  const q = questions[idx];
  if (!q) return null;
  const mins = Math.floor(timeLeft / 60);
  const secs = timeLeft % 60;

  return (
    <main className="mx-auto flex min-h-dvh max-w-lg flex-col px-5 pt-6 pb-16">
      <header className="flex items-center justify-between">
        <Logo />
        <span className={`pill font-mono ${timeLeft <= 60 ? 'pill-warn' : ''}`}>
          {mins}:{String(secs).padStart(2, '0')}
        </span>
      </header>

      {/* Progress */}
      <div className="mt-4 flex items-center justify-between">
        <p className="text-sm font-medium text-ink-800">Question {idx + 1} / {questions.length}</p>
        <p className="text-xs text-muted-500">{answers.filter(a => a >= 0).length} answered</p>
      </div>
      <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-paper-300">
        <div className="h-full rounded-full bg-ember-500 transition-all" style={{ width: `${((idx + 1) / questions.length) * 100}%` }} />
      </div>

      {/* Question dots */}
      <div className="mt-3 flex flex-wrap gap-1">
        {questions.map((_, i) => (
          <div key={i} className={`h-2 w-2 rounded-full ${i === idx ? 'bg-ember-500' : answers[i] != null && answers[i]! >= 0 ? 'bg-gold-500' : 'bg-paper-300'}`} />
        ))}
      </div>

      {/* Question card */}
      <div className="paper-card mt-5 p-5">
        <p className="text-xs text-muted-500 mb-2">{q.topic ?? 'Current Affairs'} · {q.difficulty}</p>
        <p className="font-serif text-base font-medium leading-relaxed text-ink-900">{q.question}</p>
        <div className="mt-4 space-y-2">
          {q.options.map((opt, optIdx) => (
            <button
              key={opt.key}
              onClick={() => {
                const newAnswers = [...answers];
                newAnswers[idx] = optIdx;
                setAnswers(newAnswers);
              }}
              className={`paper-card card-selectable w-full px-4 py-3 text-left text-sm ${answers[idx] === optIdx ? 'card-selected' : ''}`}
            >
              <span className="font-bold">{opt.key}.</span> {opt.text}
            </button>
          ))}
        </div>
      </div>

      {/* Navigation — no back button */}
      <div className="mt-4">
        {idx >= questions.length - 1 ? (
          <button onClick={submitQuiz} className="btn-primary w-full" style={{ backgroundColor: 'var(--color-ember-500)' }}>Submit Quiz →</button>
        ) : (
          <button onClick={() => setIdx(i => i + 1)} className="btn-primary w-full">Next →</button>
        )}
      </div>
    </main>
  );
}
