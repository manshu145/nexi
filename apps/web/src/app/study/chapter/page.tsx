'use client';

import { useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { useAuth } from '~/lib/auth-context';
import { api } from '~/lib/api';

interface ChapterSection {
  heading: string;
  content: string;
}

interface Chapter {
  title: string;
  sections: ChapterSection[];
  summary: string;
  keyPoints: string[];
}

export default function ChapterReaderPage() {
  const { user, loading } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();
  const topic = searchParams.get('topic') ?? '';
  const topicId = searchParams.get('id') ?? '';

  const [chapter, setChapter] = useState<Chapter | null>(null);
  const [currentSection, setCurrentSection] = useState(0);
  const [loadingChapter, setLoadingChapter] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!loading && !user) router.replace('/signin');
  }, [user, loading, router]);

  useEffect(() => {
    if (!user || !topic) return;
    loadChapter();
  }, [user, topic]);

  async function loadChapter() {
    try {
      setLoadingChapter(true);
      const res = await api.ai.generateChapter(topic);
      setChapter(res.chapter);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to generate chapter');
    } finally {
      setLoadingChapter(false);
    }
  }

  function nextSection() {
    if (chapter && currentSection < chapter.sections.length) {
      setCurrentSection((s) => s + 1);
    }
  }

  function prevSection() {
    if (currentSection > 0) {
      setCurrentSection((s) => s - 1);
    }
  }

  if (loading || loadingChapter) {
    return (
      <main className="flex min-h-screen items-center justify-center">
        <div className="text-center">
          <span className="spinner" aria-hidden="true" />
          <p className="mt-3 text-sm text-muted-500">
            {loadingChapter ? 'Generating chapter with AI...' : 'Loading...'}
          </p>
          <p className="mt-1 text-xs text-muted-400">This may take a few seconds</p>
        </div>
      </main>
    );
  }

  if (error) {
    return (
      <main className="mx-auto max-w-3xl px-4 py-12 text-center">
        <div className="banner banner-error">{error}</div>
        <Link href="/study" className="btn-ghost mt-4 inline-block">
          Back to Study
        </Link>
      </main>
    );
  }

  if (!chapter) return null;

  const totalPages = chapter.sections.length + 1; // +1 for summary/keypoints page
  const isOnSummaryPage = currentSection === chapter.sections.length;

  return (
    <main className="mx-auto min-h-screen max-w-3xl px-4 pb-24 pt-6">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-paper-200 pb-4">
        <Link href="/study" className="text-sm text-ember-600 hover:underline">
          &larr; Back to Study
        </Link>
        <span className="text-xs text-muted-500">
          Page {currentSection + 1} / {totalPages}
        </span>
      </div>

      {/* Chapter title */}
      <h1 className="mt-6 font-serif text-2xl font-semibold text-ink-900">
        {chapter.title}
      </h1>

      {/* Content */}
      <div className="mt-6">
        {!isOnSummaryPage ? (
          <article className="prose prose-slate max-w-none">
            <h2 className="text-lg font-semibold text-ink-800">
              {chapter.sections[currentSection]?.heading}
            </h2>
            <div
              className="mt-3 text-ink-700 leading-relaxed whitespace-pre-wrap"
            >
              {chapter.sections[currentSection]?.content}
            </div>
          </article>
        ) : (
          <div>
            {/* Key Points */}
            <h2 className="text-lg font-semibold text-ink-800">Key Points</h2>
            <ul className="mt-3 space-y-2">
              {chapter.keyPoints.map((point, i) => (
                <li key={i} className="flex items-start gap-2 text-sm text-ink-700">
                  <span className="mt-0.5 text-ember-500">&#x2022;</span>
                  <span>{point}</span>
                </li>
              ))}
            </ul>

            {/* Summary */}
            <h2 className="mt-8 text-lg font-semibold text-ink-800">Summary</h2>
            <p className="mt-3 text-sm text-ink-700 leading-relaxed">
              {chapter.summary}
            </p>

            {/* Take mock test button */}
            <div className="mt-8 text-center">
              <Link
                href={`/study/mock-test?topic=${encodeURIComponent(topic)}&id=${topicId}`}
                className="btn-primary inline-block px-6 py-2.5"
              >
                Take Mock Test (80% to pass)
              </Link>
            </div>
          </div>
        )}
      </div>

      {/* Navigation */}
      <div className="fixed bottom-0 left-0 right-0 border-t border-paper-200 bg-paper-50 px-4 py-3">
        <div className="mx-auto flex max-w-3xl items-center justify-between">
          <button
            onClick={prevSection}
            disabled={currentSection === 0}
            className="btn-ghost px-4 py-2 text-sm disabled:opacity-40"
          >
            &larr; Previous
          </button>

          {/* Progress dots */}
          <div className="flex gap-1">
            {Array.from({ length: totalPages }).map((_, i) => (
              <button
                key={i}
                onClick={() => setCurrentSection(i)}
                className={`h-2 w-2 rounded-full transition-colors ${
                  i === currentSection ? 'bg-ember-500' : 'bg-paper-300'
                }`}
              />
            ))}
          </div>

          <button
            onClick={nextSection}
            disabled={currentSection >= totalPages - 1}
            className="btn-ghost px-4 py-2 text-sm disabled:opacity-40"
          >
            Next &rarr;
          </button>
        </div>
      </div>
    </main>
  );
}
