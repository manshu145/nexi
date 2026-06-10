'use client';
import { useEffect, useState, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useTheme } from 'next-themes';
import { EXAM_BY_SLUG, planDisplayName, type ExamSlug } from '@nexigrate/shared';
import { Logo } from '~/components/Logo';
import { useAuth } from '~/lib/auth-context';
import { useUser } from '~/lib/userStore';
import { api } from '~/lib/api';
import { AILoader } from '~/components/ui/AILoader';
import { track } from '~/lib/analytics';
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
  const { user: me, loading: meLoading, refresh, mutate } = useUser();
  const [error, setError] = useState<string | null>(null);
  const [installPrompt, setInstallPrompt] = useState<any>(null);
  const [appInstalled, setAppInstalled] = useState(false);
  const [switchingExam, setSwitchingExam] = useState(false);
  // Tracks whether we've already kicked off the one-shot credit-retry
  // for brand-new users whose signup bonus hasn't credited yet.
  const creditRetryFiredRef = useRef(false);
  // One-shot guard: before bouncing a user BACK into onboarding we force
  // exactly one fresh /me (the shared store doesn't refetch on navigation,
  // so a user who JUST finished a step can arrive with a stale record).
  // This ref stops that forced refresh from looping forever.
  const onboardingRecheckedRef = useRef(false);
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

      // Work out which (if any) onboarding step still looks incomplete on
      // the record we currently hold. Order matters: phone → exam →
      // assessment → plan. `onboardingPlanChosen === undefined` is treated
      // as "already chosen" (grandfathered users); a paid plan is also
      // proof a plan was chosen (double-plan fix), so we only bounce to
      // /onboarding/plan when the flag is explicitly false AND the user is
      // still on free.
      const bounceTo =
        !isPhoneVerified ? '/verify-phone'
        : !me.targetExam ? '/onboarding/language'
        : !me.onboardingLevel ? '/onboarding/assessment'
        : (me.onboardingPlanChosen === false && (me.plan === 'free' || !me.plan)) ? '/onboarding/plan'
        : null;

      if (bounceTo) {
        // CRITICAL (founder report: "plan select karne ke baad fir se
        // assessment ke page me chala ja raha hai"). The shared user store
        // does NOT refetch on navigation — it serves the sessionStorage
        // snapshot taken at login and only revalidates on a 5-min timer /
        // tab-visibility change. A user who JUST finished assessment (or
        // plan, or phone) therefore lands here with a STALE record whose
        // onboardingLevel / onboardingPlanChosen is still empty, and the
        // guard wrongly throws them back into onboarding.
        //
        // Before bouncing BACKWARD, force exactly one fresh /me. If the
        // server confirms the step is genuinely incomplete, the effect
        // re-runs on the fresh record and the redirect fires then. The
        // ref guarantees we never loop (one forced refresh per mount).
        if (!onboardingRecheckedRef.current) {
          onboardingRecheckedRef.current = true;
          void refresh();
          return;
        }
        router.replace(bounceTo);
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

  // Multi-exam (Sprint 5): the enrolled set is [targetExam, ...secondaryExams].
  // When the user has more than one, the hero badge becomes a switcher.
  const enrolledExams = [me?.targetExam, ...((me?.secondaryExams ?? []))].filter(Boolean) as ExamSlug[];
  const handleSwitchExam = async (slug: string) => {
    if (!slug || slug === me?.targetExam || switchingExam) return;
    setSwitchingExam(true);
    try {
      const { user: updated } = await api.manageExam('switch', slug);
      mutate(() => updated);
      void refresh();
    } catch {
      /* toast handled below via no-op; keep dashboard resilient */
    } finally {
      setSwitchingExam(false);
    }
  };

  return (
    <main className="mx-auto flex min-h-dvh max-w-4xl flex-col px-5 pt-6 pb-24 overflow-x-hidden">
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
            <span className="text-[10px] text-gold-600 font-medium">✓ Installed</span>
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
            {enrolledExams.length > 1 ? (
              <label className="inline-flex items-center gap-1.5 rounded-full bg-ember-500 px-3.5 py-1.5 text-xs font-semibold text-paper-50">
                {tc('preparingFor')}:
                <select
                  value={me?.targetExam ?? ''}
                  onChange={(e) => void handleSwitchExam(e.target.value)}
                  disabled={switchingExam}
                  aria-label="Switch active exam"
                  className="cursor-pointer rounded-md bg-transparent font-semibold text-paper-50 focus:outline-none disabled:opacity-60"
                >
                  {enrolledExams.map((slug) => (
                    <option key={slug} value={slug} className="text-ink-900">
                      {EXAM_BY_SLUG.get(slug)?.name ?? slug}
                    </option>
                  ))}
                </select>
                {switchingExam && <span className="opacity-80">…</span>}
              </label>
            ) : (
              <span className="inline-flex items-center gap-1.5 rounded-full bg-ember-500 px-3.5 py-1.5 text-xs font-semibold text-paper-50">
                {tc('preparingFor')}: {examName}
              </span>
            )}
          </div>
        )}
        {me && (
          <button onClick={() => router.push((me.plan ?? 'free') === 'free' ? '/upgrade' : '/profile')} className={`mt-2 inline-flex items-center gap-1 rounded-full px-3 py-1 text-xs font-medium transition-colors hover:opacity-80 ${(me.plan ?? 'free') === 'free' ? 'bg-paper-200 text-muted-500' : ''}`}>
            {(me.plan ?? 'free') === 'free' ? (
              <><span>{t('freePlan')}</span><span className="text-ember-500">· {t('upgrade')} →</span></>
            ) : (
              <span className="inline-flex items-center gap-1 rounded-full bg-gold-500 px-3 py-1 text-xs font-semibold text-paper-50">⭐ {planDisplayName(me.plan)} {tc('plan')}{me.planExpiresAt ? ` · ${tc('expires')} ${new Date(me.planExpiresAt).toLocaleDateString(me.language === 'hi' ? 'hi-IN' : 'en-IN', { day: 'numeric', month: 'short' })}` : ''}</span>
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
                <p className="text-sm font-semibold text-ink-900">{me?.language === 'hi' ? 'क्रेडिट खत्म हो गए!' : 'You\'re out of credits!'}</p>
                <p className="mt-1 text-xs text-muted-500">
                  {me?.language === 'hi'
                    ? 'चैप्टर, AI ट्यूटर और क्विज़ इस्तेमाल करने के लिए क्रेडिट चाहिए। अपग्रेड करें या दोस्तों को रेफर करें।'
                    : 'You need credits to use chapters, the AI tutor and quizzes. Upgrade your plan or refer friends to earn more.'}
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
      {/* Today strip — exam countdown, daily plan & revision grouped into
          one tight cluster instead of three separate full-width banners. */}
      <div className="mt-5 space-y-2.5">
        {me?.targetExam && <ExamCountdown examSlug={me.targetExam} onOpen={() => router.push('/exam-calendar')} />}
        {me?.targetExam && <DailyPlanCard examSlug={me.targetExam} onOpen={() => router.push('/plan')} />}
        <ReviseTodayCard onOpen={() => router.push('/revise')} />
      </div>

      {/* Primary Study CTA - Full width hero card */}
      <section className="mt-8 animate-fadeIn">
        <button
          type="button"
          onClick={() => { track('feature_click', { feature: 'study' }); router.push('/study'); }}
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

      {/* Explore — one unified, equal-height grid for every feature.
          Replaces the old split "core features" + "quick actions" sections
          so all cards share a single visual system and line up cleanly at
          every width (2-up phones, 3-up tablet, 4-up laptop). Equal heights
          come from `h-full flex flex-col` + `mt-auto` on the CTA row. */}
      <section className="mt-6 animate-fadeIn-delay-1">
        <h2 className="text-xs font-bold uppercase tracking-wider text-muted-500">{me?.language === 'hi' ? 'एक्सप्लोर करें' : 'Explore'}</h2>
        <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {/* Current Affairs */}
          <button type="button" onClick={() => { track('feature_click', { feature: 'current_affairs' }); router.push('/current-affairs'); }} className="paper-card card-selectable group flex h-full flex-col p-4 text-left transition-all hover:shadow-md">
            <div className="flex items-center gap-2">
              <span className="inline-flex h-10 w-10 items-center justify-center rounded-xl bg-ember-500/10 text-xl">📰</span>
              <span className="inline-flex items-center gap-1 rounded-full bg-ember-500/10 px-2 py-0.5 text-[10px] font-bold text-ember-600"><span className="h-1.5 w-1.5 rounded-full bg-ember-500 animate-pulse" />LIVE</span>
            </div>
            <h3 className="mt-3 font-serif text-base font-bold text-ink-900">{t('currentAffairs')}</h3>
            <p className="mt-1 text-xs text-muted-500 line-clamp-2">{t('currentAffairsDesc')}</p>
            <div className="mt-auto pt-2.5 flex items-center gap-1 text-xs font-medium text-ember-500">{t('read')} <span className="transition-transform group-hover:translate-x-0.5">→</span></div>
          </button>

          {/* Nexi AI */}
          <button type="button" onClick={() => { track('feature_click', { feature: 'chat' }); router.push('/chat'); }} className="paper-card card-selectable group flex h-full flex-col p-4 text-left transition-all hover:shadow-md">
            <span className="inline-flex h-10 w-10 items-center justify-center rounded-xl bg-ember-500/10 text-xl">🤖</span>
            <h3 className="mt-3 font-serif text-base font-bold text-ink-900">{t('nexiAI')}</h3>
            <p className="mt-1 text-xs text-muted-500 line-clamp-2">{t('nexiAIDesc')}</p>
            <div className="mt-auto pt-2.5 flex items-center gap-1 text-xs font-medium text-ember-500">{tc('chat')} <span className="transition-transform group-hover:translate-x-0.5">→</span></div>
          </button>

          {/* Mock Tests */}
          <button type="button" onClick={() => { track('feature_click', { feature: 'mock_tests' }); router.push('/mock-tests'); }} className="paper-card card-selectable group flex h-full flex-col p-4 text-left transition-all hover:shadow-md">
            <span className="inline-flex h-10 w-10 items-center justify-center rounded-xl bg-ember-500/10 text-xl">🧪</span>
            <h3 className="mt-3 font-serif text-base font-bold text-ink-900">{t('mockTests')}</h3>
            <p className="mt-1 text-xs text-muted-500 line-clamp-2">{t('mockTestsDesc')}</p>
            <div className="mt-auto pt-2.5 flex items-center gap-1 text-xs font-medium text-ember-500">{me?.language === 'hi' ? 'शुरू करें' : 'Start'} <span className="transition-transform group-hover:translate-x-0.5">→</span></div>
          </button>

          {/* PYQ */}
          <button type="button" onClick={() => { track('feature_click', { feature: 'pyq' }); router.push('/pyq'); }} className="paper-card card-selectable group flex h-full flex-col p-4 text-left transition-all hover:shadow-md">
            <div className="flex items-center gap-2">
              <span className="inline-flex h-10 w-10 items-center justify-center rounded-xl bg-ember-500/10 text-xl">📄</span>
              <span className="inline-flex items-center gap-1 rounded-full bg-ember-500/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-ember-600">New</span>
            </div>
            <h3 className="mt-3 font-serif text-base font-bold text-ink-900">{me?.language === 'hi' ? 'पिछले वर्ष' : 'PYQ Papers'}</h3>
            <p className="mt-1 text-xs text-muted-500 line-clamp-2">{me?.language === 'hi' ? 'पिछले वर्ष के प्रश्न' : 'Previous year questions'}</p>
            <div className="mt-auto pt-2.5 flex items-center gap-1 text-xs font-medium text-ember-500">{t('read')} <span className="transition-transform group-hover:translate-x-0.5">→</span></div>
          </button>

          {/* Secondary shortcuts — same card system, equal height */}
          {([
            { icon: '🏆', title: t('leaderboard'), desc: t('quizScores'), href: '/leaderboard' },
            { icon: '✍️', title: t('essay'), desc: t('essayDesc'), href: '/essay' },
            { icon: '⭐', title: t('upgrade'), desc: t('upgradeDesc'), href: '/upgrade' },
            { icon: '🎁', title: t('refer'), desc: t('referDesc'), href: '/refer' },
            { icon: '🛟', title: t('support'), desc: t('supportDesc'), href: '/support' },
          ] as const).map((item) => (
            <button key={item.href} type="button" onClick={() => { track('feature_click', { feature: item.href.replace('/', '') }); router.push(item.href); }} className="paper-card card-selectable group flex h-full flex-col p-4 text-left transition-all hover:shadow-md">
              <span className="inline-flex h-10 w-10 items-center justify-center rounded-xl bg-ember-500/10 text-xl">{item.icon}</span>
              <h3 className="mt-3 font-serif text-base font-bold text-ink-900">{item.title}</h3>
              <p className="mt-1 text-xs text-muted-500 line-clamp-2">{item.desc}</p>
              <div className="mt-auto pt-2.5 flex items-center gap-1 text-xs font-medium text-ember-500">{me?.language === 'hi' ? 'खोलें' : 'Open'} <span className="transition-transform group-hover:translate-x-0.5">→</span></div>
            </button>
          ))}
        </div>
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
    <section>
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


/**
 * ReviseTodayCard — spaced-repetition nudge. Shows only when the student has
 * chapters due for revision today; tapping opens the /revise queue.
 */
function ReviseTodayCard({ onOpen }: { onOpen: () => void }) {
  const [dueCount, setDueCount] = useState(0);
  useEffect(() => {
    let cancelled = false;
    api.getReviewStats()
      .then((r) => { if (!cancelled) setDueCount(r.dueCount); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, []);

  if (dueCount <= 0) return null;

  return (
    <section>
      <button onClick={onOpen} className="paper-card flex w-full items-center justify-between gap-3 p-4 text-left transition-shadow hover:shadow-md">
        <div className="flex items-center gap-3">
          <span aria-hidden className="grid h-10 w-10 place-items-center rounded-xl bg-ember-500/10 text-xl">🔁</span>
          <div>
            <p className="text-sm font-semibold text-ink-900">Revise Today</p>
            <p className="text-xs text-muted-500">{dueCount} chapter{dueCount === 1 ? '' : 's'} due for spaced revision</p>
          </div>
        </div>
        <span className="text-sm font-semibold text-ember-500">Revise →</span>
      </button>
    </section>
  );
}


/**
 * DailyPlanCard — a glanceable "Today's Study Plan" summary. Pulls the
 * server-composed plan (revise + weak + next chapters) and links to /plan.
 */
function DailyPlanCard({ examSlug, onOpen }: { examSlug: string; onOpen: () => void }) {
  const [plan, setPlan] = useState<import('~/lib/api').DailyPlan | null>(null);
  useEffect(() => {
    let cancelled = false;
    api.getDailyPlan(examSlug)
      .then((p) => { if (!cancelled) setPlan(p); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [examSlug]);

  if (!plan || plan.items.length === 0) return null;
  const top = plan.items.slice(0, 3);

  return (
    <section>
      <button onClick={onOpen} className="paper-card w-full p-4 text-left transition-shadow hover:shadow-md">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <span aria-hidden className="grid h-10 w-10 place-items-center rounded-xl bg-ember-500/10 text-xl">🗺️</span>
            <div>
              <p className="text-sm font-semibold text-ink-900">Today&apos;s Study Plan</p>
              <p className="text-xs text-muted-500">{plan.items.length} tasks · ~{plan.estMinutes} min</p>
            </div>
          </div>
          <span className="text-sm font-semibold text-ember-500">Open →</span>
        </div>
        <ul className="mt-3 space-y-1.5">
          {top.map((it, i) => (
            <li key={`${it.subject}/${it.chapter}/${i}`} className="flex items-center gap-2 text-xs text-ink-700">
              <span aria-hidden>{it.kind === 'revise' ? '🔁' : it.kind === 'fix' ? '🛠️' : '📘'}</span>
              <span className="truncate">{it.chapterName}</span>
            </li>
          ))}
        </ul>
      </button>
    </section>
  );
}
