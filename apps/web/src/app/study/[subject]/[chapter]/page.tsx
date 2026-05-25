'use client';
import { useEffect, useState, useCallback, useRef } from 'react';
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
  const [mermaidCode, setMermaidCode] = useState<string | null>(null);
  const [mermaidSvg, setMermaidSvg] = useState<string | null>(null);
  const [showViz, setShowViz] = useState(false);
  const [vizLoading, setVizLoading] = useState(false);
  const [speaking, setSpeaking] = useState(false);
  const [flipClass, setFlipClass] = useState('');
  const touchStartX = useRef(0);

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
        // Split by ## headings into pages (each section = 1 page)
        const sections = res.chapter.content.split(/(?=^## )/m).filter(s => s.trim());
        setPages(sections.length > 0 ? sections : [res.chapter.content]);
      } catch (e) { setError(e instanceof Error ? e.message : 'Failed to load chapter'); }
      finally { setPageLoading(false); }
    })();
  }, [user, subject, chapter]);

  const goNext = useCallback(() => {
    if (currentPage < pages.length - 1) {
      setFlipClass('kindle-flip-next');
      setTimeout(() => { setCurrentPage(p => p + 1); setFlipClass(''); }, 300);
    }
  }, [currentPage, pages.length]);

  const goPrev = useCallback(() => {
    if (currentPage > 0) {
      setFlipClass('kindle-flip-prev');
      setTimeout(() => { setCurrentPage(p => p - 1); setFlipClass(''); }, 300);
    }
  }, [currentPage]);

  // Keyboard navigation
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'ArrowRight' || e.key === ' ') { e.preventDefault(); goNext(); }
      if (e.key === 'ArrowLeft') { e.preventDefault(); goPrev(); }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [goNext, goPrev]);

  // Swipe gesture
  const handleTouchStart = (e: React.TouchEvent) => { touchStartX.current = e.touches[0]?.clientX ?? 0; };
  const handleTouchEnd = (e: React.TouchEvent) => {
    const diff = (e.changedTouches[0]?.clientX ?? 0) - touchStartX.current;
    if (diff < -50) goNext();
    if (diff > 50) goPrev();
  };

  const handleTTS = () => {
    if (speaking) { window.speechSynthesis.cancel(); setSpeaking(false); return; }
    const text = pages[currentPage]?.replace(/[#*`$\[\]]/g, '') ?? '';
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = (localStorage.getItem('nexigrate-language') ?? 'en') === 'hi' ? 'hi-IN' : 'en-IN';
    utterance.rate = 0.9;
    utterance.onend = () => setSpeaking(false);
    window.speechSynthesis.speak(utterance);
    setSpeaking(true);
  };

  const handleVisualize = async () => {
    if (mermaidSvg) { setShowViz(true); return; }
    setVizLoading(true); setShowViz(true);
    try {
      const meRes = await api.me();
      const exam = meRes.user.targetExam ?? 'jee-main';
      const res = await api.getChapterDiagram(exam, subject, chapter);
      setMermaidCode(res.mermaid);
      // Render mermaid to SVG
      const mermaidLib = await import('mermaid');
      mermaidLib.default.initialize({ startOnLoad: false, theme: 'neutral', fontFamily: 'Inter, sans-serif' });
      const { svg } = await mermaidLib.default.render('mermaid-viz', res.mermaid);
      setMermaidSvg(svg);
    } catch { setMermaidSvg('<p style="text-align:center;color:#7A6F5C">Failed to generate diagram</p>'); }
    finally { setVizLoading(false); }
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
    <div className="kindle-frame" onTouchStart={handleTouchStart} onTouchEnd={handleTouchEnd}>
      {/* Header */}
      <div className="kindle-header">
        <button onClick={() => router.back()} className="btn-ghost-sm">← Back</button>
        <span className="text-xs font-medium text-muted-500 truncate max-w-[40%]">{chapterName}</span>
        <div className="flex items-center gap-2">
          <button onClick={handleTTS} className={`tts-btn ${speaking ? 'playing' : ''}`}>
            {speaking ? '⏸ Pause' : '🔊 Listen'}
          </button>
          <button onClick={handleVisualize} className="tts-btn">🔍 Visualize</button>
        </div>
      </div>

      {/* Book content with page flip */}
      <div className="kindle-book-wrapper">
        <div className={`kindle-page ${flipClass}`}>
          <div className="reader">
            <div className="reader-body" dangerouslySetInnerHTML={{ __html: renderMarkdown(pages[currentPage] ?? '') }} />
          </div>
        </div>
      </div>

      {/* Footer toolbar */}
      <div className="kindle-toolbar">
        <div className="kindle-progress" style={{ width: `${progressPct}%` }} />
        <button onClick={goPrev} disabled={currentPage === 0}>← Prev</button>
        <span className="kindle-page-indicator">{currentPage + 1} / {pages.length}</span>
        {currentPage === pages.length - 1 ? (
          <button onClick={() => router.push(`/study/${subject}/${chapter}/quiz`)} style={{ backgroundColor: 'var(--color-ember-500)', color: 'var(--color-paper-50)', borderColor: 'var(--color-ember-500)' }}>Take Quiz →</button>
        ) : (
          <button onClick={goNext}>Next →</button>
        )}
      </div>

      {/* Visualization Modal */}
      {showViz && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink-950/60 p-4" onClick={() => setShowViz(false)}>
          <div className="viz-container max-w-2xl w-full max-h-[80vh] overflow-auto bg-paper-50 rounded-xl p-6" onClick={e => e.stopPropagation()}>
            {vizLoading ? (
              <div className="flex flex-col items-center justify-center py-12"><span className="spinner" /><p className="mt-3 text-sm text-muted-500">Generating visualization...</p></div>
            ) : mermaidSvg ? (
              <div dangerouslySetInnerHTML={{ __html: mermaidSvg }} />
            ) : null}
            <button onClick={() => setShowViz(false)} className="btn-ghost-sm mt-4 mx-auto block">Close</button>
          </div>
        </div>
      )}
    </div>
  );
}

/** Render markdown to styled HTML for the Kindle reader */
function renderMarkdown(md: string): string {
  return md
    // Headings
    .replace(/^### (.+)$/gm, '<h3 class="reader-heading" style="font-size:1.15rem;margin-top:1.5rem">$1</h3>')
    .replace(/^## (.+)$/gm, '<h2 class="reader-heading" style="margin-top:2rem">$1</h2>')
    .replace(/^# (.+)$/gm, '<h1 class="reader-heading" style="font-size:1.6rem;margin-top:2rem">$1</h1>')
    // Bold and italic
    .replace(/\*\*(.+?)\*\*/g, '<strong style="color:var(--color-ink-900)">$1</strong>')
    .replace(/\*(.+?)\*/g, '<em>$1</em>')
    // Inline code / formulas
    .replace(/\$(.+?)\$/g, '<code style="background:var(--color-paper-200);border:1px solid var(--color-line);border-radius:0.3rem;padding:0.1rem 0.35rem;font-size:0.9em">$1</code>')
    .replace(/`(.+?)`/g, '<code style="background:var(--color-paper-200);border:1px solid var(--color-line);border-radius:0.3rem;padding:0.1rem 0.35rem;font-size:0.9em">$1</code>')
    // Lists
    .replace(/^- (.+)$/gm, '<li style="margin-left:1.5rem;margin-bottom:0.5rem;list-style-type:disc">$1</li>')
    .replace(/^(\d+)\. (.+)$/gm, '<li style="margin-left:1.5rem;margin-bottom:0.5rem;list-style-type:decimal">$2</li>')
    // Paragraphs (double newline)
    .replace(/\n\n/g, '</p><p class="reader-paragraph" style="margin-top:1rem;text-indent:0">')
    // Single newlines within paragraphs
    .replace(/\n/g, '<br/>')
    // Wrap in paragraph
    .replace(/^/, '<p class="reader-paragraph reader-dropcap">')
    .replace(/$/, '</p>')
    // Clean up empty paragraphs
    .replace(/<p class="reader-paragraph"[^>]*><\/p>/g, '')
    .replace(/<p class="reader-paragraph"[^>]*><br\/><\/p>/g, '');
}
