'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '~/lib/auth-context';
import { api, type CurrentAffairsItem, type LeaderboardEntry } from '~/lib/api';
import { Logo } from '~/components/Logo';

const CATEGORY_TABS = [
  { key: 'all', label: 'All' },
  { key: 'national', label: 'National' },
  { key: 'international', label: 'International' },
  { key: 'economy', label: 'Economy' },
  { key: 'science-tech', label: 'Science' },
  { key: 'sports', label: 'Sports' },
  { key: 'environment', label: 'Environment' },
] as const;

export default function CurrentAffairsPage() {
  const { user, loading } = useAuth();
  const router = useRouter();
  const [items, setItems] = useState<CurrentAffairsItem[]>([]);
  const [winner, setWinner] = useState<LeaderboardEntry | null>(null);
  const [activeTab, setActiveTab] = useState<string>('all');
  const [pageLoading, setPageLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => { if (!loading && !user) router.replace('/signin'); }, [user, loading, router]);

  useEffect(() => {
    if (!user) return;
    (async () => {
      try {
        let lang: 'en' | 'hi' = 'en';
        try {
          const meRes = await api.me();
          lang = meRes.user.language || 'en';
        } catch { /* default to en */ }
        const res = await api.getCurrentAffairs(lang);
        setItems(res.items);
        setWinner(res.yesterdayWinner);
      } catch (e) { setError(e instanceof Error ? e.message : 'Failed to load current affairs'); }
      finally { setPageLoading(false); }
    })();
  }, [user]);

  if (loading || !user || pageLoading) return (
    <main className="flex min-h-dvh items-center justify-center"><span className="spinner" /></main>
  );

  if (error) return (
    <main className="mx-auto flex min-h-dvh max-w-lg flex-col items-center justify-center px-5">
      <div className="banner banner-error">{error}</div>
      <button onClick={() => router.back()} className="btn-ghost mt-4">← Back</button>
    </main>
  );

  const filtered = activeTab === 'all' ? items : items.filter(item => item.category === activeTab);
  const today = new Date().toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });

  return (
    <main className="mx-auto flex min-h-dvh max-w-2xl flex-col px-5 pt-6 pb-28">
      <header className="flex items-center justify-between">
        <Logo />
        <button onClick={() => router.push('/dashboard')} className="btn-ghost-sm">← Dashboard</button>
      </header>

      <section className="mt-6">
        <h1 className="font-serif text-2xl font-bold text-ink-900">Current Affairs</h1>
        <p className="mt-1 text-sm text-muted-500">{today}</p>
      </section>

      {/* Yesterday's winner banner */}
      {winner && (
        <div className="paper-card mt-4 flex items-center gap-3 p-4" style={{ borderColor: 'var(--color-gold-500)' }}>
          <span className="text-2xl">🏆</span>
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-gold-600">Yesterday's Winner</p>
            <p className="mt-0.5 text-sm text-ink-800">
              Scored <span className="font-bold text-ink-900">{winner.score}%</span> in{' '}
              <span className="font-medium">{Math.floor(winner.timeTaken / 60)}:{String(winner.timeTaken % 60).padStart(2, '0')}</span>
            </p>
          </div>
        </div>
      )}

      {/* Take Quiz CTA */}
      <button
        onClick={() => router.push('/current-affairs/quiz')}
        className="btn-primary mt-6 w-full gap-2"
      >
        📝 Take Daily Quiz (20 Questions)
      </button>

      {/* Category tabs */}
      <div className="mt-6 flex gap-2 overflow-x-auto pb-2 scrollbar-hide">
        {CATEGORY_TABS.map(tab => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={`pill whitespace-nowrap ${activeTab === tab.key ? 'bg-ink-900 text-paper-50 border-ink-900' : ''}`}
            style={activeTab === tab.key ? { backgroundColor: 'var(--color-ink-900)', color: 'var(--color-paper-50)', borderColor: 'var(--color-ink-900)' } : undefined}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* News cards */}
      {filtered.length === 0 ? (
        <div className="mt-12 flex flex-col items-center text-center">
          <span className="text-4xl">📰</span>
          <p className="mt-3 font-serif text-lg font-semibold text-ink-900">No news yet</p>
          <p className="mt-1 text-sm text-muted-500">Current affairs refresh every 4 hours. Check back soon!</p>
        </div>
      ) : (
        <section className="mt-4 space-y-3">
          {filtered.map(item => (
            <div key={item.id} className="paper-card p-4">
              <div className="flex items-start gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="pill text-xs">{item.category}</span>
                    {item.factChecked && <span className="text-xs text-gold-600">✓ verified</span>}
                  </div>
                  <h3 className="mt-2 font-serif text-sm font-semibold leading-snug text-ink-900">{item.headline}</h3>
                  <p className="mt-1.5 text-xs leading-relaxed text-ink-700">{item.summary || item.body}</p>
                  {item.sources.length > 0 && (
                    <p className="mt-2 text-xs text-muted-400">Source: {item.sources.join(', ')}</p>
                  )}
                </div>
              </div>
            </div>
          ))}
        </section>
      )}
    </main>
  );
}
