'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { EXAM_BY_SLUG } from '@nexigrate/shared';
import { Logo } from '~/components/Logo';
import { useAuth } from '~/lib/auth-context';
import { api, type MeResponse } from '~/lib/api';
import { useTranslation } from '~/lib/useTranslation';

export default function DashboardPage() {
  const { user, loading, signOut } = useAuth();
  const router = useRouter();
  const { t, lang } = useTranslation();
  const [me, setMe] = useState<MeResponse['user'] | null>(null);
  const [progress, setProgress] = useState<any>(null);
  const [balance, setBalance] = useState<number>(0);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'main' | 'profile' | 'stats'>('main');

  useEffect(() => {
    if (!loading && !user) router.replace('/signin');
  }, [user, loading, router]);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    (async () => {
      try {
        const [meRes, progRes, balRes] = await Promise.all([
          api.me(),
          api.ai.getProgress().catch(() => ({ progress: null })),
          api.getBalance().catch(() => ({ total: 0 })),
        ]);
        if (cancelled) return;
        setMe(meRes.user);
        setProgress(progRes.progress);
        setBalance((balRes as any).total ?? 0);
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
      <main className="flex min-h-dvh items-center justify-center bg-paper-100">
        <div className="flex flex-col items-center gap-3">
          <span className="spinner" />
          <span className="text-sm text-muted-500">{t('loading', 'Loading...')}</span>
        </div>
      </main>
    );
  }

  const examName = me?.targetExam ? EXAM_BY_SLUG.get(me.targetExam)?.name ?? me.targetExam : '';
  const skillLevel = progress?.skillLevel ?? 'intermediate';
  const completedTopics = progress?.totalTopicsCompleted ?? 0;
  const totalTopics = progress?.totalTopics ?? 0;
  const progressPct = totalTopics > 0 ? Math.round((completedTopics / totalTopics) * 100) : 0;

  return (
    <main className="mx-auto flex min-h-dvh max-w-lg flex-col px-5 pt-6 pb-28">
      {/* ═══ Header ═══ */}
      <header className="flex items-center justify-between">
        <Logo />
        <div className="flex items-center gap-2">
          <button
            onClick={() => setActiveTab(activeTab === 'profile' ? 'main' : 'profile')}
            className="flex h-8 w-8 items-center justify-center rounded-full bg-paper-200 text-ink-800 hover:bg-paper-300 transition"
            title={t('dashboard.profile', 'Profile')}
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
            </svg>
          </button>
          <button onClick={() => signOut().then(() => router.replace('/signin'))} className="btn-ghost-sm text-xs">
            {t('sign_out', 'Sign out')}
          </button>
        </div>
      </header>

      {/* ═══ Greeting + Exam info ═══ */}
      <section className="mt-6">
        <p className="text-sm text-muted-500">
          {greeting(lang)},{' '}
          <span className="font-semibold text-ink-900">{firstName(me?.name ?? user.displayName ?? 'Student')}</span>
        </p>
        <h1 className="font-serif mt-1 text-2xl font-bold text-ink-900">{examName}</h1>

        {/* Progress bar */}
        {totalTopics > 0 && (
          <div className="mt-3">
            <div className="flex justify-between text-xs text-muted-500 mb-1">
              <span>{t('dashboard.syllabus_progress', 'Syllabus Progress')}</span>
              <span>{completedTopics}/{totalTopics} ({progressPct}%)</span>
            </div>
            <div className="h-2.5 rounded-full bg-paper-300 overflow-hidden shadow-inner">
              <div
                className="h-full rounded-full bg-gradient-to-r from-ember-600 to-gold-500 transition-all duration-700 ease-out"
                style={{ width: `${progressPct}%` }}
              />
            </div>
          </div>
        )}

        {/* Skill level badge */}
        {skillLevel && (
          <span className={`mt-3 inline-block rounded-full px-3 py-1 text-xs font-bold uppercase tracking-wider ${
            skillLevel === 'beginner' ? 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300' :
            skillLevel === 'advanced' ? 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300' :
            'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300'
          }`}>
            {skillLevel === 'beginner' ? (lang === 'hi' ? 'शुरुआती' : 'Beginner') :
             skillLevel === 'advanced' ? (lang === 'hi' ? 'उन्नत' : 'Advanced') :
             (lang === 'hi' ? 'मध्यम' : 'Intermediate')}
          </span>
        )}
      </section>

      {/* ═══ Quick Stats Row ═══ */}
      <section className="mt-6 grid grid-cols-4 gap-2">
        <StatCard value={me?.currentStreak ?? 0} label={t('dashboard.stat.streak', 'Streak')} icon="🔥" />
        <StatCard value={completedTopics} label={t('dashboard.stat.topics_done', 'Topics')} icon="📖" />
        <StatCard value={balance} label={t('dashboard.credits', 'Credits')} icon="💎" />
        <StatCard value={me?.bestStreak ?? 0} label={t('dashboard.stat.best_streak', 'Best')} icon="🏆" />
      </section>

      {/* ═══ Profile Panel (toggle) ═══ */}
      {activeTab === 'profile' && (
        <section className="mt-6 paper-card p-5 animate-in fade-in slide-in-from-top-2 duration-200">
          <h2 className="font-serif text-lg font-semibold text-ink-900 mb-4">
            {t('dashboard.profile', 'Profile')}
          </h2>
          <div className="space-y-3 text-sm">
            <ProfileRow label={lang === 'hi' ? 'नाम' : 'Name'} value={me?.name ?? user.displayName ?? '—'} />
            <ProfileRow label={lang === 'hi' ? 'ईमेल' : 'Email'} value={me?.email ?? user.email ?? '—'} />
            <ProfileRow label={lang === 'hi' ? 'परीक्षा' : 'Exam'} value={examName || '—'} />
            <ProfileRow label={lang === 'hi' ? 'स्तर' : 'Level'} value={skillLevel} />
            <ProfileRow label={lang === 'hi' ? 'क्रेडिट' : 'Credits'} value={String(balance)} />
          </div>
        </section>
      )}

      {/* ═══ 3 Main Actions ═══ */}
      <section className="mt-6 flex flex-col gap-3">
        {/* 1. Current Affairs */}
        <ActionCard
          onClick={() => router.push('/current-affairs')}
          icon="📰"
          iconBg="from-amber-100 to-amber-50"
          title={t('dashboard.card.ca.title', 'Current Affairs')}
          desc={t('dashboard.card.ca.desc', 'Daily digest — 6-8 items per category, exam-ready')}
        />

        {/* 2. Exam Preparation */}
        <ActionCard
          onClick={() => router.push('/study')}
          icon="📚"
          iconBg="from-blue-100 to-blue-50"
          title={t('dashboard.card.study.title', 'Exam Preparation')}
          desc={t('dashboard.card.study.desc', 'Syllabus → Chapters → Mock Tests → Final Test')}
          badge={progressPct > 0 ? `${progressPct}% ${t('dashboard.complete', 'complete')}` : undefined}
        />

        {/* 3. Nexi AI */}
        <ActionCard
          onClick={() => router.push('/nexi')}
          icon="🤖"
          iconBg="from-purple-100 to-purple-50"
          title={t('dashboard.card.nexi.title', 'Nexi AI')}
          desc={t('dashboard.card.nexi.desc', 'Doubt solving, problem help, study assistant')}
        />
      </section>

      {/* ═══ Upcoming Exams (compact) ═══ */}
      <section className="mt-6">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-500 mb-2">
          {t('dashboard.upcoming_exams', 'Upcoming Exams')}
        </h3>
        <div className="paper-card p-4">
          <p className="text-sm text-ink-800">
            {examName && (
              <span className="font-medium">{examName}</span>
            )}
            {!examName && <span className="text-muted-500">{t('no_data', 'No data available')}</span>}
          </p>
          <p className="text-xs text-muted-500 mt-1">
            {lang === 'hi' ? 'AI द्वारा परीक्षा तिथि अपडेट जल्द आ रहे हैं' : 'AI-powered exam date updates coming soon'}
          </p>
        </div>
      </section>

      {error && <p className="mt-4 text-sm text-ember-600 text-center">{error}</p>}
    </main>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// Sub-components
// ═══════════════════════════════════════════════════════════════════════════════

function StatCard({ value, label, icon }: { value: number; label: string; icon: string }) {
  return (
    <div className="paper-card flex flex-col items-center justify-center p-3 text-center">
      <span className="text-base">{icon}</span>
      <p className="font-serif text-lg font-bold text-ink-900 mt-1">{value.toLocaleString('en-IN')}</p>
      <p className="text-[9px] text-muted-500 uppercase tracking-wide leading-tight mt-0.5">{label}</p>
    </div>
  );
}

function ProfileRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between border-b border-paper-200 pb-2 last:border-0 last:pb-0">
      <span className="text-muted-500">{label}</span>
      <span className="font-medium text-ink-900 capitalize">{value}</span>
    </div>
  );
}

function ActionCard({
  onClick,
  icon,
  iconBg,
  title,
  desc,
  badge,
}: {
  onClick: () => void;
  icon: string;
  iconBg: string;
  title: string;
  desc: string;
  badge?: string;
}) {
  return (
    <button
      onClick={onClick}
      className="paper-card group flex items-center gap-4 p-5 text-left transition-all duration-200 hover:shadow-lg hover:-translate-y-0.5 hover:border-ember-500/50 active:translate-y-0 active:shadow-md"
    >
      <span className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br ${iconBg} text-2xl shadow-sm group-hover:scale-110 transition-transform duration-200`}>
        {icon}
      </span>
      <div className="flex-1 min-w-0">
        <h2 className="font-serif text-base font-semibold text-ink-900 sm:text-lg">{title}</h2>
        <p className="text-sm text-muted-500 mt-0.5 leading-snug">{desc}</p>
        {badge && <p className="text-xs font-bold text-ember-600 mt-1">{badge}</p>}
      </div>
      <span className="text-muted-400 text-lg group-hover:text-ember-500 group-hover:translate-x-0.5 transition-all duration-200">&rarr;</span>
    </button>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// Helpers
// ═══════════════════════════════════════════════════════════════════════════════

function firstName(full: string): string {
  const space = full.trim().indexOf(' ');
  return space < 0 ? full.trim() : full.trim().slice(0, space);
}

function greeting(lang: string): string {
  const istHour = (new Date().getUTCHours() + 5.5) % 24;
  if (lang === 'hi') {
    if (istHour < 12) return 'सुप्रभात';
    if (istHour < 17) return 'नमस्ते';
    return 'शुभ संध्या';
  }
  if (istHour < 12) return 'Good morning';
  if (istHour < 17) return 'Good afternoon';
  return 'Good evening';
}
