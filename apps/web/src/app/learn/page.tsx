'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import type { NexipediaArticleSummary } from '@nexigrate/shared';
import { Logo } from '~/components/Logo';
import { useAuth } from '~/lib/auth-context';
import { api } from '~/lib/api';

/**
 * /learn -- Phase 17 student page for learning techniques and study tips.
 *
 * Surfaces the dedicated 'learning-tip' Nexipedia category. Articles
 * are pedagogical-technique pieces with peer-reviewed cognitive-science
 * citations -- spaced repetition, retrieval practice, interleaving,
 * dual coding. NOT productivity-blog motivation content.
 *
 * Single column layout (no grouping), search box at top, reader URL is
 * the existing /nexipedia/<slug>.
 */
export default function LearnPage() {
  const { user, loading } = useAuth();
  const router = useRouter();

  const [articles, setArticles] = useState<NexipediaArticleSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [q, setQ] = useState('');
  const [debouncedQ, setDebouncedQ] = useState('');

  useEffect(() => {
    if (!loading && !user) router.replace('/signin');
  }, [user, loading, router]);

  useEffect(() => {
    const t = window.setTimeout(() => setDebouncedQ(q.trim()), 250);
    return () => window.clearTimeout(t);
  }, [q]);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    (async () => {
      try {
        const opts: NonNullable<Parameters<typeof api.nexipedia.list>[0]> = {
          category: 'learning-tip',
          limit: 100,
        };
        if (debouncedQ) opts.q = debouncedQ;
        const res = await api.nexipedia.list(opts);
        if (!cancelled) {
          setArticles(res.articles);
          setError(null);
        }
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : 'failed to load learning tips');
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [user, debouncedQ]);

  const sorted = useMemo(() => {
    if (!articles) return [] as NexipediaArticleSummary[];
    return articles.slice().sort((a, b) => (a.title < b.title ? -1 : 1));
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
    <main className="mx-auto flex min-h-screen max-w-3xl flex-col px-6 pt-8 pb-16">
      <header className="flex items-start justify-between">
        <Logo />
        <div className="flex items-center gap-2">
          <Link href="/dashboard" className="btn-ghost-sm">
            Dashboard
          </Link>
          <Link href="/guides" className="btn-ghost-sm">
            Exam guides
          </Link>
        </div>
      </header>

      <section className="mt-10">
        <p className="pill mb-3">Learning tips</p>
        <h1 className="font-serif text-3xl font-semibold leading-tight text-ink-900 sm:text-4xl">
          Study techniques that actually work.
        </h1>
        <p className="mt-2 text-ink-800">
          Each technique is backed by published cognitive-science research,
          verified by three AIs, and reviewed by an editor. No motivation
          fluff, no productivity-blog tropes -- just methods that move the
          needle on retention and recall.
        </p>
      </section>

      <section className="mt-6">
        <label className="block">
          <span className="sr-only">Search learning tips</span>
          <input
            type="search"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search techniques -- e.g. 'spaced repetition', 'retrieval practice'"
            className="input w-full"
          />
        </label>
      </section>

      {error ? (
        <div className="banner banner-error mt-6" role="alert">
          <span>{error}</span>
        </div>
      ) : null}

      {!articles && !error ? (
        <p className="mt-8 text-sm text-muted-500">Loading techniques...</p>
      ) : null}

      {articles && sorted.length === 0 ? (
        <section className="paper-card mt-8 p-6 sm:p-8">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-500">
            {debouncedQ ? 'No matches' : 'Coming soon'}
          </p>
          <h2 className="font-serif mt-2 text-xl font-semibold text-ink-900">
            {debouncedQ
              ? 'Nothing matches that yet.'
              : 'No techniques published yet'}
          </h2>
          <p className="mt-2 text-ink-800">
            {debouncedQ
              ? 'Try a different keyword or clear the search.'
              : "We're authoring the first batch of evidence-based learning techniques. Check back soon."}
          </p>
          {debouncedQ ? (
            <button type="button" onClick={() => setQ('')} className="btn-ghost mt-4">
              Clear search
            </button>
          ) : (
            <Link href="/guides" className="btn-ghost mt-4 inline-flex">
              Browse exam guides
            </Link>
          )}
        </section>
      ) : null}

      {sorted.length > 0 ? (
        <section className="mt-8 flex flex-col gap-3">
          {sorted.map((a) => (
            <Link
              key={a.id}
              href={`/nexipedia/${encodeURIComponent(a.slug)}`}
              className="paper-card block p-5 transition hover:bg-paper-200/40"
            >
              <p className="text-xs font-semibold uppercase tracking-[0.14em] text-gold-600">
                Technique
              </p>
              <h3 className="font-serif mt-2 text-lg font-semibold leading-snug text-ink-900">
                {a.title}
              </h3>
              <p className="mt-2 line-clamp-2 text-sm text-ink-800">{a.summary}</p>
              <p className="mt-3 text-xs text-muted-500">
                {a.estimatedReadMinutes} min read · cited cognitive science
              </p>
            </Link>
          ))}
        </section>
      ) : null}
    </main>
  );
}
