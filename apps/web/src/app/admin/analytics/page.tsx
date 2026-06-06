'use client';

/**
 * Admin → Analytics (GA-style).
 *
 * Overview KPIs (DAU/MAU/stickiness/revenue) + a daily activity line chart,
 * feature-usage bars, and an upgrade funnel — all from the cheap daily
 * rollups (analyticsDaily) + adminStore stats. No per-request user scan.
 */

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  ResponsiveContainer, LineChart, Line, BarChart, Bar, XAxis, YAxis,
  Tooltip, CartesianGrid,
} from 'recharts';
import { useAuth } from '~/lib/auth-context';
import { api, type AnalyticsOverview } from '~/lib/api';

const EMBER = '#B3461F';
const GOLD = '#B8862F';

const EVENT_LABELS: Record<string, string> = {
  page_view: 'Page views',
  chapter_open: 'Chapters opened',
  chapter_complete: 'Chapters completed',
  quiz_start: 'Quizzes started',
  quiz_complete: 'Quizzes completed',
  mock_test_start: 'Mock tests started',
  mock_test_complete: 'Mock tests completed',
  chat_message: 'Chat messages',
  current_affairs_view: 'Current affairs views',
  ca_quiz_attempt: 'CA quiz attempts',
  search: 'Searches',
  feature_click: 'Feature clicks',
  upgrade_view: 'Upgrade page views',
  upgrade_click: 'Upgrade clicks',
  error_encountered: 'Errors',
};

function Stat({ label, value, sub }: { label: string; value: string | number; sub?: string }) {
  return (
    <div className="paper-card p-4">
      <p className="text-xs font-medium uppercase tracking-wider text-muted-500">{label}</p>
      <p className="mt-1 font-serif text-2xl font-bold text-ink-900">{value}</p>
      {sub && <p className="mt-0.5 text-xs text-muted-500">{sub}</p>}
    </div>
  );
}

export default function AdminAnalyticsPage() {
  const { user, loading } = useAuth();
  const router = useRouter();
  const [data, setData] = useState<AnalyticsOverview | null>(null);
  const [days, setDays] = useState(30);
  const [pageLoading, setPageLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => { if (!loading && !user) router.replace('/signin'); }, [user, loading, router]);

  useEffect(() => {
    if (!user) return;
    setPageLoading(true);
    api.getAnalyticsOverview(days)
      .then(setData)
      .catch((e) => setError(e instanceof Error ? e.message : 'Failed to load analytics'))
      .finally(() => setPageLoading(false));
  }, [user, days]);

  if (loading || pageLoading) return <div className="space-y-4"><div className="h-7 w-40 rounded bg-paper-300 animate-pulse" /><div className="grid grid-cols-2 gap-3 md:grid-cols-4">{Array.from({ length: 4 }).map((_, i) => <div key={i} className="h-20 rounded bg-paper-300 animate-pulse" />)}</div><div className="h-64 rounded bg-paper-300 animate-pulse" /></div>;

  if (error) return <div className="paper-card border border-ember-500/40 p-5 text-sm text-ink-900">{error}</div>;
  if (!data) return null;

  const seriesData = data.series.map(d => ({
    date: d.date.slice(5),
    activity: d.total,
    chapters: d.events['chapter_open'] ?? 0,
    quizzes: d.events['quiz_complete'] ?? 0,
  }));

  const featureData = Object.entries(data.featureTotals)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([k, v]) => ({ name: EVENT_LABELS[k] ?? k, value: v }));

  const { upgradeViews, upgradeClicks, payments } = data.funnel;
  const clickRate = upgradeViews > 0 ? Math.round((upgradeClicks / upgradeViews) * 100) : 0;
  const buyRate = upgradeClicks > 0 ? Math.round((payments / upgradeClicks) * 100) : 0;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-serif text-2xl font-semibold text-ink-900">Analytics</h1>
          <p className="text-sm text-muted-500">User activity, engagement & conversion — last {data.rangeDays} days.</p>
        </div>
        <div className="flex gap-1">
          {[7, 30, 90].map(d => (
            <button key={d} onClick={() => setDays(d)} className={`pill text-xs ${days === d ? 'bg-ink-900 text-paper-50 border-ink-900' : ''}`}>{d}d</button>
          ))}
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label="DAU" value={data.overview.dau} sub="active today" />
        <Stat label="MAU" value={data.overview.mau} sub="active 30d" />
        <Stat label="Stickiness" value={`${data.overview.stickiness}%`} sub="DAU / MAU" />
        <Stat label="Total Users" value={data.overview.totalUsers} sub={`+${data.overview.newUsersThisWeek} this week`} />
        <Stat label="New Today" value={data.overview.newUsersToday} />
        <Stat label="Active Now" value={data.overview.activeSessions} sub="live sessions" />
        <Stat label="Revenue 30d" value={`₹${data.overview.revenue30d.toLocaleString('en-IN')}`} />
        <Stat label="Revenue Total" value={`₹${data.overview.revenueTotal.toLocaleString('en-IN')}`} />
      </div>

      {/* Daily activity */}
      <div className="paper-card p-4">
        <h2 className="mb-3 text-sm font-semibold text-ink-900">Daily activity</h2>
        <ResponsiveContainer width="100%" height={260}>
          <LineChart data={seriesData} margin={{ top: 5, right: 10, left: -10, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#E7E0CE" />
            <XAxis dataKey="date" tick={{ fontSize: 11, fill: '#7A6F5C' }} />
            <YAxis tick={{ fontSize: 11, fill: '#7A6F5C' }} allowDecimals={false} />
            <Tooltip contentStyle={{ background: '#FBF6E8', border: '1px solid #E7E0CE', borderRadius: 8, fontSize: 12 }} />
            <Line type="monotone" dataKey="activity" name="Total events" stroke={EMBER} strokeWidth={2} dot={false} />
            <Line type="monotone" dataKey="chapters" name="Chapters opened" stroke={GOLD} strokeWidth={2} dot={false} />
          </LineChart>
        </ResponsiveContainer>
      </div>

      {/* Funnel */}
      <div className="paper-card p-4">
        <h2 className="mb-3 text-sm font-semibold text-ink-900">Upgrade funnel</h2>
        <div className="grid grid-cols-3 gap-3 text-center">
          <div><p className="font-serif text-2xl font-bold text-ink-900">{upgradeViews}</p><p className="text-xs text-muted-500">Saw upgrade</p></div>
          <div><p className="font-serif text-2xl font-bold text-ink-900">{upgradeClicks}</p><p className="text-xs text-muted-500">Clicked buy <span className="text-ember-600">({clickRate}%)</span></p></div>
          <div><p className="font-serif text-2xl font-bold text-ink-900">{payments}</p><p className="text-xs text-muted-500">Paid <span className="text-ember-600">({buyRate}%)</span></p></div>
        </div>
      </div>

      {/* Feature usage */}
      <div className="paper-card p-4">
        <h2 className="mb-3 text-sm font-semibold text-ink-900">Top features used</h2>
        {featureData.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted-500">No events recorded yet. Data appears as users interact with the app.</p>
        ) : (
          <ResponsiveContainer width="100%" height={Math.max(200, featureData.length * 34)}>
            <BarChart data={featureData} layout="vertical" margin={{ top: 0, right: 16, left: 60, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#E7E0CE" horizontal={false} />
              <XAxis type="number" tick={{ fontSize: 11, fill: '#7A6F5C' }} allowDecimals={false} />
              <YAxis type="category" dataKey="name" tick={{ fontSize: 11, fill: '#7A6F5C' }} width={120} />
              <Tooltip contentStyle={{ background: '#FBF6E8', border: '1px solid #E7E0CE', borderRadius: 8, fontSize: 12 }} />
              <Bar dataKey="value" fill={EMBER} radius={[0, 4, 4, 0]} />
            </BarChart>
          </ResponsiveContainer>
        )}
      </div>
    </div>
  );
}
