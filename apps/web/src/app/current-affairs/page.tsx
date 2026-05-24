'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '~/lib/auth-context';
import { api } from '~/lib/api';

interface AffairsItem {
  title: string;
  summary: string;
  category: string;
  date: string;
  examRelevance: string;
}

const CATEGORY_ICONS: Record<string, string> = {
  polity: '🏛️', economy: '💰', science: '🔬', international: '🌍',
  sports: '⚽', environment: '🌿', defence: '🛡️', technology: '💻',
};

export default function CurrentAffairsPage() {
  const { user, loading } = useAuth();
  const router = useRouter();
  const [items, setItems] = useState<AffairsItem[]>([]);
  const [activeCategory, setActiveCategory] = useState<string | null>(null);
  const [fetching, setFetching] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!loading && !user) router.replace('/signin');
  }, [user, loading, router]);

  useEffect(() => {
    if (!user) return;
    (async () => {
      try {
        const res = await api.ai.getCurrentAffairs();
        setItems(res.items ?? []);
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Failed to load current affairs');
      } finally {
        setFetching(false);
      }
    })();
  }, [user]);

  if (loading || !user || fetching) {
    return (
      <main className="flex min-h-dvh items-center justify-center">
        <span className="spinner" /> <span className="ml-2 text-sm text-muted-500">Loading current affairs...</span>
      </main>
    );
  }

  const categories = [...new Set(items.map(i => i.category))];
  const filtered = activeCategory ? items.filter(i => i.category === activeCategory) : items;

  return (
    <main className="mx-auto max-w-lg px-5 pt-6 pb-10 min-h-dvh">
      <header className="flex items-center gap-3 mb-6">
        <button onClick={() => router.push('/dashboard')} className="text-ink-800 hover:text-ember-600 transition">&larr;</button>
        <h1 className="font-serif text-xl font-bold text-ink-900">📰 Current Affairs</h1>
      </header>

      {/* Category filter */}
      <nav className="flex gap-2 overflow-x-auto pb-2 mb-5 -mx-1 px-1">
        <button
          onClick={() => setActiveCategory(null)}
          className={`shrink-0 rounded-full px-3 py-1.5 text-xs font-medium transition ${!activeCategory ? 'bg-ink-900 text-paper-100' : 'bg-paper-200 text-ink-800 hover:bg-paper-300'}`}
        >All</button>
        {categories.map(cat => (
          <button
            key={cat}
            onClick={() => setActiveCategory(cat)}
            className={`shrink-0 rounded-full px-3 py-1.5 text-xs font-medium transition ${activeCategory === cat ? 'bg-ink-900 text-paper-100' : 'bg-paper-200 text-ink-800 hover:bg-paper-300'}`}
          >{CATEGORY_ICONS[cat] ?? '📌'} {cat}</button>
        ))}
      </nav>

      {/* Items */}
      <div className="flex flex-col gap-3">
        {filtered.length === 0 && (
          <p className="text-center text-sm text-muted-500 py-8">No items found. Try selecting &quot;All&quot;.</p>
        )}
        {filtered.map((item, i) => (
          <article key={i} className="paper-card p-4">
            <div className="flex items-center gap-2 mb-2">
              <span className="text-lg">{CATEGORY_ICONS[item.category] ?? '📌'}</span>
              <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-500">{item.category}</span>
            </div>
            <h2 className="font-serif text-base font-semibold text-ink-900 leading-snug">{item.title}</h2>
            <p className="mt-2 text-sm text-ink-800 leading-relaxed">{item.summary}</p>
            <p className="mt-2 text-xs text-muted-500 bg-paper-200 rounded px-2 py-1 inline-block">
              📝 {item.examRelevance}
            </p>
          </article>
        ))}
      </div>

      {error && <p className="mt-4 text-sm text-ember-600 text-center">{error}</p>}
    </main>
  );
}
