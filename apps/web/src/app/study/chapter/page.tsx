'use client';

import { useEffect, useState, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useAuth } from '~/lib/auth-context';
import { api } from '~/lib/api';

function ChapterContent() {
  const { user, loading } = useAuth();
  const router = useRouter();
  const params = useSearchParams();
  const subject = params.get('subject') ?? '';
  const topic = params.get('topic') ?? '';
  const topicId = params.get('topicId') ?? '';

  const [chapter, setChapter] = useState<any>(null);
  const [currentSection, setCurrentSection] = useState(0);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!loading && !user) router.replace('/signin');
  }, [user, loading, router]);

  useEffect(() => {
    if (!user || !topicId) return;
    (async () => {
      setGenerating(true);
      try {
        const { progress } = await api.ai.getProgress();
        const { chapter: ch } = await api.ai.generateChapter({
          exam: progress?.exam ?? '',
          subject,
          topic,
          topicId,
          skillLevel: progress?.skillLevel ?? 'intermediate',
          language: progress?.language ?? 'en',
        });
        setChapter(ch);
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Failed to load chapter');
      } finally {
        setGenerating(false);
      }
    })();
  }, [user, topicId, subject, topic]);

  if (loading || !user || generating) {
    return (
      <main className="kindle-loading">
        <div className="kindle-loader">
          <span className="spinner" />
          <p>Generating your personalized chapter…</p>
          <p className="kindle-loader-sub">AI is writing content at your level</p>
        </div>
      </main>
    );
  }

  if (error) {
    return (
      <main className="kindle-error">
        <p>{error}</p>
        <button className="btn-primary" onClick={() => router.back()}>Go Back</button>
      </main>
    );
  }

  if (!chapter) return null;

  const sections = chapter.sections ?? [];
  const section = sections[currentSection];
  const totalPages = sections.length + 2; // +1 for key points, +1 for summary
  const currentPage = currentSection + 1;

  return (
    <main className="kindle-page">
      {/* Kindle Header */}
      <header className="kindle-header">
        <button className="kindle-back" onClick={() => router.push('/study')}>✕</button>
        <div className="kindle-title-area">
          <h1 className="kindle-book-title">{chapter.title}</h1>
          <p className="kindle-meta">{subject} · {topic}</p>
        </div>
        <span className="kindle-page-num">{currentPage}/{totalPages}</span>
      </header>

      {/* Kindle Content */}
      <article className="kindle-content">
        {currentSection < sections.length && section && (
          <div className="kindle-section">
            <h2 className="kindle-section-heading">{section.heading}</h2>
            <div className="kindle-section-body" dangerouslySetInnerHTML={{ __html: formatContent(section.content) }} />
          </div>
        )}

        {currentSection === sections.length && (
          <div className="kindle-section">
            <h2 className="kindle-section-heading">📌 Key Points</h2>
            <ul className="kindle-key-points">
              {(chapter.keyPoints ?? []).map((point: string, i: number) => (
                <li key={i}>{point}</li>
              ))}
            </ul>
          </div>
        )}

        {currentSection === sections.length + 1 && (
          <div className="kindle-section">
            <h2 className="kindle-section-heading">📝 Summary</h2>
            <p className="kindle-summary">{chapter.summary}</p>
            <div className="kindle-complete">
              <p>Chapter complete! Take the mock test to advance.</p>
              <button
                className="btn-primary"
                onClick={() => router.push(`/study/mock-test?subject=${encodeURIComponent(subject)}&topic=${encodeURIComponent(topic)}&topicId=${topicId}`)}
              >
                Take Mock Test →
              </button>
            </div>
          </div>
        )}
      </article>

      {/* Kindle Footer Navigation */}
      <footer className="kindle-footer">
        <button
          className="kindle-nav-btn"
          onClick={() => setCurrentSection(Math.max(0, currentSection - 1))}
          disabled={currentSection === 0}
        >
          ← Previous
        </button>
        <div className="kindle-progress">
          <div className="kindle-progress-bar" style={{ width: `${(currentPage / totalPages) * 100}%` }} />
        </div>
        <button
          className="kindle-nav-btn"
          onClick={() => setCurrentSection(Math.min(totalPages - 1, currentSection + 1))}
          disabled={currentSection >= totalPages - 1}
        >
          Next →
        </button>
      </footer>
    </main>
  );
}

export default function ChapterPage() {
  return (
    <Suspense fallback={<main className="kindle-loading"><span className="spinner" /> Loading…</main>}>
      <ChapterContent />
    </Suspense>
  );
}

function formatContent(text: string): string {
  // Simple markdown-like formatting
  return text
    .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.*?)\*/g, '<em>$1</em>')
    .replace(/`(.*?)`/g, '<code>$1</code>')
    .replace(/\n\n/g, '</p><p>')
    .replace(/\n/g, '<br/>')
    .replace(/^/, '<p>')
    .replace(/$/, '</p>');
}
