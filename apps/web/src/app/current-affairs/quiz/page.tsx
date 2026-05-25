'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useAuth } from '~/lib/auth-context';
import { api } from '~/lib/api';
import { useTranslation } from '~/lib/useTranslation';

interface QuizQuestion {
  id: string;
  question: string;
  options: string[];
  category: string;
  source: string;
}

type QuizState = 'loading' | 'ready' | 'playing' | 'submitted' | 'error';

export default function DailyQuizPage() {
  const { user, loading } = useAuth();
  const router = useRouter();
  const { t, lang } = useTranslation();

  const [state, setState] = useState<QuizState>('loading');
  const [questions, setQuestions] = useState<QuizQuestion[]>([]);
  const [answers, setAnswers] = useState<number[]>([]);
  const [currentQ, setCurrentQ] = useState(0);
  const [timeLeft, setTimeLeft] = useState(600); // 10 minutes
  const [startTime, setStartTime] = useState(0);
  const [error, setError] = useState<string | null>(null);

  // Result
  const [result, setResult] = useState<{
    score: number;
    totalQuestions: number;
    rank: number;
    correctAnswers: number[];
    timeTakenSeconds: number;
  } | null>(null);

  // Leaderboard
  const [leaderboard, setLeaderboard] = useState<{
    top10: Array<{ rank: number; userName: string; score: number; timeTakenSeconds: number }>;
    totalParticipants: number;
    yesterdayWinner: { userName: string; score: number; timeTakenSeconds: number } | null;
  } | null>(null);

  const timerRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    if (!loading && !user) router.replace('/signin');
  }, [user, loading, router]);

  useEffect(() => {
    if (!user) return;
    loadQuiz();
  }, [user]);

  // Timer
  useEffect(() => {
    if (state !== 'playing') return;
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
  }, [state]);

  async function loadQuiz() {
    try {
      setState('loading');
      const [quizRes, lbRes] = await Promise.all([
        api.caQuiz.today(),
        api.caQuiz.leaderboard().catch(() => null),
      ]);
      setQuestions(quizRes.questions);
      setAnswers(new Array(quizRes.questions.length).fill(-1));
      setLeaderboard(lbRes ? { top10: lbRes.today.top10, totalParticipants: lbRes.today.totalParticipants, yesterdayWinner: lbRes.yesterdayWinner } : null);
      setState('ready');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load quiz');
      setState('error');
    }
  }

  function startQuiz() {
    setStartTime(Date.now());
    setState('playing');
  }

  function selectAnswer(index: number) {
    const newAnswers = [...answers];
    newAnswers[currentQ] = index;
    setAnswers(newAnswers);
  }

  async function handleSubmit() {
    if (timerRef.current) clearInterval(timerRef.current);
    const timeTaken = Math.round((Date.now() - startTime) / 1000);
    try {
      const res = await api.caQuiz.submit(answers, timeTaken, user?.displayName ?? 'Student');
      setResult({
        score: res.score,
        totalQuestions: res.totalQuestions,
        rank: res.rank,
        correctAnswers: res.correctAnswers,
        timeTakenSeconds: res.timeTakenSeconds,
      });
      setState('submitted');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to submit');
    }
  }

  const formatTime = (s: number) => `${Math.floor(s / 60)}:${(s % 60).toString().padStart(2, '0')}`;

  if (loading || state === 'loading') {
    return (
      <main className="flex min-h-dvh items-center justify-center bg-paper-100">
        <div className="flex flex-col items-center gap-3">
          <span className="spinner" />
          <span className="text-sm text-muted-500">{lang === 'hi' ? 'क्विज़ लोड हो रहा है...' : 'Loading quiz...'}</span>
        </div>
      </main>
    );
  }

  if (state === 'error') {
    return (
      <main className="mx-auto max-w-lg px-5 pt-10 pb-28 text-center">
        <p className="text-ember-600 mb-4">{error}</p>
        <button onClick={loadQuiz} className="btn-primary">{lang === 'hi' ? 'पुनः प्रयास करें' : 'Retry'}</button>
      </main>
    );
  }

  // ═══ READY STATE — show instructions + leaderboard ═══
  if (state === 'ready') {
    return (
      <main className="mx-auto max-w-lg px-5 pt-6 pb-28 min-h-dvh">
        <header className="flex items-center gap-3 mb-6">
          <button onClick={() => router.push('/current-affairs')} className="flex h-8 w-8 items-center justify-center rounded-full bg-paper-200 text-ink-800 hover:bg-paper-300 transition">
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" /></svg>
          </button>
          <h1 className="font-serif text-xl font-bold text-ink-900">{lang === 'hi' ? 'दैनिक करंट अफेयर्स क्विज़' : 'Daily Current Affairs Quiz'}</h1>
        </header>

        {/* Yesterday's winner */}
        {leaderboard?.yesterdayWinner && (
          <div className="paper-card p-5 mb-5 bg-gradient-to-r from-gold-50 to-paper-50 border-gold-300">
            <p className="text-xs font-bold uppercase tracking-wider text-gold-600 mb-1">{lang === 'hi' ? 'कल का विजेता' : "Yesterday's Winner"}</p>
            <p className="font-serif text-lg font-bold text-ink-900">{leaderboard.yesterdayWinner.userName}</p>
            <p className="text-sm text-muted-500">
              {leaderboard.yesterdayWinner.score}/20 &middot; {formatTime(leaderboard.yesterdayWinner.timeTakenSeconds)}
            </p>
            <p className="mt-2 text-sm font-semibold text-ember-600">{lang === 'hi' ? 'अब आपकी बारी है!' : "It's YOUR turn now!"}</p>
          </div>
        )}

        {/* Quiz info */}
        <div className="paper-card p-5 mb-5">
          <h2 className="font-serif text-lg font-semibold text-ink-900 mb-3">{lang === 'hi' ? 'नियम' : 'Rules'}</h2>
          <ul className="space-y-2 text-sm text-ink-700">
            <li className="flex items-center gap-2"><span>📝</span> {lang === 'hi' ? '20 प्रश्न (सभी के लिए समान)' : '20 questions (same for everyone)'}</li>
            <li className="flex items-center gap-2"><span>⏱️</span> {lang === 'hi' ? '10 मिनट का समय' : '10 minute time limit'}</li>
            <li className="flex items-center gap-2"><span>🏆</span> {lang === 'hi' ? 'सबसे ज्यादा स्कोर + सबसे कम समय = विजेता' : 'Highest score + fastest time = Winner'}</li>
            <li className="flex items-center gap-2"><span>📊</span> {lang === 'hi' ? 'विजेता का नाम कल सबको दिखेगा' : "Winner's name shown to everyone tomorrow"}</li>
          </ul>
        </div>

        {/* Today's leaderboard */}
        {leaderboard && leaderboard.top10.length > 0 && (
          <div className="paper-card p-5 mb-5">
            <h3 className="text-sm font-bold text-ink-800 mb-3">{lang === 'hi' ? 'आज की लीडरबोर्ड' : "Today's Leaderboard"} ({leaderboard.totalParticipants} {lang === 'hi' ? 'प्रतिभागी' : 'participants'})</h3>
            <div className="space-y-2">
              {leaderboard.top10.map((entry) => (
                <div key={entry.rank} className="flex items-center justify-between text-sm">
                  <span className="flex items-center gap-2">
                    <span className={`font-bold ${entry.rank <= 3 ? 'text-gold-600' : 'text-muted-500'}`}>#{entry.rank}</span>
                    <span className="text-ink-900">{entry.userName}</span>
                  </span>
                  <span className="text-muted-500">{entry.score}/20 &middot; {formatTime(entry.timeTakenSeconds)}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        <button onClick={startQuiz} className="btn-primary w-full text-lg py-4 shadow-lg">
          {lang === 'hi' ? 'क्विज़ शुरू करें' : 'Start Quiz'} ⚡
        </button>
      </main>
    );
  }

  // ═══ PLAYING STATE — quiz UI with timer ═══
  if (state === 'playing') {
    const q = questions[currentQ];
    const answered = answers.filter(a => a >= 0).length;

    return (
      <main className="mx-auto max-w-lg px-5 pt-4 pb-28 min-h-dvh">
        {/* Timer bar */}
        <div className={`sticky top-0 z-20 flex items-center justify-between py-3 px-1 bg-paper-100/90 backdrop-blur-md border-b border-paper-200 ${timeLeft <= 60 ? 'text-ember-600' : 'text-ink-800'}`}>
          <span className="text-sm font-bold">
            ⏱️ {formatTime(timeLeft)}
          </span>
          <span className="text-xs text-muted-500">{answered}/{questions.length} {lang === 'hi' ? 'उत्तर' : 'answered'}</span>
        </div>

        {/* Progress dots */}
        <div className="flex flex-wrap gap-1.5 mt-4 mb-4">
          {questions.map((_, i) => (
            <button
              key={i}
              onClick={() => setCurrentQ(i)}
              className={`h-6 w-6 rounded-full text-[10px] font-bold flex items-center justify-center transition-all ${
                i === currentQ ? 'bg-ember-500 text-white scale-110' :
                (answers[i] ?? -1) >= 0 ? 'bg-gold-200 text-gold-800' :
                'bg-paper-300 text-muted-500'
              }`}
            >
              {i + 1}
            </button>
          ))}
        </div>

        {/* Question */}
        {q && (
          <div className="paper-card p-5 mb-4">
            <p className="text-xs text-muted-500 mb-2 uppercase tracking-wider">{q.category} &middot; {q.source}</p>
            <p className="font-serif text-base font-semibold text-ink-900 leading-snug">{q.question}</p>
            <div className="mt-4 space-y-2">
              {q.options.map((opt, i) => (
                <button
                  key={i}
                  onClick={() => selectAnswer(i)}
                  className={`w-full rounded-lg border px-4 py-3 text-left text-sm transition-all duration-150 ${
                    answers[currentQ] === i
                      ? 'border-ember-500 bg-ember-50 text-ink-900 shadow-sm'
                      : 'border-paper-300 hover:border-ember-300 text-ink-700'
                  }`}
                >
                  <span className="font-semibold text-ember-600 mr-2">{String.fromCharCode(65 + i)}.</span>
                  {opt}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Navigation */}
        <div className="flex items-center justify-between">
          <button onClick={() => setCurrentQ(Math.max(0, currentQ - 1))} disabled={currentQ === 0} className="btn-ghost px-4 py-2 text-sm disabled:opacity-40">
            &larr; {lang === 'hi' ? 'पिछला' : 'Prev'}
          </button>
          {currentQ < questions.length - 1 ? (
            <button onClick={() => setCurrentQ(currentQ + 1)} className="btn-ghost px-4 py-2 text-sm">
              {lang === 'hi' ? 'अगला' : 'Next'} &rarr;
            </button>
          ) : (
            <button onClick={handleSubmit} className="btn-primary px-6 py-2 shadow-lg">
              {lang === 'hi' ? 'सबमिट करें' : 'Submit'} ✓
            </button>
          )}
        </div>
      </main>
    );
  }

  // ═══ SUBMITTED STATE — results ═══
  if (state === 'submitted' && result) {
    const pct = Math.round((result.score / result.totalQuestions) * 100);
    return (
      <main className="mx-auto max-w-lg px-5 pt-6 pb-28 min-h-dvh">
        <section className="paper-card p-7 text-center mb-6">
          <p className="text-xs font-bold uppercase tracking-wider text-ember-600 mb-2">
            {pct >= 80 ? (lang === 'hi' ? 'शानदार!' : 'Excellent!') : pct >= 50 ? (lang === 'hi' ? 'अच्छा!' : 'Good!') : (lang === 'hi' ? 'प्रयास जारी रखें' : 'Keep trying!')}
          </p>
          <p className="font-serif text-5xl font-bold text-ink-900">{result.score}<span className="text-muted-500 text-2xl">/{result.totalQuestions}</span></p>
          <p className="mt-3 text-sm text-muted-500">
            {lang === 'hi' ? 'समय' : 'Time'}: {formatTime(result.timeTakenSeconds)} &middot; {lang === 'hi' ? 'रैंक' : 'Rank'}: #{result.rank}
          </p>
        </section>

        {/* Review answers */}
        <h2 className="font-serif text-lg font-semibold text-ink-900 mb-3">{lang === 'hi' ? 'समीक्षा' : 'Review'}</h2>
        <div className="space-y-3 mb-6">
          {questions.map((q, i) => {
            const correctIdx = result.correctAnswers[i] ?? 0;
            const userIdx = answers[i] ?? -1;
            const isCorrect = userIdx === correctIdx;
            return (
              <div key={i} className={`paper-card p-4 border-l-4 ${isCorrect ? 'border-l-green-500' : 'border-l-red-400'}`}>
                <p className="text-xs text-muted-500 mb-1">Q{i + 1} &middot; {q.category}</p>
                <p className="text-sm font-medium text-ink-900">{q.question}</p>
                <p className="mt-2 text-xs">
                  {isCorrect ? (
                    <span className="text-green-700">✓ {q.options[correctIdx]}</span>
                  ) : (
                    <>
                      <span className="text-red-600">✗ {userIdx >= 0 ? q.options[userIdx] : 'Skipped'}</span>
                      <span className="ml-2 text-green-700">→ {q.options[correctIdx]}</span>
                    </>
                  )}
                </p>
              </div>
            );
          })}
        </div>

        <div className="flex gap-3">
          <Link href="/current-affairs" className="btn-ghost flex-1 text-center">{lang === 'hi' ? 'करंट अफेयर्स' : 'Current Affairs'}</Link>
          <Link href="/dashboard" className="btn-primary flex-1 text-center">{lang === 'hi' ? 'डैशबोर्ड' : 'Dashboard'}</Link>
        </div>
      </main>
    );
  }

  return null;
}
