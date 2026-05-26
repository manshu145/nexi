'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '~/lib/auth-context';
import { getFirebaseAuthClient } from '~/lib/firebase';

interface LogEntry {
  id: string;
  type: 'ai_call' | 'user_action' | 'payment' | 'error' | 'admin';
  action: string;
  userId?: string;
  metadata?: Record<string, unknown>;
  timestamp: string;
}

const API = process.env['NEXT_PUBLIC_API_URL'] ?? 'https://api.nexigrate.com';

const TYPE_COLORS: Record<string, string> = {
  ai_call: 'bg-gold-500/10 text-gold-600',
  user_action: 'bg-paper-300 text-ink-800',
  payment: 'bg-emerald-100 text-emerald-700',
  error: 'bg-ember-500/10 text-ember-600',
  admin: 'bg-paper-200 text-ink-700',
};

export default function AdminLogsPage() {
  const { user, loading } = useAuth();
  const router = useRouter();
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [total, setTotal] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [fetching, setFetching] = useState(true);
  const [filter, setFilter] = useState<string>('all');

  useEffect(() => {
    if (!loading && !user) router.replace('/admin/login');
  }, [user, loading, router]);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    (async () => {
      setFetching(true);
      try {
        const auth = getFirebaseAuthClient();
        const token = await auth.currentUser?.getIdToken();
        const url = filter === 'all' ? `${API}/v1/admin/logs` : `${API}/v1/admin/logs?type=${filter}`;
        const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
        if (!res.ok) throw new Error(`Failed: ${res.status}`);
        const data = await res.json() as { logs: LogEntry[]; total: number };
        if (!cancelled) { setLogs(data.logs); setTotal(data.total); }
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : 'Failed to load logs');
      } finally {
        if (!cancelled) setFetching(false);
      }
    })();
    return () => { cancelled = true; };
  }, [user, filter]);

  if (loading || !user) return <div className="flex items-center justify-center py-20"><span className="spinner" /></div>;

  return (
    <div>
      <h1 className="font-serif text-2xl font-bold text-ink-900">System Logs</h1>
      <p className="mt-1 text-sm text-muted-500">{total} total entries</p>

      {error && <div className="banner banner-error mt-4">{error}</div>}

      {/* Filter tabs */}
      <div className="mt-6 flex gap-2 overflow-x-auto pb-2">
        {['all', 'ai_call', 'user_action', 'payment', 'error', 'admin'].map(f => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`pill whitespace-nowrap text-xs ${filter === f ? 'bg-ink-900 text-paper-50 border-ink-900' : ''}`}
            style={filter === f ? { backgroundColor: 'var(--color-ink-900)', color: 'var(--color-paper-50)', borderColor: 'var(--color-ink-900)' } : undefined}
          >
            {f === 'all' ? 'All' : f.replace('_', ' ')}
          </button>
        ))}
      </div>

      {/* Logs list */}
      {fetching ? (
        <div className="flex items-center justify-center py-12"><span className="spinner" /></div>
      ) : logs.length === 0 ? (
        <div className="paper-card mt-6 p-8 text-center">
          <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="mx-auto text-muted-400">
            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" strokeLinecap="round" strokeLinejoin="round"/>
            <polyline points="14,2 14,8 20,8" strokeLinecap="round" strokeLinejoin="round"/>
            <line x1="16" y1="13" x2="8" y2="13" strokeLinecap="round"/><line x1="16" y1="17" x2="8" y2="17" strokeLinecap="round"/><line x1="10" y1="9" x2="8" y2="9" strokeLinecap="round"/>
          </svg>
          <p className="mt-3 text-sm text-muted-500">No logs found{filter !== 'all' ? ` for "${filter.replace('_', ' ')}"` : ''}.</p>
          <p className="text-xs text-muted-400 mt-1">Logs are recorded as users interact with the platform.</p>
        </div>
      ) : (
        <div className="mt-4 space-y-2">
          {logs.map((log) => (
            <div key={log.id} className="paper-card p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className={`inline-flex items-center rounded-md px-2 py-0.5 text-xs font-medium ${TYPE_COLORS[log.type] ?? 'bg-paper-200 text-ink-700'}`}>
                      {log.type.replace('_', ' ')}
                    </span>
                    <span className="text-sm font-medium text-ink-900 truncate">{log.action}</span>
                  </div>
                  {log.userId && (
                    <p className="mt-1 text-xs text-muted-500">User: {log.userId.slice(0, 12)}...</p>
                  )}
                  {log.metadata && Object.keys(log.metadata).length > 0 && (
                    <p className="mt-1 text-xs text-muted-400 font-mono truncate">
                      {JSON.stringify(log.metadata).slice(0, 80)}
                    </p>
                  )}
                </div>
                <span className="text-xs text-muted-400 flex-shrink-0 whitespace-nowrap">
                  {new Date(log.timestamp).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
                </span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
