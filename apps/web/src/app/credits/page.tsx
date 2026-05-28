'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '~/lib/auth-context';
import { api, type StoredUser } from '~/lib/api';
import { AILoader } from '~/components/ui/AILoader';

const EARN_OPTIONS = [
  { label: 'Daily login', reward: '+10', icon: '📅' },
  { label: '7-day streak', reward: '+25', icon: '🔥' },
  { label: 'Pass quiz', reward: '+15', icon: '✅' },
  { label: 'Refer friend', reward: '+50', icon: '🎁' },
  { label: 'Signup (one-time)', reward: '+100', icon: '🎉' },
];

export default function CreditsPage() {
  const { user, loading } = useAuth();
  const router = useRouter();
  const [me, setMe] = useState<StoredUser | null>(null);
  const [pageLoading, setPageLoading] = useState(true);

  useEffect(() => {
    if (!loading && !user) router.replace('/signin');
  }, [user, loading, router]);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await api.me();
        if (!cancelled) setMe(res.user);
      } catch { /* ignore */ }
      finally { if (!cancelled) setPageLoading(false); }
    })();
    return () => { cancelled = true; };
  }, [user]);

  if (loading || !user || pageLoading) {
    return (
      <main className="flex min-h-dvh items-center justify-center">
        <AILoader context="credits" />
      </main>
    );
  }

  return (
    <main className="mx-auto flex min-h-dvh max-w-lg flex-col px-5 pt-6 pb-8">
      {/* Back button */}
      <button onClick={() => router.back()} className="mb-4 flex items-center gap-1 text-sm font-medium text-stone-500 hover:text-stone-700">
        <svg width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path d="M19 12H5M12 19l-7-7 7-7"/></svg>
        Back
      </button>

      {/* Header */}
      <h1 className="font-serif text-2xl font-bold text-stone-900">💎 Your Credits</h1>

      {/* Balance Display */}
      <section className="mt-8 flex flex-col items-center rounded-2xl bg-stone-50 p-8 dark:bg-stone-900">
        <p className="text-sm font-medium uppercase tracking-wider text-stone-500">Available Balance</p>
        <p className="mt-2 font-serif text-5xl font-bold text-amber-500">{me?.credits ?? 0}</p>
        <p className="mt-1 text-sm text-stone-500">credits</p>
      </section>

      {/* How to earn more */}
      <section className="mt-8">
        <h2 className="font-serif text-lg font-bold text-stone-900">How to earn more</h2>
        <div className="mt-4 space-y-2">
          {EARN_OPTIONS.map((opt) => (
            <div key={opt.label} className="flex items-center justify-between rounded-xl border border-stone-200 bg-white p-4 dark:border-stone-800 dark:bg-stone-900">
              <div className="flex items-center gap-3">
                <span className="text-xl">{opt.icon}</span>
                <span className="text-sm font-medium text-stone-900">{opt.label}</span>
              </div>
              <span className="text-sm font-bold text-amber-500">{opt.reward}</span>
            </div>
          ))}
        </div>
      </section>

      {/* Get more credits */}
      <section className="mt-8">
        <h2 className="font-serif text-lg font-bold text-stone-900">Get more credits</h2>
        <div className="mt-4 grid grid-cols-2 gap-3">
          <button
            onClick={() => router.push('/refer')}
            className="flex flex-col items-start rounded-xl border border-stone-200 bg-white p-4 text-left transition-all hover:shadow-md dark:border-stone-800 dark:bg-stone-900"
          >
            <span className="text-xl">🎁</span>
            <p className="mt-2 text-sm font-semibold text-stone-900">Refer & Earn</p>
            <p className="mt-0.5 text-xs text-amber-500 font-medium">+50 per referral →</p>
          </button>
          <button
            onClick={() => router.push('/upgrade')}
            className="flex flex-col items-start rounded-xl border border-stone-200 bg-white p-4 text-left transition-all hover:shadow-md dark:border-stone-800 dark:bg-stone-900"
          >
            <span className="text-xl">⭐</span>
            <p className="mt-2 text-sm font-semibold text-stone-900">Upgrade Plan</p>
            <p className="mt-0.5 text-xs text-amber-500 font-medium">More daily credits →</p>
          </button>
        </div>
      </section>
    </main>
  );
}
