'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '~/lib/auth-context';
import { api } from '~/lib/api';
import { useTranslation } from '~/lib/useTranslation';

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
  national: '🇮🇳', awards: '🏅',
};

const CATEGORY_HI: Record<string, string> = {
  polity: 'राजनीति', economy: 'अर्थव्यवस्था', science: 'विज्ञान',
  international: 'अंतर्राष्ट्रीय', sports: 'खेल', environment: 'पर्यावरण',
  defence: 'रक्षा', technology: 'प्रौद्योगिकी', national: 'राष्ट्रीय', awards: 'पुरस्कार',
};

export default function CurrentAffairsPage() {
  const { user, loading } = useAuth();
  const router = useRouter();
  const { t, lang } = useTranslation();
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
      <main className="flex min-h-dvh items-center justify-center bg-paper-100">
        <div className="flex flex-col items-center gap-3">
          <span className="spinner" />
          <span className="text-sm text-muted-500">{t('ca.loading', 'Loading current affairs...')}</span>
        </div>
      </main>
    );
  }

  const categories = [...new Set(items.map(i => i.category))];
  const filtered = activeCategory ? items.filter(i => i.category === activeCategory) : items;

  return (
    <main className="mx-auto max-w-lg px-5 pt-6 pb-28 min-h-dvh">
      {/* Header */}
      <header className="flex items-center gap-3 mb-6">
        <button
          onClick={() => router.push('/dashboard')}
          className="flex h-8 w-8 items-center justify-center rounded-full bg-paper-200 text-ink-800 hover:bg-paper-300 transition"
        >
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
          </svg>
        </button>
        <h1 className="font-serif text-xl font-bold text-ink-900">
          {t('ca.title', 'Current Affairs')}
        </h1>
      </header>

      {/* Daily Quiz Banner */}
      <button
        onClick={() => router.push('/current-affairs/quiz')}
        className="w-full paper-card p-4 mb-5 flex items-center gap-4 bg-gradient-to-r from-gold-50 to-paper-50 border-gold-200 hover:shadow-lg hover:-translate-y-0.5 transition-all group"
      >
        <span className="text-3xl">🏆</span>
        <div className="text-left flex-1">
          <p className="font-serif text-sm font-bold text-ink-900">{lang === 'hi' ? 'दैनिक क्विज़ — 20 सवाल' : 'Daily Quiz — 20 Questions'}</p>
          <p className="text-xs text-muted-500 mt-0.5">{lang === 'hi' ? '10 मिनट, सबसे तेज़ विजेता बने!' : '10 min timer, be the fastest winner!'}</p>
        </div>
        <span className="text-ember-600 font-bold text-sm group-hover:translate-x-1 transition-transform">&rarr;</span>
      </button>

      {/* Category filter pills */}
      <nav className="flex gap-2 overflow-x-auto pb-3 mb-5 -mx-1 px-1 scrollbar-hide">
        <button
          onClick={() => setActiveCategory(null)}
          className={`shrink-0 rounded-full px-4 py-2 text-xs font-semibold transition-all duration-200 ${
            !activeCategory
              ? 'bg-ink-900 text-paper-100 shadow-md'
              : 'bg-paper-200 text-ink-800 hover:bg-paper-300'
          }`}
        >
          {t('all', 'All')}
        </button>
        {categories.map(cat => (
          <button
            key={cat}
            onClick={() => setActiveCategory(cat)}
            className={`shrink-0 rounded-full px-4 py-2 text-xs font-semibold transition-all duration-200 ${
              activeCategory === cat
                ? 'bg-ink-900 text-paper-100 shadow-md'
                : 'bg-paper-200 text-ink-800 hover:bg-paper-300'
            }`}
          >
            {CATEGORY_ICONS[cat] ?? '📌'} {lang === 'hi' ? (CATEGORY_HI[cat] ?? cat) : cat}
          </button>
        ))}
      </nav>

      {/* Items count */}
      <p className="text-xs text-muted-500 mb-3">
        {filtered.length} {lang === 'hi' ? 'आइटम' : 'items'}
        {activeCategory && ` — ${lang === 'hi' ? (CATEGORY_HI[activeCategory] ?? activeCategory) : activeCategory}`}
      </p>

      {/* Items */}
      <div className="flex flex-col gap-3">
        {filtered.length === 0 && (
          <div className="text-center py-12">
            <span className="text-3xl">📭</span>
            <p className="mt-3 text-sm text-muted-500">{t('ca.no_items', 'No items found. Try selecting "All".')}</p>
          </div>
        )}
        {filtered.map((item, i) => (
          <article key={i} className="paper-card p-4 hover:shadow-md transition-shadow duration-200">
            <div className="flex items-center gap-2 mb-2">
              <span className="text-lg">{CATEGORY_ICONS[item.category] ?? '📌'}</span>
              <span className="text-[10px] font-bold uppercase tracking-wider text-muted-500">
                {lang === 'hi' ? (CATEGORY_HI[item.category] ?? item.category) : item.category}
              </span>
            </div>
            <h2 className="font-serif text-base font-semibold text-ink-900 leading-snug">{item.title}</h2>
            <p className="mt-2 text-sm text-ink-700 leading-relaxed">{item.summary}</p>
            <div className="mt-3 flex items-center gap-2">
              <span className="inline-flex items-center gap-1 rounded-md bg-paper-200 px-2 py-1 text-[11px] text-muted-500">
                📝 {item.examRelevance}
              </span>
            </div>
          </article>
        ))}
      </div>

      {error && <p className="mt-4 text-sm text-ember-600 text-center">{error}</p>}
    </main>
  );
}
