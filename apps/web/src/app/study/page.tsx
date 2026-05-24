'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Logo } from '~/components/Logo';
import { useAuth } from '~/lib/auth-context';
import { api } from '~/lib/api';
import { useTranslation } from '~/lib/useTranslation';

interface TopicProgress {
  id: string;
  title: string;
  order: number;
  status: 'locked' | 'available' | 'in-progress' | 'mock-passed' | 'completed';
  mockScore?: number;
}

interface SyllabusProgress {
  subject: string;
  topics: TopicProgress[];
}

interface Progress {
  exam: string;
  skillLevel: string;
  syllabus: SyllabusProgress[];
  totalTopicsCompleted: number;
  totalTopics: number;
}

const STATUS_ICONS: Record<string, string> = {
  locked: '🔒',
  available: '📖',
  'in-progress': '⏳',
  'mock-passed': '✅',
  completed: '🏆',
};

export default function StudyPage() {
  const { user, loading } = useAuth();
  const router = useRouter();
  const { t, lang } = useTranslation();
  const [progress, setProgress] = useState<Progress | null>(null);
  const [activeSubject, setActiveSubject] = useState(0);
  const [loadingState, setLoadingState] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!loading && !user) router.replace('/signin');
  }, [user, loading, router]);

  useEffect(() => {
    if (!user) return;
    loadProgress();
  }, [user]);

  async function loadProgress() {
    try {
      setLoadingState(true);
      const res = await api.ai.getProgress();
      if (res.progress) {
        setProgress(res.progress);
        if (!res.progress.syllabus || res.progress.syllabus.length === 0) {
          await generateSyllabus(res.progress.exam);
        }
      } else {
        router.replace('/onboarding');
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load progress');
    } finally {
      setLoadingState(false);
    }
  }

  async function generateSyllabus(exam: string) {
    try {
      setGenerating(true);
      const res = await api.ai.generateSyllabus(exam, lang as 'en' | 'hi');
      const syllabus: SyllabusProgress[] = res.syllabus.map((s) => ({
        subject: s.subject,
        topics: s.topics.map((tp, idx) => ({
          ...tp,
          status: idx === 0 ? 'available' as const : 'locked' as const,
        })),
      }));
      const totalTopics = syllabus.reduce((acc, s) => acc + s.topics.length, 0);
      await api.ai.updateProgress({ syllabus, totalTopics });
      setProgress((prev) => prev ? { ...prev, syllabus, totalTopics } : null);
    } catch {
      setError(lang === 'hi' ? 'सिलेबस बनाने में असफल' : 'Failed to generate syllabus');
    } finally {
      setGenerating(false);
    }
  }

  function handleTopicClick(topic: TopicProgress) {
    if (topic.status === 'locked') return;
    router.push(`/study/chapter?topic=${encodeURIComponent(topic.title)}&id=${topic.id}`);
  }

  function getStatusLabel(status: string): string {
    const key = `study.status.${status.replace('-', '_')}`;
    const fallbacks: Record<string, string> = {
      locked: 'Locked', available: 'Start', 'in-progress': 'In Progress',
      'mock-passed': 'Mock Passed', completed: 'Completed',
    };
    return t(key, fallbacks[status] ?? status);
  }

  if (loading || loadingState) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-paper-100">
        <div className="flex flex-col items-center gap-3">
          <span className="spinner" />
          <span className="text-sm text-muted-500">{t('study.loading', 'Loading study plan...')}</span>
        </div>
      </main>
    );
  }

  if (!progress) return null;

  const subjects = progress.syllabus ?? [];
  const completionPct = progress.totalTopics > 0
    ? Math.round((progress.totalTopicsCompleted / progress.totalTopics) * 100)
    : 0;

  return (
    <main className="mx-auto min-h-screen max-w-4xl px-4 pb-28 pt-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <Logo />
        <Link href="/dashboard" className="text-sm text-ember-600 hover:underline font-medium">
          {t('nexi.dashboard', 'Dashboard')}
        </Link>
      </div>

      <h1 className="mt-6 font-serif text-2xl font-semibold text-ink-900">
        {t('study.title', 'Study Plan')}
      </h1>
      <p className="mt-1 text-sm text-muted-500">
        {progress.exam} · {t('study.level', 'Level')}: <span className="capitalize">{progress.skillLevel}</span> · {completionPct}% {t('study.complete_pct', 'complete')}
      </p>

      {error && <div className="banner banner-error mt-4">{error}</div>}

      {generating && (
        <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800 flex items-center gap-3">
          <span className="spinner" aria-hidden="true" />
          <span>{t('study.generating_syllabus', 'Generating your personalized syllabus...')}</span>
        </div>
      )}

      {/* Subject tabs */}
      {subjects.length > 0 && (
        <>
          <div className="mt-6 flex gap-2 overflow-x-auto pb-2 scrollbar-hide">
            {subjects.map((s, idx) => (
              <button
                key={s.subject}
                onClick={() => setActiveSubject(idx)}
                className={`whitespace-nowrap rounded-full px-4 py-2 text-sm font-semibold transition-all duration-200 ${
                  idx === activeSubject
                    ? 'bg-ember-500 text-white shadow-md'
                    : 'bg-paper-200 text-ink-700 hover:bg-paper-300'
                }`}
              >
                {s.subject}
              </button>
            ))}
          </div>

          {/* Topic cards */}
          <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
            {subjects[activeSubject]?.topics.map((topic) => (
              <button
                key={topic.id}
                onClick={() => handleTopicClick(topic)}
                disabled={topic.status === 'locked'}
                className={`paper-card px-4 py-4 text-left transition-all duration-200 ${
                  topic.status === 'locked'
                    ? 'opacity-40 cursor-not-allowed grayscale'
                    : 'hover:shadow-md hover:-translate-y-0.5 cursor-pointer active:translate-y-0'
                }`}
              >
                <div className="flex items-center gap-3">
                  <span className="text-xl">{STATUS_ICONS[topic.status]}</span>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-ink-900 truncate">{topic.title}</p>
                    <p className="text-xs text-muted-500 mt-0.5">{getStatusLabel(topic.status)}</p>
                    {topic.mockScore !== undefined && (
                      <p className="text-xs font-semibold text-ember-600 mt-0.5">Mock: {topic.mockScore}%</p>
                    )}
                  </div>
                  {topic.status !== 'locked' && (
                    <span className="text-muted-400 text-sm">&rarr;</span>
                  )}
                </div>
              </button>
            ))}
          </div>

          {/* Final test button */}
          {completionPct >= 80 && (
            <div className="mt-8 text-center">
              <Link
                href="/study/final-test"
                className="btn-primary inline-block px-8 py-3 text-base font-semibold shadow-lg hover:shadow-xl transition-shadow"
              >
                🏆 {t('study.final_test_btn', 'Take Final Comprehensive Test (50 Questions)')}
              </Link>
            </div>
          )}

          {completionPct > 0 && completionPct < 80 && (
            <p className="mt-6 text-center text-sm text-muted-500">
              {t('study.final_test_unlock', 'Complete at least 80% of topics to unlock the Final Test.')}
            </p>
          )}
        </>
      )}
    </main>
  );
}
