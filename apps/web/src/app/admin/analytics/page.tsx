'use client';

import { useEffect, useState } from 'react';
import { api, ApiError, type AdminAnalyticsOverview } from '~/lib/api';

/**
 * /admin/analytics -- Phase 20 platform overview.
 *
 * Crude but useful dashboard pulling counts from existing stores. Real
 * cohort retention / DAU / funnel analysis lives in BigQuery later; this
 * page answers "is the platform alive today?" in one glance.
 */
export default function AdminAnalyticsPage() {
  const [data, setData] = useState<AdminAnalyticsOverview | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    api.admin
      .getAnalyticsOverview()
      .then((d) => {
        if (!cancelled) setData(d);
      })
      .catch((e: unknown) => {
        if (cancelled) return;
        setError(e instanceof ApiError ? e.message : 'failed to load analytics');
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (error) {
    return (
      <main className="mx-auto max-w-3xl px-6 pt-8 pb-16">
        <div className="banner banner-error" role="alert">
          {error}
        </div>
      </main>
    );
  }
  if (!data) {
    return (
      <main className="mx-auto max-w-3xl px-6 pt-8 pb-16">
        <span className="inline-flex items-center gap-2 text-sm text-muted-500">
          <span className="spinner" aria-hidden="true" /> Loading analytics…
        </span>
      </main>
    );
  }

  const examEntries = Object.entries(data.users.examBreakdown).sort(
    (a, b) => b[1] - a[1],
  );

  return (
    <main className="mx-auto flex max-w-6xl flex-col px-6 pt-8 pb-16">
      <header>
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-gold-600">
          Phase 20 · Operations
        </p>
        <h1 className="font-serif mt-1 text-3xl font-semibold leading-tight text-ink-900">
          Analytics overview
        </h1>
        <p className="mt-2 text-sm text-muted-500">
          Quick platform pulse. Counts are based on the most recent 200
          users (so trend windows are exact only when daily signups stay
          below ~30/day). Real warehouse-backed analytics lands later.
          As of {new Date(data.asOf).toLocaleString('en-IN')}.
        </p>
      </header>

      <h2 className="font-serif mt-8 text-lg font-semibold text-ink-900">Users</h2>
      <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Last 24h signups" value={data.users.last24h} />
        <Stat label="Last 7 days" value={data.users.last7d} />
        <Stat label="Last 30 days" value={data.users.last30d} />
        <Stat
          label="Verified (recent)"
          value={data.users.verifiedInRecent}
          hint={`of ${data.users.recentTotal} recent`}
        />
      </div>

      <h2 className="font-serif mt-10 text-lg font-semibold text-ink-900">
        Exam mix (recent users)
      </h2>
      <div className="paper-card mt-3 p-5">
        {examEntries.length === 0 ? (
          <p className="text-sm text-muted-500">No data yet.</p>
        ) : (
          <ul className="space-y-2">
            {examEntries.map(([exam, count]) => {
              const pct = data.users.recentTotal > 0
                ? Math.round((count / data.users.recentTotal) * 100)
                : 0;
              return (
                <li key={exam}>
                  <div className="flex items-baseline justify-between text-sm">
                    <span className="font-medium text-ink-900">{exam}</span>
                    <span className="tabular-nums text-muted-500">
                      {count} · {pct}%
                    </span>
                  </div>
                  <div className="mt-1 h-2 w-full overflow-hidden rounded-full bg-paper-300">
                    <div
                      className="h-full bg-ember-500"
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      <h2 className="font-serif mt-10 text-lg font-semibold text-ink-900">Content</h2>
      <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <Stat label="Published chapters" value={data.content.publishedChapters} />
        <Stat
          label="Nexipedia articles"
          value={data.content.publishedNexipediaArticles}
        />
      </div>
    </main>
  );
}

function Stat(props: { label: string; value: number; hint?: string }) {
  return (
    <div className="paper-card p-4">
      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-500">
        {props.label}
      </p>
      <p className="font-serif mt-2 text-3xl font-semibold tabular-nums text-ink-900">
        {props.value.toLocaleString('en-IN')}
      </p>
      {props.hint ? (
        <p className="mt-1 text-xs text-muted-500">{props.hint}</p>
      ) : null}
    </div>
  );
}
