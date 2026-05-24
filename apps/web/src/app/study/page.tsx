'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Logo } from '~/components/Logo';
import { useAuth } from '~/lib/auth-context';
import { api } from '~/lib/api';

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
  locked: '\u{1F512}',
  available: '\u{1F4D6}',
  'in-progress': '\u{23F3}',
  'mock-passed': '\u2705',
  completed: '\u{1F3C6}',
};

const STATUS_LABELS: Record<string, string> = {
  locked: 'Locked',
  available: 'Start',
  'in-progress': 'In Progress',
  'mock-passed': 'Mock Passed',
  completed: 'Completed',
};

export default function StudyPage() {
  const { user, loading } = useAuth();
  const router = useRouter();
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
        // If syllabus is empty, generate it
        if (!res.progress.syllabus || res.progress.syllabus.length === 0) {
          await generateSyllabus(res.progress.exam);
        }
      } else {
        // No progress — redirect to onboarding
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
      const res = await api.ai.generateSyllabus(exam);
      const syllabus: SyllabusProgress[] = res.syllabus.map((s) => ({
        subject: s.subject,
        topics: s.topics.map((t, idx) => ({
          ...t,
          status: idx === 0 ? 'available' as const : 'locked' as const,
        })),
      }));
      const totalTopics = syllabus.reduce((acc, s) => acc + s.topics.length, 0);
      await api.ai.updateProgress({ syllabus, totalTopics });
      setProgress((prev) => prev ? { ...prev, syllabus, totalTopics } : null);
    } catch (e) {
      setError('Failed to generate syllabus');
    } finally {
      setGenerating(false);
    }
  }

  function handleTopicClick(topic: TopicProgress) {
    if (topic.status === 'locked') return;
    router.push(`/study/chapter?topic=${encodeURIComponent(topic.title)}&id=${topic.id}`);
  }

  if (loading || loadingState) {
    return (
      <main className="flex min-h-screen items-center justify-center">
        <span className="inline-flex items-center gap-2 text-sm text-muted-500">
          <span className="spinner" aria-hidden="true" />
          Loading study plan...
        </span>
      </main>
    );
  }

  if (!progress) return null;

  const subjects = progress.syllabus ?? [];
  const completionPct = progress.totalTopics > 0
    ? Math.round((progress.totalTopicsCompleted / progress.totalTopics) * 100)
    : 0;

  return (
    <main className="mx-auto min-h-screen max-w-4xl px-4 pb-24 pt-6">
      <div className="flex items-center justify-between">
        <Logo />
        <Link href="/dashboard" className="text-sm text-ember-600 hover:underline">
          Dashboard
        </Link>
      </div>

      <h1 className="mt-6 font-serif text-2xl font-semibold text-ink-900">
        Study Plan
      </h1>
      <p className="mt-1 text-sm text-muted-500">
        {progress.exam} &middot; Level: {progress.skillLevel} &middot; {completionPct}% complete
      </p>

      {error && <div className="banner banner-error mt-4">{error}</div>}

      {generating && (
        <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
          <span className="spinner mr-2" aria-hidden="true" />
          Generating your personalized syllabus...
        </div>
      )}

      {/* Subject tabs */}
      {subjects.length > 0 && (
        <>
          <div className="mt-6 flex gap-2 overflow-x-auto pb-2">
            {subjects.map((s, idx) => (
              <button
                key={s.subject}
                onClick={() => setActiveSubject(idx)}
                className={`whitespace-nowrap rounded-full px-4 py-1.5 text-sm font-medium transition-colors ${
                  idx === activeSubject
                    ? 'bg-ember-500 text-white'
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
                className={`paper-card px-4 py-3 text-left transition-all ${
                  topic.status === 'locked'
                    ? 'opacity-50 cursor-not-allowed'
                    : 'hover:shadow-md cursor-pointer'
                }`}
              >
                <div className="flex items-center gap-3">
                  <span className="text-xl">{STATUS_ICONS[topic.status]}</span>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-ink-900 truncate">{topic.title}</p>
                    <p className="text-xs text-muted-500">{STATUS_LABELS[topic.status]}</p>
                    {topic.mockScore !== undefined && (
                      <p className="text-xs text-ember-600">Mock: {topic.mockScore}%</p>
                    )}
                  </div>
                </div>
              </button>
            ))}
          </div>

          {/* Final test button — requires 80% topics to be mock-passed */}
          {completionPct >= 80 && (
            <div className="mt-8 text-center">
              <Link
                href="/study/final-test"
                className="btn-primary inline-block px-8 py-3"
              >
                Take Final Comprehensive Test (50 Questions)
              </Link>
            </div>
          )}

          {completionPct > 0 && completionPct < 80 && (
            <p className="mt-6 text-center text-sm text-muted-500">
              Complete at least 80% of topics to unlock the Final Test.
            </p>
          )}
        </>
      )}
    </main>
  );
}
