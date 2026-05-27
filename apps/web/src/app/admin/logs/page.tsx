'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '~/lib/auth-context';
import { getFirebaseAuthClient } from '~/lib/firebase';

interface ErrorLog {
  id: string;
  severity: 'critical' | 'warning' | 'info';
  message: string;
  route: string;
  userId?: string;
  timestamp: string;
  stack?: string;
}

interface AiLog {
  id: string;
  model: string;
  tokens: number;
  cost: number;
  latencyMs: number;
  userId?: string;
  timestamp: string;
}

interface CombinedLog {
  id: string;
  type: string;
  action: string;
  userId?: string;
  metadata?: Record<string, unknown>;
  timestamp: string;
}

type TabKey = 'all' | 'errors' | 'ai' | 'payments';

const API = process.env['NEXT_PUBLIC_API_URL'] ?? 'https://api.nexigrate.com';


const SEVERITY_COLORS: Record<string, string> = {
  critical: 'bg-ember-100 text-ember-700 dark:bg-ember-900/30 dark:text-ember-400',
  warning: 'bg-gold-100 text-gold-700 dark:bg-gold-900/30 dark:text-gold-400',
  info: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
};

function SkeletonLogRow() {
  return (
    <div className="paper-card p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="space-y-2 flex-1">
          <div className="h-4 w-48 rounded bg-paper-300 animate-pulse" />
          <div className="h-3 w-32 rounded bg-paper-300 animate-pulse" />
        </div>
        <div className="h-3 w-20 rounded bg-paper-300 animate-pulse" />
      </div>
    </div>
  );
}

export default function AdminLogsPage() {
  const { user, loading } = useAuth();
  const router = useRouter();
  const [tab, setTab] = useState<TabKey>('all');
  const [combinedLogs, setCombinedLogs] = useState<CombinedLog[]>([]);
  const [errorLogs, setErrorLogs] = useState<ErrorLog[]>([]);
  const [aiLogs, setAiLogs] = useState<AiLog[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [fetching, setFetching] = useState(true);
  const [page, setPage] = useState(1);
  const [expandedId, setExpandedId] = useState<string | null>(null);


  useEffect(() => {
    if (!loading && !user) router.replace('/admin/login');
  }, [user, loading, router]);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    (async () => {
      setFetching(true);
      setError(null);
      try {
        const auth = getFirebaseAuthClient();
        const token = await auth.currentUser?.getIdToken();

        if (tab === 'all') {
          const res = await fetch(`${API}/v1/admin/logs`, {
            headers: { Authorization: `Bearer ${token}` },
          });
          if (!res.ok) throw new Error(`Failed: ${res.status}`);
          const data = (await res.json()) as { logs: CombinedLog[] };
          if (!cancelled) setCombinedLogs(data.logs);
        } else if (tab === 'errors') {
          const res = await fetch(`${API}/v1/admin/error-logs?page=${page}&limit=20`, {
            headers: { Authorization: `Bearer ${token}` },
          });
          if (!res.ok) throw new Error(`Failed: ${res.status}`);
          const data = (await res.json()) as { logs: ErrorLog[] };
          if (!cancelled) setErrorLogs(data.logs);
        } else if (tab === 'ai') {
          const res = await fetch(`${API}/v1/admin/ai-logs?page=${page}&limit=20`, {
            headers: { Authorization: `Bearer ${token}` },
          });
          if (!res.ok) throw new Error(`Failed: ${res.status}`);
          const data = (await res.json()) as { logs: AiLog[] };
          if (!cancelled) setAiLogs(data.logs);
        } else if (tab === 'payments') {
          const res = await fetch(`${API}/v1/admin/logs?type=payment`, {
            headers: { Authorization: `Bearer ${token}` },
          });
          if (!res.ok) throw new Error(`Failed: ${res.status}`);
          const data = (await res.json()) as { logs: CombinedLog[] };
          if (!cancelled) setCombinedLogs(data.logs);
        }
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : 'Failed to load logs');
      } finally {
        if (!cancelled) setFetching(false);
      }
    })();
    return () => { cancelled = true; };
  }, [user, tab, page]);


  if (loading || !user) {
    return (
      <div className="space-y-4">
        <div className="h-7 w-32 rounded bg-paper-300 animate-pulse" />
        <div className="flex gap-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-8 w-20 rounded-full bg-paper-300 animate-pulse" />
          ))}
        </div>
        <div className="space-y-2">
          {Array.from({ length: 5 }).map((_, i) => <SkeletonLogRow key={i} />)}
        </div>
      </div>
    );
  }

  const tabs: { key: TabKey; label: string }[] = [
    { key: 'all', label: 'All' },
    { key: 'errors', label: 'Errors' },
    { key: 'ai', label: 'AI Calls' },
    { key: 'payments', label: 'Payments' },
  ];

  return (
    <div>
      <h1 className="font-serif text-2xl font-bold text-ink-900">System Logs</h1>
      <p className="mt-1 text-sm text-muted-500">Monitor errors, AI calls, and payments</p>

      {error && <div className="banner banner-error mt-4">{error}</div>}

      {/* Tabs */}
      <div className="mt-6 flex gap-2 overflow-x-auto pb-2">
        {tabs.map((t) => (
          <button
            key={t.key}
            onClick={() => { setTab(t.key); setPage(1); }}
            className={`pill whitespace-nowrap text-xs ${tab === t.key ? 'bg-ink-900 text-paper-50 border-ink-900 dark:bg-paper-50 dark:text-ink-900 dark:border-paper-50' : ''}`}
          >
            {t.label}
          </button>
        ))}
      </div>


      {/* Content */}
      {fetching ? (
        <div className="mt-4 space-y-2">
          {Array.from({ length: 5 }).map((_, i) => <SkeletonLogRow key={i} />)}
        </div>
      ) : tab === 'errors' ? (
        errorLogs.length === 0 ? (
          <EmptyState message="No error logs found" />
        ) : (
          <div className="mt-4 space-y-2">
            {errorLogs.map((log) => (
              <div key={log.id} className="paper-card p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className={`inline-flex items-center rounded-md px-2 py-0.5 text-xs font-medium ${SEVERITY_COLORS[log.severity] ?? SEVERITY_COLORS.info}`}>
                        {log.severity}
                      </span>
                      <span className="text-sm font-medium text-ink-900 truncate">{log.message}</span>
                    </div>
                    <div className="mt-1 flex items-center gap-3 text-xs text-muted-500">
                      <span>Route: {log.route}</span>
                      {log.userId && <span>User: {log.userId.slice(0, 12)}...</span>}
                    </div>
                    {log.stack && (
                      <button
                        onClick={() => setExpandedId(expandedId === log.id ? null : log.id)}
                        className="btn-ghost-sm mt-2 text-xs"
                      >
                        {expandedId === log.id ? 'Hide' : 'Show'} Stack Trace
                      </button>
                    )}
                    {expandedId === log.id && log.stack && (
                      <pre className="mt-2 overflow-x-auto rounded bg-paper-100 p-3 text-xs text-muted-600 dark:text-muted-400 font-mono">
                        {log.stack}
                      </pre>
                    )}
                  </div>
                  <span className="text-xs text-muted-400 flex-shrink-0 whitespace-nowrap">
                    {new Date(log.timestamp).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )


      ) : tab === 'ai' ? (
        aiLogs.length === 0 ? (
          <EmptyState message="No AI call logs found" />
        ) : (
          <div className="mt-4 space-y-2">
            {aiLogs.map((log) => (
              <div key={log.id} className="paper-card p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="inline-flex items-center rounded-md bg-gold-500/10 text-gold-600 dark:text-gold-400 px-2 py-0.5 text-xs font-medium">
                        {log.model}
                      </span>
                      <span className="text-xs text-muted-500">{log.tokens} tokens</span>
                      <span className="text-xs text-muted-500">₹{log.cost.toFixed(4)}</span>
                      <span className="text-xs text-muted-500">{log.latencyMs}ms</span>
                    </div>
                    {log.userId && (
                      <p className="mt-1 text-xs text-muted-500">User: {log.userId.slice(0, 12)}...</p>
                    )}
                  </div>
                  <span className="text-xs text-muted-400 flex-shrink-0 whitespace-nowrap">
                    {new Date(log.timestamp).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )
      ) : (
        /* All or Payments tab */
        combinedLogs.length === 0 ? (
          <EmptyState message={`No ${tab === 'payments' ? 'payment' : ''} logs found`} />
        ) : (
          <div className="mt-4 space-y-2">
            {combinedLogs.map((log) => (
              <div key={log.id} className="paper-card p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="inline-flex items-center rounded-md bg-paper-200 text-ink-700 px-2 py-0.5 text-xs font-medium">
                        {log.type}
                      </span>
                      <span className="text-sm font-medium text-ink-900 truncate">{log.action}</span>
                    </div>
                    {log.userId && (
                      <p className="mt-1 text-xs text-muted-500">User: {log.userId.slice(0, 12)}...</p>
                    )}
                  </div>
                  <span className="text-xs text-muted-400 flex-shrink-0 whitespace-nowrap">
                    {new Date(log.timestamp).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )
      )}


      {/* Pagination for errors and ai tabs */}
      {(tab === 'errors' || tab === 'ai') && !fetching && (
        <div className="mt-4 flex items-center justify-between">
          <button
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={page === 1}
            className="btn-ghost-sm disabled:opacity-40"
          >
            ← Previous
          </button>
          <span className="text-xs text-muted-500">Page {page}</span>
          <button
            onClick={() => setPage((p) => p + 1)}
            className="btn-ghost-sm"
          >
            Next →
          </button>
        </div>
      )}
    </div>
  );
}

function EmptyState({ message }: { message: string }) {
  return (
    <div className="paper-card mt-6 p-8 text-center">
      <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="mx-auto text-muted-400">
        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" strokeLinecap="round" strokeLinejoin="round"/>
        <polyline points="14,2 14,8 20,8" strokeLinecap="round" strokeLinejoin="round"/>
        <line x1="16" y1="13" x2="8" y2="13" strokeLinecap="round"/>
        <line x1="16" y1="17" x2="8" y2="17" strokeLinecap="round"/>
        <line x1="10" y1="9" x2="8" y2="9" strokeLinecap="round"/>
      </svg>
      <p className="mt-3 text-sm text-muted-500">{message}</p>
      <p className="text-xs text-muted-400 mt-1">Logs are recorded as activity occurs on the platform.</p>
    </div>
  );
}
