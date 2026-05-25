'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useTheme } from 'next-themes';
import { EXAM_BY_SLUG } from '@nexigrate/shared';
import { Logo } from '~/components/Logo';
import { useAuth } from '~/lib/auth-context';
import { api, type StoredUser } from '~/lib/api';

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
      try { const res = await api.me(); if (c) return; setMe(res.user);
        if (!res.user.targetExam) { router.replace('/onboarding/language'); return; }
      } catch (e) { if (c) return; setError(e instanceof Error ? e.message : 'Failed to load'); }
      finally { if (!c) setPageLoading(false); }
    })(); return () => { c = true; };
  }, [user, router]);

  if (loading || !user || pageLoading) return (
    <main className="mx-auto flex min-h-screen max-w-2xl flex-col px-4 pt-8">
      <div className="flex items-center justify-between"><div className="skeleton h-6 w-24" /><div className="skeleton h-8 w-8 rounded-full" /></div>
      <div className="mt-10 skeleton h-8 w-48" /><div className="mt-2 skeleton h-5 w-64" />
      <div className="mt-8 grid gap-4 sm:grid-cols-3">{[1,2,3].map((i) => <div key={i} className="skeleton h-40 rounded-xl" />)}</div>
    </main>
  );

  const examName = me?.targetExam ? EXAM_BY_SLUG.get(me.targetExam)?.name ?? me.targetExam : null;
  const h = (new Date().getUTCHours() + 5.5) % 24;
  const greeting = h < 12 ? t('greeting.morning') : h < 17 ? t('greeting.afternoon') : t('greeting.evening');
  const firstName = (me?.name ?? user.displayName ?? 'Student').split(' ')[0];

  return (
    <main className="mx-auto flex min-h-screen max-w-2xl flex-col px-4 pt-8 pb-16">
      <header className="flex items-center justify-between">
        <Logo />
        <div className="flex items-center gap-2">

          <button type="button" onClick={() => router.push('/upgrade')} className="flex items-center gap-1 rounded-full bg-amber-50 px-3 py-1.5 text-xs font-bold text-amber-700 hover:bg-amber-100 dark:bg-amber-500/10 dark:text-amber-400">&#x1F48E; {me?.credits ?? 0}</button>
          <button type="button" onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')} className="btn-ghost h-8 w-8 rounded-full p-0" aria-label="Toggle dark mode">
            {theme === 'dark' ? <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z" /></svg> : <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z" /></svg>}
          </button>
          <button type="button" onClick={() => router.push('/profile')} className="h-8 w-8 overflow-hidden rounded-full bg-slate-200 dark:bg-slate-700">
            {me?.photoURL ? <img src={me.photoURL} alt="" className="h-full w-full object-cover" /> : <span className="flex h-full w-full items-center justify-center text-xs font-bold text-slate-500">{firstName?.[0]?.toUpperCase()}</span>}
          </button>
          <button type="button" onClick={() => signOut().then(() => router.replace('/signin'))} className="btn-ghost text-xs">{tc('signOut')}</button>
        </div>
      </header>
      <section className="mt-10">
        <p className="text-sm text-slate-500 dark:text-slate-400">{greeting}, {firstName}</p>
        <h1 className="mt-1 text-2xl font-bold text-slate-900 dark:text-white sm:text-3xl">{t('todaySlate')}</h1>
        {examName && <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">{t('tracking')} <span className="font-medium text-slate-700 dark:text-slate-200">{examName}</span></p>}
      </section>
      <section className="mt-8 grid gap-4 sm:grid-cols-3">
        <button type="button" onClick={() => router.push('/study')} className="card cursor-pointer text-left transition-all hover:border-amber-500/50 hover:shadow-md active:scale-[0.98]"><div className="flex h-10 w-10 items-center justify-center rounded-lg bg-blue-100 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400"><svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" /></svg></div><h3 className="mt-3 font-semibold text-slate-900 dark:text-white">{t('study')}</h3><p className="mt-1 text-xs text-slate-500 dark:text-slate-400">{t('studyDesc')}</p></button>
        <button type="button" onClick={() => router.push('/current-affairs')} className="card cursor-pointer text-left transition-all hover:border-amber-500/50 hover:shadow-md active:scale-[0.98]"><div className="flex h-10 w-10 items-center justify-center rounded-lg bg-green-100 text-green-600 dark:bg-green-900/30 dark:text-green-400"><svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M19 20H5a2 2 0 01-2-2V6a2 2 0 012-2h10a2 2 0 012 2v1m2 13a2 2 0 01-2-2V7m2 13a2 2 0 002-2V9a2 2 0 00-2-2h-2m-4-3H9M7 16h6M7 8h6v4H7V8z" /></svg></div><h3 className="mt-3 font-semibold text-slate-900 dark:text-white">{t('currentAffairs')}</h3><p className="mt-1 text-xs text-slate-500 dark:text-slate-400">{t('currentAffairsDesc')}</p></button>
        <button type="button" onClick={() => router.push('/chat')} className="card cursor-pointer text-left transition-all hover:border-amber-500/50 hover:shadow-md active:scale-[0.98]"><div className="flex h-10 w-10 items-center justify-center rounded-lg bg-purple-100 text-purple-600 dark:bg-purple-900/30 dark:text-purple-400"><svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" /></svg></div><h3 className="mt-3 font-semibold text-slate-900 dark:text-white">{t('nexiAI')}</h3><p className="mt-1 text-xs text-slate-500 dark:text-slate-400">{t('nexiAIDesc')}</p></button>
      </section>
      <section className="mt-6 grid gap-4 sm:grid-cols-3">
        <div className="card"><p className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">{t('statsCredits')}</p><p className="mt-2 text-2xl font-bold tabular-nums text-slate-900 dark:text-white">{me?.credits ?? 0}</p><p className="mt-1 text-xs text-slate-500 dark:text-slate-400">{t('earnMore')}</p></div>
        <div className="card"><p className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">{t('statsStreak')}</p><p className="mt-2 text-2xl font-bold tabular-nums text-slate-900 dark:text-white">{(me?.currentStreak ?? 0) > 0 ? <>{me?.currentStreak} <span className="text-sm font-normal text-slate-500">{tc('days')}</span></> : <span className="text-slate-400">&mdash;</span>}</p><p className="mt-1 text-xs text-slate-500 dark:text-slate-400">{(me?.bestStreak ?? 0) > 0 ? t('best', { days: String(me?.bestStreak ?? 0) }) : t('startStreak')}</p></div>
        <div className="card"><p className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">{t('statsLevel')}</p><p className="mt-2 text-2xl font-bold capitalize text-slate-900 dark:text-white">{me?.onboardingLevel ?? <span className="text-slate-400">&mdash;</span>}</p><p className="mt-1 text-xs text-slate-500 dark:text-slate-400">{me?.plan === 'free' ? tc('level') : me?.plan}</p></div>
      </section>
      {error && <p className="mt-8 text-sm text-red-600 dark:text-red-400" role="alert">{error}</p>}
    </main>
  );
}
