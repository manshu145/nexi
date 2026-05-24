'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '~/lib/auth-context';
import { api } from '~/lib/api';

/**
 * Current Affairs — Daily digest for exam preparation.
 * 6-8 items per category, short and exam-focused.
 */

interface AffairsItem {
  title: string;
  summary: string;
  category: string;
  date: string;
  examRelevance: string;
}

const CATEGORY_ICONS: Record<string, string> = {
  polity: '🏛️',
  economy: '💰',
  science: '🔬',
  international: '🌍',
  sports: '⚽',
  environment: '🌿',
  defence: '🛡️',
  technology: '💻',
};

const CATEGORY_LABELS: Record<string, string> = {
  polity: 'Polity & Governance',
  economy: 'Economy & Finance',
  science: 'Science & Tech',
  international: 'International',
  sports: 'Sports',
  environment: 'Environment',
  defence: 'Defence',
  technology: 'Technology',
};

export default function CurrentAffairsPage() {
  const { user, loading } = useAuth();
  const router = useRouter();
  const [items, setItems] = useState<AffairsItem[]>([]);
  const [date, setDate] = useState('');
  const [fetching, setFetching] = useState(true);
  const [activeCategory, setActiveCategory] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!loading && !user) router.replace('/signin');
  }, [user, loading, router]);

  useEffect(() => {
    if (!user) return;
    (async () => {
      try {
        const progress = await api.ai.getProgress();
        const lang = progress?.progress?.language ?? 'en';
        const { items: data, date: d } = await api.ai.getCurrentAffairs(lang);
        setItems(data);
        setDate(d);
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Failed to load');
      } finally {
        setFetching(false);
      }
    })();
  }, [user]);

  if (loading || !user || fetching) {
    return (
      <main className="page-loading">
        <span className="spinner" /> Loading current affairs…
      </main>
    );
  }

  const categories = [...new Set(items.map(i => i.category))];
  const filtered = activeCategory ? items.filter(i => i.category === activeCategory) : items;

  return (
    <main className="affairs-page">
      <header className="affairs-header">
        <button className="btn-back" onClick={() => router.push('/dashboard')}>← Back</button>
        <div>
          <h1>📰 Current Affairs</h1>
          <p className="affairs-date">{date}</p>
        </div>
      </header>

      {/* Category Filter */}
      <nav className="affairs-categories">
        <button
          className={`category-chip ${!activeCategory ? 'active' : ''}`}
          onClick={() => setActiveCategory(null)}
        >
          All
        </button>
        {categories.map(cat => (
          <button
            key={cat}
            className={`category-chip ${activeCategory === cat ? 'active' : ''}`}
            onClick={() => setActiveCategory(cat)}
          >
            {CATEGORY_ICONS[cat] ?? '📌'} {CATEGORY_LABELS[cat] ?? cat}
          </button>
        ))}
      </nav>

      {/* Affairs Cards */}
      <section className="affairs-list">
        {filtered.map((item, i) => (
          <article key={i} className="affairs-card">
            <div className="affairs-card-header">
              <span className="affairs-icon">{CATEGORY_ICONS[item.category] ?? '📌'}</span>
              <span className="affairs-category">{CATEGORY_LABELS[item.category] ?? item.category}</span>
            </div>
            <h2 className="affairs-title">{item.title}</h2>
            <p className="affairs-summary">{item.summary}</p>
            <div className="affairs-relevance">
              <span className="relevance-tag">📝 Exam Relevance:</span>
              <span>{item.examRelevance}</span>
            </div>
          </article>
        ))}
      </section>

      {error && <p className="error-msg">{error}</p>}
    </main>
  );
}
