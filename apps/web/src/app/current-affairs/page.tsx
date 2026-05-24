'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import type { CurrentAffairsDigestSummary } from '@nexigrate/shared';
import { Logo } from '~/components/Logo';
import { useAuth } from '~/lib/auth-context';
import { api } from '~/lib/api';

/** /current-affairs -- archive of past daily digests. */
export default function CurrentAffairsArchivePage() {
  const { user, loading } = useAuth();
  const router = useRouter();
  const [list, setList] = useState<CurrentAffairsDigestSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!loading && !user) router.replace('/signin');
  }, [user, loading, router]);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await api.currentAffairs.list(60);
        if (!cancelled) setList(res.digests);
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : 'failed to load archive');
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [user]);

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
          <Link href="/today" className="btn-ghost-sm">
            Today
          </Link>
        </div>
      </header>

      <section className="mt-10">
        <p className="pill mb-3">Current affairs · archive</p>
        <h1 className="font-serif text-3xl font-semibold leading-tight text-ink-900 sm:text-4xl">
          The last 60 days, one click away.
        </h1>
      </section>

      {error ? (
        <div className="banner banner-error mt-6" role="alert">
          {error}
        </div>
      ) : null}

      {!list ? (
        <p className="mt-8 text-sm text-muted-500">Loading archive...</p>
      ) : null}

      {list && list.length === 0 ? (
        <section className="paper-card mt-8 p-6 sm:p-8">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-500">
            Coming soon
          </p>
          <h2 className="font-serif mt-2 text-xl font-semibold text-ink-900">
            No digests published yet
          </h2>
          <p className="mt-2 text-ink-800">
            The first daily digest will appear once an editor approves it.
          </p>
        </section>
      ) : null}

      {list && list.length > 0 ? (
        <section className="mt-8 flex flex-col gap-2">
          {list.map((d) => (
            <Link
              key={d.id}
              href={`/current-affairs/${encodeURIComponent(d.date)}`}
              className="paper-card flex items-start justify-between gap-3 p-4 transition hover:bg-paper-200/40"
            >
              <div className="min-w-0 flex-1">
                <p className="text-xs font-semibold uppercase tracking-[0.14em] text-ember-600">
                  {humanDate(d.date)}
                </p>
                <p className="font-serif mt-1 line-clamp-2 text-base font-medium text-ink-900">
                  {d.summary}
                </p>
              </div>
              <span className="rounded-full bg-paper-200 px-2 py-1 text-[11px] tabular-nums text-muted-500">
                {d.itemCount} items
              </span>
            </Link>
          ))}
        </section>
      ) : null}
    </main>
  );
}

function humanDate(d: string): string {
  try {
    const dt = new Date(`${d}T00:00:00.000Z`);
    return dt.toLocaleDateString('en-IN', {
      weekday: 'short',
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      timeZone: 'UTC',
    });
  } catch {
    return d;
  }
}
