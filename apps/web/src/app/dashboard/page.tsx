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
    window.addEventListener('appinstalled', () => {
      setAppInstalled(true);
      // Record PWA install
      api.recordPwaInstall().catch(() => {});
    });
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
        // If credits appear 0 for a very new user, retry once after a delay
        if ((res.user.credits === 0 || !res.user.credits) && res.user.createdAt) {
          const createdMs = new Date(res.user.createdAt).getTime();
          if (Date.now() - createdMs < 5 * 60 * 1000) {
            setTimeout(async () => {
              try {
                const retry = await api.me();
                if (retry.user.credits > 0) setMe(retry.user);
              } catch {}
            }, 2000);
          }
        }
        // Phone verification mandatory — anti-fake-user gate. Per founder
        // lock §4.5 ("phone OTP forced for fake-user protection"), there is
        // NO local-storage skip path: the bypass that used to live here is
        // gone. The check is anchored on the server-side `phoneVerified`
        // flag (set from the Firebase ID token's verified `phone_number`
        // claim by /v1/users/me), which the client cannot lie about.
        //
        // Backwards compatibility: legacy users created before this flag
        // existed have `phoneVerified === undefined`. We treat undefined
        // as "verified" iff the user has a `phone` string on file, so they
        // are not yanked back into onboarding mid-product. New users who
        // genuinely haven't verified land on /verify-phone.
        const isPhoneVerified =
          res.user.phoneVerified === true ||
          (res.user.phoneVerified === undefined && Boolean(res.user.phone));
        if (!isPhoneVerified) {
          router.replace('/verify-phone');
          return;
        }
        if (!res.user.targetExam) { router.replace('/onboarding/language'); return; }
        // Assessment is mandatory and cannot be skipped by closing the tab
        // mid-quiz (lock §4.5: "assessment force rahega bhai!!"). If the
        // user has picked an exam but never produced an `onboardingLevel`,
        // we send them back to /onboarding/assessment until it completes.
        // Grandfathered users with an exam set but no level on file are
        // also bounced -- one-time cost; once they finish, the guard
        // never fires again.
        if (!res.user.onboardingLevel) {
          router.replace('/onboarding/assessment');
          return;
        }
        // Plan-selection step (PR-05 lock §2.6) is mandatory for new users.
        // The flag is undefined for users grandfathered in before this PR
        // -- we treat undefined as "already chosen" so they aren't bounced
        // back into onboarding mid-product. For new users, false sends
        // them to /onboarding/plan; the page flips it to true on Continue.
        if (res.user.onboardingPlanChosen === false) {
          router.replace('/onboarding/plan');
          return;
        }
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
    <main className="mx-auto flex min-h-dvh max-w-4xl flex-col px-5 pt-6 pb-8 overflow-x-hidden">
      {/* Header */}
      <header className="flex items-center justify-between">
        <Logo height={44} />
        <div className="flex items-center gap-2">
          {installPrompt && !appInstalled && (
            <button onClick={handleInstallApp} className="btn-ghost-sm text-xs flex items-center gap-1">📱 Install</button>
          )}
          {appInstalled && (
            <span className="text-[10px] text-amber-600 font-medium">✓ Installed</span>
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
        {me && (
          <button onClick={() => router.push((me.plan ?? 'free') === 'free' ? '/upgrade' : '/profile')} className="mt-2 inline-flex items-center gap-1 rounded-full px-3 py-1 text-xs font-medium transition-colors hover:opacity-80" style={{ background: (me.plan ?? 'free') === 'free' ? 'var(--color-paper-200)' : undefined, color: (me.plan ?? 'free') === 'free' ? 'var(--color-muted-500)' : undefined }}>
            {(me.plan ?? 'free') === 'free' ? (
              <><span>Free Plan</span><span className="text-amber-500">· Upgrade →</span></>
            ) : (
              <span className="inline-flex items-center gap-1 rounded-full bg-amber-500 px-3 py-1 text-xs font-semibold text-stone-900">⭐ {(me.plan ?? 'free').charAt(0).toUpperCase() + (me.plan ?? 'free').slice(1)} Plan{me.planExpiresAt ? ` · Expires ${new Date(me.planExpiresAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}` : ''}</span>
            )}
          </button>
        )}
        {/* Quick stats inline */}
        <div className="mt-4 flex flex-wrap items-center gap-3 text-sm text-ink-700">
          {(me?.currentStreak ?? 0) > 0 && <span className="flex items-center gap-1">🔥 {me?.currentStreak} {tc('days')} streak</span>}
          <span className="flex items-center gap-1 cursor-pointer hover:opacity-80" onClick={() => router.push('/credits')}>💎 {me?.credits ?? 0} {tc('credits')}</span>
          <span className="flex items-center gap-1 capitalize">📊 {levelLabel}</span>
        </div>
      </section>

      {/* Primary Study CTA - Full width hero card */}
      <section className="mt-8 animate-fadeIn">
        <button
          type="button"
          onClick={() => router.push('/study')}
          className="paper-card card-selectable w-full p-5 text-left hover:shadow-md transition-all group"
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <span className="inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-ember-500/10 text-2xl">📖</span>
              <div>
                <h3 className="font-serif text-lg font-bold text-ink-900">{t('study')}</h3>
                <p className="mt-0.5 text-sm text-muted-500">{t('studyDesc')}</p>
              </div>
            </div>
            <div className="flex items-center gap-1 text-sm font-semibold text-ember-500">
              <span className="hidden sm:inline">Continue</span>
              <svg width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24" className="group-hover:translate-x-1 transition-transform"><path d="M5 12h14M12 5l7 7-7 7"/></svg>
            </div>
          </div>
        </button>
      </section>

      {/* Two Action Cards - Current Affairs + Nexi AI */}
      <section className="mt-3 grid grid-cols-2 gap-3">
        <button
          type="button"
          onClick={() => router.push('/current-affairs')}
          className="paper-card card-selectable p-5 text-left animate-fadeIn-delay-1 hover:shadow-md transition-all group"
        >
          <div className="flex items-center gap-2">
            <span className="inline-flex h-10 w-10 items-center justify-center rounded-xl bg-ember-500/10 text-xl">📰</span>
            <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 dark:bg-amber-900/30 px-2 py-0.5 text-[10px] font-bold text-amber-700 dark:text-amber-400">
              <span className="h-1.5 w-1.5 rounded-full bg-amber-500 animate-pulse" />
              LIVE
            </span>
          </div>
          <h3 className="mt-3 font-serif text-base font-bold text-ink-900">{t('currentAffairs')}</h3>
          <p className="mt-1 text-xs text-muted-500 line-clamp-1">{t('currentAffairsDesc')}</p>
          <div className="mt-2 flex items-center gap-1 text-xs font-medium text-ember-500">
            Read →
            <svg width="12" height="12" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24" className="group-hover:translate-x-0.5 transition-transform"><path d="M5 12h14M12 5l7 7-7 7"/></svg>
          </div>
        </button>

        <button
          type="button"
          onClick={() => router.push('/chat')}
          className="paper-card card-selectable p-5 text-left animate-fadeIn-delay-2 hover:shadow-md transition-all group"
        >
          <span className="inline-flex h-10 w-10 items-center justify-center rounded-xl bg-ember-500/10 text-xl">🤖</span>
          <h3 className="mt-3 font-serif text-base font-bold text-ink-900">{t('nexiAI')}</h3>
          <p className="mt-1 text-xs text-muted-500 line-clamp-1">Ask doubts, get answers</p>
          <div className="mt-2 flex items-center gap-1 text-xs font-medium text-ember-500">
            Chat →
            <svg width="12" height="12" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24" className="group-hover:translate-x-0.5 transition-transform"><path d="M5 12h14M12 5l7 7-7 7"/></svg>
          </div>
        </button>
      </section>

      {/* Quick Actions - Grid layout */}
      <section className="mt-4 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3 animate-fadeIn-delay-2">
        <button type="button" onClick={() => router.push('/essay')} className="paper-card card-selectable flex items-center gap-2.5 px-4 py-3">
          <span className="text-base">✍️</span>
          <div className="text-left">
            <p className="text-sm font-semibold text-ink-900 whitespace-nowrap">Practice Set</p>
            <p className="text-[10px] text-muted-500">Write & grade</p>
          </div>
        </button>
        <button type="button" onClick={() => router.push('/upgrade')} className="paper-card card-selectable flex items-center gap-2.5 px-4 py-3">
          <span className="text-base">⭐</span>
          <div className="text-left">
            <p className="text-sm font-semibold text-ink-900 whitespace-nowrap">Upgrade</p>
            <p className="text-[10px] text-muted-500">Go Pro</p>
          </div>
        </button>
        <button type="button" onClick={() => router.push('/refer')} className="paper-card card-selectable flex items-center gap-2.5 px-4 py-3">
          <span className="text-base">🎁</span>
          <div className="text-left">
            <p className="text-sm font-semibold text-ink-900 whitespace-nowrap">Refer Friends</p>
            <p className="text-[10px] text-muted-500">Earn 50 cr</p>
          </div>
        </button>
        <button type="button" onClick={() => router.push('/support')} className="paper-card card-selectable flex items-center gap-2.5 px-4 py-3">
          <span className="text-base">🛟</span>
          <div className="text-left">
            <p className="text-sm font-semibold text-ink-900 whitespace-nowrap">Support</p>
            <p className="text-[10px] text-muted-500">Get help</p>
          </div>
        </button>
      </section>

      {/* Stats Row - Compact and visual */}
      <section className="mt-5 paper-card p-4 animate-fadeIn-delay-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="text-center">
              <p className="font-serif text-xl font-bold text-ink-900">{me?.credits ?? 0}</p>
              <p className="text-[10px] font-medium uppercase tracking-wider text-muted-500">{t('statsCredits')}</p>
            </div>
            <div className="h-8 w-px bg-line" />
            <div className="text-center">
              <p className="font-serif text-xl font-bold text-ink-900">{(me?.currentStreak ?? 0) > 0 ? me?.currentStreak : '—'}</p>
              <p className="text-[10px] font-medium uppercase tracking-wider text-muted-500">{t('statsStreak')}</p>
            </div>
            <div className="h-8 w-px bg-line" />
            <div className="text-center">
              <p className="font-serif text-lg font-bold capitalize text-ink-900">{me?.onboardingLevel ?? '—'}</p>
              <p className="text-[10px] font-medium uppercase tracking-wider text-muted-500">{t('statsLevel')}</p>
            </div>
          </div>
          <button onClick={() => router.push('/profile/level')} className="btn-ghost-sm text-[11px]">
            <svg width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path d="M9 18l6-6-6-6"/></svg>
          </button>
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
