'use client';
import { useEffect, useState, useCallback } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { useAuth } from '~/lib/auth-context';
import { api, type ChapterContent } from '~/lib/api';
import { Logo } from '~/components/Logo';

export default function KindleReaderPage() {
  const { user, loading } = useAuth();
  const router = useRouter();
  const params = useParams();
  const subject = params.subject as string;
  const chapter = params.chapter as string;

  const [content, setContent] = useState<ChapterContent | null>(null);
  const [pages, setPages] = useState<string[]>([]);
  const [currentPage, setCurrentPage] = useState(0);
  const [pageLoading, setPageLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [mermaid, setMermaid] = useState<string | null>(null);
  const [showViz, setShowViz] = useState(false);
  const [speaking, setSpeaking] = useState(false);
  const [flipDir, setFlipDir] = useState<'next' | 'prev' | null>(null);

  useEffect(() => { if (!loading && !user) router.replace('/signin'); }, [user, loading, router]);

  useEffect(() => {
    if (!user) return;
    (async () => {
      try {
        const meRes = await api.me();
        const exam = meRes.user.targetExam ?? 'jee-main';
        const lang = (localStorage.getItem('nexigrate-language') as 'en'|'hi') || 'en';
        const res = await api.getChapterContent(exam, subject, chapter, lang);
        setContent(res.chapter);
        // Split into pages (~400 words each)
        const words = res.chapter.content.split(/\s+/);
        const pgs: string[] = [];
        for (let i = 0; i < words.length; i += 400) {
          pgs.push(words.slice(i, i + 400).join(' '));
        }
        setPages(pgs.length > 0 ? pgs : [res.chapter.content]);
      } catch (e) { setError(e instanceof Error ? e.message : 'Failed to load chapter'); }
      finally { setPageLoading(false); }
    })();
  }, [user, subject, chapter]);

  const goNext = useCallback(() => {
    if (currentPage < pages.length - 1) {
      setFlipDir('next');
      setTimeout(() => { setCurrentPage(p => p + 1); setFlipDir(null); }, 300);
    }
  }, [currentPage, pages.length]);

  const goPrev = useCallback(() => {
    if (currentPage > 0) {
      setFlipDir('prev');
      setTimeout(() => { setCurrentPage(p => p - 1); setFlipDir(null); }, 300);
    }
  }, [currentPage]);

  // Keyboard navigation
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'ArrowRight' || e.key === ' ') goNext();
      if (e.key === 'ArrowLeft') goPrev();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [goNext, goPrev]);

  const handleTTS = () => {
    if (speaking) { window.speechSynthesis.cancel(); setSpeaking(false); return; }
    const utterance = new SpeechSynthesisUtterance(pages[currentPage] ?? '');
    utterance.lang = (localStorage.getItem('nexigrate-language') ?? 'en') === 'hi' ? 'hi-IN' : 'en-IN';
    utterance.rate = 0.9;
    utterance.onend = () => setSpeaking(false);
    window.speechSynthesis.speak(utterance);
    setSpeaking(true);
  };

  const handleVisualize = async () => {
    if (mermaid) { setShowViz(true); return; }
    try {
      const meRes = await api.me();
      const exam = meRes.user.targetExam ?? 'jee-main';
      const res = await api.getChapterDiagram(exam, subject, chapter);
      setMermaid(res.mermaid);
      setShowViz(true);
    } catch { /* ignore */ }
  };

  if (loading || !user || pageLoading) return (
    <div className="kindle-frame"><div className="flex min-h-dvh items-center justify-center"><span className="spinner" /></div></div>
  );

  if (error) return (
    <div className="kindle-frame"><div className="flex min-h-dvh flex-col items-center justify-center gap-4 px-5">
      <div className="banner banner-error">{error}</div>
      <button onClick={() => router.back()} className="btn-ghost">← Back</button>
    </div></div>
  );

  const chapterName = chapter.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
  const progressPct = pages.length > 0 ? Math.round(((currentPage + 1) / pages.length) * 100) : 0;

  return (
    <div className="kindle-frame">
      {/* Header */}
      <div className="kindle-header">
        <button onClick={() => router.back()} className="btn-ghost-sm">← Back</button>
        <span className="text-xs font-medium text-muted-500 truncate max-w-[50%]">{chapterName}</span>
        <div className="flex items-center gap-2">
          <button onClick={handleTTS} className={`tts-btn ${speaking ? 'playing' : ''}`}>
            {speaking ? '⏸ Pause' : '🔊 Listen'}
          </button>
          <button onClick={handleVisualize} className="tts-btn">🔍 Visualize</button>
        </div>
      </div>

      {/* Book content */}
      <div className="kindle-book-wrapper">
        <div className={`kindle-page ${flipDir === 'next' ? 'kindle-flip-next' : flipDir === 'prev' ? 'kindle-flip-prev' : ''}`}>
          <div className="reader">
            <div className="reader-body" dangerouslySetInnerHTML={{ __html: markdownToHtml(pages[currentPage] ?? '') }} />
          </div>
        </div>
      </div>

      {/* Footer toolbar */}
      <div className="kindle-toolbar">
        <div className="kindle-progress" style={{ width: `${progressPct}%` }} />
        <button onClick={goPrev} disabled={currentPage === 0}>← Prev</button>
        <span className="kindle-page-indicator">{currentPage + 1} / {pages.length}</span>
        {currentPage === pages.length - 1 ? (
          <button onClick={() => router.push(`/study/${subject}/${chapter}/quiz`)} className="!bg-ember-500 !text-paper-50 !border-ember-500">Take Quiz →</button>
        ) : (
          <button onClick={goNext}>Next →</button>
        )}
      </div>

      {/* Visualization Modal */}
      {showViz && mermaid && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink-950/60 p-4" onClick={() => setShowViz(false)}>
          <div className="viz-container max-w-2xl w-full max-h-[80vh] overflow-auto" onClick={e => e.stopPropagation()}>
            <pre className="text-xs text-muted-500 whitespace-pre-wrap">{mermaid}</pre>
            <p className="mt-4 text-xs text-muted-400 text-center">Mermaid diagram (render with mermaid.js)</p>
          </div>
        </div>
      )}
    </div>
  );
}

/** Minimal markdown → HTML (headings, bold, paragraphs). */
function markdownToHtml(md: string): string {
  return md
    .replace(/^### (.+)$/gm, '<h3 class="reader-heading" style="font-size:1.2rem">$1</h3>')
    .replace(/^## (.+)$/gm, '<h2 class="reader-heading">$1</h2>')
    .replace(/^# (.+)$/gm, '<h1 class="reader-heading" style="font-size:1.6rem">$1</h1>')
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.+?)\*/g, '<em>$1</em>')
    .replace(/\$(.+?)\$/g, '<code>$1</code>')
    .replace(/\n\n/g, '</p><p class="reader-paragraph">')
    .replace(/^/, '<p class="reader-paragraph reader-dropcap">')
    .replace(/$/, '</p>');
}
