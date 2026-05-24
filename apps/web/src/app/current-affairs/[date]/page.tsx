'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import {
  CURRENT_AFFAIRS_CATEGORY_LABELS,
  EXAM_BY_SLUG,
  type CurrentAffairsDigest,
} from '@nexigrate/shared';
import { Logo } from '~/components/Logo';
import { useAuth } from '~/lib/auth-context';
import { api } from '~/lib/api';

/** /current-affairs/[date] -- read a specific past digest. */
export default function CurrentAffairsDateReaderPage() {
  const params = useParams<{ date: string }>();
  const date = params?.date ?? '';
  const { user, loading } = useAuth();
  const router = useRouter();

  const [digest, setDigest] = useState<CurrentAffairsDigest | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!loading && !user) router.replace('/signin');
  }, [user, loading, router]);

  useEffect(() => {
    if (!user || !date) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await api.currentAffairs.getByDate(date);
        if (!cancelled) setDigest(res.digest);
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : 'failed to load digest');
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [user, date]);

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

  if (error) {
    return (
      <main className="mx-auto max-w-2xl px-6 pt-8">
        <Logo />
        <div className="banner banner-error mt-8">{error}</div>
        <Link href="/current-affairs" className="btn-ghost mt-4 inline-flex">
          Back to archive
        </Link>
      </main>
    );
  }

  if (!digest) {
    return (
      <main className="flex min-h-[60vh] items-center justify-center px-6">
        <span className="inline-flex items-center gap-2 text-sm text-muted-500">
          <span className="spinner" aria-hidden="true" />
          Loading digest...
        </span>
      </main>
    );
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-3xl flex-col px-6 pt-8 pb-16">
      <header className="flex items-start justify-between">
        <Logo />
        <div className="flex items-center gap-2">
          <Link href="/today" className="btn-ghost-sm">
            Today
          </Link>
          <Link href="/current-affairs" className="btn-ghost-sm">
            Archive
          </Link>
        </div>
      </header>

      <section className="mt-10">
        <p className="text-xs font-semibold uppercase tracking-[0.14em] text-ember-600">
          {humanDate(digest.date)}
        </p>
        <h1 className="font-serif mt-2 text-3xl font-semibold leading-tight text-ink-900 sm:text-4xl">
          {digest.summary}
        </h1>
        <p className="mt-2 text-sm text-muted-500">
          {digest.items.length} items · sourced from official publications
        </p>
      </section>

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
              <div className="reader-body whitespace-pre-wrap">{it.body}</div>
            </div>
            {it.sources.length > 0 ? (
              <p className="mt-3 text-[11px] text-muted-500">
                Sources: {it.sources.join(' · ')}
              </p>
            ) : null}
          </article>
        ))}
      </section>
    </main>
  );
}

function humanDate(d: string): string {
  try {
    const dt = new Date(`${d}T00:00:00.000Z`);
    return dt.toLocaleDateString('en-IN', {
      weekday: 'long',
      day: '2-digit',
      month: 'long',
      year: 'numeric',
      timeZone: 'UTC',
    });
  } catch {
    return d;
  }
}
