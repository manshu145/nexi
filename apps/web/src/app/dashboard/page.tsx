'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { EXAM_BY_SLUG, type CreditBalance } from '@nexigrate/shared';
import { Logo } from '~/components/Logo';
import { useAuth } from '~/lib/auth-context';
import { api, type MeResponse } from '~/lib/api';

/**
 * Student Dashboard — 3 main sections:
 * 1. Current Affairs
 * 2. Exam Prep (Syllabus → Chapters → Mock Tests)
 * 3. Nexi AI Chatbot
 */
export default function DashboardPage() {
  const { user, loading, signOut } = useAuth();
  const router = useRouter();
  const [me, setMe] = useState<MeResponse['user'] | null>(null);
  const [progress, setProgress] = useState<any>(null);
  const [balance, setBalance] = useState<CreditBalance | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!loading && !user) router.replace('/signin');
  }, [user, loading, router]);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    (async () => {
      try {
        const [meRes, balRes, progRes] = await Promise.all([
          api.me(),
          api.getBalance(),
          api.ai.getProgress(),
        ]);
        if (cancelled) return;
        setMe(meRes.user);
        setBalance(balRes);
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
      <main className="dash-loading">
        <span className="spinner" /> Loading…
      </main>
    );
  }

  const examName = me?.targetExam ? EXAM_BY_SLUG.get(me.targetExam)?.name : null;
  const skillLevel = progress?.skillLevel ?? 'intermediate';
  const completedCount = progress?.completedTopics?.length ?? 0;
  const totalTopics = progress?.syllabus?.reduce((acc: number, s: any) => acc + (s.topics?.length ?? 0), 0) ?? 0;
  const progressPct = totalTopics > 0 ? Math.round((completedCount / totalTopics) * 100) : 0;

  return (
    <main className="dashboard-page">
      {/* Header */}
      <header className="dash-header">
        <div className="dash-header-left">
          <Logo />
          <p className="dash-greeting">
            {greeting()}, <span className="dash-name">{firstName(me?.name ?? user.displayName ?? 'Student')}</span>
          </p>
        </div>
        <div className="dash-header-right">
          <button type="button" onClick={() => signOut().then(() => router.replace('/signin'))} className="btn-ghost-sm">
            Sign out
          </button>
        </div>
      </header>

      {/* Exam & Progress Summary */}
      {examName && (
        <section className="dash-summary">
          <div className="dash-summary-card">
            <div className="summary-row">
              <div className="summary-item">
                <span className="summary-label">Exam</span>
                <span className="summary-value">{examName}</span>
              </div>
              <div className="summary-item">
                <span className="summary-label">Level</span>
                <span className={`summary-badge level-${skillLevel}`}>{skillLevel}</span>
              </div>
              <div className="summary-item">
                <span className="summary-label">Credits</span>
                <span className="summary-value">{balance?.total ?? 0}</span>
              </div>
            </div>
            {totalTopics > 0 && (
              <div className="progress-section">
                <div className="progress-header">
                  <span>Syllabus Progress</span>
                  <span>{completedCount}/{totalTopics} topics · {progressPct}%</span>
                </div>
                <div className="progress-track">
                  <div className="progress-fill" style={{ width: `${progressPct}%` }} />
                </div>
              </div>
            )}
          </div>
        </section>
      )}

      {/* Main Navigation Cards */}
      <section className="dash-grid">
        {/* Current Affairs */}
        <button type="button" className="dash-card dash-card-affairs" onClick={() => router.push('/current-affairs')}>
          <div className="dash-card-icon">📰</div>
          <div className="dash-card-content">
            <h2>{t('Current Affairs')}</h2>
            <p>{t('Daily digest for exam prep')}</p>
          </div>
          <span className="dash-card-arrow">→</span>
        </button>

        {/* Exam Preparation */}
        <button type="button" className="dash-card dash-card-study" onClick={() => router.push('/study')}>
          <div className="dash-card-icon">📚</div>
          <div className="dash-card-content">
            <h2>{t('Exam Preparation')}</h2>
            <p>{t('Syllabus, chapters, mock tests')}</p>
            {totalTopics > 0 && (
              <span className="dash-card-progress">{progressPct}% complete</span>
            )}
          </div>
          <span className="dash-card-arrow">→</span>
        </button>

        {/* Nexi AI Chat */}
        <button type="button" className="dash-card dash-card-nexi" onClick={() => router.push('/nexi')}>
          <div className="dash-card-icon">🤖</div>
          <div className="dash-card-content">
            <h2>{t('Nexi AI')}</h2>
            <p>{t('Your personal study assistant')}</p>
          </div>
          <span className="dash-card-arrow">→</span>
        </button>

        {/* Daily MCQ */}
        <button type="button" className="dash-card dash-card-mcq" onClick={() => router.push('/mcq')}>
          <div className="dash-card-icon">✍️</div>
          <div className="dash-card-content">
            <h2>{t('Daily MCQ')}</h2>
            <p>{t('10 questions, earn credits')}</p>
          </div>
          <span className="dash-card-arrow">→</span>
        </button>
      </section>

      {/* Quick Stats */}
      <section className="dash-stats">
        <div className="stat-card">
          <span className="stat-number">{me?.currentStreak ?? 0}</span>
          <span className="stat-label">Day Streak</span>
        </div>
        <div className="stat-card">
          <span className="stat-number">{completedCount}</span>
          <span className="stat-label">Topics Done</span>
        </div>
        <div className="stat-card">
          <span className="stat-number">{me?.bestStreak ?? 0}</span>
          <span className="stat-label">Best Streak</span>
        </div>
      </section>

      {error && <p className="error-msg">{error}</p>}
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

function t(text: string): string {
  return text;
}
