'use client';
import { useEffect, useState, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useTheme } from 'next-themes';
import { EXAM_BY_SLUG } from '@nexigrate/shared';
import { Logo } from '~/components/Logo';
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
  const [installPrompt, setInstallPrompt] = useState<any>(null);
  const [appInstalled, setAppInstalled] = useState(false);
  const deferredPromptRef = useRef<any>(null);

  // PWA install prompt
  useEffect(() => {
    const handler = (e: Event) => {
      e.preventDefault();
      deferredPromptRef.current = e;
      setInstallPrompt(e);
    };
    window.addEventListener('beforeinstallprompt', handler);
    window.addEventListener('appinstalled', () => setAppInstalled(true));
    return () => window.removeEventListener('beforeinstallprompt', handler);
  }, []);

  const handleInstallApp = async () => {
    const prompt = deferredPromptRef.current;
    if (!prompt) return;
    prompt.prompt();
    const result = await prompt.userChoice;
    if (result.outcome === 'accepted') setAppInstalled(true);
    setInstallPrompt(null);
    deferredPromptRef.current = null;
  };

  useEffect(() => { if (!loading && !user) router.replace('/signin'); }, [user, loading, router]);
  useEffect(() => {
    if (!user) return; let c = false;
    (async () => {
      try {
        const res = await api.me();
        if (c) return;
        setMe(res.user);
        // Phone verification mandatory — redirect if not verified
        if (!res.user.phone && !user.phoneNumber) {
          // Grace period: allow skip once for 24hrs
          const skipTs = localStorage.getItem('phoneVerifySkipUntil');
          if (!skipTs || Date.now() > Number(skipTs)) {
            router.replace('/verify-phone');
            return;
          }
        }
        if (!res.user.targetExam) { router.replace('/onboarding/language'); return; }
      }
      catch (e) { if (c) return; setError(e instanceof Error ? e.message : 'Failed to load'); }
      finally { if (!c) setPageLoading(false); }
    })(); return () => { c = true; };
  }, [user, router]);

  if (loading || !user || pageLoading) return (<main className="flex min-h-dvh items-center justify-center"><AILoader context="dashboard" /></main>);

  const examName = me?.targetExam ? EXAM_BY_SLUG.get(me.targetExam)?.name ?? '' : '';
  const h = (new Date().getUTCHours() + 5.5) % 24;
  const greeting = h < 12 ? t('greeting.morning') : h < 17 ? t('greeting.afternoon') : t('greeting.evening');
  const firstName = (me?.name ?? user.displayName ?? 'Student').split(' ')[0];
  const levelLabel = me?.onboardingLevel ?? 'beginner';

  return (
    <main className="mx-auto flex min-h-dvh max-w-lg flex-col px-5 pt-6 pb-8">
      {/* Header */}
      <header className="flex items-center justify-between">
        <Logo />
        <div className="flex items-center gap-2">
          {installPrompt && !appInstalled && (
            <button onClick={handleInstallApp} className="btn-ghost-sm text-xs flex items-center gap-1">📱 Install</button>
          )}
          {appInstalled && (
            <span className="text-[10px] text-emerald-600 font-medium">✓ Installed</span>
          )}
          <button onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')} className="btn-ghost-sm" aria-label="Toggle theme">{theme === 'dark' ? '☀️' : '🌙'}</button>
          <button onClick={() => router.push('/profile')} className="h-9 w-9 overflow-hidden rounded-full bg-paper-300 border border-line flex items-center justify-center">
            {user.photoURL ? <img src={user.photoURL} alt="" className="h-full w-full object-cover" /> : <span className="text-sm font-bold text-ink-800">{firstName?.[0]?.toUpperCase()}</span>}
          </button>
        </div>
      </header>

      {/* Hero greeting */}
      <section className="mt-8">
        <h1 className="font-serif text-2xl font-bold text-ink-900">{greeting}, {firstName}! 👋</h1>
        {examName && (
          <div className="mt-3">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-ember-500 px-3.5 py-1.5 text-xs font-semibold text-paper-50">
              Preparing for: {examName}
            </span>
          </div>
        )}
        {/* Quick stats inline */}
        <div className="mt-4 flex flex-wrap items-center gap-3 text-sm text-ink-700">
          {(me?.currentStreak ?? 0) > 0 && <span className="flex items-center gap-1">🔥 {me?.currentStreak} {tc('days')} streak</span>}
          <span className="flex items-center gap-1">💎 {me?.credits ?? 0} {tc('credits')}</span>
          <span className="flex items-center gap-1 capitalize">📊 {levelLabel}</span>
        </div>
      </section>

      {/* 3 Primary Action Cards */}
      <section className="mt-8 grid gap-4 sm:grid-cols-3">
        {/* Study */}
        <button
          type="button"
          onClick={() => router.push('/study')}
          className="paper-card card-selectable p-6 text-left animate-fadeIn hover:shadow-md transition-all group"
        >
          <span className="inline-flex h-10 w-10 items-center justify-center rounded-xl bg-ember-500/10 text-xl">📖</span>
          <h3 className="mt-3 font-serif text-lg font-bold text-ink-900">{t('study')}</h3>
          <p className="mt-1 text-xs text-muted-500">{t('studyDesc')}</p>
          <div className="mt-3 flex items-center gap-1 text-xs font-medium text-ember-500">
            Continue →
            <svg width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24" className="group-hover:translate-x-0.5 transition-transform"><path d="M5 12h14M12 5l7 7-7 7"/></svg>
          </div>
        </button>

        {/* Current Affairs */}
        <button
          type="button"
          onClick={() => router.push('/current-affairs')}
          className="paper-card card-selectable p-6 text-left animate-fadeIn-delay-1 hover:shadow-md transition-all group"
        >
          <div className="flex items-center gap-2">
            <span className="inline-flex h-10 w-10 items-center justify-center rounded-xl bg-ember-500/10 text-xl">📰</span>
            <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 dark:bg-emerald-900/30 px-2 py-0.5 text-[10px] font-bold text-emerald-700 dark:text-emerald-400">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
              LIVE
            </span>
          </div>
          <h3 className="mt-3 font-serif text-lg font-bold text-ink-900">{t('currentAffairs')}</h3>
          <p className="mt-1 text-xs text-muted-500">{t('currentAffairsDesc')}</p>
          <div className="mt-3 flex items-center gap-1 text-xs font-medium text-ember-500">
            Read now →
            <svg width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24" className="group-hover:translate-x-0.5 transition-transform"><path d="M5 12h14M12 5l7 7-7 7"/></svg>
          </div>
        </button>

        {/* Nexi AI */}
        <button
          type="button"
          onClick={() => router.push('/chat')}
          className="paper-card card-selectable p-6 text-left animate-fadeIn-delay-2 hover:shadow-md transition-all group"
        >
          <span className="inline-flex h-10 w-10 items-center justify-center rounded-xl bg-ember-500/10 text-xl">🤖</span>
          <h3 className="mt-3 font-serif text-lg font-bold text-ink-900">{t('nexiAI')}</h3>
          <p className="mt-1 text-xs text-muted-500">Ask doubts, get explanations</p>
          <div className="mt-3 flex items-center gap-1 text-xs font-medium text-ember-500">
            Chat now →
            <svg width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24" className="group-hover:translate-x-0.5 transition-transform"><path d="M5 12h14M12 5l7 7-7 7"/></svg>
          </div>
        </button>
      </section>

      {/* Secondary Row */}
      <section className="mt-4 grid grid-cols-3 gap-3">
        <button type="button" onClick={() => router.push('/upgrade')} className="paper-card card-selectable p-4 text-left animate-fadeIn-delay-1">
          <span className="text-lg">⭐</span>
          <h3 className="mt-1 text-sm font-semibold text-ink-900">Upgrade</h3>
          <p className="mt-0.5 text-[10px] text-muted-500">Premium features</p>
        </button>
        <button type="button" onClick={() => router.push('/profile#referral')} className="paper-card card-selectable p-4 text-left animate-fadeIn-delay-1">
          <span className="text-lg">🎁</span>
          <h3 className="mt-1 text-sm font-semibold text-ink-900">Refer & Earn</h3>
          <p className="mt-0.5 text-[10px] text-muted-500">Earn 50 credits</p>
        </button>
        <button type="button" onClick={() => router.push('/support')} className="paper-card card-selectable p-4 text-left animate-fadeIn-delay-2">
          <span className="text-lg">🛟</span>
          <h3 className="mt-1 text-sm font-semibold text-ink-900">Support</h3>
          <p className="mt-0.5 text-[10px] text-muted-500">Get help</p>
        </button>
      </section>

      {/* Stats Row */}
      <section className="mt-6 grid grid-cols-3 gap-3">
        <div className="paper-card p-4">
          <p className="text-xs font-semibold uppercase tracking-wider text-muted-500">{t('statsCredits')}</p>
          <p className="font-serif mt-2 text-2xl font-bold text-ink-900">{me?.credits ?? 0}</p>
          <p className="mt-1 text-xs text-muted-500">{t('earnMore')}</p>
        </div>
        <div className="paper-card p-4">
          <p className="text-xs font-semibold uppercase tracking-wider text-muted-500">{t('statsStreak')}</p>
          <p className="font-serif mt-2 text-2xl font-bold text-ink-900">{(me?.currentStreak ?? 0) > 0 ? `${me?.currentStreak} ${tc('days')}` : '—'}</p>
          <p className="mt-1 text-xs text-muted-500">{(me?.bestStreak ?? 0) > 0 ? t('best', { days: String(me?.bestStreak ?? 0) }) : t('startStreak')}</p>
        </div>
        <div className="paper-card p-4 cursor-pointer hover:bg-paper-200 transition-colors" onClick={() => router.push('/profile/level')}>
          <p className="text-xs font-semibold uppercase tracking-wider text-muted-500">{t('statsLevel')}</p>
          <p className="font-serif mt-2 text-2xl font-bold capitalize text-ink-900">{me?.onboardingLevel ?? '—'}</p>
          <p className="mt-1 text-xs text-ember-500 font-medium">View details →</p>
        </div>
      </section>

      {/* Admin Panel button */}
      {(me?.role === 'admin') && (
        <section className="mt-4">
          <button type="button" onClick={() => router.push('/admin')} className="paper-card card-selectable p-4 w-full text-left border-ember-500 flex items-center gap-3">
            <span className="inline-flex h-9 w-9 items-center justify-center rounded-lg bg-ember-500/10">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-ember-500"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>
            </span>
            <div>
              <h3 className="font-serif font-semibold text-ink-900">Admin Panel</h3>
              <p className="text-xs text-muted-500">Manage platform</p>
            </div>
          </button>
        </section>
      )}

      {error && <div className="banner banner-error mt-6">{error}</div>}
    </main>
  );
}
