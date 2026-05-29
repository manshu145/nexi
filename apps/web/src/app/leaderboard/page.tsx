'use client';

/**
 * Streak leaderboard page (lock §5.4).
 *
 * Single read-only surface showing the top 50 users by current streak.
 * Mobile-first, brand-tokened. Highlights the signed-in user's row if
 * they're on the board so they immediately see "you're #7".
 *
 * Why streaks (and not e.g. quiz scores): streaks are the most honest
 * leading indicator of disciplined preparation. Calm-brand fit -- no
 * noisy gamification, just "show up daily, see yourself climb".
 */

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '~/lib/auth-context';
import { api } from '~/lib/api';
import { AILoader } from '~/components/ui/AILoader';

interface LeaderboardRow {
  userId: string;
  name: string;
  photoURL: string | null;
  currentStreak: number;
  bestStreak: number;
  targetExam: string | null;
}

export default function LeaderboardPage() {
  const router = useRouter();
  const { user, loading: authLoading } = useAuth();
  const [rows, setRows] = useState<LeaderboardRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [myStreak, setMyStreak] = useState<number | null>(null);

  useEffect(() => {
    if (authLoading) return;
    if (!user) { router.replace('/signin'); return; }
    (async () => {
      try {
        const [lb, me] = await Promise.all([api.getStreakLeaderboard(50), api.me()]);
        setRows(lb.leaderboard);
        setMyStreak(me.user.currentStreak ?? 0);
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
        <button type="button" onClick={() => router.back()} className="btn-ghost-sm mb-3">← Back</button>
        <h1 className="font-serif text-2xl font-semibold text-ink-900">Streak Leaderboard</h1>
        <p className="mt-1 text-sm text-muted-500">Top students by current daily-study streak. Show up tomorrow to climb.</p>
      </header>

      {/* You card */}
      {myStreak !== null && (
        <section className="mx-auto mb-6 max-w-2xl">
          <div className="paper-card p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-medium uppercase tracking-wider text-muted-500">Your streak</p>
                <p className="font-serif mt-1 text-2xl font-semibold text-ink-900">
                  {myStreak} <span className="text-sm font-normal text-muted-500">days</span>
                </p>
              </div>
              {myRank >= 0 && (
                <div className="text-right">
                  <p className="text-xs font-medium uppercase tracking-wider text-muted-500">Your rank</p>
                  <p className="font-serif mt-1 text-2xl font-semibold text-ember-600">#{myRank + 1}</p>
                </div>
              )}
            </div>
          </div>
        </section>
      )}

      {/* Leaderboard */}
      <section className="mx-auto max-w-2xl">
        {rows.length === 0 ? (
          <div className="paper-card p-8 text-center">
            <p className="text-sm text-muted-500">No streaks yet. Be the first to start one — open any chapter today.</p>
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
              return (
                <li key={r.userId}>
                  <div className={`rounded-lg border p-3 ${rankBg} ${isMe ? 'ring-2 ring-ember-500/60' : ''}`}>
                    <div className="flex items-center gap-3">
                      <span className="grid h-9 w-9 place-items-center rounded-full bg-paper-50 text-sm font-mono font-semibold text-ink-900">
                        {medal ?? `#${i + 1}`}
                      </span>
                      {r.photoURL ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={r.photoURL} alt="" className="h-9 w-9 rounded-full object-cover" />
                      ) : (
                        <span className="grid h-9 w-9 place-items-center rounded-full bg-ember-500/10 text-sm font-semibold text-ember-600">
                          {(r.name?.[0] ?? '?').toUpperCase()}
                        </span>
                      )}
                      <div className="flex-1 min-w-0">
                        <p className="truncate text-sm font-medium text-ink-900">
                          {r.name || 'Student'}
                          {isMe && <span className="ml-2 rounded-full bg-ember-500 px-1.5 py-0.5 text-[10px] font-semibold text-paper-50">you</span>}
                        </p>
                        {r.targetExam && (
                          <p className="truncate text-[11px] text-muted-500">{r.targetExam.replace(/-/g, ' ').toUpperCase()}</p>
                        )}
                      </div>
                      <div className="text-right">
                        <p className="font-serif text-base font-semibold text-ink-900">{r.currentStreak}d</p>
                        <p className="text-[10px] text-muted-500">best {r.bestStreak}d</p>
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
