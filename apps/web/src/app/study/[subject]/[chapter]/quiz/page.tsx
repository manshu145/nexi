'use client';
import { useEffect, useState, useRef, useCallback } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { useAuth } from '~/lib/auth-context';
import { api, type GeneratedMCQ } from '~/lib/api';
import { Logo } from '~/components/Logo';
import { AILoader } from '~/components/ui/AILoader';

type Phase = 'loading' | 'quiz' | 'submitting' | 'result';

/** Get user's selected language from cookie or localStorage */
function getLanguageFromCookie(): 'en' | 'hi' {
  if (typeof document !== 'undefined') {
    const match = document.cookie.match(/nexigrate-language=(en|hi)/);
    if (match) return match[1] as 'en' | 'hi';
  }
  if (typeof localStorage !== 'undefined') {
    const stored = localStorage.getItem('nexigrate-language');
    if (stored === 'hi' || stored === 'en') return stored;
  }
  return 'en';
}

export default function ChapterQuizPage() {
  const { user, loading } = useAuth();
  const router = useRouter();
  const params = useParams();
  const subject = params.subject as string;
  const chapter = params.chapter as string;

  const [phase, setPhase] = useState<Phase>('loading');
  const [questions, setQuestions] = useState<GeneratedMCQ[]>([]);
  const [idx, setIdx] = useState(0);
  const [answers, setAnswers] = useState<Map<string, string | null>>(new Map());
  const [timer, setTimer] = useState(45);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{ score: number; total: number; passed: boolean; creditsAwarded: number; nextChapter: string | null } | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => { if (!loading && !user) router.replace('/signin'); }, [user, loading, router]);

  useEffect(() => {
    if (!user) return;
    (async () => {
      try {
        const meRes = await api.me();
        const exam = meRes.user.targetExam ?? 'jee-main';
        const lang = getLanguageFromCookie();
        const res = await api.getChapterQuiz(exam, subject, chapter, lang);
        setQuestions(res.questions);
        setPhase('quiz');
        setTimer(45);
      } catch (e) { setError(e instanceof Error ? e.message : 'Failed to load quiz'); }
    })();
  }, [user, subject, chapter]);

  const submitQuiz = useCallback(async () => {
    if (timerRef.current) clearInterval(timerRef.current);
    setPhase('submitting');
    try {
      const meRes = await api.me();
      const exam = meRes.user.targetExam ?? 'jee-main';
      // Calculate score locally
      let correct = 0;
      for (const q of questions) {
        if (answers.get(q.id) === q.correctOption) correct++;
      }
      const score = Math.round((correct / questions.length) * 100);
      const res = await api.completeChapter(exam, subject, chapter, score);
      setResult({ score, total: questions.length, passed: res.passed, creditsAwarded: res.creditsAwarded, nextChapter: res.nextChapter });
      setPhase('result');
    } catch (e) { setError(e instanceof Error ? e.message : 'Failed to submit'); setPhase('quiz'); }
  }, [questions, answers, subject, chapter]);

  const handleNext = useCallback(() => {
    if (timerRef.current) clearInterval(timerRef.current);
    if (idx >= questions.length - 1) submitQuiz();
    else { setIdx(i => i + 1); setTimer(45); }
  }, [idx, questions.length, submitQuiz]);

  useEffect(() => {
    if (phase !== 'quiz') return;
    timerRef.current = setInterval(() => {
      setTimer(p => { if (p <= 1) { handleNext(); return 45; } return p - 1; });
    }, 1000);
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [phase, idx, handleNext]);

  if (loading || !user) return <main className="flex min-h-dvh items-center justify-center"><AILoader context="quiz" /></main>;

  if (phase === 'loading') return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-3">
      <AILoader context="quiz" />
      <p className="text-sm text-muted-500">Loading quiz questions...</p>
      {error && <div className="banner banner-error mt-4">{error}</div>}
    </main>
  );

  if (phase === 'submitting') return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-3">
      <AILoader context="quiz" />
      <p className="text-sm text-muted-500">Calculating your score...</p>
    </main>
  );

  if (phase === 'result' && result) {
    const chapterName = chapter.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
    return (
      <main className="mx-auto flex min-h-dvh max-w-lg flex-col items-center justify-center px-5 py-12">
        <div className={`flex h-20 w-20 items-center justify-center rounded-full ${result.passed ? 'bg-paper-200 border-2 border-gold-500' : 'bg-paper-200 border border-line'}`}>
          <span className="text-3xl">{result.passed ? '🎉' : '📖'}</span>
        </div>
        <h1 className="font-serif mt-6 text-2xl font-bold text-ink-900">
          {result.passed ? 'Chapter Complete!' : 'Keep Practicing!'}
        </h1>
        <p className="mt-2 text-ink-800">
          You scored <span className="font-bold text-ember-600">{result.score}%</span> ({Math.round(result.score * result.total / 100)}/{result.total} correct)
        </p>
        {result.passed ? (
          <p className="mt-2 text-sm text-gold-600">+{result.creditsAwarded} credits earned! Next chapter unlocked.</p>
        ) : (
          <p className="mt-2 text-sm text-muted-500">You need 80% to unlock the next chapter. +5 credits for attempting.</p>
        )}

        <div className="mt-8 flex w-full max-w-xs flex-col gap-3">
          {result.passed && result.nextChapter && (
            <button onClick={() => router.push(`/study/${subject}/${result.nextChapter}`)} className="btn-primary w-full">
              Next Chapter →
            </button>
          )}
          {!result.passed && (
            <>
              <button onClick={() => router.push(`/study/${subject}/${chapter}`)} className="btn-primary w-full">Review Chapter</button>
              <button onClick={() => { setPhase('loading'); setIdx(0); setAnswers(new Map()); setTimer(45); }} className="btn-ghost w-full">Retry Quiz</button>
            </>
          )}
          <button onClick={() => router.push('/study')} className="btn-ghost w-full">← Back to Syllabus</button>
        </div>

        {/* Show correct answers */}
        <section className="mt-10 w-full">
          <h2 className="font-serif text-lg font-semibold text-ink-900">Review Answers</h2>
          <div className="mt-4 space-y-3">
            {questions.map((q, i) => {
              const chosen = answers.get(q.id);
              const isCorrect = chosen === q.correctOption;
              return (
                <div key={q.id} className="paper-card p-4">
                  <div className="flex items-start gap-2">
                    <span className={`flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full text-xs font-bold ${isCorrect ? 'bg-gold-500 text-paper-50' : 'bg-ember-500 text-paper-50'}`}>
                      {isCorrect ? '✓' : '✗'}
                    </span>
                    <div>
                      <p className="text-sm font-medium text-ink-900">{q.question}</p>
                      <p className="mt-1 text-xs text-muted-500">Your answer: {chosen ?? 'Skipped'} · Correct: {q.correctOption}</p>
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
  }

  // QUIZ phase
  const q = questions[idx];
  if (!q) return null;
  const sel = answers.get(q.id);

  return (
    <main className="mx-auto flex min-h-dvh max-w-lg flex-col px-5 pt-6 pb-16">
      <header className="flex items-center justify-between">
        <Logo />
        <span className={`pill ${timer <= 10 ? 'pill-warn' : ''}`}>{timer}s</span>
      </header>

      {/* Progress dots */}
      <div className="mt-4 flex items-center justify-between">
        <p className="text-sm font-medium text-ink-800">Question {idx + 1} / {questions.length}</p>
        <p className="text-xs text-muted-500">{answers.size} answered</p>
      </div>
      <div className="mt-2 flex gap-1">
        {questions.map((_, i) => (
          <div key={i} className={`h-2 w-2 rounded-full ${i === idx ? 'bg-ember-500' : answers.get(questions[i]?.id ?? '') ? 'bg-gold-500' : 'bg-paper-300'}`} />
        ))}
      </div>

      {/* Question card */}
      <div className="paper-card mt-6 p-5">
        <p className="text-xs text-muted-500 mb-2">{q.subject} · {q.difficulty}</p>
        <p className="font-serif text-base font-medium leading-relaxed text-ink-900">{q.question}</p>
        <div className="mt-4 space-y-2">
          {q.options.map(opt => (
            <button
              key={opt.key}
              onClick={() => setAnswers(new Map(answers).set(q.id, opt.key))}
              className={`paper-card card-selectable w-full px-4 py-3 text-left text-sm ${sel === opt.key ? 'card-selected' : ''}`}
            >
              <span className="font-bold">{opt.key}.</span> {opt.text}
            </button>
          ))}
        </div>
      </div>

      {/* Navigation */}
      <div className="mt-4 flex gap-3">
        <button onClick={() => idx > 0 && setIdx(i => i - 1)} disabled={idx === 0} className="btn-ghost flex-1 disabled:opacity-40">← Prev</button>
        <button onClick={handleNext} className="btn-primary flex-1">
          {idx >= questions.length - 1 ? 'Submit' : 'Next →'}
        </button>
      </div>
    </main>
  );
}
