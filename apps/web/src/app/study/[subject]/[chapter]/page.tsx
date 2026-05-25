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
  const [showViz, setShowViz] = useState(false);
  const [vizLoading, setVizLoading] = useState(false);
  const [vizImageUrl, setVizImageUrl] = useState<string | null>(null);
  const [vizError, setVizError] = useState<string | null>(null);
  const [speaking, setSpeaking] = useState(false);
  const [flipDirection, setFlipDirection] = useState<'next' | 'prev' | null>(null);
  const [isFlipping, setIsFlipping] = useState(false);
  const [selectedText, setSelectedText] = useState('');
  const [showSelectionBtn, setShowSelectionBtn] = useState(false);
  const [selectionPos, setSelectionPos] = useState({ x: 0, y: 0 });
  const touchStartX = useRef(0);
  const touchStartY = useRef(0);
  const pageRef = useRef<HTMLDivElement>(null);

  useEffect(() => { if (!loading && !user) router.replace('/signin'); }, [user, loading, router]);

  useEffect(() => {
    if (!user) return;
    (async () => {
      try {
        const meRes = await api.me();
        const exam = meRes.user.targetExam ?? 'jee-main';
        const lang = getLanguage();
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
    if (currentPage < pages.length - 1 && !isFlipping) {
      setIsFlipping(true);
      setFlipDirection('next');
      setTimeout(() => {
        setCurrentPage(p => p + 1);
        setFlipDirection(null);
        setIsFlipping(false);
      }, 250);
    }
  }, [currentPage, pages.length, isFlipping]);

  const goPrev = useCallback(() => {
    if (currentPage > 0 && !isFlipping) {
      setIsFlipping(true);
      setFlipDirection('prev');
      setTimeout(() => {
        setCurrentPage(p => p - 1);
        setFlipDirection(null);
        setIsFlipping(false);
      }, 250);
    }
  }, [currentPage, isFlipping]);

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
  const handleTouchStart = (e: React.TouchEvent) => {
    touchStartX.current = e.touches[0]?.clientX ?? 0;
    touchStartY.current = e.touches[0]?.clientY ?? 0;
  };
  const handleTouchEnd = (e: React.TouchEvent) => {
    const diffX = (e.changedTouches[0]?.clientX ?? 0) - touchStartX.current;
    const diffY = Math.abs((e.changedTouches[0]?.clientY ?? 0) - touchStartY.current);
    // Only trigger page flip for horizontal swipes (not scroll)
    if (Math.abs(diffX) > 60 && diffY < 80) {
      if (diffX < -60) goNext();
      if (diffX > 60) goPrev();
    }
  };

  // Text selection detection
  const handleTextSelection = () => {
    const selection = window.getSelection();
    const text = selection?.toString().trim() ?? '';
    if (text.length > 15) {
      setSelectedText(text);
      // Position the floating button near the selection
      const range = selection?.getRangeAt(0);
      if (range) {
        const rect = range.getBoundingClientRect();
        setSelectionPos({ x: rect.left + rect.width / 2, y: rect.top - 10 });
      }
      setShowSelectionBtn(true);
    } else {
      setShowSelectionBtn(false);
      setSelectedText('');
    }
  };

  // Dismiss selection button on click elsewhere
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (!target.closest('.selection-viz-btn')) {
        // Delay to allow selection check first
        setTimeout(() => {
          const sel = window.getSelection()?.toString().trim() ?? '';
          if (sel.length < 15) {
            setShowSelectionBtn(false);
            setSelectedText('');
          }
        }, 200);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const handleVisualize = async (mode: 'page' | 'selection') => {
    setVizLoading(true);
    setShowViz(true);
    setShowSelectionBtn(false);
    setVizError(null);
    setVizImageUrl(null);
    try {
      let mermaidStr: string;
      if (mode === 'selection' && selectedText) {
        const lang = getLanguage();
        const res = await api.visualizeSelection(selectedText, subject, lang);
        mermaidStr = res.mermaid;
      } else {
        const meRes = await api.me();
        const exam = meRes.user.targetExam ?? 'jee-main';
        const res = await api.getChapterDiagram(exam, subject, chapter);
        mermaidStr = res.mermaid;
      }

      if (!mermaidStr || mermaidStr.trim().length < 10) {
        throw new Error('AI returned empty diagram. Try again.');
      }

      // Try rendering mermaid to SVG
      let svg: string;
      try {
        const mermaidLib = await import('mermaid');
        mermaidLib.default.initialize({
          startOnLoad: false,
          theme: 'neutral',
          fontFamily: 'Inter, system-ui, sans-serif',
          flowchart: { curve: 'basis', padding: 16 },
          securityLevel: 'loose',
        });
        const rendered = await mermaidLib.default.render('mermaid-viz-' + Date.now(), mermaidStr);
        svg = rendered.svg;
      } catch (mermaidErr) {
        // Mermaid syntax error — show as SVG fallback with the raw text
        console.warn('Mermaid render failed:', mermaidErr);
        // Create a simple fallback SVG showing the diagram as text
        svg = `<svg xmlns="http://www.w3.org/2000/svg" width="800" height="400" viewBox="0 0 800 400">
          <rect width="800" height="400" fill="#FBF6E8" rx="8"/>
          <text x="400" y="30" text-anchor="middle" font-family="Inter, sans-serif" font-size="14" fill="#7A6F5C">Diagram (text view)</text>
          <foreignObject x="40" y="50" width="720" height="340">
            <div xmlns="http://www.w3.org/1999/xhtml" style="font-family:monospace;font-size:11px;white-space:pre-wrap;color:#2A241A;padding:8px">${escapeHtml(mermaidStr)}</div>
          </foreignObject>
        </svg>`;
      }

      // Try converting to PNG, fallback to showing SVG directly
      try {
        const pngUrl = await svgToPng(svg, 1200, 800);
        setVizImageUrl(pngUrl);
      } catch {
        // PNG conversion failed — show SVG as data URL
        const svgBlob = new Blob([svg], { type: 'image/svg+xml;charset=utf-8' });
        const svgUrl = URL.createObjectURL(svgBlob);
        setVizImageUrl(svgUrl);
      }
    } catch (err) {
      setVizError(err instanceof Error ? err.message : 'Failed to generate visualization. Try again.');
    } finally {
      setVizLoading(false);
    }
  };

  const handleShareViz = async () => {
    if (!vizImageUrl) return;
    try {
      const blob = await (await fetch(vizImageUrl)).blob();
      const file = new File([blob], `${chapter}-visualization.png`, { type: 'image/png' });
      if (navigator.share && navigator.canShare({ files: [file] })) {
        await navigator.share({
          title: `${chapterName} — Nexigrate`,
          text: `Study visualization for ${chapterName}`,
          files: [file],
        });
      } else {
        // Fallback: download
        const a = document.createElement('a');
        a.href = vizImageUrl;
        a.download = `${chapter}-visualization.png`;
        a.click();
      }
    } catch {
      // Fallback: download
      const a = document.createElement('a');
      a.href = vizImageUrl!;
      a.download = `${chapter}-visualization.png`;
      a.click();
    }
  };

  const handleSaveViz = () => {
    if (!vizImageUrl) return;
    const a = document.createElement('a');
    a.href = vizImageUrl;
    a.download = `${chapter}-visualization.png`;
    a.click();
  };

  const handleTTS = () => {
    if (speaking) { window.speechSynthesis.cancel(); setSpeaking(false); return; }
    const text = stripMarkdown(pages[currentPage] ?? '');
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = getLanguage() === 'hi' ? 'hi-IN' : 'en-IN';
    utterance.rate = 0.9;
    utterance.onend = () => setSpeaking(false);
    window.speechSynthesis.speak(utterance);
    setSpeaking(true);
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
        <button onClick={() => router.back()} className="btn-ghost-sm">←</button>
        <span className="text-xs font-medium text-muted-500 truncate max-w-[35%] sm:max-w-[40%] hidden sm:inline">{chapterName}</span>
        <span className="text-xs font-medium text-muted-500 sm:hidden">{currentPage + 1}/{pages.length}</span>
        <div className="flex items-center gap-1.5 sm:gap-2">
          <button onClick={handleTTS} className={`tts-btn ${speaking ? 'playing' : ''}`}>
            {speaking ? '⏸' : '🔊'}<span className="hidden sm:inline"> {speaking ? 'Pause' : 'Listen'}</span>
          </button>
          <button onClick={() => handleVisualize('page')} className="tts-btn">
            📊<span className="hidden sm:inline"> Visualize</span>
          </button>
        </div>
      </div>

      {/* Book content with 3D page flip */}
      <div className="kindle-book-wrapper">
        <div className="kindle-page-container" ref={pageRef}>
          <div
            className={`kindle-page ${flipDirection === 'next' ? 'page-flip-forward' : flipDirection === 'prev' ? 'page-flip-backward' : ''}`}
            onMouseUp={handleTextSelection}
          >
            <div className="reader">
              <div className="reader-body" dangerouslySetInnerHTML={{ __html: renderMarkdown(pages[currentPage] ?? '') }} />
            </div>
          </div>
        </div>

        {/* Floating selection visualize button */}
        {showSelectionBtn && (
          <div
            className="selection-viz-btn fixed z-40 animate-fade-in"
            style={{ left: `${Math.min(Math.max(selectionPos.x - 80, 16), window.innerWidth - 200)}px`, top: `${Math.max(selectionPos.y - 44, 60)}px` }}
          >
            <button
              onClick={() => handleVisualize('selection')}
              className="flex items-center gap-1.5 rounded-full bg-ink-900 px-3 py-2 text-xs font-medium text-paper-50 shadow-lg transition-transform hover:scale-105 active:scale-95"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg>
              Visualize Selection
            </button>
          </div>
        )}
      </div>

      {/* Footer toolbar */}
      <div className="kindle-toolbar">
        <div className="kindle-progress" style={{ width: `${progressPct}%` }} />
        <button onClick={goPrev} disabled={currentPage === 0 || isFlipping}>← Prev</button>
        <span className="kindle-page-indicator">{currentPage + 1} / {pages.length}</span>
        {currentPage === pages.length - 1 ? (
          <button onClick={() => router.push(`/study/${subject}/${chapter}/quiz`)} style={{ backgroundColor: 'var(--color-ember-500)', color: 'var(--color-paper-50)', borderColor: 'var(--color-ember-500)' }}>Take Quiz →</button>
        ) : (
          <button onClick={goNext} disabled={isFlipping}>Next →</button>
        )}
      </div>

      {/* Visualization Modal */}
      {showViz && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink-950/70 p-4 backdrop-blur-sm" onClick={() => setShowViz(false)}>
          <div className="viz-modal max-w-2xl w-full max-h-[85vh] overflow-auto bg-paper-50 rounded-xl shadow-2xl" onClick={e => e.stopPropagation()}>
            <div className="sticky top-0 z-10 flex items-center justify-between border-b border-line bg-paper-50 px-5 py-3 rounded-t-xl">
              <h3 className="font-serif text-sm font-semibold text-ink-900">Chapter Visualization</h3>
              <button onClick={() => setShowViz(false)} className="flex h-7 w-7 items-center justify-center rounded-full text-muted-500 hover:bg-paper-200 hover:text-ink-900 transition-colors">✕</button>
            </div>
            <div className="p-5">
              {vizLoading ? (
                <div className="flex flex-col items-center justify-center py-16">
                  <span className="spinner" style={{ width: 20, height: 20 }} />
                  <p className="mt-3 text-sm text-muted-500">Generating visualization...</p>
                </div>
              ) : vizError ? (
                <div className="flex flex-col items-center justify-center py-12">
                  <div className="banner banner-error">{vizError}</div>
                  <button onClick={() => handleVisualize('page')} className="btn-ghost-sm mt-4">Try Again</button>
                </div>
              ) : vizImageUrl ? (
                <div className="flex flex-col items-center">
                  <img src={vizImageUrl} alt={`Visualization of ${chapterName}`} className="w-full rounded-lg border border-line" />
                  <div className="mt-4 flex items-center gap-3">
                    <button onClick={handleSaveViz} className="btn-ghost-sm">💾 Save PNG</button>
                    <button onClick={handleShareViz} className="btn-ghost-sm">📤 Share</button>
                  </div>
                  <p className="mt-3 text-center text-xs text-muted-400">Powered by Nexigrate AI</p>
                </div>
              ) : null}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/** Get user's selected language from cookie or localStorage */
function getLanguage(): 'en' | 'hi' {
  // Try cookie first (most reliable for SSR-aware scenarios)
  if (typeof document !== 'undefined') {
    const match = document.cookie.match(/nexigrate-language=(en|hi)/);
    if (match) return match[1] as 'en' | 'hi';
  }
  // Fallback to localStorage
  if (typeof localStorage !== 'undefined') {
    const stored = localStorage.getItem('nexigrate-language');
    if (stored === 'hi' || stored === 'en') return stored;
  }
  return 'en';
}

/** Strip markdown for TTS */
function stripMarkdown(md: string): string {
  return md
    .replace(/^#{1,6}\s+/gm, '')
    .replace(/\*\*(.+?)\*\*/g, '$1')
    .replace(/\*(.+?)\*/g, '$1')
    .replace(/`(.+?)`/g, '$1')
    .replace(/\$(.+?)\$/g, '$1')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/^[-*+]\s+/gm, '')
    .replace(/^\d+\.\s+/gm, '')
    .replace(/\n{2,}/g, '. ')
    .replace(/\n/g, ' ')
    .trim();
}

/** Convert SVG string to PNG data URL using canvas */
async function svgToPng(svgStr: string, width: number, height: number): Promise<string> {
  return new Promise((resolve, reject) => {
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) { reject(new Error('Canvas context failed')); return; }

    const img = new Image();
    const blob = new Blob([svgStr], { type: 'image/svg+xml;charset=utf-8' });
    const url = URL.createObjectURL(blob);

    img.onload = () => {
      // White background
      ctx.fillStyle = '#FBF6E8';
      ctx.fillRect(0, 0, width, height);
      // Scale SVG to fit
      const scale = Math.min(width / img.naturalWidth, height / img.naturalHeight) * 0.9;
      const x = (width - img.naturalWidth * scale) / 2;
      const y = (height - img.naturalHeight * scale) / 2;
      ctx.drawImage(img, x, y, img.naturalWidth * scale, img.naturalHeight * scale);
      // Add watermark
      ctx.font = '11px Inter, system-ui, sans-serif';
      ctx.fillStyle = 'rgba(122, 111, 92, 0.5)';
      ctx.fillText('NEXIGRATE', width - 90, height - 12);
      URL.revokeObjectURL(url);
      resolve(canvas.toDataURL('image/png'));
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('SVG render failed')); };
    img.src = url;
  });
}

/**
 * Render markdown to properly styled HTML for the Kindle reader.
 * Handles headings, bold, italic, code, formulas, lists, blockquotes,
 * and horizontal rules — producing clean, book-quality HTML output.
 */
function renderMarkdown(md: string): string {
  // Pre-process: handle code blocks (```...```) — preserve them as-is
  const codeBlocks: string[] = [];
  let processed = md.replace(/```(\w*)\n([\s\S]*?)```/g, (_match, lang, code) => {
    const idx = codeBlocks.length;
    const escaped = escapeHtml(code.trim());
    codeBlocks.push(
      `<pre class="reader-codeblock"><code${lang ? ` data-lang="${lang}"` : ''}>${escaped}</code></pre>`
    );
    return `\n%%CODEBLOCK_${idx}%%\n`;
  });

  // Split into lines for block-level processing
  const lines = processed.split('\n');
  const blocks: string[] = [];
  let currentParagraph: string[] = [];
  let inList = false;
  let listType: 'ul' | 'ol' = 'ul';
  let listItems: string[] = [];

  const flushParagraph = () => {
    if (currentParagraph.length > 0) {
      const text = currentParagraph.join(' ').trim();
      if (text) {
        blocks.push(`<p class="reader-paragraph">${inlineFormat(text)}</p>`);
      }
      currentParagraph = [];
    }
  };

  const flushList = () => {
    if (listItems.length > 0) {
      const tag = listType;
      blocks.push(`<${tag} class="reader-list reader-list-${tag}">${listItems.join('')}</${tag}>`);
      listItems = [];
      inList = false;
    }
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    const trimmed = line.trim();

    // Code block placeholder
    const codeMatch = trimmed.match(/^%%CODEBLOCK_(\d+)%%$/);
    if (codeMatch) {
      flushParagraph();
      flushList();
      blocks.push(codeBlocks[parseInt(codeMatch[1]!)]!);
      continue;
    }

    // Empty line — flush current paragraph
    if (trimmed === '') {
      flushParagraph();
      flushList();
      continue;
    }

    // Headings
    const headingMatch = trimmed.match(/^(#{1,6})\s+(.+)$/);
    if (headingMatch) {
      flushParagraph();
      flushList();
      const level = headingMatch[1]!.length;
      const text = headingMatch[2]!;
      blocks.push(`<h${level} class="reader-heading reader-h${level}">${inlineFormat(text)}</h${level}>`);
      continue;
    }

    // Horizontal rule
    if (/^[-*_]{3,}$/.test(trimmed)) {
      flushParagraph();
      flushList();
      blocks.push('<hr class="reader-hr" />');
      continue;
    }

    // Blockquote
    if (trimmed.startsWith('> ')) {
      flushParagraph();
      flushList();
      const quoteText = trimmed.slice(2);
      blocks.push(`<blockquote class="reader-blockquote"><p>${inlineFormat(quoteText)}</p></blockquote>`);
      continue;
    }

    // Unordered list
    const ulMatch = trimmed.match(/^[-*+]\s+(.+)$/);
    if (ulMatch) {
      flushParagraph();
      if (inList && listType !== 'ul') flushList();
      inList = true;
      listType = 'ul';
      listItems.push(`<li>${inlineFormat(ulMatch[1]!)}</li>`);
      continue;
    }

    // Ordered list
    const olMatch = trimmed.match(/^\d+[.)]\s+(.+)$/);
    if (olMatch) {
      flushParagraph();
      if (inList && listType !== 'ol') flushList();
      inList = true;
      listType = 'ol';
      listItems.push(`<li>${inlineFormat(olMatch[1]!)}</li>`);
      continue;
    }

    // Regular paragraph text
    if (inList) flushList();
    currentParagraph.push(trimmed);
  }

  flushParagraph();
  flushList();

  // Add drop cap to the first paragraph
  const result = blocks.join('\n');
  return result.replace(
    /^(<p class="reader-paragraph">)/,
    '<p class="reader-paragraph reader-dropcap">'
  );
}

/** Format inline markdown: bold, italic, code, formulas, links */
function inlineFormat(text: string): string {
  return text
    // Bold + italic
    .replace(/\*\*\*(.+?)\*\*\*/g, '<strong><em>$1</em></strong>')
    // Bold
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    // Italic
    .replace(/\*(.+?)\*/g, '<em>$1</em>')
    // Inline math/formulas ($ ... $)
    .replace(/\$(.+?)\$/g, '<code class="reader-formula">$1</code>')
    // Inline code (` ... `)
    .replace(/`(.+?)`/g, '<code class="reader-code">$1</code>')
    // Links [text](url)
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" class="reader-link" target="_blank" rel="noopener">$1</a>');
}

/** Escape HTML entities */
function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
