'use client';

import { useEffect, useState } from 'react';
import { api, ApiError, type AdminAnalyticsOverview } from '~/lib/api';
import dynamic from 'next/dynamic';

const BarChart = dynamic(() => import('recharts').then(m => m.BarChart), { ssr: false });
const Bar = dynamic(() => import('recharts').then(m => m.Bar), { ssr: false });
const XAxis = dynamic(() => import('recharts').then(m => m.XAxis), { ssr: false });
const YAxis = dynamic(() => import('recharts').then(m => m.YAxis), { ssr: false });
const Tooltip = dynamic(() => import('recharts').then(m => m.Tooltip), { ssr: false });
const ResponsiveContainer = dynamic(() => import('recharts').then(m => m.ResponsiveContainer), { ssr: false });
const PieChart = dynamic(() => import('recharts').then(m => m.PieChart), { ssr: false });
const Pie = dynamic(() => import('recharts').then(m => m.Pie), { ssr: false });
const Cell = dynamic(() => import('recharts').then(m => m.Cell), { ssr: false });

const COLORS = ['#B3461F', '#8B2E1A', '#B8862F', '#8E6720', '#6E2414', '#4A3F30', '#7A6F5C', '#3A3225'];

export default function AdminAnalyticsPage() {
  const [data, setData] = useState<AdminAnalyticsOverview | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    api.admin
      .getAnalyticsOverview()
      .then((d) => { if (!cancelled) setData(d); })
      .catch((e: unknown) => {
        if (cancelled) return;
        setError(e instanceof ApiError ? e.message : 'failed to load analytics');
      });
    return () => { cancelled = true; };
  }, []);

  if (error) {
    return (
      <main className="mx-auto max-w-6xl px-6 pt-8 pb-16">
        <div className="banner banner-error" role="alert">{error}</div>
      </main>
    );
  }
  if (!data) {
    return (
      <main className="mx-auto max-w-6xl px-6 pt-8 pb-16">
        <span className="inline-flex items-center gap-2 text-sm text-muted-500">
          <span className="spinner" /> Loading analytics…
        </span>
      </main>
    );
  }

  const examEntries = Object.entries(data.users.examBreakdown)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10);

  const examChartData = examEntries.map(([exam, count]) => ({
    name: exam.length > 12 ? exam.slice(0, 12) + '…' : exam,
    users: count,
  }));

  const signupTrend = [
    { period: 'Last 24h', value: data.users.last24h },
    { period: 'Last 7d', value: data.users.last7d },
    { period: 'Last 30d', value: data.users.last30d },
  ];

  const pieData = examEntries.slice(0, 6).map(([exam, count]) => ({
    name: exam,
    value: count,
  }));

  return (
    <main className="mx-auto flex max-w-6xl flex-col px-6 pt-8 pb-16">
      <header>
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-gold-600">
          Admin · Analytics
        </p>
        <h1 className="font-serif mt-1 text-2xl font-semibold text-ink-900">
          Platform overview
        </h1>
        <p className="mt-2 text-sm text-muted-500">
          As of {new Date(data.asOf).toLocaleString('en-IN')}
        </p>
      </header>

      {/* KPI Cards */}
      <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Total recent users" value={data.users.recentTotal} />
        <Stat label="Last 24h signups" value={data.users.last24h} />
        <Stat label="Last 7 days" value={data.users.last7d} />
        <Stat label="Last 30 days" value={data.users.last30d} />
      </div>

      {/* Signup trend bar chart */}
      <h2 className="font-serif mt-10 text-lg font-semibold text-ink-900">Signup Trend</h2>
      <div className="paper-card mt-3 p-5">
        <div style={{ width: '100%', height: 200 }}>
          <ResponsiveContainer>
            <BarChart data={signupTrend}>
              <XAxis dataKey="period" tick={{ fontSize: 12 }} />
              <YAxis tick={{ fontSize: 12 }} />
              <Tooltip />
              <Bar dataKey="value" fill="#B3461F" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Exam mix */}
      <h2 className="font-serif mt-10 text-lg font-semibold text-ink-900">Exam Mix (Top 10)</h2>
      <div className="mt-3 grid gap-4 lg:grid-cols-2">
        {/* Bar chart */}
        <div className="paper-card p-5">
          <div style={{ width: '100%', height: 280 }}>
            <ResponsiveContainer>
              <BarChart data={examChartData} layout="vertical">
                <XAxis type="number" tick={{ fontSize: 11 }} />
                <YAxis type="category" dataKey="name" tick={{ fontSize: 11 }} width={100} />
                <Tooltip />
                <Bar dataKey="users" fill="#8B2E1A" radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Pie chart */}
        <div className="paper-card p-5 flex items-center justify-center">
          <div style={{ width: 250, height: 250 }}>
            <ResponsiveContainer>
              <PieChart>
                <Pie data={pieData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={90} label={{ fontSize: 10 }}>
                  {pieData.map((_, i) => (
                    <Cell key={i} fill={COLORS[i % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* Content stats */}
      <h2 className="font-serif mt-10 text-lg font-semibold text-ink-900">Content</h2>
      <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <Stat label="Published chapters" value={data.content.publishedChapters} />
        <Stat label="Nexipedia articles" value={data.content.publishedNexipediaArticles} />
        <Stat label="Verified %" value={data.users.recentTotal > 0 ? Math.round((data.users.verifiedInRecent / data.users.recentTotal) * 100) : 0} hint="of recent users" />
      </div>
    </main>
  );
}

function Stat(props: { label: string; value: number; hint?: string }) {
  return (
    <div className="paper-card p-4">
      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-500">{props.label}</p>
      <p className="font-serif mt-2 text-3xl font-semibold tabular-nums text-ink-900">
        {props.value.toLocaleString('en-IN')}
      </p>
      {props.hint && <p className="mt-1 text-xs text-muted-500">{props.hint}</p>}
    </div>
  );
}
