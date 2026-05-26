'use client';
import { useEffect, useState, useRef, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '~/lib/auth-context';
import { api, type CurrentAffairsItem } from '~/lib/api';
import { Logo } from '~/components/Logo';
import { Skeleton } from '~/components/Skeleton';

const CATEGORY_EMOJIS: Record<string, string> = {
  national: '🇮🇳', international: '🌍', economy: '💰', 'science-tech': '🔬',
  sports: '🏏', environment: '🌱', politics: '🏛️', defence: '🛡️', all: '📰',
};

const CATEGORIES = [
  { key: 'all', label: 'All', emoji: '📰' },
  { key: 'national', label: 'National', emoji: '🇮🇳' },
  { key: 'international', label: 'International', emoji: '🌍' },
  { key: 'economy', label: 'Economy', emoji: '💰' },
  { key: 'science-tech', label: 'Science', emoji: '🔬' },
  { key: 'sports', label: 'Sports', emoji: '🏏' },
  { key: 'environment', label: 'Environment', emoji: '🌱' },
];

export default function CurrentAffairsShortsPage() {
  const { user, loading } = useAuth();
  const router = useRouter();
  const [items, setItems] = useState<CurrentAffairsItem[]>([]);
  const [activeTab, setActiveTab] = useState('all');
  const [currentIdx, setCurrentIdx] = useState(0);
  const [pageLoading, setPageLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [userLikes, setUserLikes] = useState<Set<string>>(new Set());
  const [userBookmarks, setUserBookmarks] = useState<Set<string>>(new Set());
  const [likeCounts, setLikeCounts] = useState<Record<string, number>>({});
  const [isFromYesterday, setIsFromYesterday] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const touchStartY = useRef(0);
  const touchStartX = useRef(0);
  const isTransitioning = useRef(false);

  useEffect(() => { if (!loading && !user) router.replace('/signin'); }, [user, loading, router]);

  useEffect(() => {
    if (!user) return;
    (async () => {
      try {
        const lang = (localStorage.getItem('nexigrate-language') as 'en' | 'hi') || 'en';
        const res = await api.getCurrentAffairs(lang);
        setItems(res.items);
        if (res.userLikes) setUserLikes(new Set(res.userLikes));
        if (res.userBookmarks) setUserBookmarks(new Set(res.userBookmarks));
        if (res.likeCounts) setLikeCounts(res.likeCounts);
        if ((res as any).isFromYesterday) setIsFromYesterday(true);
      } catch (e) { setError(e instanceof Error ? e.message : 'Failed to load'); }
      finally { setPageLoading(false); }
    })();
  }, [user]);

  const filtered = activeTab === 'all' ? items : items.filter(i => i.category === activeTab);

  const goNext = useCallback(() => {
    if (isTransitioning.current) return;
    if (currentIdx < filtered.length - 1) {
      isTransitioning.current = true;
      setCurrentIdx(i => i + 1);
      setTimeout(() => { isTransitioning.current = false; }, 350);
    }
  }, [currentIdx, filtered.length]);

  const goPrev = useCallback(() => {
    if (isTransitioning.current) return;
    if (currentIdx > 0) {
      isTransitioning.current = true;
      setCurrentIdx(i => i - 1);
      setTimeout(() => { isTransitioning.current = false; }, 350);
    }
  }, [currentIdx]);

  // Touch handlers for swipe
  const handleTouchStart = (e: React.TouchEvent) => {
    touchStartY.current = e.touches[0]!.clientY;
    touchStartX.current = e.touches[0]!.clientX;
  };

  const handleTouchEnd = (e: React.TouchEvent) => {
    const deltaY = touchStartY.current - e.changedTouches[0]!.clientY;
    const deltaX = Math.abs(touchStartX.current - e.changedTouches[0]!.clientX);
    // Only swipe vertically (not horizontal scrolls)
    if (Math.abs(deltaY) > 60 && deltaX < 100) {
      if (deltaY > 0) goNext(); // swipe up = next
      else goPrev(); // swipe down = prev
    }
  };

  // Keyboard navigation
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'ArrowDown' || e.key === 'j') goNext();
      if (e.key === 'ArrowUp' || e.key === 'k') goPrev();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [goNext, goPrev]);

  // Reset index on tab change
  useEffect(() => { setCurrentIdx(0); }, [activeTab]);

  const handleLike = async (id: string) => {
    try {
      const res = await api.toggleNewsLike(id);
      setUserLikes(prev => {
        const next = new Set(prev);
        if (res.liked) next.add(id); else next.delete(id);
        return next;
      });
      setLikeCounts(prev => ({ ...prev, [id]: res.count }));
    } catch { /* silent */ }
  };

  const handleBookmark = async (id: string) => {
    try {
      const res = await api.toggleNewsBookmark(id);
      setUserBookmarks(prev => {
        const next = new Set(prev);
        if (res.bookmarked) next.add(id); else next.delete(id);
        return next;
      });
    } catch { /* silent */ }
  };

  const handleShare = async (item: CurrentAffairsItem) => {
    const text = `${item.headline}\n\nRead more on Nexigrate - AI-powered exam prep`;
    if (navigator.share) {
      try { await navigator.share({ title: item.headline, text, url: window.location.origin + `/current-affairs/${item.id}` }); } catch { /* cancelled */ }
    } else {
      await navigator.clipboard.writeText(`${item.headline}\n${window.location.origin}/current-affairs/${item.id}`);
    }
  };

  if (loading || !user || pageLoading) return (
    <main className="flex min-h-dvh items-center justify-center bg-ink-900">
      <div className="space-y-4 w-64">
        <Skeleton className="h-8 w-48 bg-paper-200/10" />
        <Skeleton className="h-64 w-full rounded-2xl bg-paper-200/10" />
      </div>
    </main>
  );

  if (error) return (
    <main className="mx-auto flex min-h-dvh max-w-lg flex-col items-center justify-center px-5">
      <div className="banner banner-error">{error}</div>
      <button onClick={() => router.back()} className="btn-ghost mt-4">← Back</button>
    </main>
  );

  const currentItem = filtered[currentIdx];

  return (
    <main className="fixed inset-0 flex flex-col bg-ink-900 overflow-hidden select-none">
      {/* Top bar */}
      <header className="relative z-20 flex items-center justify-between px-4 pt-3 pb-2 safe-top">
        <button onClick={() => router.push('/dashboard')} className="flex items-center gap-1.5 text-paper-50/80 text-sm font-medium">
          <svg width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path d="M15 18l-6-6 6-6"/></svg>
          Back
        </button>
        <div className="flex items-center gap-1">
          <span className="text-paper-50 text-sm font-semibold">Today&apos;s News</span>
          {isFromYesterday && <span className="text-[10px] px-1.5 py-0.5 rounded bg-gold-500/20 text-gold-400">Yesterday</span>}
        </div>
        <button onClick={() => router.push('/current-affairs/quiz')} className="text-paper-50/80 text-sm font-medium">
          📝 Quiz
        </button>
      </header>

      {/* Category pills — horizontal scrollable */}
      <div className="relative z-20 px-3 pb-2 flex gap-1.5 overflow-x-auto scrollbar-hide">
        {CATEGORIES.map(cat => (
          <button
            key={cat.key}
            onClick={() => setActiveTab(cat.key)}
            className={`flex items-center gap-1 whitespace-nowrap px-3 py-1.5 rounded-full text-xs font-medium transition-all ${
              activeTab === cat.key
                ? 'bg-paper-50 text-ink-900 shadow-md'
                : 'bg-paper-50/10 text-paper-50/70 hover:bg-paper-50/20'
            }`}
          >
            <span>{cat.emoji}</span>
            <span>{cat.label}</span>
          </button>
        ))}
      </div>

      {/* Shorts container */}
      {filtered.length === 0 ? (
        <div className="flex-1 flex flex-col items-center justify-center text-center px-6">
          <span className="text-5xl">📰</span>
          <p className="mt-4 font-serif text-xl font-semibold text-paper-50">No news yet</p>
          <p className="mt-2 text-sm text-paper-50/60">Refreshes every 30 minutes. Check back soon!</p>
        </div>
      ) : (
        <div
          ref={containerRef}
          className="flex-1 relative overflow-hidden"
          onTouchStart={handleTouchStart}
          onTouchEnd={handleTouchEnd}
        >
          {/* Card stack */}
          <div
            className="absolute inset-0 transition-transform duration-300 ease-out"
            style={{ transform: `translateY(-${currentIdx * 100}%)` }}
          >
            {filtered.map((item, idx) => (
              <ShortCard
                key={item.id}
                item={item}
                isActive={idx === currentIdx}
                liked={userLikes.has(item.id)}
                bookmarked={userBookmarks.has(item.id)}
                likeCount={likeCounts[item.id] ?? 0}
                onLike={() => handleLike(item.id)}
                onBookmark={() => handleBookmark(item.id)}
                onShare={() => handleShare(item)}
                onTap={() => router.push(`/current-affairs/${item.id}`)}
                onAskNexi={() => router.push(`/chat?topic=${encodeURIComponent(item.headline)}`)}
              />
            ))}
          </div>

          {/* Progress dots (right side) */}
          <div className="absolute right-3 top-1/2 -translate-y-1/2 flex flex-col gap-1 z-10">
            {filtered.slice(Math.max(0, currentIdx - 3), currentIdx + 4).map((item, i) => {
              const realIdx = Math.max(0, currentIdx - 3) + i;
              return (
                <div
                  key={item.id}
                  className={`rounded-full transition-all duration-300 ${
                    realIdx === currentIdx ? 'w-1.5 h-4 bg-paper-50' : 'w-1.5 h-1.5 bg-paper-50/30'
                  }`}
                />
              );
            })}
          </div>

          {/* Counter */}
          <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-10">
            <span className="px-3 py-1 rounded-full bg-paper-50/10 backdrop-blur text-paper-50/80 text-xs font-medium">
              {currentIdx + 1} / {filtered.length}
            </span>
          </div>

          {/* Swipe hint (only on first card) */}
          {currentIdx === 0 && (
            <div className="absolute bottom-12 left-1/2 -translate-x-1/2 z-10 animate-bounce">
              <svg width="24" height="24" fill="none" stroke="white" strokeWidth="2" viewBox="0 0 24 24" opacity="0.5">
                <path d="M12 5v14M5 12l7 7 7-7"/>
              </svg>
            </div>
          )}
        </div>
      )}
    </main>
  );
}

/* ─── Individual Short Card ─── */
interface ShortCardProps {
  item: CurrentAffairsItem;
  isActive: boolean;
  liked: boolean;
  bookmarked: boolean;
  likeCount: number;
  onLike: () => void;
  onBookmark: () => void;
  onShare: () => void;
  onTap: () => void;
  onAskNexi: () => void;
}

function ShortCard({ item, isActive, liked, bookmarked, likeCount, onLike, onBookmark, onShare, onTap, onAskNexi }: ShortCardProps) {
  const emoji = CATEGORY_EMOJIS[item.category] ?? '📰';
  
  // Extract key points from summary (split by sentences or bullet points)
  const keyPoints = extractKeyPoints(item.summary || item.body);

  return (
    <div className="h-full w-full flex items-center justify-center px-4 py-2">
      <div
        className={`relative w-full max-w-md h-full rounded-3xl overflow-hidden transition-all duration-300 ${
          isActive ? 'scale-100 opacity-100' : 'scale-95 opacity-50'
        }`}
        style={{
          background: `linear-gradient(165deg, var(--color-paper-100) 0%, var(--color-paper-50) 100%)`,
        }}
      >
        {/* Category badge + emoji header */}
        <div className="absolute top-0 left-0 right-0 h-28 flex items-center justify-center"
          style={{ background: getCategoryGradient(item.category) }}>
          <span className="text-5xl opacity-80">{emoji}</span>
        </div>

        {/* Content area */}
        <div className="absolute inset-0 flex flex-col pt-28 px-5 pb-20" onClick={onTap}>
          {/* Category pill + verified */}
          <div className="flex items-center gap-2 mt-3">
            <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-ink-900/8 text-ink-700">
              {item.category}
            </span>
            {item.factChecked && (
              <span className="px-2 py-0.5 rounded-full text-[10px] font-medium bg-gold-500/10 text-gold-700">✓ Verified</span>
            )}
          </div>

          {/* Headline */}
          <h2 className="mt-3 font-serif text-lg font-bold leading-snug text-ink-900 line-clamp-3">
            {item.headline}
          </h2>

          {/* Key points as bullet list */}
          <div className="mt-3 flex-1 overflow-hidden">
            <ul className="space-y-1.5">
              {keyPoints.slice(0, 4).map((point, i) => (
                <li key={i} className="flex items-start gap-2 text-sm text-ink-700 leading-relaxed">
                  <span className="mt-1 h-1.5 w-1.5 rounded-full bg-ember-500 flex-shrink-0" />
                  <span className="line-clamp-2">{point}</span>
                </li>
              ))}
            </ul>
          </div>

          {/* Sources */}
          {item.sources.length > 0 && (
            <p className="mt-auto pt-2 text-[11px] text-muted-400 truncate">
              📎 {item.sources.slice(0, 2).join(' · ')}
            </p>
          )}

          {/* Tap to read more hint */}
          <p className="text-center text-[11px] text-muted-400 mt-2">Tap to read full article →</p>
        </div>

        {/* Action buttons (right side, vertical) */}
        <div className="absolute right-3 bottom-24 flex flex-col items-center gap-4 z-10">
          <button onClick={(e) => { e.stopPropagation(); onLike(); }} className="flex flex-col items-center gap-0.5">
            <span className={`text-xl transition-transform ${liked ? 'scale-125' : ''}`}>{liked ? '❤️' : '🤍'}</span>
            <span className="text-[10px] text-ink-600 font-medium">{likeCount || ''}</span>
          </button>
          <button onClick={(e) => { e.stopPropagation(); onBookmark(); }} className="flex flex-col items-center gap-0.5">
            <span className={`text-xl transition-transform ${bookmarked ? 'scale-110' : ''}`}>{bookmarked ? '🔖' : '📑'}</span>
            <span className="text-[10px] text-ink-600 font-medium">Save</span>
          </button>
          <button onClick={(e) => { e.stopPropagation(); onShare(); }} className="flex flex-col items-center gap-0.5">
            <span className="text-xl">↗️</span>
            <span className="text-[10px] text-ink-600 font-medium">Share</span>
          </button>
          <button onClick={(e) => { e.stopPropagation(); onAskNexi(); }} className="flex flex-col items-center gap-0.5">
            <span className="text-xl">🤖</span>
            <span className="text-[10px] text-ink-600 font-medium">Ask</span>
          </button>
        </div>
      </div>
    </div>
  );
}

/* ─── Helpers ─── */
function extractKeyPoints(text: string): string[] {
  if (!text) return [];
  // Try splitting by bullet markers first
  const bullets = text.split(/[•\-\*]\s+/).filter(s => s.trim().length > 10);
  if (bullets.length >= 2) return bullets.slice(0, 5);
  // Fall back to sentences
  const sentences = text.split(/[.!?]+\s+/).filter(s => s.trim().length > 15);
  return sentences.slice(0, 5);
}

function getCategoryGradient(category: string): string {
  const gradients: Record<string, string> = {
    national: 'linear-gradient(135deg, #FF9933 0%, #FFB366 100%)',
    international: 'linear-gradient(135deg, #4A90D9 0%, #7BB3E8 100%)',
    economy: 'linear-gradient(135deg, #2ECC71 0%, #66E8A3 100%)',
    'science-tech': 'linear-gradient(135deg, #9B59B6 0%, #BB8FCC 100%)',
    sports: 'linear-gradient(135deg, #E74C3C 0%, #F1948A 100%)',
    environment: 'linear-gradient(135deg, #27AE60 0%, #7DCEA0 100%)',
    politics: 'linear-gradient(135deg, #8E44AD 0%, #BB8FCE 100%)',
    defence: 'linear-gradient(135deg, #2C3E50 0%, #5D6D7E 100%)',
  };
  return gradients[category] ?? 'linear-gradient(135deg, #34495E 0%, #5D6D7E 100%)';
}
