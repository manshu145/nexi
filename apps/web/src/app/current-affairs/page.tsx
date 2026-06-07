'use client';
import { useEffect, useState, useRef, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '~/lib/auth-context';
import { api, type CurrentAffairsItem, type CAStateOption } from '~/lib/api';
import { Logo } from '~/components/Logo';
import { Skeleton } from '~/components/Skeleton';
import { AILoader } from '~/components/ui/AILoader';
import { CATEGORY_EMOJIS, CATEGORY_IMAGES } from './_shared';

const CATEGORIES = [
  { key: 'all', label: 'All', emoji: '\u{1F4F0}' },
  { key: 'national', label: 'National', emoji: '\u{1F1EE}\u{1F1F3}' },
  { key: 'international', label: 'International', emoji: '\u{1F30D}' },
  { key: 'economy', label: 'Economy', emoji: '\u{1F4B0}' },
  { key: 'science-tech', label: 'Science', emoji: '\u{1F52C}' },
  { key: 'sports', label: 'Sports', emoji: '\u{1F3CF}' },
  { key: 'environment', label: 'Environment', emoji: '\u{1F331}' },
];

/**
 * Current Affairs reels — PR-39 native scroll-snap rebuild.
 *
 * Founder lock (30 May 22:00 IST):
 *   "uske single page me reel vala slider atk rha hai bahut.. smooth
 *    nhi hai jaise insta ka hota hai. uska UI me kam krne ki jaurat hai."
 *
 * Pre-PR-39 the reels used an absolute-positioned container with a
 * transform-translate animation driven by manual touch + wheel handlers.
 * Even with PR-33's GPU compositing tweaks it never felt as native as
 * Instagram's reels because the gesture detection was JS-driven --
 * iOS Safari and Chromium handle native scroll inertia + rubber-banding
 * far better than any setTimeout-throttled JS handler can.
 *
 * PR-39 swaps to native CSS scroll-snap: each card is a snap-point in
 * a vertically-scrollable column. The browser owns the gesture, the
 * inertia curve, the rubber-band edges, and the snap. We only listen
 * to `scroll` to keep `currentIdx` in sync for the desktop sidebar +
 * dot indicators, and we call `scrollTo({ top, behavior: 'smooth' })`
 * for keyboard/programmatic navigation.
 *
 * Performance: we still mount only the active card +/- 1 sibling so
 * a 50-item feed doesn't render 50 heavy ShortCard nodes simultaneously.
 * Items outside the window render a transparent placeholder of equal
 * height so the snap geometry stays correct.
 */
export default function CurrentAffairsShortsPage() {
  const { user, loading } = useAuth();
  const router = useRouter();
  const [items, setItems] = useState<CurrentAffairsItem[]>([]);
  const [activeTab, setActiveTab] = useState('all');
  // State editions: 'all' (default — national + every live state's news),
  // 'national' (only untagged items), or a specific state slug. The
  // selector only renders when the admin has marked at least one state
  // live, so national-only deployments are visually unchanged.
  const [states, setStates] = useState<CAStateOption[]>([]);
  const [activeState, setActiveState] = useState('all');
  const [currentIdx, setCurrentIdx] = useState(0);
  const [pageLoading, setPageLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [userLikes, setUserLikes] = useState<Set<string>>(new Set());
  const [userBookmarks, setUserBookmarks] = useState<Set<string>>(new Set());
  const [likeCounts, setLikeCounts] = useState<Record<string, number>>({});
  const [isFromYesterday, setIsFromYesterday] = useState(false);
  const scrollerRef = useRef<HTMLDivElement>(null);

  useEffect(() => { if (!loading && !user) router.replace('/signin'); }, [user, loading, router]);

  // Fetch the live state editions once. Empty list = national-only, in
  // which case the selector stays hidden and nothing changes for users.
  useEffect(() => {
    if (!user) return;
    (async () => {
      try {
        const res = await api.getCurrentAffairsStates();
        setStates(res.states ?? []);
      } catch { /* selector simply stays hidden */ }
    })();
  }, [user]);

  // Load the feed for the active state edition. Re-runs when the user
  // switches state. National (default) passes state='national' which the
  // API maps to "items without a state tag" — i.e. the original feed.
  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    setPageLoading(true);
    (async () => {
      try {
        const lang = (localStorage.getItem('nexigrate-language') as 'en' | 'hi') || 'en';
        const res = await api.getCurrentAffairs(lang, activeState);
        if (cancelled) return;
        setItems(res.items);
        if (res.userLikes) setUserLikes(new Set(res.userLikes));
        if (res.userBookmarks) setUserBookmarks(new Set(res.userBookmarks));
        if (res.likeCounts) setLikeCounts(res.likeCounts);
        // PR-34b (audit #36): drop the `as any` cast — the field is now
        // typed on CurrentAffairsResponse so the optional read is safe.
        setIsFromYesterday(Boolean(res.isFromYesterday));
      } catch (e) { if (!cancelled) setError(e instanceof Error ? e.message : 'Failed to load'); }
      finally { if (!cancelled) setPageLoading(false); }
    })();
    return () => { cancelled = true; };
  }, [user, activeState]);

  const filtered = activeTab === 'all' ? items : items.filter(i => i.category === activeTab);

  /**
   * Derive currentIdx from the scroll container's scrollTop. Native
   * scroll-snap snaps to each card's height, so dividing scrollTop by
   * the container's clientHeight gives the active index.
   *
   * PR-41: rAF-throttle to avoid setState storms during inertial scroll
   * on 120Hz displays. Previous version fired setCurrentIdx on every
   * scroll event (~4-8× per frame on iPad Pro) which caused re-renders
   * mid-momentum and visible stutter.
   */
  const rafRef = useRef<number>(0);
  const onScroll = useCallback(() => {
    if (rafRef.current) return; // already scheduled
    rafRef.current = requestAnimationFrame(() => {
      rafRef.current = 0;
      const el = scrollerRef.current;
      if (!el) return;
      const idx = Math.round(el.scrollTop / Math.max(1, el.clientHeight));
      setCurrentIdx(prev => (idx !== prev && idx >= 0 && idx < filtered.length) ? idx : prev);
    });
  }, [filtered.length]);

  // Programmatic navigation (keyboard, dot click, etc) — uses native
  // smooth scroll so it feels identical to a swipe.
  const scrollToIndex = useCallback((idx: number) => {
    const el = scrollerRef.current;
    if (!el) return;
    const clamped = Math.max(0, Math.min(filtered.length - 1, idx));
    el.scrollTo({ top: clamped * el.clientHeight, behavior: 'smooth' });
  }, [filtered.length]);

  // Keyboard nav (desktop). Mobile users swipe — handled natively.
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'ArrowDown' || e.key === 'j') { e.preventDefault(); scrollToIndex(currentIdx + 1); }
      if (e.key === 'ArrowUp' || e.key === 'k') { e.preventDefault(); scrollToIndex(currentIdx - 1); }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [currentIdx, scrollToIndex]);

  // Reset to top when category or state edition changes.
  useEffect(() => {
    setCurrentIdx(0);
    if (scrollerRef.current) scrollerRef.current.scrollTo({ top: 0, behavior: 'instant' as ScrollBehavior });
  }, [activeTab, activeState]);

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
    const url = window.location.origin + `/current-affairs/${item.id}`;
    const text = `${item.headline}\n\n📰 via Nexigrate — ${url}`;

    // 1. Try sharing a branded "news flash" IMAGE (WhatsApp-status friendly).
    //    Uses Web Share API Level 2 (files). Falls back gracefully below.
    try {
      const { buildNewsCardImage } = await import('~/lib/newsCard');
      const points = extractKeyPoints(item.summary || item.body).slice(0, 3);
      const file = await buildNewsCardImage({
        headline: item.headline,
        points,
        category: item.category,
        url,
        lang: getLang(),
      });
      if (file && typeof navigator.canShare === 'function' && navigator.canShare({ files: [file] })) {
        await navigator.share({ files: [file], text, title: item.headline });
        return;
      }
    } catch { /* image generation/share unsupported or cancelled → fall through */ }

    // 2. Fallback: text + link share.
    if (navigator.share) {
      try { await navigator.share({ title: item.headline, text, url }); } catch { /* cancelled */ }
    } else {
      await navigator.clipboard.writeText(text);
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
      {/* Top bar — clean news-site style */}
      <header className="relative z-20 px-4 pt-3 pb-1">
        <div className="flex items-center justify-between">
          <button onClick={() => router.push('/dashboard')} className="text-ink-700 hover:text-ink-900 transition-colors active:scale-95 rounded-lg p-1.5 -ml-1.5 hover:bg-paper-300/50">
            <svg width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path d="M15 18l-6-6 6-6"/></svg>
          </button>
          <h1 className="text-lg font-serif font-bold text-ink-900">
            {getLang() === 'hi' ? 'आज की खबरें' : "Today's News"}
            {isFromYesterday && <span className="ml-2 text-[10px] px-1.5 py-0.5 rounded-full bg-ember-500/15 text-ember-600 font-medium align-middle">{getLang() === 'hi' ? 'कल' : 'Yesterday'}</span>}
          </h1>
          <div className="flex items-center gap-1.5">
            <button onClick={() => router.push('/current-affairs/quiz/leaderboard')} className="rounded-full p-1.5 hover:bg-paper-300/50 text-ink-700 transition-colors active:scale-95" title="Leaderboard">🏆</button>
            <button onClick={() => router.push('/current-affairs/bookmarks')} className="rounded-full p-1.5 hover:bg-paper-300/50 text-ink-700 transition-colors active:scale-95" title="Saved">🔖</button>
            <button onClick={() => router.push('/current-affairs/quiz')} className="inline-flex items-center gap-1 rounded-full bg-ember-500 px-3 py-1.5 text-xs font-semibold text-paper-50 hover:bg-ember-600 transition-all shadow-sm active:scale-95">
              Quiz
            </button>
          </div>
        </div>
      </header>

      {/* State edition selector — only shown when admin has enabled at
          least one state, so the default national feed is unchanged. */}
      {states.length > 0 && (
        <div className="relative z-20 px-3 pt-1 flex items-center gap-2">
          <span className="flex-shrink-0 text-[11px] font-semibold uppercase tracking-wide text-muted-500">📍 Edition</span>
          <div className="flex gap-2 overflow-x-auto scrollbar-hide">
            <button
              onClick={() => setActiveState('all')}
              className={`flex-shrink-0 whitespace-nowrap rounded-full px-3 py-1.5 text-xs font-medium transition-all active:scale-95 ${
                activeState === 'all'
                  ? 'bg-ember-500 text-paper-50 shadow-sm'
                  : 'bg-paper-50 text-ink-700 border border-line hover:bg-paper-300'
              }`}
            >
              🗞️ {getLang() === 'hi' ? 'सभी' : 'All'}
            </button>
            <button
              onClick={() => setActiveState('national')}
              className={`flex-shrink-0 whitespace-nowrap rounded-full px-3 py-1.5 text-xs font-medium transition-all active:scale-95 ${
                activeState === 'national'
                  ? 'bg-ember-500 text-paper-50 shadow-sm'
                  : 'bg-paper-50 text-ink-700 border border-line hover:bg-paper-300'
              }`}
            >
              🇮🇳 {getLang() === 'hi' ? 'राष्ट्रीय' : 'National'}
            </button>
            {states.map(s => (
              <button
                key={s.slug}
                onClick={() => setActiveState(s.slug)}
                className={`flex-shrink-0 whitespace-nowrap rounded-full px-3 py-1.5 text-xs font-medium transition-all active:scale-95 ${
                  activeState === s.slug
                    ? 'bg-ember-500 text-paper-50 shadow-sm'
                    : 'bg-paper-50 text-ink-700 border border-line hover:bg-paper-300'
                }`}
              >
                {getLang() === 'hi' ? s.nameHi : s.name}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Category pills — below heading like news websites */}
      <div className="relative z-20 px-3 pb-2 pt-1 flex gap-2 overflow-x-auto scrollbar-hide">
        {CATEGORIES.map(cat => (
          <button
            key={cat.key}
            onClick={() => setActiveTab(cat.key)}
            className={`flex-shrink-0 flex items-center gap-1.5 whitespace-nowrap px-3.5 py-2 rounded-full text-xs font-medium transition-all duration-200 active:scale-95 ${
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

      {/* Reels container */}
      {filtered.length === 0 ? (
        <div className="flex-1 flex flex-col items-center justify-center text-center px-6 animate-fadeIn">
          <div className="w-16 h-16 rounded-2xl bg-paper-300 flex items-center justify-center">
            <svg width="28" height="28" fill="none" stroke="currentColor" strokeWidth="1.5" viewBox="0 0 24 24" className="text-muted-500"><path d="M19 20H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v1m2 13a2 2 0 0 1-2-2V9a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2h-2z"/></svg>
          </div>
          <p className="mt-4 font-serif text-xl font-semibold text-ink-900">No news yet</p>
          <p className="mt-2 text-sm text-muted-500 max-w-xs">Refreshes every 30 minutes. Check back soon!</p>
        </div>
      ) : (
        <div className="flex-1 relative overflow-hidden">
          <div className="absolute inset-0 flex items-stretch justify-center">
            {/* Native scroll-snap column.
                Each ShortCard wrapper has snap-start + h-full so the
                browser snaps to one card per page. overscroll-contain
                stops the underlying body from scrolling on rubber-band.
                will-change-transform hints the compositor for momentum
                on iOS Safari. */}
            <div
              ref={scrollerRef}
              onScroll={onScroll}
              className="relative w-full max-w-[480px] lg:max-w-[420px] h-full overflow-y-auto overscroll-contain scrollbar-hide will-change-transform touch-pan-y"
              style={{ scrollSnapType: 'y mandatory', WebkitOverflowScrolling: 'touch' }}
              aria-label="News reel"
            >
              {filtered.map((item, idx) => {
                // Render-window: keep current ±2 neighbours mounted for
                // buttery-smooth fast swiping. Items further away render
                // as transparent placeholders that hold the snap height.
                const inWindow = Math.abs(idx - currentIdx) <= 2;
                return (
                  <div
                    key={item.id}
                    className="h-full w-full"
                    style={{ scrollSnapAlign: 'start', scrollSnapStop: 'always' }}
                  >
                    {inWindow ? (
                      <ShortCard
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
                      <div className="h-full w-full" aria-hidden />
                    )}
                  </div>
                );
              })}
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

          {/* Mobile progress indicator: vertical line on the right edge,
              like Instagram's reel position bar. Cleaner than the dot
              cluster pre-PR-39 and doesn't overlap action buttons. */}
          {filtered.length > 1 && (
            <div className="absolute right-1.5 top-1/2 -translate-y-1/2 z-10 lg:hidden">
              <div className="h-32 w-1 rounded-full bg-muted-400/30 overflow-hidden">
                <div
                  className="w-full bg-ember-500 rounded-full transition-all duration-300 ease-out"
                  style={{
                    height: `${Math.max(10, 100 / filtered.length)}%`,
                    transform: `translateY(${currentIdx * (100 / Math.max(1, filtered.length - 1)) * ((filtered.length - 1) / Math.max(1, filtered.length))}%)`,
                  }}
                />
              </div>
              <p className="mt-1.5 text-center text-[9px] font-mono text-muted-500">
                {currentIdx + 1}/{filtered.length}
              </p>
            </div>
          )}

          {currentIdx === 0 && (
            <div className="absolute bottom-14 left-1/2 -translate-x-1/2 z-10 animate-bounce opacity-40 pointer-events-none">
              <svg width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24" className="text-ink-700"><path d="M12 5v14M5 12l7 7 7-7"/></svg>
            </div>
          )}
        </div>
      )}

      {/* Sticky mobile bottom quiz bar — positioned above BottomNav (h-14 + safe-area) */}
      {filtered.length > 0 && (
        <div className="fixed bottom-[calc(3.5rem+env(safe-area-inset-bottom))] left-0 right-0 z-30 px-4 pb-2 pt-3 bg-gradient-to-t from-paper-50 via-paper-50/95 to-transparent lg:hidden animate-slideUp">
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
  // Prefer the REAL article image extracted from the source RSS feed;
  // fall back to a category stock image, then (on load error) the emoji tile.
  const categoryImage = CATEGORY_IMAGES[item.category] ?? CATEGORY_IMAGES['national']!;
  const [imgError, setImgError] = useState(false);
  const [usedFallback, setUsedFallback] = useState(false);
  const imageUrl = (item.imageUrl && !usedFallback) ? item.imageUrl : categoryImage;

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
            <img src={imageUrl} alt={item.category} className="absolute inset-0 w-full h-full object-cover transition-transform duration-700 ease-out" style={{ transform: isActive ? 'scale(1)' : 'scale(1.1)' }} loading="lazy" onError={() => { if (!usedFallback && item.imageUrl) { setUsedFallback(true); } else { setImgError(true); } }} />
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
              <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-gold-500/90 text-paper-50 shadow-sm">✓ Verified</span>
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
            PR-49: BottomNav now stays visible on /current-affairs.
            Quiz bar sits above BottomNav (~56px + safe-area from bottom).
            Action buttons at bottom-32 to clear quiz bar + BottomNav. */}
        <div className="absolute right-2.5 bottom-32 flex flex-col items-center gap-2.5 z-20 lg:hidden">
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
function getLang(): 'en' | 'hi' {
  if (typeof window === 'undefined') return 'en';
  return (localStorage.getItem('nexigrate-language') as 'en' | 'hi') || 'en';
}

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
