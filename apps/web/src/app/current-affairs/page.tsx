'use client';
import { useEffect, useState, useRef, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '~/lib/auth-context';
import { api, type CurrentAffairsItem } from '~/lib/api';
import { Logo } from '~/components/Logo';
import { Skeleton } from '~/components/Skeleton';
import { AILoader } from '~/components/ui/AILoader';

const CATEGORY_EMOJIS: Record<string, string> = {
  national: '\u{1F1EE}\u{1F1F3}', international: '\u{1F30D}', economy: '\u{1F4B0}', 'science-tech': '\u{1F52C}',
  sports: '\u{1F3CF}', environment: '\u{1F331}', politics: '\u{1F3DB}\u{FE0F}', defence: '\u{1F6E1}\u{FE0F}', all: '\u{1F4F0}',
};

const CATEGORIES = [
  { key: 'all', label: 'All', emoji: '\u{1F4F0}' },
  { key: 'national', label: 'National', emoji: '\u{1F1EE}\u{1F1F3}' },
  { key: 'international', label: 'International', emoji: '\u{1F30D}' },
  { key: 'economy', label: 'Economy', emoji: '\u{1F4B0}' },
  { key: 'science-tech', label: 'Science', emoji: '\u{1F52C}' },
  { key: 'sports', label: 'Sports', emoji: '\u{1F3CF}' },
  { key: 'environment', label: 'Environment', emoji: '\u{1F331}' },
];

const CATEGORY_IMAGES: Record<string, string> = {
  national: 'https://images.unsplash.com/photo-1532375810709-75b1da00537c?w=600&h=300&fit=crop&q=80',
  international: 'https://images.unsplash.com/photo-1451187580459-43490279c0fa?w=600&h=300&fit=crop&q=80',
  economy: 'https://images.unsplash.com/photo-1611974789855-9c2a0a7236a3?w=600&h=300&fit=crop&q=80',
  'science-tech': 'https://images.unsplash.com/photo-1507413245164-6160d8298b31?w=600&h=300&fit=crop&q=80',
  sports: 'https://images.unsplash.com/photo-1461896836934-bd45ea8f5a65?w=600&h=300&fit=crop&q=80',
  environment: 'https://images.unsplash.com/photo-1441974231531-c6227db76b6e?w=600&h=300&fit=crop&q=80',
  politics: 'https://images.unsplash.com/photo-1529107386315-e1a2ed48a620?w=600&h=300&fit=crop&q=80',
  defence: 'https://images.unsplash.com/photo-1579912437766-7896df6d3cd3?w=600&h=300&fit=crop&q=80',
};

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
  const wheelTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);

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
        // PR-34b (audit #36): drop the `as any` cast — the field is now
        // typed on CurrentAffairsResponse so the optional read is safe.
        if (res.isFromYesterday) setIsFromYesterday(true);
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
      // PR-33: lock matches the 300ms CSS transition + 50ms safety. Pre-PR-33
      // the lock was 400ms, which caused dropped touch events on rapid swipes
      // (the next swipe arrived during the unlock window and was discarded).
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

  // Touch handlers for swipe (mobile)
  const handleTouchStart = (e: React.TouchEvent) => {
    touchStartY.current = e.touches[0]!.clientY;
    touchStartX.current = e.touches[0]!.clientX;
  };

  const handleTouchEnd = (e: React.TouchEvent) => {
    const deltaY = touchStartY.current - e.changedTouches[0]!.clientY;
    const deltaX = Math.abs(touchStartX.current - e.changedTouches[0]!.clientX);
    if (Math.abs(deltaY) > 50 && deltaX < 120) {
      if (deltaY > 0) goNext();
      else goPrev();
    }
  };

  // Mouse wheel handler (desktop) - use { passive: false } via ref to avoid Chrome warning
  const handleWheel = useCallback((e: WheelEvent) => {
    e.preventDefault();
    if (wheelTimeout.current) return;
    if (Math.abs(e.deltaY) < 30) return;
    if (e.deltaY > 0) goNext();
    else goPrev();
    wheelTimeout.current = setTimeout(() => { wheelTimeout.current = null; }, 400);
  }, [goNext, goPrev]);

  // Attach wheel listener with { passive: false } to avoid Chrome warning (Fix #16)
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    el.addEventListener('wheel', handleWheel, { passive: false });
    return () => el.removeEventListener('wheel', handleWheel);
  }, [handleWheel]);

  // Keyboard navigation
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'ArrowDown' || e.key === 'j') { e.preventDefault(); goNext(); }
      if (e.key === 'ArrowUp' || e.key === 'k') { e.preventDefault(); goPrev(); }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [goNext, goPrev]);

  useEffect(() => { setCurrentIdx(0); }, [activeTab]);

  const handleLike = async (id: string) => {
    try {
      const res = await api.toggleNewsLike(id);
      setUserLikes(prev => { const next = new Set(prev); if (res.liked) next.add(id); else next.delete(id); return next; });
      setLikeCounts(prev => ({ ...prev, [id]: res.count }));
    } catch { /* silent */ }
  };

  const handleBookmark = async (id: string) => {
    try {
      const res = await api.toggleNewsBookmark(id);
      setUserBookmarks(prev => { const next = new Set(prev); if (res.bookmarked) next.add(id); else next.delete(id); return next; });
    } catch { /* silent */ }
  };

  const handleShare = async (item: CurrentAffairsItem) => {
    const text = `${item.headline}\n\nRead more on Nexigrate`;
    if (navigator.share) {
      try { await navigator.share({ title: item.headline, text, url: window.location.origin + `/current-affairs/${item.id}` }); } catch { /* cancelled */ }
    } else {
      await navigator.clipboard.writeText(`${item.headline}\n${window.location.origin}/current-affairs/${item.id}`);
    }
  };

  if (loading || !user || pageLoading) return (
    <main className="shorts-shell flex min-h-dvh items-center justify-center">
      <AILoader context="currentAffairs" />
    </main>
  );

  if (error) return (
    <main className="shorts-shell flex min-h-dvh items-center justify-center px-5">
      <div className="text-center">
        <p className="text-ink-800 text-sm">{error}</p>
        <button onClick={() => router.back()} className="btn-ghost mt-4">← Back</button>
      </div>
    </main>
  );

  return (
    <main className="shorts-shell fixed inset-0 flex flex-col overflow-hidden select-none">
      {/* Top bar */}
      <header className="relative z-20 flex items-center justify-between px-4 pt-3 pb-2">
        <button onClick={() => router.push('/dashboard')} className="flex items-center gap-1.5 text-ink-700 text-sm font-medium hover:text-ink-900 transition-colors active:scale-95 rounded-lg px-2 py-1.5 -ml-2 hover:bg-paper-300/50">
          <svg width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path d="M15 18l-6-6 6-6"/></svg>
          Back
        </button>
        <div className="flex items-center gap-2">
          <span className="text-ink-900 text-sm font-semibold">Today&apos;s News</span>
          {isFromYesterday && <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-ember-500/15 text-ember-600 font-medium">Yesterday</span>}
        </div>
        <button onClick={() => router.push('/current-affairs/quiz')} className="inline-flex items-center gap-1.5 rounded-full bg-ember-500 px-3.5 py-1.5 text-xs font-semibold text-paper-50 hover:bg-ember-600 transition-all duration-150 shadow-sm active:scale-95">
          <svg width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path d="M9 11l3 3L22 4M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/></svg>
          Quiz
        </button>
      </header>

      {/* Category pills */}
      <div className="relative z-20 px-3 pb-3 flex gap-2 overflow-x-auto scrollbar-hide">
        {CATEGORIES.map(cat => (
          <button
            key={cat.key}
            onClick={() => setActiveTab(cat.key)}
            className={`flex items-center gap-1.5 whitespace-nowrap px-3.5 py-2 rounded-full text-xs font-medium transition-all duration-200 active:scale-95 ${
              activeTab === cat.key
                ? 'bg-ink-900 text-paper-50 shadow-md scale-[1.02]'
                : 'bg-paper-50 text-ink-700 border border-line hover:bg-paper-300 hover:border-muted-400'
            }`}
          >
            <span className="text-sm">{cat.emoji}</span>
            <span>{cat.label}</span>
          </button>
        ))}
      </div>

      {/* Shorts container */}
      {filtered.length === 0 ? (
        <div className="flex-1 flex flex-col items-center justify-center text-center px-6 animate-fadeIn">
          <div className="w-16 h-16 rounded-2xl bg-paper-300 flex items-center justify-center">
            <svg width="28" height="28" fill="none" stroke="currentColor" strokeWidth="1.5" viewBox="0 0 24 24" className="text-muted-500"><path d="M19 20H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v1m2 13a2 2 0 0 1-2-2V9a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2h-2z"/></svg>
          </div>
          <p className="mt-4 font-serif text-xl font-semibold text-ink-900">No news yet</p>
          <p className="mt-2 text-sm text-muted-500 max-w-xs">Refreshes every 30 minutes. Check back soon!</p>
        </div>
      ) : (
        <div
          ref={containerRef}
          className="flex-1 relative overflow-hidden"
          onTouchStart={handleTouchStart}
          onTouchEnd={handleTouchEnd}
        >
          {/* Desktop layout: centered card + sidebar */}
          <div className="absolute inset-0 flex items-stretch justify-center">
            {/* Card column.
                PR-33: render ONLY the visible card +/- 1 sibling rather
                than every filtered item. Pre-PR-33 a 50-item feed
                mounted 50 fully-styled cards (each with image, gradient,
                action buttons, etc.) which is what made the slider
                stutter on mobile -- mid-tier Android devices struggle
                with 50 layout-heavy DOM nodes inside a transformed
                ancestor. Window rendering keeps DOM size constant. */}
            <div className="relative w-full max-w-[480px] lg:max-w-[420px] h-full overflow-hidden">
              <div
                className="absolute inset-0 transition-transform duration-300 ease-out will-change-transform"
                style={{
                  // PR-33: translate3d(0, ..., 0) instead of translateY()
                  // forces GPU compositing on iOS Safari + Chromium
                  // mobile, which removes the "stuck" feeling on the
                  // first swipe after a long idle.
                  transform: `translate3d(0, -${currentIdx * 100}%, 0)`,
                }}
              >
                {filtered.map((item, idx) => {
                  // Render-window: keep current and immediate neighbours
                  // in the DOM. Items further away render a lightweight
                  // placeholder so the absolute positioning stays
                  // correct (each slot still occupies 100% height).
                  const inWindow = Math.abs(idx - currentIdx) <= 1;
                  return inWindow ? (
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
                  ) : (
                    <div key={item.id} className="h-full w-full" aria-hidden />
                  );
                })}
              </div>
            </div>

            {/* Desktop sidebar: action buttons */}
            <div className="hidden lg:flex flex-col items-center justify-center gap-6 pl-6 pr-4">
              {filtered[currentIdx] && (
                <>
                  <ActionBtn icon={userLikes.has(filtered[currentIdx]!.id) ? '❤️' : '🤍'} label={String(likeCounts[filtered[currentIdx]!.id] || '')} active={userLikes.has(filtered[currentIdx]!.id)} onClick={() => handleLike(filtered[currentIdx]!.id)} />
                  <ActionBtn icon={userBookmarks.has(filtered[currentIdx]!.id) ? '🔖' : '📑'} label="Save" active={userBookmarks.has(filtered[currentIdx]!.id)} onClick={() => handleBookmark(filtered[currentIdx]!.id)} />
                  <ActionBtn icon="↗️" label="Share" onClick={() => handleShare(filtered[currentIdx]!)} />
                  <ActionBtn icon="🤖" label="Ask AI" onClick={() => router.push(`/chat?topic=${encodeURIComponent(filtered[currentIdx]!.headline)}`)} />
                </>
              )}
            </div>
          </div>

          {/* Mobile progress dots */}
          <div className="absolute right-2.5 top-1/2 -translate-y-1/2 flex flex-col gap-1.5 z-10 lg:hidden">
            {filtered.slice(Math.max(0, currentIdx - 3), currentIdx + 4).map((item, i) => {
              const realIdx = Math.max(0, currentIdx - 3) + i;
              return (
                <div key={item.id} className={`rounded-full transition-all duration-300 ease-out ${realIdx === currentIdx ? 'w-2 h-5 bg-ember-500 shadow-sm' : 'w-2 h-2 bg-muted-400/60'}`} />
              );
            })}
          </div>



          {currentIdx === 0 && (
            <div className="absolute bottom-14 left-1/2 -translate-x-1/2 z-10 animate-bounce opacity-40">
              <svg width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24" className="text-ink-700"><path d="M12 5v14M5 12l7 7 7-7"/></svg>
            </div>
          )}
        </div>
      )}

      {/* Sticky mobile bottom quiz bar */}
      {filtered.length > 0 && (
        <div className="fixed bottom-16 left-0 right-0 z-30 px-4 pb-4 pb-[env(safe-area-inset-bottom)] pt-3 bg-gradient-to-t from-paper-50 via-paper-50/95 to-transparent lg:hidden animate-slideUp">
          <button
            onClick={() => router.push('/current-affairs/quiz')}
            className="w-full rounded-xl bg-ember-500 px-4 py-3.5 text-sm font-bold text-paper-50 shadow-lg hover:bg-ember-600 transition-all duration-150 active:scale-[0.97] flex items-center justify-center gap-2"
          >
            <svg width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path d="M9 11l3 3L22 4M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/></svg>
            Take Today&apos;s Quiz
          </button>
        </div>
      )}
    </main>
  );
}

/* ─── Desktop Action Button ─── */
function ActionBtn({ icon, label, active, onClick }: { icon: string; label: string; active?: boolean; onClick: () => void }) {
  return (
    <button onClick={onClick} className={`flex flex-col items-center gap-1.5 group transition-all duration-150 hover:scale-110 active:scale-90 ${active ? 'scale-105' : ''}`}>
      <span className={`text-2xl transition-transform duration-200 ${active ? 'scale-110' : 'group-hover:scale-105'}`}>{icon}</span>
      <span className="text-[11px] text-muted-500 group-hover:text-ink-900 font-medium transition-colors">{label}</span>
    </button>
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
  const keyPoints = extractKeyPoints(item.summary || item.body);
  const imageUrl = CATEGORY_IMAGES[item.category] ?? CATEGORY_IMAGES['national']!;
  const [imgError, setImgError] = useState(false);

  return (
    <div className="h-full w-full flex items-center justify-center px-3 py-2 lg:px-0 lg:py-3">
      <div
        className={`relative w-full h-full rounded-2xl lg:rounded-3xl overflow-hidden shadow-xl border cursor-pointer bg-paper-50 dark:bg-paper-100 transition-all duration-300 ease-out ${
          isActive ? 'scale-100 opacity-100 border-line shadow-xl' : 'scale-[0.94] opacity-20 border-transparent shadow-none'
        }`}
        onClick={onTap}
      >
        {/* Image header */}
        <div className="relative h-[35%] min-h-[140px] max-h-[200px] overflow-hidden">
          {!imgError ? (
            <img src={imageUrl} alt={item.category} className="absolute inset-0 w-full h-full object-cover transition-transform duration-700 ease-out" style={{ transform: isActive ? 'scale(1)' : 'scale(1.1)' }} loading="lazy" onError={() => setImgError(true)} />
          ) : (
            <div className="absolute inset-0 w-full h-full bg-gradient-to-br from-paper-200 to-paper-300 dark:from-ink-800 dark:to-ink-900 flex items-center justify-center">
              <span className="text-4xl">{emoji}</span>
            </div>
          )}
          <div className="absolute inset-0" style={{ background: `linear-gradient(180deg, ${getCategoryOverlay(item.category)}70 0%, ${getCategoryOverlay(item.category)}30 40%, transparent 100%)` }} />
          <div className="absolute top-3 left-3 flex items-center gap-2">
            <span className="px-2.5 py-1 rounded-full text-[11px] font-bold uppercase tracking-wider bg-paper-50/90 text-ink-900 backdrop-blur-sm shadow-sm border border-line/30">
              {emoji} {item.category}
            </span>
            {item.factChecked && (
              <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-amber-500/90 text-white shadow-sm">✓ Verified</span>
            )}
          </div>
        </div>

        {/* Content area */}
        <div className="flex flex-col px-4 pt-3.5 pb-4 h-[65%] overflow-hidden">
          <h2 className="font-serif text-[15px] lg:text-base font-bold leading-snug text-ink-900 line-clamp-3">
            {item.headline}
          </h2>
          <div className="mt-3 flex-1 overflow-hidden">
            <ul className="space-y-2">
              {keyPoints.slice(0, 3).map((point, i) => (
                <li key={i} className="flex items-start gap-2.5 text-[13px] text-ink-700 leading-relaxed">
                  <span className="mt-1.5 h-1.5 w-1.5 rounded-full bg-ember-500 flex-shrink-0" />
                  <span className="line-clamp-2">{point}</span>
                </li>
              ))}
            </ul>
          </div>
          <div className="mt-auto pt-2.5 flex items-center justify-between border-t border-line/50">
            {item.sources.length > 0 && (
              <p className="text-[10px] text-muted-400 truncate max-w-[60%]">{item.sources.slice(0, 2).join(' · ')}</p>
            )}
            <span className="text-[11px] text-ember-500 font-semibold flex items-center gap-1">
              Read more
              <svg width="12" height="12" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path d="M5 12h14M12 5l7 7-7 7"/></svg>
            </span>
          </div>
        </div>

        {/* Mobile action buttons.
            PR-33: moved from `bottom-20` (80px) to `bottom-28` (112px)
            because the fixed quiz bar (`fixed bottom-16` + ~52px tall)
            occupies the 64-116px band of the viewport. Pre-PR-33 the
            action buttons sat at 80-230px, overlapping the quiz bar's
            top 36px and disappearing into its gradient fade.
            bottom-28 puts the bottom edge of the action stack 4px
            above the quiz bar's solid area -- visually clear.
            Also bumped z-index from z-10 to z-20 so a translucent
            quiz bar gradient (z-30) does not cover them on overscroll. */}
        <div className="absolute right-2.5 bottom-28 flex flex-col items-center gap-2.5 z-20 lg:hidden">
          <button onClick={(e) => { e.stopPropagation(); onLike(); }} className={`flex flex-col items-center gap-0.5 rounded-full p-2.5 border transition-all duration-150 active:scale-90 ${liked ? 'bg-paper-50/90 border-ember-500/30 shadow-md' : 'bg-paper-50/70 backdrop-blur-sm border-line/50'}`}>
            <span className={`text-lg transition-transform duration-200 ${liked ? 'scale-110' : ''}`}>{liked ? '❤️' : '🤍'}</span>
            {likeCount > 0 && <span className="text-[9px] text-ink-800 font-semibold">{likeCount}</span>}
          </button>
          <button onClick={(e) => { e.stopPropagation(); onBookmark(); }} className={`rounded-full p-2.5 border transition-all duration-150 active:scale-90 ${bookmarked ? 'bg-paper-50/90 border-gold-500/30 shadow-md' : 'bg-paper-50/70 backdrop-blur-sm border-line/50'}`}>
            <span className={`text-lg transition-transform duration-200 ${bookmarked ? 'scale-110' : ''}`}>{bookmarked ? '🔖' : '📑'}</span>
          </button>
          <button onClick={(e) => { e.stopPropagation(); onShare(); }} className="bg-paper-50/70 backdrop-blur-sm rounded-full p-2.5 border border-line/50 transition-all duration-150 active:scale-90">
            <svg width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24" className="text-ink-700"><path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8M16 6l-4-4-4 4M12 2v13"/></svg>
          </button>
          <button onClick={(e) => { e.stopPropagation(); onAskNexi(); }} className="bg-paper-50/70 backdrop-blur-sm rounded-full p-2.5 border border-line/50 transition-all duration-150 active:scale-90">
            <svg width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24" className="text-ink-700"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
          </button>
        </div>
      </div>
    </div>
  );
}

/* ─── Helpers ─── */
function extractKeyPoints(text: string): string[] {
  if (!text) return [];
  const bullets = text.split(/[•\-\*]\s+/).filter(s => s.trim().length > 10);
  if (bullets.length >= 2) return bullets.slice(0, 5);
  const sentences = text.split(/[.!?]+\s+/).filter(s => s.trim().length > 15);
  return sentences.slice(0, 5);
}

function getCategoryOverlay(category: string): string {
  const colors: Record<string, string> = {
    national: '#FF9933', international: '#2563EB', economy: '#059669',
    'science-tech': '#7C3AED', sports: '#DC2626', environment: '#16A34A',
    politics: '#7C3AED', defence: '#1E3A5F',
  };
  return colors[category] ?? '#1E293B';
}
