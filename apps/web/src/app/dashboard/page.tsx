'use client';
import { useEffect, useState, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useTheme } from 'next-themes';
import { EXAM_BY_SLUG, planDisplayName } from '@nexigrate/shared';
import { Logo } from '~/components/Logo';
import { useAuth } from '~/lib/auth-context';
import { useUser } from '~/lib/userStore';
import { api } from '~/lib/api';
import { AILoader } from '~/components/ui/AILoader';
import { OnboardingTour } from '~/components/OnboardingTour';
import { NotificationBell } from '~/components/NotificationBell';

export default function DashboardPage() {
  const t = useTranslations('dashboard');
  const tc = useTranslations('common');
  const { user, loading, signOut } = useAuth();
  const { theme, setTheme } = useTheme();
  const router = useRouter();
  // PR-32: read the persisted user from the shared store. The store
  // hydrates from sessionStorage on first paint and revalidates in the
  // background, so navigation between authenticated pages no longer
  // triggers a fresh /me round-trip per page (~600ms warm, 2-3s cold).
  const { user: me, loading: meLoading, refresh } = useUser();
  const [error, setError] = useState<string | null>(null);
  const [installPrompt, setInstallPrompt] = useState<any>(null);
  const [appInstalled, setAppInstalled] = useState(false);
  // Tracks whether we've already kicked off the one-shot credit-retry
  // for brand-new users whose signup bonus hasn't credited yet.
  const creditRetryFiredRef = useRef(false);
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

  // Onboarding gates + brand-new-user credit retry. Runs whenever the
  // shared store delivers a fresh `me` record. No /me fetch happens
  // here — the store has already resolved it once for the whole app.
  useEffect(() => {
    if (!user || !me) return;
    let cancelled = false;
    setError(null);
    try {
      // If credits appear 0 for a very new user, retry once via the
      // store's refresh() so every subscriber sees the new balance.
      // Single-shot guard prevents a refresh() loop if the bonus is
      // genuinely zero (admin override, etc).
      if (
        !creditRetryFiredRef.current &&
        (me.credits === 0 || !me.credits) &&
        me.createdAt
      ) {
        const createdMs = new Date(me.createdAt).getTime();
        if (Date.now() - createdMs < 5 * 60 * 1000) {
          creditRetryFiredRef.current = true;
          setTimeout(() => { if (!cancelled) void refresh(); }, 2000);
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
        me.phoneVerified === true ||
        (me.phoneVerified === undefined && Boolean(me.phone));
      if (!isPhoneVerified) {
        router.replace('/verify-phone');
        return;
      }
      if (!me.targetExam) { router.replace('/onboarding/language'); return; }
      // Assessment is mandatory and cannot be skipped by closing the tab
      // mid-quiz (lock §4.5: "assessment force rahega bhai!!"). If the
      // user has picked an exam but never produced an `onboardingLevel`,
      // we send them back to /onboarding/assessment until it completes.
      // Grandfathered users with an exam set but no level on file are
      // also bounced -- one-time cost; once they finish, the guard
      // never fires again.
      if (!me.onboardingLevel) {
        router.replace('/onboarding/assessment');
        return;
      }
      // Plan-selection step (PR-05 lock §2.6) is mandatory for new users.
      // The flag is undefined for users grandfathered in before this PR
      // -- we treat undefined as "already chosen" so they aren't bounced
      // back into onboarding mid-product. For new users, false sends
      // them to /onboarding/plan; the page flips it to true on Continue.
      //
      // FIX (onboarding double-plan): if the user already has a paid
      // plan active, never redirect to /onboarding/plan even if the
      // flag is false (e.g. markPlanChosen API call failed during
      // onboarding but Razorpay checkout succeeded). A paid plan is
      // proof the user chose one.
      if (me.onboardingPlanChosen === false && (me.plan === 'free' || !me.plan)) {
        router.replace('/onboarding/plan');
        return;
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load');
    }
    return () => { cancelled = true; };
  }, [user, me, router, refresh]);

  if (loading || !user || meLoading || !me) return (<main className="flex min-h-dvh items-center justify-center"><AILoader context="dashboard" /></main>);

  const examName = me?.targetExam ? EXAM_BY_SLUG.get(me.targetExam)?.name ?? '' : '';
  const h = (new Date().getUTCHours() + 5.5) % 24;
  const greeting = h < 12 ? t('greeting.morning') : h < 17 ? t('greeting.afternoon') : t('greeting.evening');
  const firstName = (me?.name ?? user.displayName ?? 'Student').split(' ')[0];
  const levelLabel = me?.onboardingLevel ?? 'beginner';

  return (
    <main className="mx-auto flex min-h-dvh max-w-4xl flex-col px-5 pt-6 pb-8 overflow-x-hidden">
      {/* Onboarding tour for first-time users */}
      <OnboardingTour />
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
          <NotificationBell />
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
              {tc('preparingFor')}: {examName}
            </span>
          </div>
        )}
        {me && (
          <button onClick={() => router.push((me.plan ?? 'free') === 'free' ? '/upgrade' : '/profile')} className="mt-2 inline-flex items-center gap-1 rounded-full px-3 py-1 text-xs font-medium transition-colors hover:opacity-80" style={{ background: (me.plan ?? 'free') === 'free' ? 'var(--color-paper-200)' : undefined, color: (me.plan ?? 'free') === 'free' ? 'var(--color-muted-500)' : undefined }}>
            {(me.plan ?? 'free') === 'free' ? (
              <><span>{t('freePlan')}</span><span className="text-amber-500">· {t('upgrade')} →</span></>
            ) : (
              <span className="inline-flex items-center gap-1 rounded-full bg-amber-500 px-3 py-1 text-xs font-semibold text-stone-900">⭐ {planDisplayName(me.plan)} {tc('plan')}{me.planExpiresAt ? ` · ${tc('expires')} ${new Date(me.planExpiresAt).toLocaleDateString(me.language === 'hi' ? 'hi-IN' : 'en-IN', { day: 'numeric', month: 'short' })}` : ''}</span>
            )}
          </button>
        )}
        {/* Quick stats inline */}
        <div className="mt-4 flex flex-wrap items-center gap-3 text-sm text-ink-700">
          {(me?.currentStreak ?? 0) > 0 && <span className="flex items-center gap-1">🔥 {me?.currentStreak} {tc('days')} {tc('streak')}</span>}
          <span className="flex items-center gap-1 cursor-pointer hover:opacity-80" onClick={() => router.push('/credits')}>💎 {me?.credits ?? 0} {tc('credits')}</span>
          <span className="flex items-center gap-1 capitalize">📊 {levelLabel}</span>
        </div>

        {/* Zero-credits warning for free plan users */}
        {(me?.plan === 'free' || !me?.plan) && (me?.credits ?? 0) <= 0 && (
          <div className="mt-4 rounded-xl border border-ember-500/30 bg-ember-500/5 p-4">
            <div className="flex items-start gap-3">
              <span className="text-xl flex-shrink-0">⚠️</span>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-ink-900">Credits khatam ho gaye!</p>
                <p className="mt-1 text-xs text-muted-500">
                  Chapters, AI Tutor, aur quizzes use karne ke liye credits chahiye. Upgrade karo ya friends ko refer karo.
                </p>
                <div className="mt-3 flex flex-wrap gap-2">
                  <button onClick={() => router.push('/upgrade')} className="inline-flex items-center gap-1 rounded-full bg-ember-500 px-3.5 py-1.5 text-xs font-semibold text-paper-50 hover:bg-ember-600 transition-colors">
                    ⭐ Upgrade Plan
                  </button>
                  <button onClick={() => router.push('/refer')} className="inline-flex items-center gap-1 rounded-full border border-line bg-paper-50 px-3.5 py-1.5 text-xs font-medium text-ink-900 hover:bg-paper-200 transition-colors">
                    🎁 Refer & Earn
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
      </section>

      {/* Exam countdown — days remaining to the user's target exam */}
      {me?.targetExam && <ExamCountdown examSlug={me.targetExam} onOpen={() => router.push('/exam-calendar')} />}

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
              <span className="hidden sm:inline">{tc('continue')}</span>
              <svg width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24" className="group-hover:translate-x-1 transition-transform"><path d="M5 12h14M12 5l7 7-7 7"/></svg>
            </div>
          </div>
        </button>
      </section>

      {/* Core features — Current Affairs · Nexi AI · Mock Tests · PYQ.
          Promotes the two test-prep surfaces (Mock Tests, PYQ) from the
          small quick-action chips into first-class feature cards so they
          sit alongside Current Affairs + Nexi AI. 2-up on phones,
          4-up on laptops. */}
      <section className="mt-3 grid grid-cols-2 gap-3 lg:grid-cols-4">
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
            {t('read')} →
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
          <p className="mt-1 text-xs text-muted-500 line-clamp-1">{t('nexiAIDesc')}</p>
          <div className="mt-2 flex items-center gap-1 text-xs font-medium text-ember-500">
            {tc('chat')} →
            <svg width="12" height="12" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24" className="group-hover:translate-x-0.5 transition-transform"><path d="M5 12h14M12 5l7 7-7 7"/></svg>
          </div>
        </button>

        <button
          type="button"
          onClick={() => router.push('/mock-tests')}
          className="paper-card card-selectable p-5 text-left animate-fadeIn-delay-2 hover:shadow-md transition-all group"
        >
          <span className="inline-flex h-10 w-10 items-center justify-center rounded-xl bg-ember-500/10 text-xl">🧪</span>
          <h3 className="mt-3 font-serif text-base font-bold text-ink-900">{t('mockTests')}</h3>
          <p className="mt-1 text-xs text-muted-500 line-clamp-1">{t('mockTestsDesc')}</p>
          <div className="mt-2 flex items-center gap-1 text-xs font-medium text-ember-500">
            {me?.language === 'hi' ? 'शुरू करें' : 'Start'} →
            <svg width="12" height="12" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24" className="group-hover:translate-x-0.5 transition-transform"><path d="M5 12h14M12 5l7 7-7 7"/></svg>
          </div>
        </button>

        <button
          type="button"
          onClick={() => router.push('/pyq')}
          className="paper-card card-selectable p-5 text-left animate-fadeIn-delay-2 hover:shadow-md transition-all group"
        >
          <div className="flex items-center gap-2">
            <span className="inline-flex h-10 w-10 items-center justify-center rounded-xl bg-ember-500/10 text-xl">📄</span>
            <span className="inline-flex items-center gap-1 rounded-full bg-ember-500/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-ember-600">New</span>
          </div>
          <h3 className="mt-3 font-serif text-base font-bold text-ink-900">{me?.language === 'hi' ? 'पिछले वर्ष' : 'PYQ Papers'}</h3>
          <p className="mt-1 text-xs text-muted-500 line-clamp-1">{me?.language === 'hi' ? 'पिछले वर्ष के प्रश्न' : 'Previous year questions'}</p>
          <div className="mt-2 flex items-center gap-1 text-xs font-medium text-ember-500">
            {t('read')} →
            <svg width="12" height="12" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24" className="group-hover:translate-x-0.5 transition-transform"><path d="M5 12h14M12 5l7 7-7 7"/></svg>
          </div>
        </button>
      </section>

      {/* Quick Actions - Grid layout. Mock Tests + PYQ live in the
          "Core features" grid above; these are the secondary shortcuts. */}
      <section className="mt-4 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3 animate-fadeIn-delay-2">
        <button type="button" onClick={() => router.push('/leaderboard')} className="paper-card card-selectable flex items-center gap-2.5 px-4 py-3 min-h-[68px]">
          <span className="text-base flex-shrink-0">🏆</span>
          <div className="text-left min-w-0">
            <p className="text-sm font-semibold text-ink-900 whitespace-nowrap">{t('leaderboard')}</p>
            <p className="text-[10px] text-muted-500 truncate">{t('quizScores')}</p>
          </div>
        </button>
        <button type="button" onClick={() => router.push('/essay')} className="paper-card card-selectable flex items-center gap-2.5 px-4 py-3 min-h-[68px]">
          <span className="text-base flex-shrink-0">✍️</span>
          <div className="text-left min-w-0">
            <p className="text-sm font-semibold text-ink-900 whitespace-nowrap">{t('essay')}</p>
            <p className="text-[10px] text-muted-500 truncate">{t('essayDesc')}</p>
          </div>
        </button>
        <button type="button" onClick={() => router.push('/upgrade')} className="paper-card card-selectable flex items-center gap-2.5 px-4 py-3 min-h-[68px]">
          <span className="text-base flex-shrink-0">⭐</span>
          <div className="text-left min-w-0">
            <p className="text-sm font-semibold text-ink-900 whitespace-nowrap">{t('upgrade')}</p>
            <p className="text-[10px] text-muted-500 truncate">{t('upgradeDesc')}</p>
          </div>
        </button>
        <button type="button" onClick={() => router.push('/refer')} className="paper-card card-selectable flex items-center gap-2.5 px-4 py-3 min-h-[68px]">
          <span className="text-base flex-shrink-0">🎁</span>
          <div className="text-left min-w-0">
            <p className="text-sm font-semibold text-ink-900 whitespace-nowrap">{t('refer')}</p>
            <p className="text-[10px] text-muted-500 truncate">{t('referDesc')}</p>
          </div>
        </button>
        <button type="button" onClick={() => router.push('/support')} className="paper-card card-selectable flex items-center gap-2.5 px-4 py-3 min-h-[68px]">
          <span className="text-base flex-shrink-0">🛟</span>
          <div className="text-left min-w-0">
            <p className="text-sm font-semibold text-ink-900 whitespace-nowrap">{t('support')}</p>
            <p className="text-[10px] text-muted-500 truncate">{t('supportDesc')}</p>
          </div>
        </button>
      </section>

      {/* Stats Row - Compact and visual */}
      <section className="mt-5 paper-card p-4 animate-fadeIn-delay-2">
        <div className="flex items-center justify-between overflow-x-auto">
          <div className="flex items-center gap-3 sm:gap-4 min-w-0">
            <div className="text-center flex-shrink-0">
              <p className="font-serif text-xl font-bold text-ink-900 tabular-nums">{me?.credits ?? 0}</p>
              <p className="text-[10px] font-medium uppercase tracking-wider text-muted-500">{t('statsCredits')}</p>
            </div>
            <div className="h-8 w-px bg-line flex-shrink-0" />
            <div className="text-center flex-shrink-0">
              <p className="font-serif text-xl font-bold text-ink-900 tabular-nums">{(me?.currentStreak ?? 0) > 0 ? me?.currentStreak : '—'}</p>
              <p className="text-[10px] font-medium uppercase tracking-wider text-muted-500">{t('statsStreak')}</p>
            </div>
            <div className="h-8 w-px bg-line flex-shrink-0" />
            <div className="text-center flex-shrink-0">
              <p className="font-serif text-lg font-bold capitalize text-ink-900">{me?.onboardingLevel ?? '—'}</p>
              <p className="text-[10px] font-medium uppercase tracking-wider text-muted-500">{t('statsLevel')}</p>
            </div>
          </div>
          <button onClick={() => router.push('/profile/level')} className="btn-ghost-sm text-[11px] flex-shrink-0 ml-2">
            <svg width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path d="M9 18l6-6-6-6"/></svg>
          </button>
        </div>
      </section>

      {/* Admin Panel button */}
      {(me?.role === 'admin') && (
        <section className="mt-4">
          <button type="button" onClick={() => router.push('/admin')} className="paper-card card-selectable p-4 w-full text-left border border-ember-500/40 flex items-center gap-3">
            <span className="inline-flex h-9 w-9 items-center justify-center rounded-lg bg-ember-500/10 flex-shrink-0">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-ember-500"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>
            </span>
            <div className="min-w-0">
              <h3 className="font-serif font-semibold text-ink-900">Admin Panel</h3>
              <p className="text-xs text-muted-500">Manage platform</p>
            </div>
            <svg width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24" className="ml-auto text-ember-500 flex-shrink-0"><path d="M9 18l6-6-6-6"/></svg>
          </button>
        </section>
      )}

      {error && <div className="banner banner-error mt-6">{error}</div>}
    </main>
  );
}


/**
 * Compact exam-countdown card. Self-contained (fetches its own data) so it
 * never blocks the dashboard's main load. Shows days remaining to the
 * nearest upcoming event for the user's target exam, or the estimate when
 * the date isn't officially confirmed yet.
 */
function ExamCountdown({ examSlug, onOpen }: { examSlug: string; onOpen: () => void }) {
  const [info, setInfo] = useState<{ examName: string; eventName: string; days: number | null; estimate: string; confirmed: boolean } | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const data = await api.getExamDatesFor(examSlug);
        if (cancelled || !data.events || data.events.length === 0) return;
        const today = new Date(); today.setHours(0, 0, 0, 0);
        const withDays = data.events.map((e) => {
          const d = e.date ? Math.ceil((new Date(e.date).getTime() - today.getTime()) / 86_400_000) : null;
          return { e, d };
        });
        // Prefer the nearest future confirmed date; else the first event.
        const upcoming = withDays.filter(x => x.d !== null && x.d >= 0).sort((a, b) => (a.d! - b.d!))[0] ?? withDays[0];
        if (!upcoming) return;
        setInfo({
          examName: data.examName,
          eventName: upcoming.e.name,
          days: upcoming.d,
          estimate: upcoming.e.estimatedMonth || 'TBA',
          confirmed: upcoming.e.isConfirmed,
        });
      } catch { /* non-critical widget — stay hidden on error */ }
    })();
    return () => { cancelled = true; };
  }, [examSlug]);

  if (!info) return null;

  return (
    <section className="mt-4">
      <button type="button" onClick={onOpen} className="paper-card card-selectable w-full p-4 text-left hover:shadow-md transition-all">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <span className="inline-flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-xl bg-ember-500/10 text-xl">📅</span>
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold text-ink-900">{info.examName} · {info.eventName}</p>
              <p className="mt-0.5 text-xs text-muted-500">
                {info.confirmed && info.days !== null
                  ? `${info.days} days to go`
                  : `Estimated: ${info.estimate}`}
                {!info.confirmed && <span className="ml-1.5 rounded-full bg-gold-500/10 px-1.5 py-0.5 text-[10px] text-gold-700">estimate</span>}
              </p>
            </div>
          </div>
          {info.confirmed && info.days !== null && info.days >= 0 ? (
            <div className="text-right">
              <p className="font-serif text-2xl font-bold text-ember-600">{info.days}</p>
              <p className="text-[10px] uppercase tracking-wider text-muted-400">days left</p>
            </div>
          ) : (
            <span className="text-sm font-semibold text-ember-500">View →</span>
          )}
        </div>
      </button>
    </section>
  );
}
