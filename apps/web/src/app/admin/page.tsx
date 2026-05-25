'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '~/lib/auth-context';
import { getFirebaseAuthClient } from '~/lib/firebase';

interface AdminStats {
  totalUsers: number;
  dau: number;
  mau: number;
  revenue30d: number;
  aiCallsToday: number;
  aiCostToday: number;
}

const API = process.env['NEXT_PUBLIC_API_URL'] ?? 'https://api.nexigrate.com';

export default function AdminStatsPage() {
  const { user, loading } = useAuth();
  const router = useRouter();
  const [stats, setStats] = useState<AdminStats | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [fetching, setFetching] = useState(true);

  useEffect(() => {
    if (!loading && !user) router.replace('/signin');
    if (!loading && user && user.email !== 'manshu.ibc24@gmail.com') router.replace('/dashboard');
  }, [user, loading, router]);

  useEffect(() => {
    if (!user || user.email !== 'manshu.ibc24@gmail.com') return;
    let cancelled = false;
    (async () => {
      try {
        const auth = getFirebaseAuthClient();
        const token = await auth.currentUser?.getIdToken();
        const res = await fetch(`${API}/v1/admin/stats`, { headers: { Authorization: `Bearer ${token}` } });
        if (!res.ok) throw new Error(`Failed: ${res.status}`);
        const data = await res.json() as AdminStats;
        if (!cancelled) setStats(data);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : 'Failed to load stats');
      } finally {
        if (!cancelled) setFetching(false);
      }
    })();
    return () => { cancelled = true; };
  }, [user]);

  if (loading || !user || fetching) return <div className="flex items-center justify-center py-20"><span className="spinner" /></div>;
  if (error) return <div className="banner banner-error">{error}</div>;

  return (
    <div>
      <h1 className="font-serif text-2xl font-bold text-ink-900 dark:text-paper-50">Dashboard</h1>
      <p className="mt-1 text-sm text-muted-500">Overview of platform metrics</p>

      <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <div className="paper-card p-5">
          <p className="text-xs font-semibold uppercase tracking-wider text-muted-500">Total Users</p>
          <p className="font-serif mt-2 text-3xl font-bold text-ink-900 dark:text-paper-50">{stats?.totalUsers ?? 0}</p>
        </div>
        <div className="paper-card p-5">
          <p className="text-xs font-semibold uppercase tracking-wider text-muted-500">DAU (Today)</p>
          <p className="font-serif mt-2 text-3xl font-bold text-ink-900 dark:text-paper-50">{stats?.dau ?? 0}</p>
        </div>
        <div className="paper-card p-5">
          <p className="text-xs font-semibold uppercase tracking-wider text-muted-500">Revenue (30d)</p>
          <p className="font-serif mt-2 text-3xl font-bold text-ink-900 dark:text-paper-50">₹{stats?.revenue30d ?? 0}</p>
        </div>
        <div className="paper-card p-5">
          <p className="text-xs font-semibold uppercase tracking-wider text-muted-500">AI Calls Today</p>
          <p className="font-serif mt-2 text-3xl font-bold text-ink-900 dark:text-paper-50">{stats?.aiCallsToday ?? 0}</p>
        </div>
        <div className="paper-card p-5">
          <p className="text-xs font-semibold uppercase tracking-wider text-muted-500">AI Cost Today</p>
          <p className="font-serif mt-2 text-3xl font-bold text-ink-900 dark:text-paper-50">₹{stats?.aiCostToday ?? 0}</p>
        </div>
        <div className="paper-card p-5">
          <p className="text-xs font-semibold uppercase tracking-wider text-muted-500">MAU</p>
          <p className="font-serif mt-2 text-3xl font-bold text-ink-900 dark:text-paper-50">{stats?.mau ?? 0}</p>
        </div>
      </div>
    </div>
  );
}
