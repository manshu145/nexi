'use client';

import { Suspense, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { useAuth } from '~/lib/auth-context';
import { api } from '~/lib/api';
import { useTranslation } from '~/lib/useTranslation';
import { TextToSpeech } from '~/components/TextToSpeech';
import { VisualizeButton } from '~/components/VisualizeButton';
import { getLanguage } from '~/lib/i18n';

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

// ═══ localStorage cache helpers ═══
const CACHE_KEY_PREFIX = 'nexi.chapter.';
const CACHE_EXPIRY_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

function getCachedChapter(topic: string): Chapter | null {
  try {
    const key = CACHE_KEY_PREFIX + btoa(encodeURIComponent(topic));
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    const { chapter, timestamp } = JSON.parse(raw);
    if (Date.now() - timestamp > CACHE_EXPIRY_MS) {
      localStorage.removeItem(key);
      return null;
    }
    return chapter as Chapter;
  } catch {
    return null;
  }
}

function setCachedChapter(topic: string, chapter: Chapter): void {
  try {
    const key = CACHE_KEY_PREFIX + btoa(encodeURIComponent(topic));
    localStorage.setItem(key, JSON.stringify({ chapter, timestamp: Date.now() }));
  } catch {
    // localStorage full or unavailable — ignore
  }
}

function ChapterReaderContent() {
  const { user, loading } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();
  const { t, lang } = useTranslation();
  const topic = searchParams.get('topic') ?? '';
  const topicId = searchParams.get('id') ?? '';

  const [chapter, setChapter] = useState<Chapter | null>(null);
  const [currentSection, setCurrentSection] = useState(0);
  const [loadingChapter, setLoadingChapter] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [fromCache, setFromCache] = useState(false);
  const [flipDir, setFlipDir] = useState<'next' | 'prev' | null>(null);
  const [flipKey, setFlipKey] = useState(0);

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

      // Try cache first
      const cached = getCachedChapter(topic);
      if (cached) {
        setChapter(cached);
        setFromCache(true);
        setLoadingChapter(false);
        return;
      }

      // Generate fresh — pass language explicitly from localStorage
      const userLang = getLanguage();
      const res = await api.ai.generateChapter(topic, undefined, userLang);
      setChapter(res.chapter);
      // Cache for next time
      setCachedChapter(topic, res.chapter);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to generate chapter');
    } finally {
      setLoadingChapter(false);
    }
  }

  function nextSection() {
    if (chapter && currentSection < chapter.sections.length) {
      setFlipDir('next');
      setFlipKey(k => k + 1);
      setCurrentSection((s) => s + 1);
    }
  }

  function prevSection() {
    if (currentSection > 0) {
      setFlipDir('prev');
      setFlipKey(k => k + 1);
      setCurrentSection((s) => s - 1);
    }
  }

  if (loading || loadingChapter) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-paper-100">
        <div className="text-center max-w-xs">
          <div className="inline-flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-blue-100 to-blue-50 mb-4">
            <span className="text-3xl">📖</span>
          </div>
          <span className="spinner mx-auto block" aria-hidden="true" />
          <p className="mt-4 text-sm font-medium text-ink-900">
            {t('chapter.loading', 'Generating chapter with AI...')}
          </p>
          <p className="mt-1 text-xs text-muted-500">
            {t('chapter.loading_sub', 'This may take a few seconds')}
          </p>
        </div>
      </main>
    );
  }

  if (error) {
    return (
      <main className="mx-auto max-w-3xl px-4 py-12 text-center">
        <div className="banner banner-error">{error}</div>
        <Link href="/study" className="btn-ghost mt-4 inline-block">
          {t('chapter.back_to_study', 'Back to Study')}
        </Link>
      </main>
    );
  }

  if (!chapter) return null;

  const totalPages = chapter.sections.length + 1; // +1 for summary/keypoints page
  const isOnSummaryPage = currentSection === chapter.sections.length;
  const ttsLanguage = getLanguage() === 'hi' ? 'hi-IN' : 'en-IN';

  return (
    <main className="mx-auto min-h-screen max-w-3xl px-4 pb-28 pt-6">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-paper-200 pb-4">
        <Link href="/study" className="text-sm text-ember-600 hover:underline font-medium">
          &larr; {t('chapter.back_to_study', 'Back to Study')}
        </Link>
        <div className="flex items-center gap-2">
          {fromCache && (
            <span className="text-[10px] bg-green-100 text-green-700 px-2 py-0.5 rounded-full">cached</span>
          )}
          <span className="text-xs text-muted-500">
            {t('chapter.page', 'Page')} {currentSection + 1} / {totalPages}
          </span>
        </div>
      </div>

      {/* Chapter title */}
      <h1 className="mt-6 font-serif text-2xl font-semibold text-ink-900">
        {chapter.title}
      </h1>

      {/* Content */}
      <div key={flipKey} className={`mt-6 ${flipDir === 'next' ? 'kindle-flip-next' : flipDir === 'prev' ? 'kindle-flip-prev' : ''}`}>
        {!isOnSummaryPage ? (
          <article>
            <h2 className="text-lg font-semibold text-ink-800">
              {chapter.sections[currentSection]?.heading}
            </h2>

            {/* TTS + Visualize toolbar */}
            <div className="mt-3 flex items-center gap-2 border-b border-paper-200 pb-3 mb-4">
              <TextToSpeech
                text={chapter.sections[currentSection]?.content ?? ''}
                language={ttsLanguage}
              />
              <VisualizeButton
                text={chapter.sections[currentSection]?.content ?? ''}
                title={chapter.sections[currentSection]?.heading}
              />
            </div>

            <div className="text-ink-700 leading-relaxed whitespace-pre-wrap text-[15px]">
              {chapter.sections[currentSection]?.content}
            </div>
          </article>
        ) : (
          <div>
            {/* Key Points */}
            <h2 className="text-lg font-semibold text-ink-800">
              {t('chapter.key_points', 'Key Points')}
            </h2>
            <ul className="mt-3 space-y-2">
              {chapter.keyPoints.map((point, i) => (
                <li key={i} className="flex items-start gap-2 text-sm text-ink-700">
                  <span className="mt-0.5 flex-shrink-0 h-5 w-5 rounded-full bg-ember-100 text-ember-600 flex items-center justify-center text-xs font-bold">
                    {i + 1}
                  </span>
                  <span>{point}</span>
                </li>
              ))}
            </ul>

            {/* Summary */}
            <h2 className="mt-8 text-lg font-semibold text-ink-800">
              {t('chapter.summary', 'Summary')}
            </h2>
            <div className="mt-3 flex items-center gap-2 mb-3">
              <TextToSpeech text={chapter.summary} language={ttsLanguage} />
            </div>
            <p className="text-sm text-ink-700 leading-relaxed">
              {chapter.summary}
            </p>

            {/* Take mock test button */}
            <div className="mt-10 text-center">
              <Link
                href={`/study/mock-test?topic=${encodeURIComponent(topic)}&id=${encodeURIComponent(topicId)}`}
                className="btn-primary inline-block px-8 py-3 text-base font-semibold shadow-lg hover:shadow-xl transition-shadow"
              >
                🎯 {t('chapter.take_mock', 'Take Mock Test (80% to pass)')}
              </Link>
            </div>
          </div>
        )}
      </div>

      {/* Navigation - fixed bottom */}
      <div className="fixed bottom-0 left-0 right-0 border-t border-paper-200 bg-paper-50/90 backdrop-blur-md px-4 py-3 z-20">
        <div className="mx-auto flex max-w-3xl items-center justify-between">
          <button
            onClick={prevSection}
            disabled={currentSection === 0}
            className="btn-ghost px-4 py-2 text-sm disabled:opacity-40"
          >
            &larr; {t('previous', 'Previous')}
          </button>

          {/* Progress dots */}
          <div className="flex gap-1.5">
            {Array.from({ length: totalPages }).map((_, i) => (
              <button
                key={i}
                onClick={() => setCurrentSection(i)}
                className={`h-2.5 w-2.5 rounded-full transition-all duration-200 ${
                  i === currentSection ? 'bg-ember-500 scale-125' : i < currentSection ? 'bg-ember-300' : 'bg-paper-300'
                }`}
              />
            ))}
          </div>

          <button
            onClick={nextSection}
            disabled={currentSection >= totalPages - 1}
            className="btn-ghost px-4 py-2 text-sm disabled:opacity-40"
          >
            {t('next', 'Next')} &rarr;
          </button>
        </div>
      </div>
    </main>
  );
}

export default function ChapterReaderPage() {
  return (
    <Suspense fallback={<div className="flex min-h-dvh items-center justify-center"><span className="spinner" /></div>}>
      <ChapterReaderContent />
    </Suspense>
  );
}
