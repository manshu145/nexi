'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Logo } from '~/components/Logo';
import { useAuth } from '~/lib/auth-context';

/**
 * Phase F — Current affairs daily quiz.
 * 20 MCQs from today's digest. Timer. Leaderboard. Winner banner.
 */

interface QuizQuestion {
  id: string;
  question: string;
  options: { A: string; B: string; C: string; D: string };
  sourceHeadline: string;
  category: string;
}

interface QuizResult {
  id: string;
  question: string;
  options: { A: string; B: string; C: string; D: string };
  correctOption: string;
  yourAnswer: string | null;
  isCorrect: boolean;
  sourceHeadline: string;
}

interface LeaderboardEntry {
  rank: number;
  userName: string;
  score: number;
  timeTakenSeconds: number;
}

type Phase = 'loading' | 'ready' | 'quiz' | 'submitting' | 'results' | 'no-quiz';

export default function CurrentAffairsQuizPage() {
  const { user, loading: authLoading } = useAuth();
  const router = useRouter();

  const [phase, setPhase] = useState<Phase>('loading');
  const [questions, setQuestions] = useState<QuizQuestion[]>([]);
  const [quizId, setQuizId] = useState('');
  const [timeLimit, setTimeLimit] = useState(600);
  const [currentQ, setCurrentQ] = useState(0);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [timeLeft, setTimeLeft] = useState(600);
  const [startedAt, setStartedAt] = useState(0);
  const [results, setResults] = useState<QuizResult[]>([]);
  const [score, setScore] = useState(0);
  const [timeTaken, setTimeTaken] = useState(0);
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([]);
  const [alreadyAttempted, setAlreadyAttempted] = useState(false);
  const [previousScore, setPreviousScore] = useState<number | null>(null);
  const timerRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    if (!authLoading && !user) router.replace('/signin');
  }, [user, authLoading, router]);

  // Load quiz
  useEffect(() => {
    if (!user) return;
    (async () => {
      try {
        const auth = await import('~/lib/firebase').then((m) => m.getFirebaseAuthClient());
        const token = await auth.currentUser?.getIdToken();
        if (!token) return;
        const baseUrl = process.env['NEXT_PUBLIC_API_BASE_URL'] ?? 'http://localhost:9090';
        const res = await fetch(`${baseUrl}/v1/current-affairs-quiz/today`, {
          headers: { 'Authorization': `Bearer ${token}` },
        });
        if (!res.ok) { setPhase('no-quiz'); return; }
        const data = await res.json();
        if (!data.quiz) { setPhase('no-quiz'); return; }
        setQuestions(data.quiz.questions);
        setQuizId(data.quiz.id);
        setTimeLimit(data.quiz.timeLimitSeconds);
        setTimeLeft(data.quiz.timeLimitSeconds);
        if (data.alreadyAttempted) {
          setAlreadyAttempted(true);
          setPreviousScore(data.previousScore);
        }
        setPhase('ready');

        // Also load leaderboard
        const lbRes = await fetch(`${baseUrl}/v1/current-affairs-quiz/leaderboard`, {
          headers: { 'Authorization': `Bearer ${token}` },
        });
        if (lbRes.ok) {
          const lbData = await lbRes.json();
          setLeaderboard(lbData.leaderboard ?? []);
        }
      } catch {
        setPhase('no-quiz');
      }
    })();
  }, [user]);

  // Timer
  useEffect(() => {
    if (phase !== 'quiz') return;
    timerRef.current = setInterval(() => {
      setTimeLeft((prev) => {
        if (prev <= 1) {
          clearInterval(timerRef.current!);
          submitQuiz();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [phase]);

  const startQuiz = () => {
    setStartedAt(Date.now());
    setPhase('quiz');
  };

  const selectAnswer = (qId: string, opt: string) => {
    setAnswers((prev) => ({ ...prev, [qId]: opt }));
  };

  const submitQuiz = async () => {
    if (timerRef.current) clearInterval(timerRef.current);
    setPhase('submitting');
    const elapsed = Math.round((Date.now() - startedAt) / 1000);
    try {
      const auth = await import('~/lib/firebase').then((m) => m.getFirebaseAuthClient());
      const token = await auth.currentUser?.getIdToken();
      if (!token) return;
      const baseUrl = process.env['NEXT_PUBLIC_API_BASE_URL'] ?? 'http://localhost:9090';
      const res = await fetch(`${baseUrl}/v1/current-affairs-quiz/submit`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ answers, timeTakenSeconds: elapsed }),
      });
      if (res.ok) {
        const data = await res.json();
        setScore(data.score);
        setTimeTaken(data.timeTakenSeconds);
        setResults(data.results ?? []);
        setPhase('results');
        // Reload leaderboard
        const lbRes = await fetch(`${baseUrl}/v1/current-affairs-quiz/leaderboard`, {
          headers: { 'Authorization': `Bearer ${token}` },
        });
        if (lbRes.ok) {
          const lbData = await lbRes.json();
          setLeaderboard(lbData.leaderboard ?? []);
        }
      } else {
        setPhase('results');
      }
    } catch {
      setPhase('results');
    }
  };

  const fmtTime = (s: number) => `${Math.floor(s / 60)}:${(s % 60).toString().padStart(2, '0')}`;

  if (authLoading || !user) {
    return (
      <main className="flex min-h-[60vh] items-center justify-center px-6">
        <span className="text-sm text-muted-500"><span className="spinner" /> Loading…</span>
      </main>
    );
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-3xl flex-col px-6 pt-8 pb-16">
      <div className="flex items-center justify-between">
        <Logo />
        <button type="button" onClick={() => router.push('/today')} className="btn-ghost-sm">
          Back to digest
        </button>
      </div>

      {/* No quiz available */}
      {phase === 'no-quiz' && (
        <section className="mt-12 text-center">
          <h1 className="font-serif text-2xl font-semibold text-ink-900">No quiz today</h1>
          <p className="mt-2 text-sm text-muted-500">
            The daily current affairs quiz hasn&apos;t been generated yet. Check back later!
          </p>
          <button type="button" onClick={() => router.push('/today')} className="btn-primary mt-6">
            Read today&apos;s digest
          </button>
        </section>
      )}

      {/* Ready state */}
      {phase === 'ready' && (
        <section className="mt-10 text-center">
          <h1 className="font-serif text-3xl font-semibold text-ink-900">
            Daily current affairs quiz
          </h1>
          <p className="mt-3 text-ink-800">
            20 questions from today&apos;s news. {fmtTime(timeLimit)} time limit.
            Fastest correct completion wins!
          </p>

          {alreadyAttempted ? (
            <div className="paper-card mt-6 p-6">
              <p className="text-sm text-muted-500">You already took today&apos;s quiz</p>
              <p className="font-serif mt-2 text-3xl font-semibold text-ink-900">
                {previousScore}/20
              </p>
            </div>
          ) : (
            <button type="button" onClick={startQuiz} className="btn-primary mt-8">
              Start quiz
            </button>
          )}

          {/* Leaderboard */}
          {leaderboard.length > 0 && (
            <div className="mt-8">
              <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-500">
                Today&apos;s leaderboard
              </h2>
              <div className="mt-3 space-y-2">
                {leaderboard.slice(0, 10).map((entry) => (
                  <div
                    key={entry.rank}
                    className={`paper-card flex items-center justify-between p-3 ${
                      entry.rank === 1 ? 'ring-2 ring-gold-500' : ''
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <span className={`flex h-7 w-7 items-center justify-center rounded-full text-xs font-bold ${
                        entry.rank === 1 ? 'bg-gold-500 text-paper-50' :
                        entry.rank <= 3 ? 'bg-paper-300 text-ink-900' :
                        'bg-paper-200 text-muted-500'
                      }`}>
                        {entry.rank}
                      </span>
                      <span className="text-sm font-medium text-ink-900">{entry.userName}</span>
                    </div>
                    <div className="text-right">
                      <span className="text-sm font-semibold text-ink-900">{entry.score}/20</span>
                      <span className="ml-2 text-xs text-muted-500">{fmtTime(entry.timeTakenSeconds)}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </section>
      )}

      {/* Quiz in progress */}
      {phase === 'quiz' && questions.length > 0 && (
        <section className="mt-6">
          {/* Timer bar */}
          <div className="flex items-center justify-between">
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-500">
              {currentQ + 1}/{questions.length}
            </p>
            <div className={`rounded-full px-3 py-1 text-sm font-semibold ${
              timeLeft < 60 ? 'bg-ember-100 text-ember-700 animate-pulse' : 'bg-paper-200 text-ink-900'
            }`}>
              {fmtTime(timeLeft)}
            </div>
          </div>
          <div className="mt-2 h-1 w-full rounded-full bg-paper-300">
            <div className="h-full rounded-full bg-ember-500 transition-all" style={{ width: `${((timeLimit - timeLeft) / timeLimit) * 100}%` }} />
          </div>

          {/* Question */}
          <div className="paper-card mt-4 p-5">
            <p className="text-[11px] uppercase tracking-wider text-muted-500">{questions[currentQ]!.category}</p>
            <h2 className="font-serif mt-2 text-lg font-semibold leading-snug text-ink-900">
              {questions[currentQ]!.question}
            </h2>
            <div className="mt-4 space-y-2">
              {(['A', 'B', 'C', 'D'] as const).map((opt) => (
                <button
                  key={opt}
                  type="button"
                  onClick={() => selectAnswer(questions[currentQ]!.id, opt)}
                  className={`w-full rounded-lg border p-3 text-left text-sm transition ${
                    answers[questions[currentQ]!.id] === opt
                      ? 'border-ember-500 bg-ember-50 ring-1 ring-ember-500'
                      : 'border-line bg-paper-50 hover:bg-paper-200'
                  }`}
                >
                  <span className="font-semibold">{opt}.</span> {questions[currentQ]!.options[opt]}
                </button>
              ))}
            </div>
          </div>

          {/* Nav */}
          <div className="mt-4 flex items-center justify-between">
            <button type="button" onClick={() => setCurrentQ(Math.max(0, currentQ - 1))} disabled={currentQ === 0} className="btn-ghost">
              Prev
            </button>
            {currentQ < questions.length - 1 ? (
              <button type="button" onClick={() => setCurrentQ(currentQ + 1)} className="btn-primary">
                Next
              </button>
            ) : (
              <button type="button" onClick={submitQuiz} className="btn-primary">
                Submit quiz
              </button>
            )}
          </div>

          {/* Quick nav */}
          <div className="mt-3 flex flex-wrap justify-center gap-1">
            {questions.map((q, i) => (
              <button
                key={q.id}
                type="button"
                onClick={() => setCurrentQ(i)}
                className={`h-6 w-6 rounded-full text-[10px] font-medium ${
                  i === currentQ ? 'bg-ink-900 text-paper-100' :
                  answers[q.id] ? 'bg-gold-200 text-ink-900' :
                  'bg-paper-200 text-muted-500'
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
          <span className="spinner" /><span className="ml-2 text-sm text-muted-500">Grading…</span>
        </section>
      )}

      {/* Results */}
      {phase === 'results' && (
        <section className="mt-8">
          <div className="paper-card p-6 text-center">
            <p className="text-xs uppercase tracking-wider text-muted-500">Your score</p>
            <p className="font-serif mt-2 text-5xl font-semibold text-ink-900">{score}/20</p>
            <p className="mt-2 text-sm text-muted-500">
              Completed in {fmtTime(timeTaken)}
            </p>
          </div>

          {/* Leaderboard */}
          {leaderboard.length > 0 && (
            <div className="mt-6">
              <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-500">Leaderboard</h2>
              <div className="mt-3 space-y-2">
                {leaderboard.slice(0, 5).map((entry) => (
                  <div key={entry.rank} className="paper-card flex items-center justify-between p-3">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-bold text-muted-500">#{entry.rank}</span>
                      <span className="text-sm font-medium text-ink-900">{entry.userName}</span>
                    </div>
                    <span className="text-sm text-ink-800">{entry.score}/20 · {fmtTime(entry.timeTakenSeconds)}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          <button type="button" onClick={() => router.push('/today')} className="btn-primary mt-8 w-full">
            Back to today&apos;s digest
          </button>
        </section>
      )}
    </main>
  );
}
