'use client';
import { useEffect, useState, useRef, useCallback } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { useAuth } from '~/lib/auth-context';
import { api, type CurrentAffairsItem } from '~/lib/api';
import { Skeleton } from '~/components/Skeleton';

export default function CurrentAffairsDetailPage() {
  const { user, loading } = useAuth();
  const router = useRouter();
  const params = useParams();
  const id = params.id as string;

  const [item, setItem] = useState<CurrentAffairsItem | null>(null);
  const [pageLoading, setPageLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [liked, setLiked] = useState(false);
  const [bookmarked, setBookmarked] = useState(false);
  const [likeCount, setLikeCount] = useState(0);
  const [speaking, setSpeaking] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const utteranceRef = useRef<SpeechSynthesisUtterance | null>(null);

  useEffect(() => { if (!loading && !user) router.replace('/signin'); }, [user, loading, router]);

  useEffect(() => {
    if (!user || !id) return;
    (async () => {
      try {
        const lang = (localStorage.getItem('nexigrate-language') as 'en' | 'hi') || 'en';
        const res = await api.getCurrentAffairsDetail(id, lang);
        setItem(res.item);
      } catch (e) { setError(e instanceof Error ? e.message : 'Article not found'); }
      finally { setPageLoading(false); }
    })();
  }, [user, id]);

  useEffect(() => {
    return () => { window.speechSynthesis?.cancel(); };
  }, []);

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 2500);
  };

  const handleTTS = useCallback(() => {
    if (!item) return;
    if (speaking) {
      window.speechSynthesis.cancel();
      setSpeaking(false);
      return;
    }
    const text = `${item.headline}. ${item.summary || item.body}`;
    const utterance = new SpeechSynthesisUtterance(text);
    const lang = (localStorage.getItem('nexigrate-language') as 'en' | 'hi') || 'en';
    utterance.lang = lang === 'hi' ? 'hi-IN' : 'en-IN';
    utterance.rate = 0.9;
    utterance.pitch = 1.0;
    const voices = window.speechSynthesis.getVoices();
    const targetLang = lang === 'hi' ? 'hi' : 'en-IN';
    const langVoices = voices.filter(v => v.lang.startsWith(targetLang));
    if (langVoices.length > 0) {
      const femaleVoice = langVoices.find(v => v.name.toLowerCase().includes('female') || v.name.toLowerCase().includes('woman'));
      utterance.voice = femaleVoice ?? langVoices[0]!;
    }
    utterance.onend = () => setSpeaking(false);
    utterance.onerror = () => setSpeaking(false);
    utteranceRef.current = utterance;
    window.speechSynthesis.speak(utterance);
    setSpeaking(true);
  }, [item, speaking]);

  const handleLike = async () => {
    if (!item) return;
    try {
      const res = await api.toggleNewsLike(item.id);
      setLiked(res.liked);
      setLikeCount(res.count);
      showToast(res.liked ? '❤️ Added to favorites' : 'Removed from favorites');
    } catch { /* silent */ }
  };

  const handleBookmark = async () => {
    if (!item) return;
    try {
      const res = await api.toggleNewsBookmark(item.id);
      setBookmarked(res.bookmarked);
      showToast(res.bookmarked ? '🔖 Saved for later' : 'Removed from saved');
    } catch { /* silent */ }
  };

  const handleShare = async () => {
    if (!item) return;
    const shareData = {
      title: item.headline,
      text: `${item.headline}\n\nRead on Nexigrate`,
      url: window.location.href,
    };
    if (navigator.share) {
      try { await navigator.share(shareData); } catch { /* cancelled */ }
    } else {
      await navigator.clipboard.writeText(`${item.headline}\n${window.location.href}`);
      showToast('📋 Link copied to clipboard');
    }
  };

  const handleAskNexi = () => {
    if (!item) return;
    router.push(`/chat?topic=${encodeURIComponent(item.headline)}`);
  };

  if (loading || !user || pageLoading) return (
    <main className="min-h-dvh bg-amber-50/30 dark:bg-slate-950">
      <div className="mx-auto max-w-[680px] px-5 pt-6 pb-28 space-y-4">
        <Skeleton className="h-6 w-24" />
        <Skeleton className="h-8 w-full" />
        <Skeleton className="h-4 w-40" />
        <Skeleton className="h-48 w-full rounded-xl" />
        <Skeleton className="h-32 w-full rounded-xl" />
      </div>
    </main>
  );

  if (error || !item) return (
    <main className="min-h-dvh bg-amber-50/30 dark:bg-slate-950 flex items-center justify-center px-5">
      <div className="text-center">
        <span className="text-4xl">😕</span>
        <p className="mt-3 text-lg font-bold text-slate-900 dark:text-slate-100">{error || 'Article not found'}</p>
        <button onClick={() => router.push('/current-affairs')} className="mt-4 px-4 py-2 rounded-lg bg-slate-100 dark:bg-slate-800 text-sm font-medium text-slate-700 dark:text-slate-300">← Back to News</button>
      </div>
    </main>
  );

  const keyPoints = extractKeyPoints(item.summary || item.body);
  const fullBody = item.body || item.summary || '';
  const sections = splitIntoSections(fullBody);
  const publishedTime = new Date(item.publishedAt).toLocaleString('en-IN', { 
    day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' 
  });

  return (
    <main className="min-h-dvh bg-amber-50/30 dark:bg-slate-950 pb-24">
      {/* Header */}
      <header className="sticky top-0 z-30 bg-white/80 dark:bg-slate-900/80 backdrop-blur-md border-b border-amber-100 dark:border-slate-800">
        <div className="mx-auto max-w-[680px] flex items-center justify-between px-4 py-3">
          <button onClick={() => router.push('/current-affairs')} className="flex items-center gap-1 text-slate-700 dark:text-slate-300 text-sm font-medium hover:text-slate-900 dark:hover:text-white transition-colors">
            <svg width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path d="M15 18l-6-6 6-6"/></svg>
            Back
          </button>
          <button
            onClick={handleTTS}
            className={`px-3 py-1.5 rounded-full text-xs font-bold transition-colors ${
              speaking
                ? 'bg-amber-500 text-white'
                : 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700'
            }`}
          >
            {speaking ? '⏸️ Stop' : '🎧 Listen'}
          </button>
        </div>
      </header>

      <article className="mx-auto max-w-[680px] px-5 pt-6">
        {/* Category + Meta */}
        <div className="flex items-center gap-3 mb-4">
          <span className="px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider text-white"
            style={{ background: getCategoryColor(item.category) }}>
            {item.category}
          </span>
          {item.factChecked && (
            <span className="px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400 border border-green-200 dark:border-green-800">
              ✓ Verified
            </span>
          )}
          <span className="text-xs text-slate-500 dark:text-slate-400">{publishedTime}</span>
        </div>

        {/* Headline */}
        <h1 className="text-2xl sm:text-3xl font-bold leading-tight text-slate-900 dark:text-slate-100" style={{ lineHeight: '1.3' }}>
          {item.headline}
        </h1>

        {/* Source info */}
        <div className="mt-3 flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
          <span>{item.sources.length} source{item.sources.length !== 1 ? 's' : ''}</span>
        </div>

        {/* AI Summary - Key Points */}
        {keyPoints.length > 0 && (
          <section className="mt-6">
            <div className="flex items-center gap-2 mb-3">
              <span className="text-sm">🤖</span>
              <h2 className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">AI Summary — Key Points</h2>
            </div>
            <div className="rounded-2xl bg-white dark:bg-slate-900 border border-amber-100 dark:border-slate-800 p-5 space-y-3">
              {keyPoints.map((point, i) => (
                <div key={i} className="flex items-start gap-3">
                  <span className="mt-0.5 flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full bg-amber-100 dark:bg-amber-500/10 text-amber-700 dark:text-amber-400 text-[10px] font-bold">
                    {i + 1}
                  </span>
                  <p className="text-sm leading-relaxed text-slate-700 dark:text-slate-300">{point}</p>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* Divider */}
        <hr className="my-6 border-slate-200 dark:border-slate-800" />

        {/* Full Details */}
        <section>
          <h2 className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-4">Full Details</h2>
          <div className="space-y-4" style={{ lineHeight: '1.8' }}>
            {sections.main.map((para, i) => (
              <p key={i} className="text-[15px] text-slate-800 dark:text-slate-200 leading-relaxed">{para}</p>
            ))}
          </div>
        </section>

        {/* Why This Matters */}
        {sections.relevance.length > 0 && (
          <>
            <hr className="my-6 border-slate-200 dark:border-slate-800" />
            <section>
              <h2 className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-4">📚 Why This Matters for Exams</h2>
              <div className="rounded-2xl bg-amber-50 dark:bg-amber-500/5 border border-amber-100 dark:border-amber-900/30 p-5 space-y-3">
                {sections.relevance.map((point, i) => (
                  <p key={i} className="text-sm leading-relaxed text-slate-700 dark:text-slate-300">{point}</p>
                ))}
              </div>
            </section>
          </>
        )}

        {/* Sources */}
        {item.sources.length > 0 && (
          <>
            <hr className="my-6 border-slate-200 dark:border-slate-800" />
            <section>
              <h2 className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-3">Sources</h2>
              <div className="flex flex-wrap gap-2">
                {item.sources.map((src, i) => (
                  <span key={i} className="px-3 py-1.5 rounded-lg bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs text-slate-700 dark:text-slate-300 font-medium">
                    📎 {src}
                  </span>
                ))}
              </div>
            </section>
          </>
        )}

        {/* Ask Nexi CTA */}
        <button
          onClick={handleAskNexi}
          className="mt-8 w-full flex items-center justify-center gap-2 px-5 py-3.5 rounded-2xl bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900 font-medium text-sm hover:opacity-90 transition-opacity"
        >
          🤖 Ask Nexi to explain this topic
        </button>
      </article>

      {/* Fixed bottom action bar */}
      <div className="fixed bottom-0 left-0 right-0 z-30 border-t border-slate-200 dark:border-slate-800 bg-white/95 dark:bg-slate-900/95 backdrop-blur-md">
        <div className="mx-auto max-w-[680px] flex items-center justify-around py-3 px-4">
          <button onClick={handleLike} className="flex flex-col items-center gap-0.5 transition-transform active:scale-90">
            <span className={`text-xl transition-all ${liked ? 'scale-110' : ''}`}>{liked ? '❤️' : '🤍'}</span>
            <span className="text-[10px] text-slate-500 dark:text-slate-400 font-medium">{likeCount || 'Like'}</span>
          </button>
          <button onClick={handleBookmark} className="flex flex-col items-center gap-0.5 transition-transform active:scale-90">
            <span className={`text-xl transition-all ${bookmarked ? 'scale-110' : ''}`}>{bookmarked ? '🔖' : '📑'}</span>
            <span className="text-[10px] text-slate-500 dark:text-slate-400 font-medium">{bookmarked ? 'Saved' : 'Save'}</span>
          </button>
          <button onClick={handleShare} className="flex flex-col items-center gap-0.5 transition-transform active:scale-90">
            <span className="text-xl">📤</span>
            <span className="text-[10px] text-slate-500 dark:text-slate-400 font-medium">Share</span>
          </button>
          <button onClick={handleTTS} className="flex flex-col items-center gap-0.5 transition-transform active:scale-90">
            <span className={`text-xl ${speaking ? 'animate-pulse' : ''}`}>{speaking ? '⏸️' : '🎧'}</span>
            <span className="text-[10px] text-slate-500 dark:text-slate-400 font-medium">{speaking ? 'Stop' : 'Listen'}</span>
          </button>
        </div>
      </div>

      {/* Toast */}
      {toast && (
        <div className="fixed top-20 left-1/2 -translate-x-1/2 z-50 px-4 py-2 rounded-lg bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900 text-sm shadow-xl animate-fadeIn">
          {toast}
        </div>
      )}
    </main>
  );
}

/* ─── Helpers ─── */
function extractKeyPoints(text: string): string[] {
  if (!text) return [];
  const bullets = text.split(/[•\-\*]\s+/).filter(s => s.trim().length > 10);
  if (bullets.length >= 2) return bullets.slice(0, 6);
  const sentences = text.split(/[.!?]+\s+/).filter(s => s.trim().length > 15);
  return sentences.slice(0, 6);
}

function splitIntoSections(text: string): { main: string[]; relevance: string[] } {
  if (!text) return { main: [], relevance: [] };
  const paragraphs = text.split(/\n+/).filter(p => p.trim().length > 0);
  
  // Look for relevance markers
  const relevanceMarkers = ['why it matters', 'exam relevance', 'important for', 'related topics', 'why this is important'];
  const relevanceIdx = paragraphs.findIndex(p => 
    relevanceMarkers.some(marker => p.toLowerCase().includes(marker))
  );

  if (relevanceIdx > 0) {
    return {
      main: paragraphs.slice(0, relevanceIdx),
      relevance: paragraphs.slice(relevanceIdx),
    };
  }

  // If no explicit markers, use the last paragraph(s) as relevance if long enough
  if (paragraphs.length > 3) {
    return {
      main: paragraphs.slice(0, -1),
      relevance: paragraphs.slice(-1),
    };
  }

  return { main: paragraphs, relevance: [] };
}

function getCategoryColor(category: string): string {
  const colors: Record<string, string> = {
    national: '#FF9933', international: '#4A90D9', economy: '#2ECC71',
    'science-tech': '#9B59B6', sports: '#E74C3C', environment: '#27AE60',
    politics: '#8E44AD', defence: '#2C3E50',
  };
  return colors[category] ?? '#34495E';
}
