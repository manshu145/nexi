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
      try { const res = await api.me(); if (c) return; setMe(res.user); if (!res.user.targetExam) { router.replace('/onboarding/language'); return; } }
      catch (e) { if (c) return; setError(e instanceof Error ? e.message : 'Failed to load'); }
      finally { if (!c) setPageLoading(false); }
    })(); return () => { c = true; };
  }, [user, router]);

  if (loading || !user || pageLoading) return (<main className="flex min-h-dvh items-center justify-center"><span className="spinner" /></main>);

  const examName = me?.targetExam ? EXAM_BY_SLUG.get(me.targetExam)?.name ?? '' : '';
  const h = (new Date().getUTCHours() + 5.5) % 24;
  const greeting = h < 12 ? t('greeting.morning') : h < 17 ? t('greeting.afternoon') : t('greeting.evening');
  const firstName = (me?.name ?? user.displayName ?? 'Student').split(' ')[0];

  return (
    <main className="mx-auto flex min-h-dvh max-w-lg flex-col px-5 pt-6 pb-28">
      <header className="flex items-center justify-between"><Logo /><div className="flex items-center gap-2"><button onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')} className="btn-ghost-sm" aria-label="Toggle theme">{theme === 'dark' ? '☀️' : '🌙'}</button><button onClick={() => router.push('/profile')} className="btn-ghost-sm">👤</button><button onClick={() => signOut().then(() => router.replace('/signin'))} className="btn-ghost-sm">{tc('signOut')}</button></div></header>
      <section className="mt-6"><p className="text-sm text-muted-500">{greeting}, <span className="font-semibold text-ink-900">{firstName}</span></p><h1 className="font-serif mt-1 text-2xl font-bold text-ink-900">{examName}</h1></section>
      <div className="mt-4 flex gap-2"><span className="pill">💎 {me?.credits ?? 0} {tc('credits')}</span>{(me?.currentStreak ?? 0) > 0 && <span className="pill">🔥 {me?.currentStreak} {tc('days')}</span>}</div>
      <section className="mt-8 grid gap-3 sm:grid-cols-3">
        <button type="button" onClick={() => router.push('/study')} className="paper-card card-selectable p-5 text-left animate-fadeIn hover:scale-[1.02] transition-transform"><span className="text-2xl">📖</span><h3 className="mt-2 font-serif font-semibold text-ink-900">{t('study')}</h3><p className="mt-1 text-xs text-muted-500">{t('studyDesc')}</p></button>
        <button type="button" onClick={() => router.push('/current-affairs')} className="paper-card card-selectable p-5 text-left animate-fadeIn-delay-1 hover:scale-[1.02] transition-transform"><span className="text-2xl">📰</span><h3 className="mt-2 font-serif font-semibold text-ink-900">{t('currentAffairs')}</h3><p className="mt-1 text-xs text-muted-500">{t('currentAffairsDesc')}</p></button>
        <button type="button" onClick={() => router.push('/nexi')} className="paper-card card-selectable p-5 text-left animate-fadeIn-delay-2 hover:scale-[1.02] transition-transform"><span className="text-2xl">🤖</span><h3 className="mt-2 font-serif font-semibold text-ink-900">{t('nexiAI')}</h3><p className="mt-1 text-xs text-muted-500">{t('nexiAIDesc')}</p></button>
        <button type="button" onClick={() => router.push('/chat')} className="paper-card card-selectable p-5 text-left animate-fadeIn hover:scale-[1.02] transition-transform"><span className="text-2xl">💬</span><h3 className="mt-2 font-serif font-semibold text-ink-900">Nexi Chat</h3><p className="mt-1 text-xs text-muted-500">AI-powered conversation for doubts</p></button>
        <button type="button" onClick={() => router.push('/upgrade')} className="paper-card card-selectable p-5 text-left animate-fadeIn-delay-1 hover:scale-[1.02] transition-transform"><span className="text-2xl">⭐</span><h3 className="mt-2 font-serif font-semibold text-ink-900">Upgrade</h3><p className="mt-1 text-xs text-muted-500">Unlock premium features</p></button>
        <button type="button" onClick={() => router.push('/support')} className="paper-card card-selectable p-5 text-left animate-fadeIn-delay-2 hover:scale-[1.02] transition-transform"><span className="text-2xl">🛟</span><h3 className="mt-2 font-serif font-semibold text-ink-900">Support</h3><p className="mt-1 text-xs text-muted-500">Get help with any issues</p></button>
      </section>
      <section className="mt-6 grid gap-3 sm:grid-cols-3">
        <div className="paper-card p-4"><p className="text-xs font-semibold uppercase tracking-wider text-muted-500">{t('statsCredits')}</p><p className="font-serif mt-2 text-2xl font-bold text-ink-900">{me?.credits ?? 0}</p><p className="mt-1 text-xs text-muted-500">{t('earnMore')}</p></div>
        <div className="paper-card p-4"><p className="text-xs font-semibold uppercase tracking-wider text-muted-500">{t('statsStreak')}</p><p className="font-serif mt-2 text-2xl font-bold text-ink-900">{(me?.currentStreak ?? 0) > 0 ? `${me?.currentStreak} ${tc('days')}` : '—'}</p><p className="mt-1 text-xs text-muted-500">{(me?.bestStreak ?? 0) > 0 ? t('best', { days: String(me?.bestStreak ?? 0) }) : t('startStreak')}</p></div>
        <div className="paper-card p-4"><p className="text-xs font-semibold uppercase tracking-wider text-muted-500">{t('statsLevel')}</p><p className="font-serif mt-2 text-2xl font-bold capitalize text-ink-900">{me?.onboardingLevel ?? '—'}</p><p className="mt-1 text-xs text-muted-500">{me?.plan === 'free' ? tc('level') : me?.plan}</p></div>
      </section>
      {error && <div className="banner banner-error mt-6">{error}</div>}
    </main>
  );
}
