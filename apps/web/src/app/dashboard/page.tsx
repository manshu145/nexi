'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useTheme } from 'next-themes';
import { EXAM_BY_SLUG } from '@nexigrate/shared';
import { useAuth } from '~/lib/auth-context';
import { api, type StoredUser } from '~/lib/api';
import { AILoader } from '~/components/ui/AILoader';

export default function DashboardPage() {
  const t = useTranslations('dashboard');
  const tc = useTranslations('common');
  const { user, loading, signOut } = useAuth();
  const { theme, setTheme } = useTheme();
  const router = useRouter();
  const [me, setMe] = useState<StoredUser | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pageLoading, setPageLoading] = useState(true);

  useEffect(() => { if (!loading && !user) router.replace('/signin'); }, [user, loading, router]);
  useEffect(() => {
    if (!user) return; let c = false;
    (async () => {
      try {
        const res = await api.me();
        if (c) return;
        setMe(res.user);
        if (!res.user.targetExam) { router.replace('/onboarding/language'); return; }
      } catch (e) {
        if (c) return;
        setError(e instanceof Error ? e.message : 'Failed to load');
      } finally { if (!c) setPageLoading(false); }
    })();
    return () => { c = true; };
  }, [user, router]);

  if (loading || !user || pageLoading) return (
    <main className="flex min-h-dvh items-center justify-center">
      <AILoader context="dashboard" />
    </main>
  );

  const examName = me?.targetExam ? EXAM_BY_SLUG.get(me.targetExam)?.name ?? '' : '';
  const h = (new Date().getUTCHours() + 5.5) % 24;
  const greeting = h < 12 ? t('greeting.morning') : h < 17 ? t('greeting.afternoon') : t('greeting.evening');
  const firstName = (me?.name ?? user.displayName ?? 'Student').split(' ')[0] ?? 'Student';
  const levelLabel = me?.onboardingLevel ? me.onboardingLevel.charAt(0).toUpperCase() + me.onboardingLevel.slice(1) : 'Beginner';

  return (
    <main className="min-h-dvh bg-amber-50/30 dark:bg-slate-950 pb-8">
      {/* Header */}
      <header className="sticky top-0 z-30 bg-white/80 dark:bg-slate-900/80 backdrop-blur-md border-b border-amber-100 dark:border-slate-800 px-4 py-3">
        <div className="mx-auto max-w-lg flex items-center justify-between">
          <span className="font-serif text-xl font-bold text-amber-500">Nexigrate</span>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
              className="h-9 w-9 rounded-full flex items-center justify-center hover:bg-amber-100 dark:hover:bg-slate-800 transition-colors"
              aria-label="Toggle theme"
            >
              {theme === 'dark' ? '☀️' : '🌙'}
            </button>
            <button
              onClick={() => router.push('/profile')}
              className="h-9 w-9 rounded-full overflow-hidden border-2 border-amber-200 dark:border-slate-700 hover:border-amber-400 transition-colors"
              aria-label="Profile"
            >
              {user.photoURL ? (
                <img src={user.photoURL} alt="" className="h-full w-full object-cover" referrerPolicy="no-referrer" />
              ) : (
                <div className="h-full w-full bg-amber-100 dark:bg-slate-700 flex items-center justify-center text-sm font-bold text-amber-700 dark:text-amber-400">
                  {firstName.charAt(0).toUpperCase()}
                </div>
              )}
            </button>
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-lg px-4 pt-6">
        {/* Hero Section */}
        <section className="mb-6">
          <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100">
            {greeting}, {firstName}! 👋
          </h1>
          {examName && (
            <span className="mt-2 inline-block px-3 py-1 rounded-full bg-amber-500 text-white text-xs font-medium">
              Preparing for: {examName}
            </span>
          )}
          <div className="mt-3 flex flex-wrap items-center gap-3 text-sm text-slate-600 dark:text-slate-400">
            {(me?.currentStreak ?? 0) > 0 && (
              <span className="flex items-center gap-1">🔥 {me?.currentStreak} days streak</span>
            )}
            <span className="flex items-center gap-1">💎 {me?.credits ?? 0} credits</span>
            <span className="flex items-center gap-1">📊 {levelLabel}</span>
          </div>
        </section>

        {/* Primary Action Cards */}
        <section className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-4">
          {/* Study Card */}
          <button
            type="button"
            onClick={() => router.push('/study')}
            className="group relative bg-white dark:bg-slate-900 rounded-2xl border border-amber-100 dark:border-slate-800 p-6 text-left hover:shadow-md transition-all duration-200"
          >
            <div className="h-10 w-10 rounded-xl bg-amber-50 dark:bg-amber-500/10 flex items-center justify-center mb-3">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-amber-500"><path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"/><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"/></svg>
            </div>
            <h3 className="text-lg font-bold text-slate-900 dark:text-slate-100">{t('study')}</h3>
            <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">Continue your syllabus</p>
            <div className="mt-3 flex items-center justify-between">
              <span className="text-xs text-slate-500 dark:text-slate-500">Start your journey</span>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-amber-500 group-hover:translate-x-1 transition-transform"><polyline points="9 18 15 12 9 6"/></svg>
            </div>
          </button>

          {/* Current Affairs Card */}
          <button
            type="button"
            onClick={() => router.push('/current-affairs')}
            className="group relative bg-white dark:bg-slate-900 rounded-2xl border border-blue-100 dark:border-slate-800 p-6 text-left hover:shadow-md transition-all duration-200"
          >
            <div className="h-10 w-10 rounded-xl bg-blue-50 dark:bg-blue-500/10 flex items-center justify-center mb-3">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-blue-500"><path d="M4 22h16a2 2 0 0 0 2-2V4a2 2 0 0 0-2-2H8a2 2 0 0 0-2 2v16a2 2 0 0 1-2 2Zm0 0a2 2 0 0 1-2-2v-9c0-1.1.9-2 2-2h2"/><path d="M18 14h-8"/><path d="M15 18h-5"/><path d="M10 6h8v4h-8V6Z"/></svg>
            </div>
            <h3 className="text-lg font-bold text-slate-900 dark:text-slate-100">{t('currentAffairs')}</h3>
            <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">Today&apos;s news digest &amp; quiz</p>
            <div className="mt-3 flex items-center gap-2">
              <span className="flex items-center gap-1 text-xs text-green-600 dark:text-green-400">
                <span className="h-2 w-2 rounded-full bg-green-500 animate-pulse" />
                LIVE
              </span>
            </div>
          </button>

          {/* Nexi AI Card */}
          <button
            type="button"
            onClick={() => router.push('/chat')}
            className="group relative bg-white dark:bg-slate-900 rounded-2xl border border-purple-100 dark:border-slate-800 p-6 text-left hover:shadow-md transition-all duration-200"
          >
            <div className="h-10 w-10 rounded-xl bg-purple-50 dark:bg-purple-500/10 flex items-center justify-center mb-3">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-purple-500"><path d="M12 8V4H8"/><rect width="16" height="12" x="4" y="8" rx="2"/><path d="M2 14h2"/><path d="M20 14h2"/><path d="M15 13v2"/><path d="M9 13v2"/></svg>
            </div>
            <h3 className="text-lg font-bold text-slate-900 dark:text-slate-100">{t('nexiAI')}</h3>
            <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">Ask doubts, get explanations</p>
            <div className="mt-3 flex items-center justify-end">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-purple-500 group-hover:translate-x-1 transition-transform"><polyline points="9 18 15 12 9 6"/></svg>
            </div>
          </button>
        </section>

        {/* Secondary Row */}
        <section className="grid grid-cols-3 gap-3 mb-6">
          <button
            type="button"
            onClick={() => router.push('/upgrade')}
            className="bg-white dark:bg-slate-900 rounded-xl border border-slate-100 dark:border-slate-800 p-4 text-left hover:shadow-sm transition-all"
          >
            <span className="text-lg">⭐</span>
            <h3 className="mt-1 text-sm font-semibold text-slate-900 dark:text-slate-100">Upgrade</h3>
          </button>
          <button
            type="button"
            onClick={() => router.push('/profile#referral')}
            className="bg-white dark:bg-slate-900 rounded-xl border border-slate-100 dark:border-slate-800 p-4 text-left hover:shadow-sm transition-all"
          >
            <span className="text-lg">🎁</span>
            <h3 className="mt-1 text-sm font-semibold text-slate-900 dark:text-slate-100">Refer &amp; Earn</h3>
          </button>
          <button
            type="button"
            onClick={() => router.push('/support')}
            className="bg-white dark:bg-slate-900 rounded-xl border border-slate-100 dark:border-slate-800 p-4 text-left hover:shadow-sm transition-all"
          >
            <span className="text-lg">🛟</span>
            <h3 className="mt-1 text-sm font-semibold text-slate-900 dark:text-slate-100">Support</h3>
          </button>
        </section>

        {/* Stats Row */}
        <section className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-6">
          <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-100 dark:border-slate-800 p-4">
            <p className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">{t('statsCredits')}</p>
            <p className="mt-2 text-2xl font-bold text-slate-900 dark:text-white">{me?.credits ?? 0}</p>
            <button onClick={() => router.push('/profile#referral')} className="mt-1 text-xs text-amber-600 dark:text-amber-400 font-medium hover:underline">Earn more →</button>
          </div>
          <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-100 dark:border-slate-800 p-4">
            <p className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">{t('statsStreak')}</p>
            <p className="mt-2 text-2xl font-bold text-slate-900 dark:text-white">
              {(me?.currentStreak ?? 0) > 0 ? `🔥 ${me?.currentStreak} ${tc('days')}` : '—'}
            </p>
            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
              {(me?.bestStreak ?? 0) > 0 ? t('best', { days: String(me?.bestStreak ?? 0) }) : t('startStreak')}
            </p>
          </div>
          <div
            className="bg-white dark:bg-slate-900 rounded-xl border border-slate-100 dark:border-slate-800 p-4 cursor-pointer hover:border-amber-200 dark:hover:border-amber-800 transition-colors"
            onClick={() => router.push('/profile/level')}
          >
            <p className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">{t('statsLevel')}</p>
            <p className="mt-2 text-2xl font-bold capitalize text-slate-900 dark:text-white">{me?.onboardingLevel ?? '—'}</p>
            <p className="mt-1 text-xs text-amber-600 dark:text-amber-400 font-medium">View details →</p>
          </div>
        </section>

        {/* Admin Panel Link (conditional) */}
        {me?.role === 'admin' && (
          <section className="mb-6">
            <button
              type="button"
              onClick={() => router.push('/admin')}
              className="w-full bg-white dark:bg-slate-900 rounded-xl border-2 border-amber-200 dark:border-amber-800 p-4 text-left hover:shadow-sm transition-all flex items-center gap-3"
            >
              <div className="h-9 w-9 rounded-lg bg-amber-50 dark:bg-amber-500/10 flex items-center justify-center">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-amber-500"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>
              </div>
              <div>
                <h3 className="font-semibold text-slate-900 dark:text-slate-100">Admin Panel</h3>
                <p className="text-xs text-slate-500 dark:text-slate-400">Manage platform</p>
              </div>
            </button>
          </section>
        )}

        {error && <div className="p-3 rounded-lg bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800 text-sm text-red-700 dark:text-red-400">{error}</div>}
      </div>
    </main>
  );
}
