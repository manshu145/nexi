'use client';

/**
 * Leaderboard page — shows today's Current Affairs quiz top performers.
 *
 * Founder (31 May 2026): "isme streaks nhi balki current affair quize
 * me jo log achha perform kiye hai unka dena hai"
 *
 * Fetches from GET /v1/current-affairs/leaderboard which returns:
 *   { date, leaderboard: [...], yesterdayWinner: {...} | null }
 */

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '~/lib/auth-context';
import { useUser } from '~/lib/userStore';
import { api } from '~/lib/api';
import { AILoader } from '~/components/ui/AILoader';

interface LeaderboardEntry {
  userId: string;
  userName: string;
  score: number;
  timeTaken: number;
  date: string;
}

export default function LeaderboardPage() {
  const router = useRouter();
  const { user, loading: authLoading } = useAuth();
  const { user: me } = useUser();
  const [rows, setRows] = useState<LeaderboardEntry[]>([]);
  const [yesterdayWinner, setYesterdayWinner] = useState<LeaderboardEntry | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (authLoading) return;
    if (!user) { router.replace('/signin'); return; }
    (async () => {
      try {
        const res = await api.getCurrentAffairsLeaderboard();
        setRows(res.leaderboard ?? []);
        setYesterdayWinner(res.yesterdayWinner ?? null);
      } catch {
        setRows([]);
      } finally {
        setLoading(false);
      }
    })();
  }, [authLoading, user, router]);

  if (loading) {
    return <main className="min-h-screen bg-paper-100"><AILoader context="general" /></main>;
  }

  const myUid = user?.uid ?? '';
  const myRank = rows.findIndex(r => r.userId === myUid);

  return (
    <main className="min-h-screen bg-paper-100 px-4 py-6 pb-24">
      <header className="mx-auto mb-6 max-w-2xl">
        <button type="button" onClick={() => router.back()} className="btn-ghost-sm mb-3">&larr; Back</button>
        <h1 className="font-serif text-2xl font-semibold text-ink-900">Quiz Leaderboard</h1>
        <p className="mt-1 text-sm text-muted-500">Top scorers on today&apos;s Current Affairs quiz. Take the quiz to compete!</p>
      </header>

      {/* Yesterday's winner */}
      {yesterdayWinner && (
        <section className="mx-auto mb-4 max-w-2xl">
          <div className="paper-card p-4 border-gold-500/40 bg-gold-500/5">
            <p className="text-[10px] uppercase tracking-wider text-gold-600 font-semibold mb-1">Yesterday&apos;s Champion</p>
            <div className="flex items-center justify-between">
              <div>
                <p className="font-serif text-lg font-bold text-ink-900">{yesterdayWinner.userName}</p>
                <p className="text-xs text-muted-500">Score: {yesterdayWinner.score}% &middot; Time: {Math.floor(yesterdayWinner.timeTaken / 60)}m {yesterdayWinner.timeTaken % 60}s</p>
              </div>
              <span className="text-3xl">🏆</span>
            </div>
          </div>
        </section>
      )}

      {/* Your rank card */}
      {myRank >= 0 && me && (
        <section className="mx-auto mb-4 max-w-2xl">
          <div className="paper-card p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-medium uppercase tracking-wider text-muted-500">Your rank today</p>
                <p className="font-serif mt-1 text-2xl font-semibold text-ember-600">#{myRank + 1}</p>
              </div>
              <div className="text-right">
                <p className="text-xs font-medium uppercase tracking-wider text-muted-500">Score</p>
                <p className="font-serif mt-1 text-2xl font-semibold text-ink-900">{rows[myRank]?.score}%</p>
              </div>
            </div>
          </div>
        </section>
      )}

      {/* Leaderboard */}
      <section className="mx-auto max-w-2xl">
        {rows.length === 0 ? (
          <div className="paper-card p-8 text-center">
            <p className="text-lg mb-2">📝</p>
            <p className="text-sm text-muted-500">No quiz submissions yet today.</p>
            <button onClick={() => router.push('/current-affairs/quiz')} className="btn-primary mt-4 text-sm">Take Today&apos;s Quiz</button>
          </div>
        ) : (
          <ol className="space-y-2">
            {rows.map((r, i) => {
              const isMe = r.userId === myUid;
              const rankBg = i === 0 ? 'bg-gold-500/15 border-gold-500/40'
                : i === 1 ? 'bg-muted-500/10 border-muted-500/30'
                : i === 2 ? 'bg-ember-500/10 border-ember-500/30'
                : 'border-line bg-paper-50';
              const medal = i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : null;
              const mins = Math.floor(r.timeTaken / 60);
              const secs = r.timeTaken % 60;
              return (
                <li key={`${r.userId}-${r.date}`}>
                  <div className={`rounded-lg border p-3 ${rankBg} ${isMe ? 'ring-2 ring-ember-500/60' : ''}`}>
                    <div className="flex items-center gap-3">
                      <span className="grid h-9 w-9 place-items-center rounded-full bg-paper-50 text-sm font-mono font-semibold text-ink-900">
                        {medal ?? `#${i + 1}`}
                      </span>
                      <span className="grid h-9 w-9 place-items-center rounded-full bg-ember-500/10 text-sm font-semibold text-ember-600">
                        {(r.userName?.[0] ?? '?').toUpperCase()}
                      </span>
                      <div className="flex-1 min-w-0">
                        <p className="truncate text-sm font-medium text-ink-900">
                          {r.userName || 'Student'}
                          {isMe && <span className="ml-2 rounded-full bg-ember-500 px-1.5 py-0.5 text-[10px] font-semibold text-paper-50">you</span>}
                        </p>
                        <p className="text-[11px] text-muted-500">{mins}m {secs}s</p>
                      </div>
                      <div className="text-right">
                        <p className="font-serif text-base font-semibold text-ink-900">{r.score}%</p>
                      </div>
                    </div>
                  </div>
                </li>
              );
            })}
          </ol>
        )}
      </section>
    </main>
  );
}
