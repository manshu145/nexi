'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { EXAM_BY_SLUG } from '@nexigrate/shared';
import { Logo } from '~/components/Logo';
import { useAuth } from '~/lib/auth-context';
import { api, type MeResponse } from '~/lib/api';

export default function DashboardPage() {
  const { user, loading, signOut } = useAuth();
  const router = useRouter();
  const [me, setMe] = useState<MeResponse['user'] | null>(null);
  const [progress, setProgress] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!loading && !user) router.replace('/signin');
  }, [user, loading, router]);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    (async () => {
      try {
        const [meRes, progRes] = await Promise.all([
          api.me(),
          api.ai.getProgress().catch(() => ({ progress: null })),
        ]);
        if (cancelled) return;
        setMe(meRes.user);
        setProgress(progRes.progress);
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
      <main className="flex min-h-dvh items-center justify-center">
        <span className="spinner" /> <span className="ml-2 text-sm text-muted-500">Loading...</span>
      </main>
    );
  }

  const examName = me?.targetExam ? EXAM_BY_SLUG.get(me.targetExam)?.name ?? me.targetExam : '';
  const skillLevel = progress?.skillLevel ?? 'intermediate';
  const completedTopics = progress?.totalTopicsCompleted ?? 0;
  const totalTopics = progress?.totalTopics ?? 0;
  const progressPct = totalTopics > 0 ? Math.round((completedTopics / totalTopics) * 100) : 0;

  return (
    <main className="mx-auto flex min-h-dvh max-w-lg flex-col px-5 pt-6 pb-10">
      {/* Header */}
      <header className="flex items-center justify-between">
        <Logo />
        <button onClick={() => signOut().then(() => router.replace('/signin'))} className="btn-ghost-sm">Sign out</button>
      </header>

      {/* Greeting */}
      <section className="mt-8">
        <p className="text-sm text-muted-500">{greeting()}, <span className="font-semibold text-ink-900">{firstName(me?.name ?? user.displayName ?? 'Student')}</span></p>
        <h1 className="font-serif mt-1 text-2xl font-bold text-ink-900">{examName}</h1>
        {totalTopics > 0 && (
          <div className="mt-3">
            <div className="flex justify-between text-xs text-muted-500 mb-1">
              <span>Syllabus Progress</span>
              <span>{completedTopics}/{totalTopics} ({progressPct}%)</span>
            </div>
            <div className="h-2 rounded-full bg-paper-300 overflow-hidden">
              <div className="h-full rounded-full bg-gradient-to-r from-ember-600 to-gold-500 transition-all duration-500" style={{ width: `${progressPct}%` }} />
            </div>
          </div>
        )}
        {skillLevel && (
          <span className={`mt-2 inline-block rounded-full px-3 py-0.5 text-xs font-semibold capitalize ${
            skillLevel === 'beginner' ? 'bg-green-100 text-green-800' :
            skillLevel === 'advanced' ? 'bg-blue-100 text-blue-800' :
            'bg-amber-100 text-amber-800'
          }`}>{skillLevel}</span>
        )}
      </section>

      {/* 3 Main Actions */}
      <section className="mt-8 flex flex-col gap-4">
        {/* 1. Current Affairs */}
        <button
          onClick={() => router.push('/current-affairs')}
          className="paper-card flex items-center gap-4 p-5 text-left transition-all hover:shadow-lg hover:-translate-y-0.5 hover:border-ember-500 active:translate-y-0"
        >
          <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-amber-100 to-amber-50 text-2xl">📰</span>
          <div className="flex-1 min-w-0">
            <h2 className="font-serif text-lg font-semibold text-ink-900">Current Affairs</h2>
            <p className="text-sm text-muted-500 mt-0.5">Daily digest — 6-8 items per category, exam-ready</p>
          </div>
          <span className="text-muted-400 text-xl">&rarr;</span>
        </button>

        {/* 2. Exam Preparation */}
        <button
          onClick={() => router.push('/study')}
          className="paper-card flex items-center gap-4 p-5 text-left transition-all hover:shadow-lg hover:-translate-y-0.5 hover:border-ember-500 active:translate-y-0"
        >
          <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-blue-100 to-blue-50 text-2xl">📚</span>
          <div className="flex-1 min-w-0">
            <h2 className="font-serif text-lg font-semibold text-ink-900">Exam Preparation</h2>
            <p className="text-sm text-muted-500 mt-0.5">Syllabus → Chapters → Mock Tests → Final Test</p>
            {progressPct > 0 && <p className="text-xs font-semibold text-ember-600 mt-1">{progressPct}% complete</p>}
          </div>
          <span className="text-muted-400 text-xl">&rarr;</span>
        </button>

        {/* 3. Nexi AI */}
        <button
          onClick={() => router.push('/nexi')}
          className="paper-card flex items-center gap-4 p-5 text-left transition-all hover:shadow-lg hover:-translate-y-0.5 hover:border-ember-500 active:translate-y-0"
        >
          <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-purple-100 to-purple-50 text-2xl">🤖</span>
          <div className="flex-1 min-w-0">
            <h2 className="font-serif text-lg font-semibold text-ink-900">Nexi AI</h2>
            <p className="text-sm text-muted-500 mt-0.5">Doubt solving, problem help, study assistant</p>
          </div>
          <span className="text-muted-400 text-xl">&rarr;</span>
        </button>
      </section>

      {/* Quick stats */}
      <section className="mt-8 grid grid-cols-3 gap-3">
        <div className="paper-card p-3 text-center">
          <p className="font-serif text-xl font-bold text-ink-900">{me?.currentStreak ?? 0}</p>
          <p className="text-[10px] text-muted-500 uppercase tracking-wide">Day Streak</p>
        </div>
        <div className="paper-card p-3 text-center">
          <p className="font-serif text-xl font-bold text-ink-900">{completedTopics}</p>
          <p className="text-[10px] text-muted-500 uppercase tracking-wide">Topics Done</p>
        </div>
        <div className="paper-card p-3 text-center">
          <p className="font-serif text-xl font-bold text-ink-900">{me?.bestStreak ?? 0}</p>
          <p className="text-[10px] text-muted-500 uppercase tracking-wide">Best Streak</p>
        </div>
      </section>

      {error && <p className="mt-4 text-sm text-ember-600 text-center">{error}</p>}
    </main>
  );
}

function firstName(full: string): string {
  const space = full.trim().indexOf(' ');
  return space < 0 ? full.trim() : full.trim().slice(0, space);
}

function greeting(): string {
  const istHour = (new Date().getUTCHours() + 5.5) % 24;
  if (istHour < 12) return 'Good morning';
  if (istHour < 17) return 'Good afternoon';
  return 'Good evening';
}
