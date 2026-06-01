'use client';
import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '~/lib/auth-context';
import { getFirebaseAuthClient } from '~/lib/firebase';
import { api } from '~/lib/api';

interface AdminStats {
  totalUsers: number;
  dau: number;
  activeNow: number;
  newToday: number;
  revenue30d: number;
  aiCostToday: number;
  activeSessions?: number;
  newUsersToday?: number;
  pwaInstalls?: number;
}

interface ApiHealthStatus {
  health: {
    openai: 'ok' | 'error' | 'unconfigured';
    groq: 'ok' | 'error' | 'unconfigured';
    gemini: 'ok' | 'error' | 'unconfigured';
    razorpay: 'ok' | 'error' | 'unconfigured';
  };
  checkedAt: string;
}

const API = process.env['NEXT_PUBLIC_API_URL'] ?? 'https://api.nexigrate.com';

function SkeletonCard() {
  return (
    <div className="paper-card p-5">
      <div className="h-3 w-24 rounded bg-paper-300 animate-pulse" />
      <div className="mt-3 h-8 w-20 rounded bg-paper-300 animate-pulse" />
    </div>
  );
}

function SkeletonHealthRow() {
  return (
    <div className="paper-card p-4 mt-6">
      <div className="h-3 w-20 rounded bg-paper-300 animate-pulse mb-3" />
      <div className="flex gap-3">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="h-6 w-20 rounded-full bg-paper-300 animate-pulse" />
        ))}
      </div>
    </div>
  );
}

function HealthBadge({ name, status }: { name: string; status: 'ok' | 'error' | 'unconfigured' }) {
  const mapped = status === 'ok' ? 'up' : status === 'error' ? 'down' : 'unknown';
  const colors: Record<string, string> = {
    up: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400',
    down: 'bg-ember-100 text-ember-700 dark:bg-ember-900/30 dark:text-ember-400',
    unknown: 'bg-paper-200 text-muted-500 dark:text-muted-400',
  };
  const dots: Record<string, string> = {
    up: 'bg-amber-500',
    down: 'bg-ember-500',
    unknown: 'bg-muted-400',
  };
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium ${colors[mapped]}`}>
      <span className={`h-2 w-2 rounded-full ${dots[mapped]}`} />
      {name}
    </span>
  );
}

export default function AdminStatsPage() {
  const { user, loading } = useAuth();
  const router = useRouter();
  const [stats, setStats] = useState<AdminStats | null>(null);
  const [health, setHealth] = useState<ApiHealthStatus | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [fetchingStats, setFetchingStats] = useState(true);
  const [fetchingHealth, setFetchingHealth] = useState(true);
  const [resetting, setResetting] = useState(false);
  const [resetConfirm, setResetConfirm] = useState(false);
  const [resetMsg, setResetMsg] = useState<string | null>(null);

  const isAdmin = (email?: string | null) =>
    email === 'manshu.ibc24@gmail.com' || email === 'manshusinha777@gmail.com';

  useEffect(() => {
    if (!loading && !user) router.replace('/admin/login');
    if (!loading && user && !isAdmin(user.email)) router.replace('/dashboard');
  }, [user, loading, router]);

  const fetchStats = useCallback(async () => {
    if (!user || !isAdmin(user.email)) return;
    try {
      const auth = getFirebaseAuthClient();
      const token = await auth.currentUser?.getIdToken();
      const res = await fetch(`${API}/v1/admin/stats`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error(`Failed: ${res.status}`);
      const data = (await res.json()) as AdminStats;
      setStats({ ...data, activeNow: data.activeNow ?? data.activeSessions ?? 0, newToday: data.newToday ?? data.newUsersToday ?? 0 });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load stats');
    } finally {
      setFetchingStats(false);
    }
  }, [user]);

  useEffect(() => {
    if (!user || !isAdmin(user.email)) return;
    void fetchStats();
    // PR-41: auto-refresh stats every 60s with visibility gate
    const interval = setInterval(() => {
      if (document.visibilityState === 'visible') void fetchStats();
    }, 60_000);
    return () => clearInterval(interval);
  }, [user, fetchStats]);

  const fetchHealth = useCallback(async () => {
    if (!user || !isAdmin(user.email)) return;
    try {
      const auth = getFirebaseAuthClient();
      const token = await auth.currentUser?.getIdToken();
      const res = await fetch(`${API}/v1/admin/api-health`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error(`Health check failed: ${res.status}`);
      const data = (await res.json()) as ApiHealthStatus;
      setHealth(data);
    } catch {
      // silently ignore health fetch errors
    } finally {
      setFetchingHealth(false);
    }
  }, [user]);

  useEffect(() => {
    if (!user || !isAdmin(user.email)) return;
    void fetchHealth();
    // PR-34a: gate polling on document.visibilityState so a backgrounded
    // admin dashboard tab doesn't keep hitting /v1/admin/api-health every
    // minute. The first call still fires on mount via the void fetchHealth
    // above so the dashboard isn't blank when the tab regains focus.
    const interval = setInterval(() => {
      if (document.visibilityState === 'visible') void fetchHealth();
    }, 60_000);
    return () => clearInterval(interval);
  }, [user, fetchHealth]);

  if (loading || !user) {
    return (
      <div className="space-y-6">
        <div className="h-7 w-40 rounded bg-paper-300 animate-pulse" />
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => <SkeletonCard key={i} />)}
        </div>
        <SkeletonHealthRow />
      </div>
    );
  }

  if (error) return <div className="banner banner-error">{error}</div>;

  const handleReset = async () => {
    setResetting(true);
    setResetMsg(null);
    try {
      const res = await api.adminResetAnalytics();
      const summary = Object.entries(res.deleted).map(([k, v]) => `${k}: ${v}`).join(' · ');
      setResetMsg(`✓ Reset complete — ${summary}`);
      setResetConfirm(false);
      void fetchStats();
    } catch (e) {
      setResetMsg(`✗ ${e instanceof Error ? e.message : 'Reset failed'}`);
    } finally {
      setResetting(false);
    }
  };

  return (
    <div>
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="font-serif text-2xl font-bold text-ink-900">Dashboard</h1>
          <p className="mt-1 text-sm text-muted-500">Overview of platform metrics</p>
        </div>
        {/* Reset test data — clears AI logs / error logs / sessions + counters.
            Users & payments are NOT affected. */}
        <div className="flex flex-col items-end gap-1">
          {!resetConfirm ? (
            <button
              onClick={() => { setResetConfirm(true); setResetMsg(null); }}
              className="rounded-lg border border-line bg-paper-50 px-3 py-1.5 text-xs font-medium text-muted-600 hover:text-ember-600 hover:border-ember-500/40 transition-colors"
            >
              ♻️ Reset test data
            </button>
          ) : (
            <div className="flex items-center gap-2 rounded-lg border border-ember-500/40 bg-ember-500/5 px-3 py-1.5">
              <span className="text-xs text-ink-900">Clear analytics? (users & payments safe)</span>
              <button onClick={handleReset} disabled={resetting} className="text-xs font-semibold text-ember-600 hover:text-ember-700 disabled:opacity-50">
                {resetting ? 'Resetting…' : 'Yes, reset'}
              </button>
              <button onClick={() => setResetConfirm(false)} disabled={resetting} className="text-xs font-medium text-muted-500 hover:text-ink-900">Cancel</button>
            </div>
          )}
          {resetMsg && <p className="text-[11px] text-muted-500 max-w-xs text-right">{resetMsg}</p>}
        </div>
      </div>

      {/* KPI Cards */}
      {fetchingStats ? (
        <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => <SkeletonCard key={i} />)}
        </div>
      ) : (
        <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <div className="paper-card min-h-[100px] p-5 flex flex-col justify-between">
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-500">Active Users</p>
            <p className="font-serif mt-2 text-3xl font-bold text-ink-900 tabular-nums">
              {stats?.totalUsers.toLocaleString() ?? '0'}
            </p>
          </div>
          <div className="paper-card min-h-[100px] p-5 flex flex-col justify-between">
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-500">DAU (Today)</p>
            <p className="font-serif mt-2 text-3xl font-bold text-ink-900 tabular-nums">
              {stats?.dau.toLocaleString() ?? '0'}
            </p>
          </div>
          <div className="paper-card min-h-[100px] p-5 flex flex-col justify-between">
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-500">Active Now</p>
            <p className="font-serif mt-2 text-3xl font-bold text-ink-900 tabular-nums">
              {stats?.activeNow.toLocaleString() ?? '0'}
            </p>
          </div>
          <div className="paper-card min-h-[100px] p-5 flex flex-col justify-between">
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-500">New Today</p>
            <p className="font-serif mt-2 text-3xl font-bold text-ink-900 tabular-nums">
              {stats?.newToday.toLocaleString() ?? '0'}
            </p>
          </div>
          <div className="paper-card min-h-[100px] p-5 flex flex-col justify-between">
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-500">Revenue (30d)</p>
            <p className="font-serif mt-2 text-3xl font-bold text-ink-900 tabular-nums">
              ₹{stats?.revenue30d.toLocaleString() ?? '0'}
            </p>
          </div>
          <div className="paper-card min-h-[100px] p-5 flex flex-col justify-between">
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-500">AI Cost Today</p>
            <p className="font-serif mt-2 text-3xl font-bold text-ink-900 tabular-nums">
              ₹{stats?.aiCostToday.toLocaleString() ?? '0'}
            </p>
          </div>
          <div className="paper-card min-h-[100px] p-5 flex flex-col justify-between">
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-500">PWA Installs</p>
            <p className="font-serif mt-2 text-3xl font-bold text-ink-900 tabular-nums">
              {stats?.pwaInstalls?.toLocaleString() ?? '0'}
            </p>
          </div>
        </div>
      )}

      {/* API Health Row */}
      {fetchingHealth ? (
        <SkeletonHealthRow />
      ) : health ? (
        <div className="paper-card p-4 mt-6">
          <div className="flex items-center justify-between mb-3">
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-500">API Health</p>
            <span className="text-xs text-muted-400">
              Checked {new Date(health.checkedAt).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}
            </span>
          </div>
          <div className="flex flex-wrap gap-3">
            <HealthBadge name="OpenAI" status={health.health.openai} />
            <HealthBadge name="Groq" status={health.health.groq} />
            <HealthBadge name="Gemini" status={health.health.gemini} />
            <HealthBadge name="Razorpay" status={health.health.razorpay} />
          </div>
        </div>
      ) : null}
    </div>
  );
}
