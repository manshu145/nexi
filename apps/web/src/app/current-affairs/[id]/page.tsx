'use client';
import { useEffect, useState, useRef, useCallback } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { useAuth } from '~/lib/auth-context';
import { api, type CurrentAffairsItem } from '~/lib/api';
import { Logo } from '~/components/Logo';
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
  const [showShareToast, setShowShareToast] = useState(false);
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

  // Cleanup TTS on unmount
  useEffect(() => {
    return () => { window.speechSynthesis?.cancel(); };
  }, []);

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
    // Select best voice
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
    } catch { /* silent */ }
  };

  const handleBookmark = async () => {
    if (!item) return;
    try {
      const res = await api.toggleNewsBookmark(item.id);
      setBookmarked(res.bookmarked);
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
      setShowShareToast(true);
      setTimeout(() => setShowShareToast(false), 2000);
    }
  };

  const handleAskNexi = () => {
    if (!item) return;
    router.push(`/chat?topic=${encodeURIComponent(item.headline)}`);
  };

  if (loading || !user || pageLoading) return (
    <main className="mx-auto flex min-h-dvh max-w-2xl flex-col px-5 pt-6 pb-28">
      <div className="space-y-4 mt-8">
        <Skeleton className="h-6 w-24" />
        <Skeleton className="h-8 w-full" />
        <Skeleton className="h-4 w-40" />
        <Skeleton className="h-48 w-full rounded-xl" />
      </div>
    </main>
  );

  if (error || !item) return (
    <main className="mx-auto flex min-h-dvh max-w-lg flex-col items-center justify-center px-5">
      <span className="text-4xl">😕</span>
      <p className="mt-3 font-serif text-lg font-semibold text-ink-900">{error || 'Article not found'}</p>
      <button onClick={() => router.push('/current-affairs')} className="btn-ghost mt-4">← Back to News</button>
    </main>
  );

  const keyPoints = extractKeyPoints(item.summary || item.body);
  const fullBody = item.body || item.summary || '';
  const publishedTime = new Date(item.publishedAt).toLocaleString('en-IN', { 
    day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' 
  });

  return (
    <main className="mx-auto flex min-h-dvh max-w-2xl flex-col px-5 pt-6 pb-32">
      {/* Header */}
      <header className="flex items-center justify-between">
        <button onClick={() => router.push('/current-affairs')} className="flex items-center gap-1 text-sm text-muted-500 hover:text-ink-900 transition-colors">
          <svg width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path d="M15 18l-6-6 6-6"/></svg>
          Back
        </button>
        <Logo />
      </header>

      {/* Category + time */}
      <div className="mt-6 flex items-center gap-3">
        <span className="px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider"
          style={{ background: getCategoryColor(item.category), color: 'white' }}>
          {item.category}
        </span>
        {item.factChecked && (
          <span className="px-2.5 py-0.5 rounded-full text-xs font-medium bg-gold-500/10 text-gold-700 border border-gold-500/20">
            ✓ Verified
          </span>
        )}
      </div>

      {/* Category image */}
      <div className="mt-4 relative h-40 sm:h-52 rounded-2xl overflow-hidden">
        <img src={getCategoryImage(item.category)} alt={item.category} className="absolute inset-0 w-full h-full object-cover" />
        <div className="absolute inset-0 bg-gradient-to-t from-black/40 to-transparent" />
      </div>

      {/* Headline */}
      <h1 className="mt-4 font-serif text-2xl font-bold leading-tight text-ink-900">
        {item.headline}
      </h1>

      {/* Meta info */}
      <div className="mt-3 flex items-center gap-3 text-xs text-muted-500">
        <span>{publishedTime}</span>
        <span>·</span>
        <span>{item.sources.length} source{item.sources.length !== 1 ? 's' : ''}</span>
      </div>

      {/* Listen button */}
      <button
        onClick={handleTTS}
        className={`mt-5 inline-flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium transition-all ${
          speaking
            ? 'bg-ember-500 text-paper-50 shadow-lg shadow-ember-500/20'
            : 'bg-paper-200 text-ink-800 hover:bg-paper-300'
        }`}
      >
        {speaking ? (
          <>
            <span className="flex gap-0.5">
              <span className="w-0.5 h-3 bg-paper-50 rounded-full animate-pulse" />
              <span className="w-0.5 h-4 bg-paper-50 rounded-full animate-pulse" style={{ animationDelay: '0.1s' }} />
              <span className="w-0.5 h-2 bg-paper-50 rounded-full animate-pulse" style={{ animationDelay: '0.2s' }} />
              <span className="w-0.5 h-3.5 bg-paper-50 rounded-full animate-pulse" style={{ animationDelay: '0.3s' }} />
            </span>
            Stop Listening
          </>
        ) : (
          <>🎧 Listen to this article</>
        )}
      </button>

      {/* AI Summary - Key Points */}
      <section className="mt-6">
        <div className="flex items-center gap-2 mb-3">
          <span className="text-sm">🤖</span>
          <h2 className="text-xs font-bold uppercase tracking-wider text-muted-500">AI Summary — Key Points</h2>
        </div>
        <div className="rounded-2xl bg-paper-100 border border-paper-200 p-5 space-y-3">
          {keyPoints.map((point, i) => (
            <div key={i} className="flex items-start gap-3">
              <span className="mt-0.5 flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full bg-ember-500/10 text-ember-600 text-[10px] font-bold">
                {i + 1}
              </span>
              <p className="text-sm leading-relaxed text-ink-800">{point}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Full Article */}
      <section className="mt-6">
        <h2 className="text-xs font-bold uppercase tracking-wider text-muted-500 mb-3">Full Details</h2>
        <div className="prose prose-sm max-w-none text-ink-800 leading-relaxed">
          {fullBody.split('\n').filter(p => p.trim()).map((para, i) => (
            <p key={i} className="mb-3 text-sm leading-relaxed">{para}</p>
          ))}
        </div>
      </section>

      {/* Sources */}
      {item.sources.length > 0 && (
        <section className="mt-6">
          <h2 className="text-xs font-bold uppercase tracking-wider text-muted-500 mb-2">Sources</h2>
          <div className="flex flex-wrap gap-2">
            {item.sources.map((src, i) => (
              <span key={i} className="px-3 py-1.5 rounded-lg bg-paper-200 text-xs text-ink-700 font-medium">
                📎 {src}
              </span>
            ))}
          </div>
        </section>
      )}

      {/* Why This Matters */}
      <section className="mt-6">
        <h2 className="text-xs font-bold uppercase tracking-wider text-muted-500 mb-3">Why This Matters</h2>
        <div className="rounded-2xl bg-gold-500/5 border border-gold-500/20 p-5">
          <p className="text-sm leading-relaxed text-ink-800">
            This topic is relevant for competitive exams ({item.category === 'national' ? 'GS Paper I, II' : item.category === 'economy' ? 'Economics, GS Paper III' : item.category === 'international' ? 'International Relations, GS Paper II' : 'General Studies'}). 
            Understanding current developments in <span className="font-semibold">{item.category}</span> helps in essay writing, mains answers, and interview preparation.
          </p>
        </div>
      </section>

      {/* Ask Nexi CTA */}
      <button
        onClick={handleAskNexi}
        className="mt-8 w-full flex items-center justify-center gap-2 px-5 py-3.5 rounded-2xl bg-ink-900 text-paper-50 font-medium text-sm hover:bg-ink-800 transition-colors"
      >
        🤖 Ask Nexi to explain this topic
      </button>

      {/* Fixed bottom action bar */}
      <div className="fixed bottom-0 left-0 right-0 z-30 border-t border-paper-200 bg-paper-50/95 backdrop-blur-md safe-bottom">
        <div className="mx-auto max-w-2xl flex items-center justify-around py-3 px-4">
          <button onClick={handleLike} className="flex flex-col items-center gap-0.5 transition-transform active:scale-90">
            <span className={`text-2xl transition-all ${liked ? 'scale-110' : ''}`}>{liked ? '❤️' : '🤍'}</span>
            <span className="text-[10px] text-muted-500 font-medium">{likeCount || 'Like'}</span>
          </button>
          <button onClick={handleBookmark} className="flex flex-col items-center gap-0.5 transition-transform active:scale-90">
            <span className={`text-2xl transition-all ${bookmarked ? 'scale-110' : ''}`}>{bookmarked ? '🔖' : '📑'}</span>
            <span className="text-[10px] text-muted-500 font-medium">{bookmarked ? 'Saved' : 'Save'}</span>
          </button>
          <button onClick={handleShare} className="flex flex-col items-center gap-0.5 transition-transform active:scale-90">
            <span className="text-2xl">↗️</span>
            <span className="text-[10px] text-muted-500 font-medium">Share</span>
          </button>
          <button onClick={handleTTS} className="flex flex-col items-center gap-0.5 transition-transform active:scale-90">
            <span className={`text-2xl ${speaking ? 'animate-pulse' : ''}`}>{speaking ? '⏸️' : '🎧'}</span>
            <span className="text-[10px] text-muted-500 font-medium">{speaking ? 'Stop' : 'Listen'}</span>
          </button>
        </div>
      </div>

      {/* Share toast */}
      {showShareToast && (
        <div className="fixed top-20 left-1/2 -translate-x-1/2 z-50 px-4 py-2 rounded-lg bg-ink-900 text-paper-50 text-sm shadow-xl animate-fadeIn">
          ✓ Link copied!
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

function getCategoryColor(category: string): string {
  const colors: Record<string, string> = {
    national: '#FF9933', international: '#4A90D9', economy: '#2ECC71',
    'science-tech': '#9B59B6', sports: '#E74C3C', environment: '#27AE60',
    politics: '#8E44AD', defence: '#2C3E50',
  };
  return colors[category] ?? '#34495E';
}

function getCategoryImage(category: string): string {
  const images: Record<string, string> = {
    national: 'https://images.unsplash.com/photo-1532375810709-75b1da00537c?w=800&h=400&fit=crop&q=80',
    international: 'https://images.unsplash.com/photo-1451187580459-43490279c0fa?w=800&h=400&fit=crop&q=80',
    economy: 'https://images.unsplash.com/photo-1611974789855-9c2a0a7236a3?w=800&h=400&fit=crop&q=80',
    'science-tech': 'https://images.unsplash.com/photo-1507413245164-6160d8298b31?w=800&h=400&fit=crop&q=80',
    sports: 'https://images.unsplash.com/photo-1461896836934-bd45ea8f5a65?w=800&h=400&fit=crop&q=80',
    environment: 'https://images.unsplash.com/photo-1441974231531-c6227db76b6e?w=800&h=400&fit=crop&q=80',
    politics: 'https://images.unsplash.com/photo-1529107386315-e1a2ed48a620?w=800&h=400&fit=crop&q=80',
    defence: 'https://images.unsplash.com/photo-1579912437766-7896df6d3cd3?w=800&h=400&fit=crop&q=80',
  };
  return images[category] ?? images['national']!;
}
