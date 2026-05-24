'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Logo } from '~/components/Logo';
import { useAuth } from '~/lib/auth-context';
import { api } from '~/lib/api';

interface LeaderboardEntry {
  rank: number;
  userName: string;
  score: number;
  totalQuestions: number;
  timeTakenSeconds: number;
}

interface LeaderboardData {
  today: {
    date: string;
    top10: LeaderboardEntry[];
    totalParticipants: number;
  };
  yesterdayWinner: {
    userName: string;
    score: number;
    timeTakenSeconds: number;
  } | null;
}

export default function LeaderboardPage() {
  const { user, loading } = useAuth();
  const router = useRouter();
  const [data, setData] = useState<LeaderboardData | null>(null);

  useEffect(() => {
    if (!loading && !user) router.replace('/signin');
  }, [user, loading, router]);

  useEffect(() => {
    if (!user) return;
    api.caQuiz.leaderboard().then(setData).catch(() => {});
  }, [user]);

  if (loading || !user || !data) {
    return (
      <main className="flex min-h-screen items-center justify-center">
        <span className="spinner" />
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-2xl px-6 pt-10 pb-16">
      <div className="flex items-center justify-between">
        <Logo />
        <button className="btn-ghost-sm" onClick={() => router.push('/today')}>
          Back
        </button>
      </div>

      <h1 className="mt-8 font-serif text-2xl font-semibold text-ink-900">
        Current Affairs Quiz Leaderboard
      </h1>

      {/* Yesterday's winner banner */}
      {data.yesterdayWinner && (
        <div className="mt-6 paper-card p-5 border-l-4 border-l-gold-500 bg-paper-200">
          <p className="text-xs uppercase tracking-wide text-gold-600 font-medium">
            Yesterday&apos;s Winner
          </p>
          <p className="mt-1 font-serif text-lg font-semibold text-ink-900">
            {data.yesterdayWinner.userName}
          </p>
          <p className="text-sm text-muted-500">
            Score: {data.yesterdayWinner.score}/20 · Time: {formatTime(data.yesterdayWinner.timeTakenSeconds)}
          </p>
          <p className="mt-2 text-xs text-ember-600 font-medium">
            It&apos;s now YOUR turn!
          </p>
        </div>
      )}

      {/* Today's leaderboard */}
      <div className="mt-6">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-medium uppercase tracking-wide text-muted-500">
            Today ({data.today.date})
          </h2>
          <span className="pill">{data.today.totalParticipants} participants</span>
        </div>

        {data.today.top10.length === 0 ? (
          <div className="paper-card p-8 text-center">
            <p className="text-muted-500">No attempts yet today.</p>
            <button
              className="btn-primary mt-4"
              onClick={() => router.push('/today/quiz')}
            >
              Be the first!
            </button>
          </div>
        ) : (
          <div className="space-y-2">
            {data.today.top10.map((entry) => (
              <div
                key={entry.rank}
                className={`paper-card px-4 py-3 flex items-center gap-4 ${
                  entry.rank === 1 ? 'ring-2 ring-gold-500' : ''
                }`}
              >
                <span className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold ${
                  entry.rank === 1 ? 'bg-gold-500 text-paper-50' :
                  entry.rank === 2 ? 'bg-paper-300 text-ink-900' :
                  entry.rank === 3 ? 'bg-paper-300 text-ink-800' :
                  'bg-paper-200 text-muted-500'
                }`}>
                  {entry.rank}
                </span>
                <div className="flex-1">
                  <p className="text-sm font-medium text-ink-900">{entry.userName}</p>
                  <p className="text-xs text-muted-500">
                    {entry.score}/{entry.totalQuestions} · {formatTime(entry.timeTakenSeconds)}
                  </p>
                </div>
                <span className="text-lg font-bold text-ember-500">
                  {Math.round((entry.score / entry.totalQuestions) * 100)}%
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

      <button
        className="btn-primary mt-8 w-full"
        onClick={() => router.push('/today/quiz')}
      >
        Take Today&apos;s Quiz
      </button>
    </main>
  );
}

function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}
