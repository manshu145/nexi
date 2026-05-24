'use client';

import { useEffect, useState } from 'react';
import { api, type AdminAnalyticsOverview } from '~/lib/api';

export default function AdminAnalyticsPage() {
  const [data, setData] = useState<AdminAnalyticsOverview | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const res = await api.admin.getAnalyticsOverview();
        setData(res);
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Failed to load analytics');
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  if (loading) return <div className="flex items-center gap-2"><span className="spinner" /> Loading analytics...</div>;
  if (error) return <div className="banner banner-error">{error}</div>;
  if (!data) return null;

  const examEntries = Object.entries(data.users.examBreakdown).sort((a, b) => b[1] - a[1]);
  const maxExamCount = examEntries[0]?.[1] ?? 1;

  return (
    <div>
      <h1 className="font-serif text-2xl font-bold text-ink-900">Analytics</h1>
      <p className="text-sm text-muted-500 mt-1">Platform overview as of {new Date(data.asOf).toLocaleString('en-IN')}</p>

      {/* KPI Cards */}
      <div className="mt-6 grid grid-cols-2 sm:grid-cols-4 gap-4">
        <KpiCard label="Total Users" value={data.users.recentTotal} />
        <KpiCard label="Last 24h" value={data.users.last24h} accent />
        <KpiCard label="Last 7 days" value={data.users.last7d} />
        <KpiCard label="Last 30 days" value={data.users.last30d} />
      </div>

      <div className="mt-4 grid grid-cols-2 sm:grid-cols-3 gap-4">
        <KpiCard label="Verified Users" value={data.users.verifiedInRecent} />
        <KpiCard label="Published Chapters" value={data.content.publishedChapters} />
        <KpiCard label="Nexipedia Articles" value={data.content.publishedNexipediaArticles} />
      </div>

      {/* Exam Mix */}
      <section className="mt-8">
        <h2 className="font-serif text-lg font-semibold text-ink-900 mb-4">Exam Mix</h2>
        <div className="space-y-2">
          {examEntries.slice(0, 15).map(([exam, count]) => (
            <div key={exam} className="flex items-center gap-3">
              <span className="text-xs text-muted-500 w-28 truncate">{exam}</span>
              <div className="flex-1 h-5 bg-paper-200 rounded-full overflow-hidden">
                <div
                  className="h-full bg-gradient-to-r from-ember-500 to-gold-500 rounded-full transition-all duration-500"
                  style={{ width: `${(count / maxExamCount) * 100}%` }}
                />
              </div>
              <span className="text-xs font-semibold text-ink-800 w-8 text-right">{count}</span>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}

function KpiCard({ label, value, accent }: { label: string; value: number; accent?: boolean }) {
  return (
    <div className={`paper-card p-4 ${accent ? 'border-ember-200 bg-ember-50/30' : ''}`}>
      <p className="text-2xl font-serif font-bold text-ink-900">{value.toLocaleString('en-IN')}</p>
      <p className="text-xs text-muted-500 mt-1">{label}</p>
    </div>
  );
}
