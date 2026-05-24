'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { EXAM_BY_SLUG, type CreditBalance } from '@nexigrate/shared';
import { Logo } from '~/components/Logo';
import { MobileNav } from '~/components/MobileNav';
import { ChatWidget } from '~/components/ChatWidget';
import { useAuth } from '~/lib/auth-context';
import { api, type MeResponse, type StudyPlan } from '~/lib/api';
import { getLang, t } from '~/lib/i18n';

export default function DashboardPage() {
  const { user, loading, signOut } = useAuth();
  const router = useRouter();
  const lang = getLang();

  const [me, setMe] = useState<MeResponse['user'] | null>(null);
  const [balance, setBalance] = useState<CreditBalance | null>(null);
  const [studyPlan, setStudyPlan] = useState<StudyPlan | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!loading && !user) router.replace('/signin');
  }, [user, loading, router]);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    (async () => {
      try {
        const [meRes, balRes, planRes] = await Promise.all([
          api.me(),
          api.getBalance(),
          api.getStudyPlan().catch(() => null),
        ]);
        if (cancelled) return;
        setMe(meRes.user);
        setBalance(balRes);
        setStudyPlan(planRes);
        if (!meRes.user.targetExam) {
          router.replace('/onboarding');
        }
      } catch (e) {
        if (cancelled) return;
        setError(e instanceof Error ? e.message : 'failed to load');
      }
    })();
    return () => { cancelled = true; };
  }, [user, router]);

  if (loading || !user) {
    return (
      <main className="flex min-h-screen items-center justify-center px-4">
        <span className="spinner" />
      </main>
    );
  }

  const examName = me?.targetExam ? EXAM_BY_SLUG.get(me.targetExam)?.name : null;

  return (
    <>
      <main className="mx-auto flex min-h-screen max-w-lg flex-col px-4 pt-6 pb-24 sm:max-w-2xl sm:px-6">
        {/* Header */}
        <header className="flex items-center justify-between">
          <Logo />
          <div className="flex items-center gap-2">
            <button type="button" onClick={() => router.push('/upgrade')} className="btn-ghost-sm">
              {t('dash.upgrade', lang)}
            </button>
            <button type="button" onClick={() => signOut().then(() => router.replace('/signin'))} className="btn-ghost-sm">
              {t('dash.signout', lang)}
            </button>
          </div>
        </header>

        {/* Greeting */}
        <section className="mt-6">
          <p className="text-sm text-muted-500">
            {greeting(lang)}, {firstName(me?.name ?? user.displayName ?? 'Student')}
          </p>
          <h1 className="font-serif mt-1 text-2xl font-semibold text-ink-900 sm:text-3xl">
            {t('dash.title', lang)}
          </h1>
          {examName && (
            <p className="mt-1 text-xs text-muted-500">
              {lang === 'hi' ? 'परीक्षा' : 'Tracking'}: <span className="font-medium text-ink-800">{examName}</span>
            </p>
          )}
        </section>

        {/* Stats row */}
        <section className="mt-5 grid grid-cols-3 gap-2 sm:gap-4">
          <div className="paper-card p-3 sm:p-4">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-500">{t('dash.credits', lang)}</p>
            <p className="font-serif mt-1 text-xl font-semibold tabular-nums text-ink-900 sm:text-2xl">
              {balance ? balance.total : '—'}
            </p>
          </div>
          <div className="paper-card p-3 sm:p-4">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-500">{t('dash.streak', lang)}</p>
            <p className="font-serif mt-1 text-xl font-semibold tabular-nums text-ink-900 sm:text-2xl">
              {(me?.currentStreak ?? 0) > 0 ? me?.currentStreak : '—'}
              {(me?.currentStreak ?? 0) > 0 && <span className="ml-0.5 text-xs text-muted-500">{t('dash.streak.days', lang)}</span>}
            </p>
          </div>
          <div className="paper-card p-3 sm:p-4">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-500">
              {lang === 'hi' ? 'स्तर' : 'Level'}
            </p>
            <p className="font-serif mt-1 text-sm font-semibold capitalize text-ember-600 sm:text-base">
              {me?.skillLevel ?? 'N/A'}
            </p>
          </div>
        </section>

        {/* Daily MCQ Card */}
        <section className="paper-card mt-5 p-4 sm:p-6">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-ember-600">
            {t('dash.mcq.title', lang)}
          </p>
          <h2 className="font-serif mt-2 text-lg font-semibold text-ink-900 sm:text-xl">
            {t('dash.mcq.subtitle', lang)}
          </h2>
          <p className="mt-2 text-sm text-ink-800">
            {t('dash.mcq.pass', lang)} <span className="font-medium">+50 credits</span>
          </p>
          <button type="button" onClick={() => router.push('/mcq')} className="btn-primary mt-4 w-full sm:w-auto">
            {t('dash.mcq.cta', lang)}
          </button>
        </section>

        {/* Quick actions grid */}
        <section className="mt-5 grid grid-cols-2 gap-2 sm:grid-cols-4 sm:gap-3">
          <QuickAction icon="📖" label={t('dash.study', lang)} onClick={() => router.push('/library')} />
          <QuickAction icon="📝" label={t('dash.mocktest', lang)} onClick={() => router.push('/mock-test')} />
          <QuickAction icon="📚" label={t('dash.nexipedia', lang)} onClick={() => router.push('/nexipedia')} />
          <QuickAction icon="📰" label={t('dash.ca', lang)} onClick={() => router.push('/today')} />
        </section>

        {/* Personalized Recommendations */}
        {studyPlan && studyPlan.recommendations.length > 0 && (
          <section className="mt-5">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-500">
              {t('dash.recommended', lang)}
            </h3>
            <div className="mt-2 space-y-2">
              {studyPlan.recommendations.map((rec, i) => (
                <div key={i} className="paper-card flex items-center gap-3 p-3">
                  <span className="text-ember-600">→</span>
                  <span className="text-sm text-ink-800">{rec}</span>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* Weak subjects alert */}
        {studyPlan && studyPlan.weakSubjects.length > 0 && (
          <section className="mt-5 paper-card p-4 border-l-4 border-l-ember-600">
            <p className="text-xs font-semibold uppercase text-ember-600">
              {lang === 'hi' ? 'ध्यान दें' : 'Focus Areas'}
            </p>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {studyPlan.weakSubjects.map((s) => (
                <span key={s} className="pill">{s}</span>
              ))}
            </div>
          </section>
        )}

        {error && (
          <p className="mt-6 text-sm text-ember-600" role="alert">{error}</p>
        )}
      </main>

      <MobileNav />
      <ChatWidget />
    </>
  );
}

function QuickAction({ icon, label, onClick }: { icon: string; label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="paper-card flex flex-col items-center gap-1.5 p-4 transition active:scale-95 hover:-translate-y-0.5"
    >
      <span className="text-2xl">{icon}</span>
      <span className="text-xs font-medium text-ink-800">{label}</span>
    </button>
  );
}

function firstName(full: string): string {
  const space = full.trim().indexOf(' ');
  return space < 0 ? full.trim() : full.trim().slice(0, space);
}

function greeting(lang: 'en' | 'hi'): string {
  const istHour = (new Date().getUTCHours() + 5.5) % 24;
  if (istHour < 12) return t('dash.greeting.morning', lang);
  if (istHour < 17) return t('dash.greeting.afternoon', lang);
  return t('dash.greeting.evening', lang);
}
