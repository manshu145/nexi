'use client';
import { useEffect, useState, useRef, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '~/lib/auth-context';
import { getFirebaseAuthClient } from '~/lib/firebase';

interface AIDebugLog {
  id: string;
  model: string;
  tokens: number;
  cost: number;
  latencyMs: number;
  userId?: string;
  timestamp: string;
  status?: 'success' | 'error';
  endpoint?: string;
  provider?: string;
  error?: string;
  requestPreview?: string;
  responsePreview?: string;
}

type StatusFilter = 'all' | 'success' | 'error';

const API = process.env['NEXT_PUBLIC_API_URL'] ?? 'https://api.nexigrate.com';

const STATUS_BADGE: Record<string, string> = {
  success: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400',
  error: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',
};

const PROVIDER_COLORS: Record<string, string> = {
  groq: 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400',
  openai: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400',
  gemini: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
};

function SkeletonRow() {
  return (
    <div className="paper-card p-4 animate-pulse">
      <div className="flex items-start justify-between gap-3">
        <div className="space-y-2 flex-1">
          <div className="h-4 w-56 rounded bg-paper-300" />
          <div className="h-3 w-40 rounded bg-paper-300" />
        </div>
        <div className="h-3 w-20 rounded bg-paper-300" />
      </div>
    </div>
  );
}

export default function AIDebugPage() {
  const { user, loading } = useAuth();
  const router = useRouter();
  const [logs, setLogs] = useState<AIDebugLog[]>([]);
  const [fetching, setFetching] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [lastRefresh, setLastRefresh] = useState<Date>(new Date());
  const [page, setPage] = useState(1);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (!loading && !user) router.replace('/admin/login');
  }, [user, loading, router]);

  const fetchLogs = useCallback(async (silent = false) => {
    if (!user) return;
    if (!silent) setFetching(true);
    setError(null);
    try {
      const auth = getFirebaseAuthClient();
      const token = await auth.currentUser?.getIdToken();
      const params = new URLSearchParams({ page: String(page), limit: '30' });
      if (statusFilter !== 'all') params.set('status', statusFilter);
      const res = await fetch(`${API}/v1/admin/ai-debug-logs?${params}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error(`Failed: ${res.status}`);
      const data = (await res.json()) as { logs: AIDebugLog[] };
      setLogs(data.logs);
      setLastRefresh(new Date());
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load AI debug logs');
    } finally {
      setFetching(false);
    }
  }, [user, page, statusFilter]);

  // Initial fetch and refetch on filter/page change
  useEffect(() => {
    fetchLogs();
  }, [fetchLogs]);

  // Auto-refresh every 5 seconds
  useEffect(() => {
    if (autoRefresh) {
      intervalRef.current = setInterval(() => fetchLogs(true), 5000);
    }
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [autoRefresh, fetchLogs]);

  if (loading || !user) {
    return (
      <div className="space-y-4">
        <div className="h-7 w-40 rounded bg-paper-300 animate-pulse" />
        <div className="space-y-2">
          {Array.from({ length: 6 }).map((_, i) => <SkeletonRow key={i} />)}
        </div>
      </div>
    );
  }

  const successCount = logs.filter(l => (l.status ?? 'success') === 'success').length;
  const errorCount = logs.filter(l => l.status === 'error').length;

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="font-serif text-2xl font-bold text-ink-900">AI Debug Logs</h1>
          <p className="mt-1 text-sm text-muted-500">Real-time AI request/response monitoring</p>
        </div>
        <div className="flex items-center gap-3">
          {/* Live indicator */}
          <div className="flex items-center gap-1.5">
            <span className={`inline-block h-2 w-2 rounded-full ${autoRefresh ? 'bg-emerald-500 animate-pulse' : 'bg-muted-400'}`} />
            <span className="text-xs text-muted-500">{autoRefresh ? 'Live' : 'Paused'}</span>
          </div>
          <button
            onClick={() => setAutoRefresh(!autoRefresh)}
            className={`pill text-xs ${autoRefresh ? 'bg-emerald-600 text-white border-emerald-600' : ''}`}
          >
            {autoRefresh ? '⏸ Pause' : '▶ Live'}
          </button>
          <button
            onClick={() => fetchLogs()}
            className="pill text-xs"
            disabled={fetching}
          >
            🔄 Refresh
          </button>
        </div>
      </div>

      {error && <div className="banner banner-error mt-4">{error}</div>}

      {/* Stats bar */}
      <div className="mt-4 flex flex-wrap gap-3">
        <div className="paper-card px-4 py-2 flex items-center gap-2">
          <span className="text-xs text-muted-500">Total:</span>
          <span className="text-sm font-semibold text-ink-900">{logs.length}</span>
        </div>
        <div className="paper-card px-4 py-2 flex items-center gap-2">
          <span className="inline-block h-2 w-2 rounded-full bg-emerald-500" />
          <span className="text-xs text-muted-500">Success:</span>
          <span className="text-sm font-semibold text-emerald-700">{successCount}</span>
        </div>
        <div className="paper-card px-4 py-2 flex items-center gap-2">
          <span className="inline-block h-2 w-2 rounded-full bg-red-500" />
          <span className="text-xs text-muted-500">Errors:</span>
          <span className="text-sm font-semibold text-red-700">{errorCount}</span>
        </div>
        <div className="paper-card px-4 py-2 flex items-center gap-2">
          <span className="text-xs text-muted-400">Last refresh: {lastRefresh.toLocaleTimeString('en-IN')}</span>
        </div>
      </div>

      {/* Filters */}
      <div className="mt-4 flex gap-2 overflow-x-auto pb-2">
        {(['all', 'success', 'error'] as StatusFilter[]).map((f) => (
          <button
            key={f}
            onClick={() => { setStatusFilter(f); setPage(1); }}
            className={`pill whitespace-nowrap text-xs capitalize ${statusFilter === f ? 'bg-ink-900 text-paper-50 border-ink-900 dark:bg-paper-50 dark:text-ink-900 dark:border-paper-50' : ''}`}
          >
            {f === 'all' ? 'All Calls' : f === 'success' ? '✓ Success' : '✗ Errors'}
          </button>
        ))}
      </div>

      {/* Logs List */}
      {fetching && logs.length === 0 ? (
        <div className="mt-4 space-y-2">
          {Array.from({ length: 6 }).map((_, i) => <SkeletonRow key={i} />)}
        </div>
      ) : logs.length === 0 ? (
        <div className="paper-card mt-6 p-8 text-center">
          <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="mx-auto text-muted-400">
            <path d="M12 2L2 7l10 5 10-5-10-5z" strokeLinecap="round" strokeLinejoin="round"/>
            <path d="M2 17l10 5 10-5" strokeLinecap="round" strokeLinejoin="round"/>
            <path d="M2 12l10 5 10-5" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
          <p className="mt-3 text-sm text-muted-500">No AI debug logs found</p>
          <p className="text-xs text-muted-400 mt-1">Logs appear here as AI calls are made on the platform.</p>
        </div>
      ) : (
        <div className="mt-4 space-y-2">
          {logs.map((log) => {
            const isExpanded = expandedId === log.id;
            const logStatus = log.status ?? 'success';
            return (
              <div
                key={log.id}
                className={`paper-card p-4 transition-all cursor-pointer hover:shadow-sm ${logStatus === 'error' ? 'border-l-4 border-l-red-400' : 'border-l-4 border-l-emerald-400'}`}
                onClick={() => setExpandedId(isExpanded ? null : log.id)}
              >
                {/* Top row */}
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      {/* Status badge */}
                      <span className={`inline-flex items-center rounded-md px-2 py-0.5 text-xs font-medium ${STATUS_BADGE[logStatus] ?? STATUS_BADGE.success}`}>
                        {logStatus === 'success' ? '✓' : '✗'} {logStatus}
                      </span>
                      {/* Model */}
                      <span className="inline-flex items-center rounded-md bg-gold-500/10 text-gold-600 dark:text-gold-400 px-2 py-0.5 text-xs font-medium">
                        {log.model}
                      </span>
                      {/* Provider */}
                      {log.provider && (
                        <span className={`inline-flex items-center rounded-md px-2 py-0.5 text-xs font-medium ${PROVIDER_COLORS[log.provider] ?? 'bg-paper-200 text-ink-700'}`}>
                          {log.provider}
                        </span>
                      )}
                      {/* Endpoint */}
                      {log.endpoint && (
                        <span className="inline-flex items-center rounded-md bg-paper-200 text-ink-600 px-2 py-0.5 text-xs font-mono">
                          {log.endpoint}
                        </span>
                      )}
                    </div>
                    {/* Metrics */}
                    <div className="mt-1.5 flex items-center gap-3 text-xs text-muted-500 flex-wrap">
                      <span>{log.tokens} tokens</span>
                      <span>₹{(log.cost * 83).toFixed(4)}</span>
                      <span>{log.latencyMs}ms</span>
                      {log.userId && <span>User: {log.userId.slice(0, 10)}...</span>}
                    </div>
                    {/* Error preview (always visible for errors) */}
                    {logStatus === 'error' && log.error && !isExpanded && (
                      <p className="mt-1.5 text-xs text-red-600 dark:text-red-400 truncate max-w-md">
                        {log.error.slice(0, 120)}
                      </p>
                    )}
                  </div>
                  <div className="flex flex-col items-end gap-1 flex-shrink-0">
                    <span className="text-xs text-muted-400 whitespace-nowrap">
                      {new Date(log.timestamp).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                    </span>
                    <span className="text-xs text-muted-400">{isExpanded ? '▲' : '▼'}</span>
                  </div>
                </div>

                {/* Expanded detail */}
                {isExpanded && (
                  <div className="mt-3 pt-3 border-t border-line space-y-3">
                    {/* Error body */}
                    {log.error && (
                      <div>
                        <p className="text-xs font-semibold text-red-600 mb-1">Error:</p>
                        <pre className="overflow-x-auto rounded bg-red-50 dark:bg-red-900/20 p-3 text-xs text-red-700 dark:text-red-300 font-mono whitespace-pre-wrap">
                          {log.error}
                        </pre>
                      </div>
                    )}
                    {/* Request preview */}
                    {log.requestPreview && (
                      <div>
                        <p className="text-xs font-semibold text-muted-600 mb-1">Request (prompt preview):</p>
                        <pre className="overflow-x-auto rounded bg-paper-100 dark:bg-paper-800 p-3 text-xs text-muted-700 dark:text-muted-300 font-mono whitespace-pre-wrap">
                          {log.requestPreview}
                        </pre>
                      </div>
                    )}
                    {/* Response preview */}
                    {log.responsePreview && (
                      <div>
                        <p className="text-xs font-semibold text-muted-600 mb-1">Response (preview):</p>
                        <pre className="overflow-x-auto rounded bg-paper-100 dark:bg-paper-800 p-3 text-xs text-muted-700 dark:text-muted-300 font-mono whitespace-pre-wrap">
                          {log.responsePreview}
                        </pre>
                      </div>
                    )}
                    {/* Metadata grid */}
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
                      <div className="bg-paper-100 dark:bg-paper-800 rounded p-2">
                        <span className="text-muted-500 block">Model</span>
                        <span className="text-ink-900 font-medium">{log.model}</span>
                      </div>
                      <div className="bg-paper-100 dark:bg-paper-800 rounded p-2">
                        <span className="text-muted-500 block">Latency</span>
                        <span className="text-ink-900 font-medium">{log.latencyMs}ms</span>
                      </div>
                      <div className="bg-paper-100 dark:bg-paper-800 rounded p-2">
                        <span className="text-muted-500 block">Tokens</span>
                        <span className="text-ink-900 font-medium">{log.tokens}</span>
                      </div>
                      <div className="bg-paper-100 dark:bg-paper-800 rounded p-2">
                        <span className="text-muted-500 block">Cost (USD)</span>
                        <span className="text-ink-900 font-medium">${log.cost.toFixed(6)}</span>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Pagination */}
      {logs.length > 0 && (
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
            disabled={logs.length < 30}
            className="btn-ghost-sm disabled:opacity-40"
          >
            Next →
          </button>
        </div>
      )}
    </div>
  );
}
