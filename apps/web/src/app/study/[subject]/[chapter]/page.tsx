'use client';
import { useEffect, useState, useCallback, useRef } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { useAuth } from '~/lib/auth-context';
import { api, type ChapterContent } from '~/lib/api';
import { Logo } from '~/components/Logo';
import { PlanGate } from '~/components/PlanGate';

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
  const [vizSvgHtml, setVizSvgHtml] = useState<string | null>(null);
  const [vizImageUrl, setVizImageUrl] = useState<string | null>(null);
  const [vizError, setVizError] = useState<string | null>(null);
  const [vizTab, setVizTab] = useState<'diagram' | 'mindmap' | 'image'>('diagram');
  const [vizCache, setVizCache] = useState<Record<string, { type: 'mermaid' | 'image'; content: string }>>({});
  const [speaking, setSpeaking] = useState(false);
  const [flipDirection, setFlipDirection] = useState<'next' | 'prev' | null>(null);
  const [isFlipping, setIsFlipping] = useState(false);
  const [selectedText, setSelectedText] = useState('');
  const [showSelectionBtn, setShowSelectionBtn] = useState(false);
  const [selectionPos, setSelectionPos] = useState({ x: 0, y: 0 });
  const [showPlanGate, setShowPlanGate] = useState(false);
  const [userCredits, setUserCredits] = useState(0);
  const [unlocking, setUnlocking] = useState(false);
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
        const userPlan = meRes.user.plan ?? 'free';
        const credits = meRes.user.credits ?? 0;
        setUserCredits(credits);

        // PlanGate: Free plan users, chapter index >= 2, insufficient credits
        if (userPlan === 'free') {
          // Get syllabus to determine chapter index
          try {
            const syllRes = await api.getSyllabus(exam);
            const subjectData = syllRes.syllabus.subjects.find((s: any) => s.slug === subject);
            if (subjectData) {
              const chapterIdx = subjectData.chapters.findIndex((ch: any) => ch.slug === chapter);
              if (chapterIdx >= 2 && credits < 5) {
                setShowPlanGate(true);
                setPageLoading(false);
                return;
              }
            }
          } catch { /* allow access if syllabus fetch fails */ }
        }

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

  const handleUseCredits = async () => {
    setUnlocking(true);
    try {
      // Deduct credits via API (uses the earn endpoint with negative type — or direct balance update)
      // For now, just reload the page which will pass since credits check happens server-side too
      setShowPlanGate(false);
      setPageLoading(true);
      const meRes = await api.me();
      const exam = meRes.user.targetExam ?? 'jee-main';
      const lang = getLanguage();
      const res = await api.getChapterContent(exam, subject, chapter, lang);
      setContent(res.chapter);
      const sections = res.chapter.content.split(/(?=^## )/m).filter(s => s.trim());
      setPages(sections.length > 0 ? sections : [res.chapter.content]);
    } catch (e) { setError(e instanceof Error ? e.message : 'Failed to unlock chapter'); }
    finally { setUnlocking(false); setPageLoading(false); }
  };

  /** Play a realistic paper page-turn sound using Web Audio API */
  const playPageTurnSound = useCallback(() => {
    try {
      const ctx = new AudioContext();
      const sampleRate = ctx.sampleRate;
      const duration = 0.25; // 250ms for a natural page flip
      const buffer = ctx.createBuffer(1, sampleRate * duration, sampleRate);
      const data = buffer.getChannelData(0);

      // Generate shaped noise that mimics paper friction
      for (let i = 0; i < data.length; i++) {
        const t = i / data.length;
        // Envelope: quick attack, sustained rustle, gentle fade
        const envelope = t < 0.05
          ? t / 0.05 // attack
          : t < 0.4
            ? 1.0 - (t - 0.05) * 0.3 // slight decay during rustle
            : Math.max(0, 1.0 - ((t - 0.4) / 0.6) ** 1.5); // natural release
        // Filtered noise with some "crinkle" character
        const noise = (Math.random() * 2 - 1);
        const crinkle = Math.sin(i * 0.15) * 0.3 + Math.sin(i * 0.08) * 0.2;
        data[i] = (noise * 0.6 + crinkle * noise) * envelope * 0.4;
      }

      const source = ctx.createBufferSource();
      source.buffer = buffer;

      // Low-pass filter to make it sound like paper (remove harsh high frequencies)
      const lpFilter = ctx.createBiquadFilter();
      lpFilter.type = 'lowpass';
      lpFilter.frequency.value = 3500;
      lpFilter.Q.value = 0.7;

      // High-pass to remove rumble
      const hpFilter = ctx.createBiquadFilter();
      hpFilter.type = 'highpass';
      hpFilter.frequency.value = 200;
      hpFilter.Q.value = 0.5;

      const gain = ctx.createGain();
      gain.gain.value = 0.18;

      source.connect(hpFilter);
      hpFilter.connect(lpFilter);
      lpFilter.connect(gain);
      gain.connect(ctx.destination);
      source.start();

      // Cleanup
      source.onended = () => { ctx.close().catch(() => {}); };
    } catch { /* AudioContext not available, silently skip */ }
  }, []);

  const goNext = useCallback(() => {
    if (currentPage < pages.length - 1 && !isFlipping) {
      playPageTurnSound();
      setIsFlipping(true);
      setFlipDirection('next');
      setTimeout(() => {
        setCurrentPage(p => p + 1);
        setFlipDirection(null);
        setIsFlipping(false);
      }, 700);
    }
  }, [currentPage, pages.length, isFlipping]);

  const goPrev = useCallback(() => {
    if (currentPage > 0 && !isFlipping) {
      playPageTurnSound();
      setIsFlipping(true);
      setFlipDirection('prev');
      setTimeout(() => {
        setCurrentPage(p => p - 1);
        setFlipDirection(null);
        setIsFlipping(false);
      }, 700);
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
    setVizSvgHtml(null);
    setVizImageUrl(null);

    if (mode === 'selection' && selectedText) {
      // Selection-based: always uses diagram
      try {
        const lang = getLanguage();
        const res = await api.visualizeSelection(selectedText, subject, lang);
        const mermaidStr = res.mermaid;
        if (!mermaidStr || mermaidStr.trim().length < 10) throw new Error('AI returned empty diagram. Try again.');
        await renderMermaidToSvg(mermaidStr);
      } catch (err) {
        setVizError(err instanceof Error ? err.message : 'Failed to generate visualization. Try again.');
      } finally { setVizLoading(false); }
      return;
    }

    // Page/chapter-level: use tabbed approach
    await loadVisualizationTab(vizTab);
  };

  const loadVisualizationTab = async (tab: 'diagram' | 'mindmap' | 'image') => {
    setVizTab(tab);
    setVizError(null);
    setVizSvgHtml(null);
    setVizImageUrl(null);

    // Check cache first
    if (vizCache[tab]) {
      const cached = vizCache[tab];
      if (cached.type === 'image') {
        setVizImageUrl(cached.content);
        setVizLoading(false);
        return;
      }
      await renderMermaidToSvg(cached.content);
      setVizLoading(false);
      return;
    }

    setVizLoading(true);
    try {
      const meRes = await api.me();
      const exam = meRes.user.targetExam ?? 'jee-main';
      const vizType = tab === 'image' ? 'image' : tab === 'mindmap' ? 'mindmap' : 'diagram';
      const res = await api.visualizeChapter(exam, subject, chapter, vizType);
      const result = res.visualization;

      // Cache the result
      setVizCache(prev => ({ ...prev, [tab]: result }));

      if (result.type === 'image') {
        setVizImageUrl(result.content);
      } else {
        if (!result.content || result.content.trim().length < 10) throw new Error('AI returned empty diagram. Try again.');
        await renderMermaidToSvg(result.content);
      }
    } catch (err) {
      setVizError(err instanceof Error ? err.message : 'Failed to generate visualization. Try again.');
    } finally { setVizLoading(false); }
  };

  const renderMermaidToSvg = async (mermaidStr: string) => {
    try {
      const mermaidLib = await import('mermaid');
      mermaidLib.default.initialize({
        startOnLoad: false,
        theme: 'neutral',
        fontFamily: 'Inter, system-ui, sans-serif',
        flowchart: { curve: 'basis', padding: 16 },
        securityLevel: 'loose',
      });
      const { svg } = await mermaidLib.default.render('mermaid-viz-' + Date.now(), mermaidStr);
      setVizSvgHtml(svg);
    } catch {
      // Mermaid parse failed — show raw code
      setVizSvgHtml(`<div style="background:var(--color-paper-100);border:1px solid var(--color-paper-300);border-radius:8px;padding:16px;font-family:monospace;font-size:12px;white-space:pre-wrap;color:var(--color-ink-900);max-height:400px;overflow:auto"><p style="color:var(--color-muted-500);margin-bottom:8px;font-family:Inter,sans-serif;font-size:13px">Diagram code (render failed):</p>${escapeHtml(mermaidStr)}</div>`);
    }
  };

  const handleShareViz = async () => {
    try {
      if (vizImageUrl) {
        // Share image URL
        if (navigator.share) {
          await navigator.share({ title: `${chapterName} — Nexigrate`, text: `Study visualization for ${chapterName}`, url: vizImageUrl });
        } else {
          handleSaveViz();
        }
      } else if (vizSvgHtml) {
        const blob = new Blob([vizSvgHtml], { type: 'image/svg+xml' });
        const file = new File([blob], `${chapter}-diagram.svg`, { type: 'image/svg+xml' });
        if (navigator.share && navigator.canShare({ files: [file] })) {
          await navigator.share({ title: `${chapterName} — Nexigrate`, text: `Study diagram for ${chapterName}`, files: [file] });
        } else {
          handleSaveViz();
        }
      }
    } catch { handleSaveViz(); }
  };

  const handleSaveViz = () => {
    if (vizImageUrl) {
      // Download image as PNG
      const a = document.createElement('a');
      a.href = vizImageUrl;
      a.download = `${chapter}-${vizTab}.png`;
      a.target = '_blank';
      a.rel = 'noopener';
      a.click();
      return;
    }
    if (vizSvgHtml) {
      // Convert SVG to PNG for download
      const svgBlob = new Blob([vizSvgHtml], { type: 'image/svg+xml' });
      const url = URL.createObjectURL(svgBlob);
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        canvas.width = img.width * 2;
        canvas.height = img.height * 2;
        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.fillStyle = '#ffffff';
          ctx.fillRect(0, 0, canvas.width, canvas.height);
          ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
          // Add watermark
          ctx.font = '14px Inter, sans-serif';
          ctx.fillStyle = 'rgba(0,0,0,0.3)';
          ctx.textAlign = 'right';
          ctx.fillText('nexigrate.com', canvas.width - 16, canvas.height - 12);
          const pngUrl = canvas.toDataURL('image/png');
          const a = document.createElement('a');
          a.href = pngUrl;
          a.download = `${chapter}-${vizTab}.png`;
          a.click();
        }
        URL.revokeObjectURL(url);
      };
      img.src = url;
    }
  };

  const handleTTS = () => {
    if (speaking) { window.speechSynthesis.cancel(); setSpeaking(false); return; }
    const text = stripMarkdown(pages[currentPage] ?? '');
    const utterance = new SpeechSynthesisUtterance(text);
    const lang = getLanguage();
    utterance.lang = lang === 'hi' ? 'hi-IN' : 'en-IN';
    utterance.rate = 0.9;
    // Try to select a gendered voice matching user preference
    const voices = window.speechSynthesis.getVoices();
    const targetLang = lang === 'hi' ? 'hi' : 'en-IN';
    const langVoices = voices.filter(v => v.lang.startsWith(targetLang));
    if (langVoices.length > 0) {
      // Prefer female voice (default for education apps)
      const femaleVoice = langVoices.find(v => v.name.toLowerCase().includes('female') || v.name.toLowerCase().includes('woman'));
      utterance.voice = femaleVoice ?? langVoices[0]!;
    }
    utterance.onend = () => setSpeaking(false);
    window.speechSynthesis.speak(utterance);
    setSpeaking(true);
  };

  if (loading || !user || pageLoading) return (
    <div className="kindle-frame"><div className="flex-1 p-6 space-y-4 animate-pulse"><div className="h-6 w-3/4 rounded bg-paper-200" /><div className="h-4 w-full rounded bg-paper-200" /><div className="h-4 w-full rounded bg-paper-200" /><div className="h-4 w-5/6 rounded bg-paper-200" /><div className="h-4 w-full rounded bg-paper-200" /><div className="h-4 w-2/3 rounded bg-paper-200" /><div className="h-6 w-1/2 rounded bg-paper-200 mt-6" /><div className="h-4 w-full rounded bg-paper-200" /><div className="h-4 w-full rounded bg-paper-200" /></div></div>
  );

  if (showPlanGate) return (
    <div className="kindle-frame">
      <PlanGate credits={userCredits} onUseCredits={handleUseCredits} loading={unlocking} />
    </div>
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

      {/* Visualization Modal — Tabbed */}
      {showViz && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink-950/70 p-4 backdrop-blur-sm" onClick={() => setShowViz(false)}>
          <div className="viz-modal max-w-2xl w-full max-h-[85vh] overflow-auto bg-paper-50 rounded-xl shadow-2xl" onClick={e => e.stopPropagation()}>
            <div className="sticky top-0 z-10 flex flex-col border-b border-line bg-paper-50 rounded-t-xl">
              <div className="flex items-center justify-between px-5 py-3">
                <h3 className="font-serif text-sm font-semibold text-ink-900">Chapter Visualization</h3>
                <button onClick={() => setShowViz(false)} className="flex h-7 w-7 items-center justify-center rounded-full text-muted-500 hover:bg-paper-200 hover:text-ink-900 transition-colors">✕</button>
              </div>
              {/* Tabs */}
              <div className="flex border-t border-line">
                <button
                  onClick={() => loadVisualizationTab('diagram')}
                  className={`flex-1 px-4 py-2.5 text-xs font-medium transition-colors ${vizTab === 'diagram' ? 'text-amber-600 dark:text-amber-400 border-b-2 border-amber-500' : 'text-muted-500 hover:text-ink-700'}`}
                >📊 Diagram</button>
                <button
                  onClick={() => loadVisualizationTab('mindmap')}
                  className={`flex-1 px-4 py-2.5 text-xs font-medium transition-colors ${vizTab === 'mindmap' ? 'text-amber-600 dark:text-amber-400 border-b-2 border-amber-500' : 'text-muted-500 hover:text-ink-700'}`}
                >🧠 Mind Map</button>
                <button
                  onClick={() => loadVisualizationTab('image')}
                  className={`flex-1 px-4 py-2.5 text-xs font-medium transition-colors ${vizTab === 'image' ? 'text-amber-600 dark:text-amber-400 border-b-2 border-amber-500' : 'text-muted-500 hover:text-ink-700'}`}
                >🎨 AI Image</button>
              </div>
            </div>
            <div className="p-5">
              {vizLoading ? (
                <div className="flex flex-col items-center justify-center py-16">
                  <div className="h-48 w-full rounded-lg bg-gradient-to-br from-amber-100 via-paper-100 to-amber-50 dark:from-amber-900/20 dark:via-ink-800 dark:to-amber-950/20 animate-pulse" />
                  <p className="mt-4 text-sm text-muted-500">{vizTab === 'image' ? '🎨 Generating AI image...' : '📊 Generating visualization...'}</p>
                </div>
              ) : vizError ? (
                <div className="flex flex-col items-center justify-center py-12">
                  <div className="banner banner-error">{vizError}</div>
                  <button onClick={() => loadVisualizationTab(vizTab)} className="btn-ghost-sm mt-4">Try Again</button>
                </div>
              ) : vizImageUrl ? (
                <div className="flex flex-col items-center">
                  <div className="relative w-full overflow-hidden rounded-lg border border-line bg-paper-100">
                    <img src={vizImageUrl} alt={`${chapterName} visualization`} className="w-full h-auto" />
                    <div className="absolute bottom-2 right-2 text-[10px] font-medium text-white/60 bg-black/30 px-2 py-0.5 rounded">nexigrate.com</div>
                  </div>
                  <div className="mt-4 flex items-center gap-3">
                    <button onClick={handleSaveViz} className="btn-ghost-sm">📥 Download PNG</button>
                    <button onClick={handleShareViz} className="btn-ghost-sm">📤 Share</button>
                  </div>
                </div>
              ) : vizSvgHtml ? (
                <div className="flex flex-col items-center">
                  <div className="w-full overflow-auto rounded-lg border border-line bg-paper-100 p-4" dangerouslySetInnerHTML={{ __html: vizSvgHtml }} />
                  <div className="mt-4 flex items-center gap-3">
                    <button onClick={handleSaveViz} className="btn-ghost-sm">📥 Download PNG</button>
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
