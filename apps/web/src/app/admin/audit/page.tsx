'use client';

import { useEffect, useState } from 'react';
import { api, type AuditLogEntry, type AuditAction } from '~/lib/api';

export default function AdminAuditPage() {
  const [entries, setEntries] = useState<AuditLogEntry[]>([]);
  const [actions, setActions] = useState<AuditAction[]>([]);
  const [filterAction, setFilterAction] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadAudit();
    loadActions();
  }, []);

  async function loadAudit(action?: string) {
    try {
      setLoading(true);
      const opts: { action?: AuditAction; limit?: number } = { limit: 50 };
      if (action) opts.action = action as AuditAction;
      const res = await api.admin.listAuditLog(opts);
      setEntries(res.entries);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load audit log');
    } finally {
      setLoading(false);
    }
  }

  async function loadActions() {
    try {
      const res = await api.admin.listAuditActions();
      setActions(res.actions);
    } catch { /* ignore */ }
  }

  function handleFilterChange(val: string) {
    setFilterAction(val);
    loadAudit(val || undefined);
  }

  return (
    <div>
      <h1 className="font-serif text-2xl font-bold text-ink-900">Audit Log</h1>
      <p className="text-sm text-muted-500 mt-1">Every admin action is recorded here.</p>

      {/* Filter */}
      <div className="mt-4">
        <select className="input w-64" value={filterAction} onChange={e => handleFilterChange(e.target.value)}>
          <option value="">All actions</option>
          {actions.map(a => <option key={a} value={a}>{a}</option>)}
        </select>
      </div>

      {error && <div className="banner banner-error mt-4">{error}</div>}

      {/* Entries */}
      <div className="mt-4 space-y-2">
        {loading ? (
          <div className="flex items-center gap-2 text-sm text-muted-500"><span className="spinner" /> Loading...</div>
        ) : entries.length === 0 ? (
          <p className="text-sm text-muted-500 py-8 text-center">No audit entries found.</p>
        ) : entries.map(entry => (
          <div key={entry.id} className="paper-card p-4">
            <div className="flex items-center justify-between">
              <span className="text-xs font-mono bg-paper-200 px-2 py-0.5 rounded text-ink-800">{entry.action}</span>
              <span className="text-xs text-muted-400">{new Date(entry.occurredAt).toLocaleString('en-IN')}</span>
            </div>
            <div className="mt-2 flex items-center gap-4 text-xs text-muted-500">
              <span>Actor: <span className="font-medium text-ink-800">{entry.actorEmail ?? entry.actorUid}</span></span>
              {entry.targetId && <span>Target: <span className="font-mono">{entry.targetId}</span></span>}
            </div>
            {Object.keys(entry.metadata).length > 0 && (
              <pre className="mt-2 text-[10px] bg-paper-200 rounded p-2 overflow-x-auto text-muted-500">
                {JSON.stringify(entry.metadata, null, 2)}
              </pre>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
