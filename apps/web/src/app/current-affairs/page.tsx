'use client';
import { useEffect, useState, useRef, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '~/lib/auth-context';
import { api, type CurrentAffairsItem, type LeaderboardEntry } from '~/lib/api';
import { Logo } from '~/components/Logo';
import { Skeleton } from '~/components/Skeleton';

const CATEGORY_TABS = [
  { key: 'all', label: 'All', emoji: '📰' },
  { key: 'national', label: 'National', emoji: '🇮🇳' },
  { key: 'international', label: 'International', emoji: '🌍' },
  { key: 'economy', label: 'Economy', emoji: '💹' },
  { key: 'science-tech', label: 'Science', emoji: '🔬' },
  { key: 'sports', label: 'Sports', emoji: '🏏' },
  { key: 'environment', label: 'Environment', emoji: '🌱' },
] as const;

const CATEGORY_COLORS: Record<string, string> = {
  national: 'from-ember-500/20 to-ember-600/5',
  international: 'from-gold-500/20 to-gold-600/5',
  economy: 'from-gold-600/20 to-gold-500/5',
  'science-tech': 'from-ember-600/20 to-ember-500/5',
  environment: 'from-gold-500/15 to-gold-600/5',
  sports: 'from-ember-500/15 to-ember-600/5',
  other: 'from-paper-300/50 to-paper-200/30',
};

export default function CurrentAffairsPage() {
  const { user, loading } = useAuth();
  const router = useRouter();
  const [items, setItems] = useState<CurrentAffairsItem[]>([]);
  const [winner, setWinner] = useState<LeaderboardEntry | null>(null);
  const [activeTab, setActiveTab] = useState<string>('all');
  const [pageLoading, setPageLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isFromYesterday, setIsFromYesterday] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const touchStartY = useRef(0);
  const touchStartTime = useRef(0);

  useEffect(() => { if (!loading && !user) router.replace('/signin'); }, [user, loading, router]);

  useEffect(() => {
    if (!user) return;
    (async () => {
      try {
        const lang = (localStorage.getItem('nexigrate-language') as 'en' | 'hi') || 'en';
        const res = await api.getCurrentAffairs(lang);
        setItems(res.items);
        setWinner(res.yesterdayWinner);
        if ((res as any).isFromYesterday) setIsFromYesterday(true);
      } catch (e) { setError(e instanceof Error ? e.message : 'Failed to load current affairs'); }
      finally { setPageLoading(false); }
    })();
  }, [user]);

  const filtered = activeTab === 'all' ? items : items.filter(item => item.category === activeTab);

  // Swipe handling for shorts-style navigation
  const handleTouchStart = (e: React.TouchEvent) => {
    touchStartY.current = e.touches[0]?.clientY ?? 0;
    touchStartTime.current = Date.now();
  };

  const handleTouchEnd = (e: React.TouchEvent) => {
    const diffY = (e.changedTouches[0]?.clientY ?? 0) - touchStartY.current;
    const timeDiff = Date.now() - touchStartTime.current;
    // Quick swipe detection (< 300ms and > 50px)
    if (timeDiff < 300 && Math.abs(diffY) > 50) {
      if (diffY < -50 && currentIndex < filtered.length - 1) {
        setCurrentIndex(prev => prev + 1);
      } else if (diffY > 50 && currentIndex > 0) {
        setCurrentIndex(prev => prev - 1);
      }
    }
  };

  // Scroll snap for desktop
  const handleScroll = useCallback(() => {
    if (!containerRef.current) return;
    const scrollTop = containerRef.current.scrollTop;
    const cardHeight = containerRef.current.clientHeight;
    const newIndex = Math.round(scrollTop / cardHeight);
    if (newIndex !== currentIndex && newIndex >= 0 && newIndex < filtered.length) {
      setCurrentIndex(newIndex);
    }
  }, [currentIndex, filtered.length]);

  // Reset index when tab changes
  useEffect(() => { setCurrentIndex(0); }, [activeTab]);

  // Scroll to current card
  useEffect(() => {
    if (containerRef.current) {
      const cardHeight = containerRef.current.clientHeight;
      containerRef.current.scrollTo({ top: currentIndex * cardHeight, behavior: 'smooth' });
    }
  }, [currentIndex]);

  if (loading || !user || pageLoading) return (
    <main className="flex min-h-dvh flex-col">
      <div className="flex-1 flex items-center justify-center">
        <div className="space-y-4 w-full max-w-sm px-5">
          <Skeleton className="h-8 w-48" />
          <Skeleton className="h-[60vh] w-full rounded-2xl" />
        </div>
      </div>
    </main>
  );

  if (error) return (
    <main className="mx-auto flex min-h-dvh max-w-lg flex-col items-center justify-center px-5">
      <div className="banner banner-error">{error}</div>
      <button onClick={() => router.back()} className="btn-ghost mt-4">← Back</button>
    </main>
  );

  const today = new Date().toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' });

  return (
    <main className="flex min-h-dvh flex-col overflow-hidden">
      {/* Fixed Header */}
      <header className="sticky top-0 z-30 bg-paper-50/95 backdrop-blur-md border-b border-line px-4 py-3">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="font-serif text-lg font-bold text-ink-900">Current Affairs</h1>
            <p className="text-xs text-muted-500">{today} · {filtered.length} stories</p>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={() => router.push('/current-affairs/quiz')} className="pill text-xs font-medium">
              📝 Quiz
            </button>
            <button onClick={() => router.push('/dashboard')} className="btn-ghost-sm">←</button>
          </div>
        </div>

        {/* Category tabs */}
        <div className="mt-3 flex gap-1.5 overflow-x-auto pb-1 scrollbar-hide -mx-1 px-1">
          {CATEGORY_TABS.map(tab => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`flex items-center gap-1 whitespace-nowrap rounded-full px-3 py-1.5 text-xs font-medium transition-all ${
                activeTab === tab.key
                  ? 'bg-ink-900 text-paper-50 shadow-sm'
                  : 'bg-paper-200 text-ink-800 hover:bg-paper-300'
              }`}
            >
              <span className="text-sm">{tab.emoji}</span>
              {tab.label}
            </button>
          ))}
        </div>
      </header>

      {/* Yesterday's winner — compact */}
      {winner && currentIndex === 0 && (
        <div className="mx-4 mt-2 flex items-center gap-2 rounded-lg bg-gold-500/10 border border-gold-500/20 px-3 py-2">
          <span className="text-lg">🏆</span>
          <p className="text-xs text-ink-800">
            <span className="font-semibold">Yesterday's Winner:</span> {winner.score}% in {Math.floor(winner.timeTaken / 60)}:{String(winner.timeTaken % 60).padStart(2, '0')}
          </p>
        </div>
      )}

      {isFromYesterday && (
        <div className="mx-4 mt-2 rounded-lg bg-gold-500/10 border border-gold-500/20 px-3 py-2 text-xs text-gold-600">
          ⚠️ Today's news updating. Showing yesterday's affairs.
        </div>
      )}

      {/* Shorts-style scrollable cards */}
      {filtered.length === 0 ? (
        <div className="flex-1 flex flex-col items-center justify-center text-center px-4">
          <span className="text-5xl">📰</span>
          <p className="mt-4 font-serif text-lg font-semibold text-ink-900">No stories yet</p>
          <p className="mt-1 text-sm text-muted-500">News refreshes every 30 minutes. Check back soon!</p>
        </div>
      ) : (
        <div
          ref={containerRef}
          className="flex-1 overflow-y-auto snap-y snap-mandatory"
          onTouchStart={handleTouchStart}
          onTouchEnd={handleTouchEnd}
          onScroll={handleScroll}
          style={{ scrollSnapType: 'y mandatory' }}
        >
          {filtered.map((item, idx) => (
            <div
              key={item.id}
              className="snap-start h-[calc(100dvh-140px)] flex items-center justify-center px-4 py-3"
              style={{ scrollSnapAlign: 'start' }}
            >
              <button
                onClick={() => router.push(`/current-affairs/${item.id}`)}
                className="w-full max-w-md h-full flex flex-col rounded-2xl border border-line bg-paper-50 shadow-lg overflow-hidden transition-transform active:scale-[0.98] text-left"
              >
                {/* Card gradient top */}
                <div className={`h-32 sm:h-40 w-full bg-gradient-to-br ${CATEGORY_COLORS[item.category] || CATEGORY_COLORS.other} flex items-center justify-center relative`}>
                  <span className="text-5xl sm:text-6xl opacity-60">
                    {CATEGORY_TABS.find(t => t.key === item.category)?.emoji || '📰'}
                  </span>
                  <div className="absolute top-3 left-3 flex items-center gap-2">
                    <span className="rounded-full bg-paper-50/90 backdrop-blur-sm px-2.5 py-1 text-xs font-medium text-ink-900 shadow-sm">
                      {item.category}
                    </span>
                    {item.factChecked && (
                      <span className="rounded-full bg-gold-500/20 px-2 py-0.5 text-xs font-medium text-gold-600">✓ verified</span>
                    )}
                  </div>
                  {/* Card number */}
                  <div className="absolute top-3 right-3 flex items-center gap-1 rounded-full bg-ink-900/70 px-2 py-0.5">
                    <span className="text-xs font-mono text-paper-50">{idx + 1}/{filtered.length}</span>
                  </div>
                </div>

                {/* Card content */}
                <div className="flex-1 flex flex-col p-5">
                  {/* Headline */}
                  <h2 className="font-serif text-lg sm:text-xl font-bold leading-tight text-ink-900 line-clamp-3">
                    {item.headline}
                  </h2>

                  {/* Summary as bullet points */}
                  <div className="mt-3 flex-1">
                    {(item.summary || item.body).split('. ').filter(s => s.trim()).slice(0, 3).map((point, i) => (
                      <div key={i} className="flex items-start gap-2 mt-2">
                        <span className="mt-1 h-1.5 w-1.5 rounded-full bg-ember-500 flex-shrink-0" />
                        <p className="text-sm leading-relaxed text-ink-700 line-clamp-2">{point.trim()}{!point.endsWith('.') ? '.' : ''}</p>
                      </div>
                    ))}
                  </div>

                  {/* Footer */}
                  <div className="mt-auto pt-3 flex items-center justify-between border-t border-line">
                    <div className="flex items-center gap-2">
                      {item.sources.length > 0 && (
                        <span className="text-xs text-muted-400">📌 {item.sources[0]}</span>
                      )}
                    </div>
                    <span className="flex items-center gap-1 text-xs font-medium text-ember-500">
                      Read more →
                    </span>
                  </div>
                </div>
              </button>
            </div>
          ))}

          {/* End card — Quiz CTA */}
          <div className="snap-start h-[calc(100dvh-140px)] flex items-center justify-center px-4 py-3">
            <div className="w-full max-w-md flex flex-col items-center justify-center text-center p-8 rounded-2xl border border-line bg-paper-50 shadow-lg">
              <span className="text-5xl">🎯</span>
              <h2 className="mt-4 font-serif text-xl font-bold text-ink-900">That's all for now!</h2>
              <p className="mt-2 text-sm text-muted-500">Test your knowledge with today's quiz</p>
              <button
                onClick={() => router.push('/current-affairs/quiz')}
                className="btn-primary mt-6 w-full"
              >
                📝 Take Daily Quiz (20 Questions)
              </button>
              <button onClick={() => { setCurrentIndex(0); containerRef.current?.scrollTo({ top: 0, behavior: 'smooth' }); }} className="btn-ghost mt-3 w-full text-sm">
                ↑ Back to top
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Bottom progress dots */}
      {filtered.length > 0 && filtered.length <= 20 && (
        <div className="fixed bottom-4 left-1/2 -translate-x-1/2 flex items-center gap-1 rounded-full bg-ink-900/70 backdrop-blur-sm px-3 py-1.5 shadow-lg z-20">
          {filtered.slice(0, 10).map((_, i) => (
            <div
              key={i}
              className={`h-1.5 rounded-full transition-all ${
                i === currentIndex ? 'w-4 bg-paper-50' : 'w-1.5 bg-paper-50/40'
              }`}
            />
          ))}
          {filtered.length > 10 && (
            <span className="ml-1 text-[10px] text-paper-50/70 font-mono">{currentIndex + 1}/{filtered.length}</span>
          )}
        </div>
      )}
    </main>
  );
}
