'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  CURRENT_AFFAIRS_CATEGORY_LABELS,
  EXAM_BY_SLUG,
  type CurrentAffairsDigest,
} from '@nexigrate/shared';
import { Logo } from '~/components/Logo';
import { useAuth } from '~/lib/auth-context';
import { api } from '~/lib/api';

/**
 * /today -- Phase 19 student page for today's current affairs digest.
 *
 * Shows the latest published digest. If today's hasn't been authored
 * yet, falls back to the most recent published one with a 'Last
 * updated DD MMM' timestamp so the student isn't staring at an empty
 * page.
 */
export default function TodayPage() {
  const { user, loading } = useAuth();
  const router = useRouter();

  const [digest, setDigest] = useState<CurrentAffairsDigest | null | 'loading'>(
    'loading',
  );
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!loading && !user) router.replace('/signin');
  }, [user, loading, router]);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await api.currentAffairs.today();
        if (!cancelled) setDigest(res.digest);
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : 'failed to load digest');
          setDigest(null);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [user]);

  if (loading || !user || digest === 'loading') {
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
          <Link href="/current-affairs" className="btn-ghost-sm">
            Archive
          </Link>
        </div>
      </header>

      <section className="mt-10">
        <p className="pill mb-3">Current affairs · today</p>
        <h1 className="font-serif text-3xl font-semibold leading-tight text-ink-900 sm:text-4xl">
          {digest?.summary ?? 'No digest published yet'}
        </h1>
        {digest ? (
          <p className="mt-2 text-sm text-muted-500">
            For {humanDate(digest.date)} · {digest.items.length} items · sourced from
            official publications
          </p>
        ) : (
          <p className="mt-2 text-ink-800">
            Our editors are still preparing today&apos;s digest. Check back in a
            few hours, or browse the archive.
          </p>
        )}
      </section>

      {error ? (
        <div className="banner banner-error mt-6" role="alert">
          {error}
        </div>
      ) : null}

      {digest ? (
        <section className="mt-8 flex flex-col gap-4">
          {digest.items.map((it) => (
            <article key={it.id} className="paper-card p-5">
              <div className="flex items-center justify-between gap-2">
                <p className="text-xs font-semibold uppercase tracking-[0.14em] text-ember-600">
                  {CURRENT_AFFAIRS_CATEGORY_LABELS[it.category]}
                </p>
                {it.relevantExams.length > 0 ? (
                  <p className="text-[11px] text-muted-500">
                    {it.relevantExams
                      .map((e) => EXAM_BY_SLUG.get(e)?.name ?? e)
                      .join(' · ')}
                  </p>
                ) : null}
              </div>
              <h2 className="font-serif mt-2 text-lg font-semibold leading-snug text-ink-900">
                {it.headline}
              </h2>
              <div className="reader mt-3">
                <div className="reader-body">{renderItemBody(it.body)}</div>
              </div>
              {it.sources.length > 0 ? (
                <p className="mt-3 text-[11px] text-muted-500">
                  Sources: {it.sources.join(' · ')}
                </p>
              ) : null}
              {it.tags.length > 0 ? (
                <div className="mt-2 flex flex-wrap gap-1">
                  {it.tags.map((t) => (
                    <span
                      key={t}
                      className="rounded-full bg-paper-200 px-2 py-0.5 text-[11px] text-muted-500"
                    >
                      #{t}
                    </span>
                  ))}
                </div>
              ) : null}
            </article>
          ))}
        </section>
      ) : null}

      {!digest ? (
        <Link href="/current-affairs" className="btn-ghost mt-6 inline-flex">
          Browse archive
        </Link>
      ) : null}
    </main>
  );
}

function humanDate(d: string): string {
  // d = YYYY-MM-DD
  try {
    const dt = new Date(`${d}T00:00:00.000Z`);
    return dt.toLocaleDateString('en-IN', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      timeZone: 'UTC',
    });
  } catch {
    return d;
  }
}

/**
 * Lightweight markdown renderer matching the chapter / nexipedia readers:
 *   - paragraph breaks on blank lines
 *   - **bold**
 * NEVER injects HTML.
 */
function renderItemBody(s: string): React.ReactNode {
  const paragraphs = s.split(/\n{2,}/);
  return paragraphs.map((p, i) => (
    <p key={i} className="reader-paragraph">
      {renderInline(p)}
    </p>
  ));
}

function renderInline(s: string): React.ReactNode {
  const parts = s.split(/(\*\*[^*]+\*\*)/g);
  return parts.map((p, i) => {
    if (p.startsWith('**') && p.endsWith('**')) {
      return <strong key={i}>{p.slice(2, -2)}</strong>;
    }
    return <span key={i}>{p}</span>;
  });
}
