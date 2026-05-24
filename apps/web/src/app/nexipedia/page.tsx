'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  NEXIPEDIA_CATEGORIES,
  NEXIPEDIA_CATEGORY_LABELS,
  type NexipediaArticleSummary,
  type NexipediaCategory,
} from '@nexigrate/shared';
import { Logo } from '~/components/Logo';
import { useAuth } from '~/lib/auth-context';
import { api } from '~/lib/api';

/**
 * /nexipedia -- Phase 14 student entry point.
 *
 * Encyclopedia browse + search. The corpus is small in early phases so
 * we do server-side substring search over a Firestore-fetched slice;
 * once we're north of ~1000 articles we'll either move to a managed
 * search service (Algolia/Typesense) or build a lightweight inverted
 * index in Firestore.
 *
 * Layout:
 *   - search box at the top, debounced
 *   - category filter pills
 *   - results grouped by category, each card linking to /nexipedia/:slug
 *
 * Empty states:
 *   - no articles published yet: friendly "coming soon" pitch
 *   - search returns nothing: short "no matches" line + clear-search button
 */
export default function NexipediaListPage() {
  const { user, loading } = useAuth();
  const router = useRouter();

  const [articles, setArticles] = useState<NexipediaArticleSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [q, setQ] = useState('');
  const [debouncedQ, setDebouncedQ] = useState('');
  const [category, setCategory] = useState<NexipediaCategory | 'all'>('all');

  useEffect(() => {
    if (!loading && !user) router.replace('/signin');
  }, [user, loading, router]);

  // Debounce search input by 250ms.
  useEffect(() => {
    const t = window.setTimeout(() => setDebouncedQ(q.trim()), 250);
    return () => window.clearTimeout(t);
  }, [q]);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    (async () => {
      try {
        const opts: Parameters<typeof api.nexipedia.list>[0] = {};
        if (debouncedQ) opts.q = debouncedQ;
        if (category !== 'all') opts.category = category;
        const res = await api.nexipedia.list(opts);
        if (!cancelled) {
          setArticles(res.articles);
          setError(null);
        }
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : 'failed to load articles');
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [user, debouncedQ, category]);

  // Group results by category for the bookshelf-style layout.
  const grouped = useMemo(() => {
    if (!articles) return [];
    const map = new Map<NexipediaCategory, NexipediaArticleSummary[]>();
    for (const a of articles) {
      const arr = map.get(a.category) ?? [];
      arr.push(a);
      map.set(a.category, arr);
    }
    return Array.from(map.entries())
      .map(([cat, items]) => ({
        category: cat,
        items: items.slice().sort((a, b) => (a.title < b.title ? -1 : 1)),
      }))
      .sort((a, b) => a.category.localeCompare(b.category));
  }, [articles]);

  if (loading || !user) {
    return (
      <main className="flex min-h-[60vh] items-center justify-center px-6">
        <span className="inline-flex items-center gap-2 text-sm text-muted-500">
          <span className="spinner" aria-hidden="true" />
          Loading...
        </span>
      </main>
    );
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-3xl flex-col px-4 pt-6 pb-24 sm:px-6 sm:pt-8 sm:pb-16">
      <header className="flex items-start justify-between">
        <Logo />
        <div className="flex items-center gap-2">
          <Link href="/dashboard" className="btn-ghost-sm">
            Dashboard
          </Link>
          <Link href="/chapters" className="btn-ghost-sm">
            Library
          </Link>
        </div>
      </header>

      <section className="mt-10">
        <p className="pill mb-3">Nexipedia</p>
        <h1 className="font-serif text-3xl font-semibold leading-tight text-ink-900 sm:text-4xl">
          Verified knowledge, no rabbit holes.
        </h1>
        <p className="mt-2 text-ink-800">
          Every article is generated and verified by three AIs (OpenAI,
          Gemini, Groq), then approved by an editor. Cited from NCERT and
          Government of India sources.
        </p>
      </section>

      <section className="mt-6 flex flex-col gap-3">
        <label className="block">
          <span className="sr-only">Search Nexipedia</span>
          <input
            type="search"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search articles -- e.g. 'photosynthesis', 'partition of india'"
            className="input w-full"
            autoFocus
          />
        </label>
        <div className="flex flex-wrap gap-2">
          <CategoryPill
            active={category === 'all'}
            label="All"
            onClick={() => setCategory('all')}
          />
          {NEXIPEDIA_CATEGORIES.map((cat) => (
            <CategoryPill
              key={cat}
              active={category === cat}
              label={NEXIPEDIA_CATEGORY_LABELS[cat]}
              onClick={() => setCategory(cat)}
            />
          ))}
        </div>
      </section>

      {error ? (
        <div className="banner banner-error mt-6" role="alert">
          <span>{error}</span>
        </div>
      ) : null}

      {!articles && !error ? (
        <p className="mt-8 text-sm text-muted-500">Loading articles...</p>
      ) : null}

      {articles && articles.length === 0 ? (
        <section className="paper-card mt-6 p-6 sm:p-8">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-500">
            {debouncedQ || category !== 'all' ? 'No matches' : 'Coming soon'}
          </p>
          <h2 className="font-serif mt-2 text-xl font-semibold text-ink-900">
            {debouncedQ || category !== 'all'
              ? 'Nothing matches that yet.'
              : 'No articles published yet'}
          </h2>
          <p className="mt-2 text-ink-800">
            {debouncedQ || category !== 'all'
              ? 'Try a different search term or category. Our editors are still seeding the library.'
              : "We're still authoring the first batch of Nexipedia articles. Check back soon."}
          </p>
          {debouncedQ || category !== 'all' ? (
            <button
              type="button"
              onClick={() => {
                setQ('');
                setCategory('all');
              }}
              className="btn-ghost mt-4"
            >
              Clear filters
            </button>
          ) : (
            <div className="mt-4 flex gap-2">
              <Link href="/chapters" className="btn-primary">
                Open chapter library
              </Link>
              <Link href="/mcq" className="btn-ghost">
                Daily MCQ
              </Link>
            </div>
          )}
        </section>
      ) : null}

      {grouped.length > 0 ? (
        <section className="mt-8 flex flex-col gap-8">
          {grouped.map((shelf) => (
            <div key={shelf.category}>
              <div className="flex items-baseline justify-between border-b border-line pb-2">
                <h2 className="font-serif text-sm font-semibold uppercase tracking-[0.18em] text-ink-800">
                  {NEXIPEDIA_CATEGORY_LABELS[shelf.category]}
                </h2>
                <span className="text-xs text-muted-500">
                  {shelf.items.length} article{shelf.items.length === 1 ? '' : 's'}
                </span>
              </div>
              <ul className="mt-4 grid gap-3 sm:grid-cols-2">
                {shelf.items.map((a) => (
                  <li key={a.id}>
                    <Link
                      href={`/nexipedia/${encodeURIComponent(a.slug)}`}
                      className="paper-card block h-full p-5 transition hover:bg-paper-200/40"
                    >
                      <h3 className="font-serif text-lg font-semibold leading-snug text-ink-900">
                        {a.title}
                      </h3>
                      <p className="mt-2 line-clamp-2 text-sm text-ink-800">
                        {a.summary}
                      </p>
                      <p className="mt-3 text-xs text-muted-500">
                        {a.estimatedReadMinutes} min read · verified by 3 AIs
                      </p>
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </section>
      ) : null}
    </main>
  );
}

function CategoryPill({
  active,
  label,
  onClick,
}: {
  active: boolean;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={
        'rounded-full border px-3 py-1 text-xs font-medium transition ' +
        (active
          ? 'border-ink-900 bg-ink-900 text-paper-100'
          : 'border-line bg-paper-50 text-ink-800 hover:border-ember-500')
      }
      aria-pressed={active}
    >
      {label}
    </button>
  );
}
