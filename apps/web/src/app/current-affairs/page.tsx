'use client';
import { useEffect, useState, useRef, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '~/lib/auth-context';
import { api, type CurrentAffairsItem } from '~/lib/api';
import { Skeleton } from '~/components/Skeleton';

const CATEGORIES = [
  { key: 'all', label: 'All' },
  { key: 'national', label: 'National' },
  { key: 'international', label: 'International' },
  { key: 'economy', label: 'Economy' },
  { key: 'science-tech', label: 'Science' },
  { key: 'sports', label: 'Sports' },
  { key: 'environment', label: 'Environment' },
];

const CATEGORY_COLORS: Record<string, string> = {
  national: 'bg-orange-500',
  international: 'bg-blue-600',
  economy: 'bg-emerald-600',
  'science-tech': 'bg-purple-600',
  sports: 'bg-red-600',
  environment: 'bg-green-600',
  politics: 'bg-violet-600',
  defence: 'bg-slate-700',
};

const CATEGORY_GRADIENTS: Record<string, string> = {
  national: 'from-orange-400 to-amber-500',
  international: 'from-blue-500 to-indigo-600',
  economy: 'from-emerald-400 to-teal-600',
  'science-tech': 'from-purple-500 to-violet-600',
  sports: 'from-red-500 to-rose-600',
  environment: 'from-green-400 to-emerald-600',
  politics: 'from-violet-500 to-purple-600',
  defence: 'from-slate-600 to-slate-800',
};

/** Extract 1-2 keywords from title for image search */
function getImageKeyword(title: string): string {
  const stopWords = new Set(['the', 'a', 'an', 'in', 'on', 'at', 'to', 'for', 'of', 'is', 'are', 'was', 'were', 'and', 'or', 'but', 'with', 'from', 'by', 'that', 'this', 'it', 'its', 'has', 'have', 'had', 'not', 'be', 'been', 'will', 'would', 'could', 'should', 'may', 'can', 'do', 'does', 'did', 'as', 'if', 'than', 'so']);
  const words = title.toLowerCase().replace(/[^a-z\s]/g, '').split(/\s+/).filter(w => w.length > 3 && !stopWords.has(w));
  return words.slice(0, 2).join(',') || 'news';
}

export default function CurrentAffairsPage() {
  const { user, loading } = useAuth();
  const router = useRouter();
  const [items, setItems] = useState<CurrentAffairsItem[]>([]);
  const [activeTab, setActiveTab] = useState('all');
  const [pageLoading, setPageLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [userLikes, setUserLikes] = useState<Set<string>>(new Set());
  const [userBookmarks, setUserBookmarks] = useState<Set<string>>(new Set());
  const [likeCounts, setLikeCounts] = useState<Record<string, number>>({});
  const [visibleCount, setVisibleCount] = useState(10);
  const [toast, setToast] = useState<string | null>(null);
  const observerRef = useRef<HTMLDivElement>(null);

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
      } catch (e) { setError(e instanceof Error ? e.message : 'Failed to load'); }
      finally { setPageLoading(false); }
    })();
  }, [user]);

  // Infinite scroll observer
  useEffect(() => {
    const el = observerRef.current;
    if (!el) return;
    const observer = new IntersectionObserver((entries) => {
      if (entries[0]?.isIntersecting) {
        setVisibleCount(prev => prev + 10);
      }
    }, { threshold: 0.1 });
    observer.observe(el);
    return () => observer.disconnect();
  }, [pageLoading]);

  const filtered = activeTab === 'all' ? items : items.filter(i => i.category === activeTab);
  const visible = filtered.slice(0, visibleCount);

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 2000);
  };

  const handleLike = async (id: string) => {
    try {
      const res = await api.toggleNewsLike(id);
      setUserLikes(prev => { const next = new Set(prev); if (res.liked) next.add(id); else next.delete(id); return next; });
      setLikeCounts(prev => ({ ...prev, [id]: res.count }));
      showToast(res.liked ? '❤️ Added to favorites' : 'Removed from favorites');
    } catch { /* silent */ }
  };

  const handleBookmark = async (id: string) => {
    try {
      const res = await api.toggleNewsBookmark(id);
      setUserBookmarks(prev => { const next = new Set(prev); if (res.bookmarked) next.add(id); else next.delete(id); return next; });
      showToast(res.bookmarked ? '🔖 Saved for later' : 'Removed from saved');
    } catch { /* silent */ }
  };

  const handleShare = async (item: CurrentAffairsItem) => {
    const text = `${item.headline}\n\nRead more on Nexigrate`;
    const url = `${window.location.origin}/current-affairs/${item.id}`;
    if (navigator.share) {
      try { await navigator.share({ title: item.headline, text, url }); } catch { /* cancelled */ }
    } else {
      await navigator.clipboard.writeText(`${item.headline}\n${url}`);
      showToast('📋 Link copied!');
    }
  };

  useEffect(() => { setVisibleCount(10); }, [activeTab]);

  if (loading || !user || pageLoading) return (
    <main className="min-h-dvh bg-amber-50/30 dark:bg-slate-950 flex items-center justify-center">
      <div className="space-y-4 w-64">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-64 w-full rounded-2xl" />
        <Skeleton className="h-64 w-full rounded-2xl" />
      </div>
    </main>
  );

  if (error) return (
    <main className="min-h-dvh bg-amber-50/30 dark:bg-slate-950 flex items-center justify-center px-5">
      <div className="text-center">
        <p className="text-slate-800 dark:text-slate-200 text-sm">{error}</p>
        <button onClick={() => router.back()} className="mt-4 px-4 py-2 rounded-lg bg-slate-100 dark:bg-slate-800 text-sm font-medium">← Back</button>
      </div>
    </main>
  );

  return (
    <main className="min-h-dvh bg-amber-50/30 dark:bg-slate-950">
      {/* Header */}
      <header className="sticky top-0 z-30 bg-white/80 dark:bg-slate-900/80 backdrop-blur-md border-b border-amber-100 dark:border-slate-800">
        <div className="mx-auto max-w-[520px] flex items-center justify-between px-4 py-3">
          <button onClick={() => router.push('/dashboard')} className="flex items-center gap-1 text-slate-700 dark:text-slate-300 text-sm font-medium hover:text-slate-900 dark:hover:text-white transition-colors">
            <svg width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path d="M15 18l-6-6 6-6"/></svg>
            Back
          </button>
          <h1 className="text-base font-bold text-slate-900 dark:text-slate-100">Today&apos;s News</h1>
          <button
            onClick={() => router.push('/current-affairs/quiz')}
            className="px-3 py-1.5 rounded-full bg-amber-500 text-white text-xs font-bold hover:bg-amber-600 transition-colors shadow-sm"
          >
            📝 Take Quiz
          </button>
        </div>

        {/* Category tabs */}
        <div className="mx-auto max-w-[520px] px-3 pb-2 flex gap-2 overflow-x-auto scrollbar-hide">
          {CATEGORIES.map(cat => (
            <button
              key={cat.key}
              onClick={() => setActiveTab(cat.key)}
              className={`whitespace-nowrap px-3 py-1.5 rounded-full text-xs font-medium transition-all ${
                activeTab === cat.key
                  ? 'bg-amber-500 text-white shadow-sm'
                  : 'bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-400 border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-700'
              }`}
            >
              {cat.label}
            </button>
          ))}
        </div>
      </header>

      {/* News Feed */}
      <div className="mx-auto max-w-[480px] px-4 py-4 space-y-4">
        {filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <span className="text-5xl">📰</span>
            <p className="mt-4 text-lg font-bold text-slate-900 dark:text-slate-100">No news yet</p>
            <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">Refreshes every 4 hours. Check back soon!</p>
          </div>
        ) : (
          <>
            {visible.map((item) => (
              <NewsCard
                key={item.id}
                item={item}
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
            {/* Infinite scroll trigger */}
            {visibleCount < filtered.length && (
              <div ref={observerRef} className="flex justify-center py-6">
                <div className="h-8 w-8 border-2 border-amber-500 border-t-transparent rounded-full animate-spin" />
              </div>
            )}
          </>
        )}
      </div>

      {/* Mobile sticky quiz button */}
      <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-30 sm:hidden">
        <button
          onClick={() => router.push('/current-affairs/quiz')}
          className="px-5 py-3 rounded-full bg-amber-500 text-white text-sm font-bold shadow-lg hover:bg-amber-600 transition-colors flex items-center gap-2"
        >
          📝 Take Today&apos;s Quiz
        </button>
      </div>

      {/* Toast */}
      {toast && (
        <div className="fixed bottom-20 left-1/2 -translate-x-1/2 z-50 px-4 py-2 rounded-lg bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900 text-sm shadow-xl animate-fadeIn">
          {toast}
        </div>
      )}
    </main>
  );
}

/* ─── News Card Component ─── */
interface NewsCardProps {
  item: CurrentAffairsItem;
  liked: boolean;
  bookmarked: boolean;
  likeCount: number;
  onLike: () => void;
  onBookmark: () => void;
  onShare: () => void;
  onTap: () => void;
  onAskNexi: () => void;
}

function NewsCard({ item, liked, bookmarked, likeCount, onLike, onBookmark, onShare, onTap, onAskNexi }: NewsCardProps) {
  const [imgError, setImgError] = useState(false);
  const keyword = getImageKeyword(item.headline);
  const imageUrl = `https://source.unsplash.com/480x240/?${encodeURIComponent(keyword)}`;
  const categoryColor = CATEGORY_COLORS[item.category] ?? 'bg-slate-600';
  const gradient = CATEGORY_GRADIENTS[item.category] ?? 'from-slate-500 to-slate-700';

  const summary = item.summary || item.body || '';
  const displayText = summary.length > 200 ? summary.slice(0, 200) + '...' : summary;

  return (
    <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-100 dark:border-slate-800 overflow-hidden shadow-sm hover:shadow-md transition-shadow">
      {/* Image */}
      <div className="relative h-44 overflow-hidden cursor-pointer" onClick={onTap}>
        {!imgError ? (
          <img
            src={imageUrl}
            alt=""
            className="w-full h-full object-cover"
            loading="lazy"
            onError={() => setImgError(true)}
          />
        ) : (
          <div className={`w-full h-full bg-gradient-to-br ${gradient} flex items-center justify-center`}>
            <span className="text-4xl opacity-50">📰</span>
          </div>
        )}
        {/* Category badge */}
        <span className={`absolute top-3 left-3 px-2.5 py-1 rounded-full text-[11px] font-bold text-white ${categoryColor} shadow-sm`}>
          {item.category}
        </span>
      </div>

      {/* Content */}
      <div className="p-4">
        <h2
          className="font-bold text-lg leading-snug text-slate-900 dark:text-slate-100 line-clamp-2 cursor-pointer hover:text-amber-700 dark:hover:text-amber-400 transition-colors"
          onClick={onTap}
        >
          {item.headline}
        </h2>
        <p className="mt-2 text-sm text-slate-600 dark:text-slate-400 leading-relaxed line-clamp-3">
          {displayText}
        </p>

        {/* Bottom bar */}
        <div className="mt-3 flex items-center justify-between">
          <div className="flex items-center gap-1">
            {item.sources.length > 0 && (
              <span className="text-xs text-slate-400 dark:text-slate-500 truncate max-w-[120px]">
                {item.sources[0]}
              </span>
            )}
          </div>
          <button onClick={onTap} className="text-xs font-semibold text-amber-600 dark:text-amber-400 hover:underline">
            Read more →
          </button>
        </div>

        {/* Action buttons */}
        <div className="mt-3 pt-3 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button onClick={onLike} className={`flex items-center gap-1 text-sm transition-transform ${liked ? 'scale-110' : 'hover:scale-105'}`}>
              <span>{liked ? '❤️' : '🤍'}</span>
              {likeCount > 0 && <span className="text-xs text-slate-500">{likeCount}</span>}
            </button>
            <button onClick={onBookmark} className={`text-sm transition-transform ${bookmarked ? 'scale-110' : 'hover:scale-105'}`}>
              {bookmarked ? '🔖' : '📑'}
            </button>
            <button onClick={onShare} className="text-sm hover:scale-105 transition-transform">
              📤
            </button>
          </div>
          <button
            onClick={onAskNexi}
            className="flex items-center gap-1 px-2.5 py-1 rounded-full bg-purple-50 dark:bg-purple-500/10 text-xs font-medium text-purple-700 dark:text-purple-300 hover:bg-purple-100 dark:hover:bg-purple-500/20 transition-colors"
          >
            🤖 Ask AI
          </button>
        </div>
      </div>
    </div>
  );
}
