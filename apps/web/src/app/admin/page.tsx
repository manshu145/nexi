'use client';
import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '~/lib/auth-context';
import { getFirebaseAuthClient } from '~/lib/firebase';

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

  const isAdmin = (email?: string | null) =>
    email === 'manshu.ibc24@gmail.com' || email === 'manshusinha777@gmail.com';

  useEffect(() => {
    if (!loading && !user) router.replace('/admin/login');
    if (!loading && user && !isAdmin(user.email)) router.replace('/dashboard');
  }, [user, loading, router]);

  useEffect(() => {
    if (!user || !isAdmin(user.email)) return;
    let cancelled = false;
    (async () => {
      try {
        const auth = getFirebaseAuthClient();
        const token = await auth.currentUser?.getIdToken();
        const res = await fetch(`${API}/v1/admin/stats`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!res.ok) throw new Error(`Failed: ${res.status}`);
        const data = (await res.json()) as AdminStats;
        if (!cancelled) setStats({ ...data, activeNow: data.activeNow ?? data.activeSessions ?? 0, newToday: data.newToday ?? data.newUsersToday ?? 0 });
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : 'Failed to load stats');
      } finally {
        if (!cancelled) setFetchingStats(false);
      }
    })();
    return () => { cancelled = true; };
  }, [user]);

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

  return (
    <div>
      <h1 className="font-serif text-2xl font-bold text-ink-900">Dashboard</h1>
      <p className="mt-1 text-sm text-muted-500">Overview of platform metrics</p>

      {/* KPI Cards */}
      {fetchingStats ? (
        <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => <SkeletonCard key={i} />)}
        </div>
      ) : (
        <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <div className="paper-card min-h-0 p-5">
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-500">Total Users</p>
            <p className="font-serif mt-2 text-3xl font-bold text-ink-900">
              {stats?.totalUsers.toLocaleString() ?? '0'}
            </p>
          </div>
          <div className="paper-card min-h-0 p-5">
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-500">DAU (Today)</p>
            <p className="font-serif mt-2 text-3xl font-bold text-ink-900">
              {stats?.dau.toLocaleString() ?? '0'}
            </p>
          </div>
          <div className="paper-card min-h-0 p-5">
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-500">Active Now</p>
            <p className="font-serif mt-2 text-3xl font-bold text-ink-900">
              {stats?.activeNow.toLocaleString() ?? '0'}
            </p>
          </div>
          <div className="paper-card min-h-0 p-5">
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-500">New Today</p>
            <p className="font-serif mt-2 text-3xl font-bold text-ink-900">
              {stats?.newToday.toLocaleString() ?? '0'}
            </p>
          </div>
          <div className="paper-card min-h-0 p-5">
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-500">Revenue (30d)</p>
            <p className="font-serif mt-2 text-3xl font-bold text-ink-900">
              ₹{stats?.revenue30d.toLocaleString() ?? '0'}
            </p>
          </div>
          <div className="paper-card min-h-0 p-5">
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-500">AI Cost Today</p>
            <p className="font-serif mt-2 text-3xl font-bold text-ink-900">
              ₹{stats?.aiCostToday.toLocaleString() ?? '0'}
            </p>
          </div>
          <div className="paper-card min-h-0 p-5">
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-500">PWA Installs</p>
            <p className="font-serif mt-2 text-3xl font-bold text-ink-900">
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
