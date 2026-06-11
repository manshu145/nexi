'use client';

/**
 * Current Affairs daily-quiz leaderboard (PR-34c, audit #29).
 *
 * The /current-affairs/quiz rules screen has always promised "Compete
 * on the daily leaderboard" but no leaderboard page existed for it —
 * only the streak leaderboard at /leaderboard. The backend has been
 * serving GET /v1/current-affairs/leaderboard since the quiz shipped;
 * this page just renders it.
 *
 * Pattern matches /leaderboard (medals on top 3, current-user
 * highlight, brand tokens only). Auth gate via useUser() per PR-32.
 */

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations, useLocale } from 'next-intl';
import { toast } from 'sonner';
import { useAuth } from '~/lib/auth-context';
import { useUser } from '~/lib/userStore';
import { api, type LeaderboardEntry } from '~/lib/api';
import { AILoader } from '~/components/ui/AILoader';
import { Logo } from '~/components/Logo';

function fmtTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

export default function CurrentAffairsLeaderboardPage() {
  const t = useTranslations('caLeaderboard');
  const locale = useLocale();
  const router = useRouter();
  const { user, loading: authLoading } = useAuth();
  const { user: me, loading: meLoading } = useUser();
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([]);
  const [yesterdayWinner, setYesterdayWinner] = useState<LeaderboardEntry | null>(null);
  const [date, setDate] = useState<string>('');
  const [loading, setLoading] = useState(true);

  useEffect(() => { if (!authLoading && !user) router.replace('/signin'); }, [authLoading, user, router]);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await api.getCurrentAffairsLeaderboard();
        if (cancelled) return;
        setLeaderboard(res.leaderboard ?? []);
        setYesterdayWinner(res.yesterdayWinner);
        setDate(res.date);
      } catch (e) {
        if (!cancelled) {
          toast.error(e instanceof Error ? e.message : t('loadFailed'));
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [user]);

  if (authLoading || !user || meLoading || !me || loading) {
    return <main className="flex min-h-dvh items-center justify-center"><AILoader context="general" /></main>;
  }

  // Top 20 only (server already limits but be defensive).
  const top20 = leaderboard.slice(0, 20);
  const myUid = user.uid;
  const myEntry = top20.find((e) => e.userId === myUid);
  const myRank = top20.findIndex((e) => e.userId === myUid);

  const dateLabel = date
    ? new Date(date).toLocaleDateString(locale === 'hi' ? 'hi-IN' : 'en-IN', { day: 'numeric', month: 'long', year: 'numeric' })
    : '';

  return (
    <main className="mx-auto flex min-h-dvh max-w-2xl flex-col px-5 pt-6 pb-16">
      <header className="flex items-center justify-between">
        <button type="button" onClick={() => router.back()} className="btn-ghost-sm">{t('back')}</button>
        <Logo height={36} />
      </header>

      <section className="mt-6">
        <h1 className="font-serif text-2xl font-bold text-ink-900">{t('title')}</h1>
        <p className="mt-1 text-sm text-muted-500">{dateLabel ? t('todayWithDate', { date: dateLabel }) : t('todayTop')}</p>
      </section>

      {/* Yesterday's winner card */}
      {yesterdayWinner && (
        <section className="mt-5">
          <div className="paper-card flex items-center gap-3 border-gold-500/40 bg-gold-500/10 p-4">
            <span className="text-2xl">🏆</span>
            <div className="min-w-0 flex-1">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-gold-600">
                {t('yesterdayWinner')}
              </p>
              <p className="font-serif mt-0.5 truncate text-base font-semibold text-ink-900">
                {yesterdayWinner.userName || t('student')}
              </p>
              <p className="text-xs text-muted-500">
                {t('scoreTime', { score: yesterdayWinner.score, time: fmtTime(yesterdayWinner.timeTaken) })}
              </p>
            </div>
          </div>
        </section>
      )}

      {/* Your rank card — only when on the board */}
      {myEntry && myRank >= 0 && (
        <section className="mt-5">
          <div className="paper-card p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-medium uppercase tracking-wider text-muted-500">{t('yourScore')}</p>
                <p className="font-serif mt-1 text-2xl font-semibold text-ink-900">
                  {myEntry.score}%
                  <span className="ml-2 text-sm font-normal text-muted-500">
                    {t('inTime', { time: fmtTime(myEntry.timeTaken) })}
                  </span>
                </p>
              </div>
              <div className="text-right">
                <p className="text-xs font-medium uppercase tracking-wider text-muted-500">{t('yourRank')}</p>
                <p className="font-serif mt-1 text-2xl font-semibold text-ember-600">#{myRank + 1}</p>
              </div>
            </div>
          </div>
        </section>
      )}

      {/* Leaderboard */}
      <section className="mt-6">
        {top20.length === 0 ? (
          <div className="paper-card p-8 text-center">
            <p className="text-sm text-muted-500">
              {t('noScores')}
            </p>
            <button
              type="button"
              onClick={() => router.push('/current-affairs/quiz')}
              className="mt-4 text-sm font-medium text-ember-600 hover:underline"
            >
              {t('takeQuiz')}
            </button>
          </div>
        ) : (
          <ol className="space-y-2">
            {top20.map((entry, i) => {
              const isMe = entry.userId === myUid;
              const rankBg =
                i === 0 ? 'bg-gold-500/15 border-gold-500/40'
                : i === 1 ? 'bg-muted-500/10 border-muted-500/30'
                : i === 2 ? 'bg-ember-500/10 border-ember-500/30'
                : 'border-line bg-paper-50';
              const medal = i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : null;
              return (
                <li key={`${entry.userId}-${i}`}>
                  <div className={`rounded-lg border p-3 ${rankBg} ${isMe ? 'ring-2 ring-ember-500/60' : ''}`}>
                    <div className="flex items-center gap-3">
                      <span className="grid h-9 w-9 place-items-center rounded-full bg-paper-50 text-sm font-mono font-semibold text-ink-900">
                        {medal ?? `#${i + 1}`}
                      </span>
                      <span className="grid h-9 w-9 place-items-center rounded-full bg-ember-500/10 text-sm font-semibold text-ember-600">
                        {(entry.userName?.[0] ?? '?').toUpperCase()}
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium text-ink-900">
                          {entry.userName || t('student')}
                          {isMe && (
                            <span className="ml-2 rounded-full bg-ember-500 px-1.5 py-0.5 text-[10px] font-semibold text-paper-50">
                              {t('you')}
                            </span>
                          )}
                        </p>
                        <p className="text-[11px] text-muted-500">
                          {t('timeTaken', { time: fmtTime(entry.timeTaken) })}
                        </p>
                      </div>
                      <div className="text-right">
                        <p className="font-serif text-base font-semibold text-ink-900">{entry.score}%</p>
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
