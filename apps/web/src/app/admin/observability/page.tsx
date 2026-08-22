'use client';

/**
 * Admin observability dashboard (lock §3.2).
 *
 * Founder lock: "ye sb admin panel me dikhna chahiye -- ham cloudflare
 * & google cloud use rha hai." This is the single-pane view of the
 * stack health: AI provider reachability, today's AI spend leaderboard
 * (PR-25), recent 5xx errors, active sessions, persistence status.
 *
 * Designed for the 29 May incident pattern: founder hits this page,
 * within 10 seconds knows whether providers are up + which user is
 * burning the budget + whether there's a 5xx storm. Without this,
 * the only signal available was a generic /diag/ai check + a 503
 * cascade on /assessment.
 *
 * Read-only diagnostic page. Auto-refreshes every 60s when the tab is
 * visible. Uses the public /diag/ai/test endpoint (no auth required)
 * for live AI probes so we don't burn admin tokens on routine checks.
 */

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '~/lib/auth-context';
import { authedFetch } from '~/lib/api';

// API base for the unauth public probe (matches lib/api.ts)
const API_BASE = process.env['NEXT_PUBLIC_API_URL'] ?? 'https://api.nexigrate.com';

interface AIDiagResponse {
  ok: boolean;
  summary: string;
  totalMs: number;
  providers: Record<string, { ok: boolean; latencyMs: number; model?: string; sample?: string; error?: string }>;
}

interface TopSpender {
  userId: string;
  email: string;
  name: string;
  plan: string;
  totalToday: number;
  cap: number;
  pctOfCap: number;
}

interface ErrorLog { id: string; message: string; route?: string; severity?: string; timestamp: string }
interface SessionStat { activeNow: number; today: number }

export default function AdminObservabilityPage() {
  const router = useRouter();
  const { user, loading: authLoading } = useAuth();
  const [diag, setDiag] = useState<AIDiagResponse | null>(null);
  const [spenders, setSpenders] = useState<TopSpender[]>([]);
  const [defaultCaps, setDefaultCaps] = useState<Record<string, number>>({});
  const [errors, setErrors] = useState<ErrorLog[]>([]);
  const [sessions, setSessions] = useState<SessionStat | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [lastRefresh, setLastRefresh] = useState<Date>(new Date());

  const refresh = useCallback(async () => {
    setRefreshing(true);
    const probes = await Promise.allSettled([
      // Public diag probe -- no auth required.
      fetch(`${API_BASE}/diag/ai/test`).then(r => r.json() as Promise<AIDiagResponse>),
      // Top AI spenders -- admin endpoint.
      authedFetch('/v1/admin/ai-spend/top?limit=10').then(r => r.json()),
      // Recent error logs.
      authedFetch('/v1/admin/error-logs?limit=10').then(r => r.json()),
      // Sessions stats.
      authedFetch('/v1/admin/sessions').then(r => r.json()),
    ]);
    if (probes[0].status === 'fulfilled') setDiag(probes[0].value);
    if (probes[1].status === 'fulfilled') {
      const v = probes[1].value as { topSpenders: TopSpender[]; defaultCaps: Record<string, number> };
      setSpenders(v.topSpenders ?? []);
      setDefaultCaps(v.defaultCaps ?? {});
    }
    if (probes[2].status === 'fulfilled') {
      const v = probes[2].value as { logs?: ErrorLog[] };
      setErrors(v.logs ?? []);
    }
    if (probes[3].status === 'fulfilled') {
      const v = probes[3].value as SessionStat;
      setSessions(v);
    }
    setLastRefresh(new Date());
    setRefreshing(false);
    setLoading(false);
  }, []);

  useEffect(() => {
    if (authLoading) return;
    if (!user) { router.replace('/admin/login'); return; }
    void refresh();
    // 60s auto-refresh while tab is visible.
    const interval = setInterval(() => {
      if (document.visibilityState === 'visible') void refresh();
    }, 60_000);
    return () => clearInterval(interval);
  }, [authLoading, user, router, refresh]);

  if (loading) {
    return <div className="p-6 text-sm text-muted-500">Loading observability dashboard…</div>;
  }

  return (
    <div className="space-y-6 p-4 md:p-6">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="font-serif text-2xl font-semibold text-ink-900">Observability</h1>
          <p className="mt-1 text-xs text-muted-500">
            Live system health · auto-refreshes every 60s · last update {lastRefresh.toLocaleTimeString()}
          </p>
        </div>
        <button type="button" onClick={() => void refresh()} disabled={refreshing} className="btn-ghost-sm disabled:opacity-50">
          {refreshing ? 'Refreshing…' : 'Refresh'}
        </button>
      </header>

      {/* AI providers — live probe */}
      <section>
        <h2 className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted-500">AI Providers</h2>
        {diag ? (
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {Object.entries(diag.providers).map(([name, p]) => (
              <div key={name} className={`paper-card p-4 ${p.ok ? '' : 'border-red-500/40 bg-red-500/5'}`}>
                <div className="flex items-center justify-between">
                  <p className="font-medium capitalize text-ink-900">{name}</p>
                  <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider ${
                    p.ok ? 'bg-ember-500/10 text-ember-600' : 'bg-red-500/10 text-red-600'
                  }`}>
                    {p.ok ? 'up' : 'down'}
                  </span>
                </div>
                <p className="mt-2 text-xs text-muted-500">
                  {p.ok
                    ? <>{p.model} · <span className="font-mono">{p.latencyMs}ms</span></>
                    : <span className="break-all text-red-600">{p.error?.slice(0, 120)}</span>}
                </p>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-sm text-muted-500">Probe failed — check API health.</p>
        )}
      </section>

      {/* Sessions */}
      <section>
        <h2 className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted-500">Sessions</h2>
        <div className="grid grid-cols-2 gap-3">
          <div className="paper-card p-4">
            <p className="text-xs font-medium uppercase tracking-wider text-muted-500">Active now</p>
            <p className="font-serif mt-1 text-2xl font-semibold text-ink-900">{sessions?.activeNow ?? 0}</p>
          </div>
          <div className="paper-card p-4">
            <p className="text-xs font-medium uppercase tracking-wider text-muted-500">Today</p>
            <p className="font-serif mt-1 text-2xl font-semibold text-ink-900">{sessions?.today ?? 0}</p>
          </div>
        </div>
      </section>

      {/* Top AI spenders */}
      <section>
        <h2 className="mb-3 flex items-center justify-between text-xs font-semibold uppercase tracking-wider text-muted-500">
          <span>Top AI spenders today (USD)</span>
          {Object.keys(defaultCaps).length > 0 && (
            <span className="font-mono normal-case">
              caps: free ${defaultCaps['free']} · scholar ${defaultCaps['scholar']} · aspirant ${defaultCaps['aspirant']} · achiever ${defaultCaps['achiever']}
            </span>
          )}
        </h2>
        {spenders.length === 0 ? (
          <p className="text-sm text-muted-500">No spend recorded today yet.</p>
        ) : (
          <div className="paper-card overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-left text-[11px] uppercase tracking-wider text-muted-500">
                <tr>
                  <th className="px-3 py-2">User</th>
                  <th className="px-3 py-2">Plan</th>
                  <th className="px-3 py-2 text-right">Today</th>
                  <th className="px-3 py-2 text-right">% of cap</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {spenders.map(s => (
                  <tr key={s.userId} className={s.pctOfCap >= 100 ? 'bg-red-500/5' : s.pctOfCap >= 80 ? 'bg-gold-500/5' : ''}>
                    <td className="px-3 py-2">
                      <p className="font-medium text-ink-900">{s.name || '—'}</p>
                      <p className="text-[11px] text-muted-500">{s.email}</p>
                    </td>
                    <td className="px-3 py-2 text-muted-600 capitalize">{s.plan}</td>
                    <td className="px-3 py-2 text-right font-mono text-ink-900">${s.totalToday.toFixed(4)}</td>
                    <td className={`px-3 py-2 text-right font-mono ${
                      s.pctOfCap >= 100 ? 'text-red-600' : s.pctOfCap >= 80 ? 'text-gold-700' : 'text-muted-600'
                    }`}>{s.pctOfCap}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* Recent errors */}
      <section>
        <h2 className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted-500">Recent errors</h2>
        {errors.length === 0 ? (
          <p className="text-sm text-muted-500">No errors logged recently. 🎉</p>
        ) : (
          <ul className="space-y-2">
            {errors.map(e => (
              <li key={e.id} className="paper-card p-3 text-xs">
                <div className="flex items-center justify-between">
                  <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider ${
                    e.severity === 'critical' ? 'bg-red-500/10 text-red-600' : 'bg-gold-500/10 text-gold-700'
                  }`}>
                    {e.severity ?? 'error'}
                  </span>
                  <span className="text-muted-500">{new Date(e.timestamp).toLocaleString('en-IN', { hour12: false })}</span>
                </div>
                <p className="mt-2 font-mono text-[11px] text-ink-900 break-all">{e.message?.slice(0, 300)}</p>
                {e.route && <p className="mt-1 text-[10px] text-muted-400">{e.route}</p>}
              </li>
            ))}
          </ul>
        )}
      </section>

      <footer className="text-[11px] text-muted-400">
        <p>External dashboards:
          <a href="https://console.cloud.google.com/run?project=nexigrate-prod" target="_blank" rel="noopener noreferrer" className="ml-2 underline hover:text-ember-600">Cloud Run</a>
          <span className="mx-1">·</span>
          <a href="https://console.cloud.google.com/firestore?project=nexigrate-prod" target="_blank" rel="noopener noreferrer" className="underline hover:text-ember-600">Firestore</a>
          <span className="mx-1">·</span>
          <a href="https://dash.cloudflare.com/" target="_blank" rel="noopener noreferrer" className="underline hover:text-ember-600">Cloudflare</a>
        </p>
      </footer>
    </div>
  );
}
