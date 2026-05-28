'use client';
import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '~/lib/auth-context';
import { getFirebaseAuthClient } from '~/lib/firebase';

interface ActiveSession {
  userId: string;
  userName: string;
  exam: string;
  lastActiveAt: string;
  plan: string;
}

const API = process.env['NEXT_PUBLIC_API_URL'] ?? 'https://api.nexigrate.com';

function SkeletonRow() {
  return (
    <tr>
      <td className="px-4 py-3"><div className="h-4 w-28 rounded bg-paper-300 animate-pulse" /></td>
      <td className="px-4 py-3"><div className="h-4 w-20 rounded bg-paper-300 animate-pulse" /></td>
      <td className="px-4 py-3"><div className="h-4 w-16 rounded bg-paper-300 animate-pulse" /></td>
      <td className="px-4 py-3"><div className="h-4 w-14 rounded bg-paper-300 animate-pulse" /></td>
    </tr>
  );
}

export default function AdminSessionsPage() {
  const { user, loading } = useAuth();
  const router = useRouter();
  const [sessions, setSessions] = useState<ActiveSession[]>([]);
  const [count, setCount] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [fetching, setFetching] = useState(true);

  useEffect(() => {
    if (!loading && !user) router.replace('/admin/login');
  }, [user, loading, router]);

  const fetchSessions = useCallback(async () => {
    if (!user) return;
    try {
      const auth = getFirebaseAuthClient();
      const token = await auth.currentUser?.getIdToken();
      const res = await fetch(`${API}/v1/admin/sessions`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error(`Failed: ${res.status}`);
      const data = (await res.json()) as { sessions: ActiveSession[]; count: number };
      setSessions(data.sessions);
      setCount(data.count);
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Failed to load sessions';
      if (!msg.includes('404')) setError(msg);
    } finally {
      setFetching(false);
    }
  }, [user]);

  useEffect(() => {
    if (!user) return;
    void fetchSessions();
    const interval = setInterval(() => { void fetchSessions(); }, 30_000);
    return () => clearInterval(interval);
  }, [user, fetchSessions]);

  if (loading || !user) {
    return (
      <div className="space-y-4">
        <div className="h-7 w-48 rounded bg-paper-300 animate-pulse" />
        <div className="h-4 w-24 rounded bg-paper-300 animate-pulse" />
      </div>
    );
  }

  return (
    <div>
      <div className="flex items-center gap-3">
        <h1 className="font-serif text-2xl font-bold text-ink-900">Live Sessions</h1>
        <span className="inline-flex items-center rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-medium text-amber-700 dark:bg-amber-900/30 dark:text-amber-400">
          {count} online
        </span>
      </div>
      <p className="mt-1 text-sm text-muted-500">Users active in the last 10 minutes</p>

      {error && <div className="banner banner-error mt-4">{error}</div>}

      {fetching ? (
        <div className="paper-card mt-6 overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-line text-left">
                <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wider text-muted-500">Name</th>
                <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wider text-muted-500">Exam</th>
                <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wider text-muted-500">Last Active</th>
                <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wider text-muted-500">Plan</th>
              </tr>
            </thead>
            <tbody>
              {Array.from({ length: 5 }).map((_, i) => <SkeletonRow key={i} />)}
            </tbody>
          </table>
        </div>
      ) : sessions.length === 0 ? (
        <div className="paper-card mt-6 p-8 text-center">
          <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="mx-auto text-muted-400">
            <circle cx="12" cy="12" r="10" />
            <path d="M8 14s1.5 2 4 2 4-2 4-2" strokeLinecap="round" />
            <line x1="9" y1="9" x2="9.01" y2="9" strokeLinecap="round" />
            <line x1="15" y1="9" x2="15.01" y2="9" strokeLinecap="round" />
          </svg>
          <p className="mt-3 text-sm text-muted-500">No active users right now</p>
          <p className="text-xs text-muted-400 mt-1">Sessions will appear here when users are online.</p>
        </div>
      ) : (
        <div className="paper-card mt-6 overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-line text-left">
                <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wider text-muted-500">Name</th>
                <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wider text-muted-500">Exam</th>
                <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wider text-muted-500">Last Active</th>
                <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wider text-muted-500">Plan</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {sessions.map((s) => (
                <tr key={s.userId} className="hover:bg-paper-100 transition-colors">
                  <td className="px-4 py-3 font-medium text-ink-900">{s.userName}</td>
                  <td className="px-4 py-3 text-muted-600 dark:text-muted-400">{s.exam}</td>
                  <td className="px-4 py-3 text-muted-500">
                    {new Date(s.lastActiveAt).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}
                  </td>
                  <td className="px-4 py-3">
                    <span className="pill text-xs">{s.plan}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
