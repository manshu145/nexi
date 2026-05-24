'use client';

import { useEffect, useState } from 'react';
import { api, ApiError, type AuditAction, type AuditLogEntry } from '~/lib/api';

/**
 * /admin/audit -- Phase 20 audit log viewer.
 *
 * Read-only feed of every state-changing admin action. Filter by action
 * (grant_credits, suspend, etc.) and by actor uid. Scrolls to older
 * entries with a cursor of the last seen occurredAt timestamp.
 */
export default function AdminAuditPage() {
  const [entries, setEntries] = useState<AuditLogEntry[]>([]);
  const [actions, setActions] = useState<AuditAction[]>([]);
  const [filterAction, setFilterAction] = useState<'all' | AuditAction>('all');
  const [actorUid, setActorUid] = useState('');
  const [cursor, setCursor] = useState<string | null>(null);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Static action catalogue (fetched once).
  useEffect(() => {
    let cancelled = false;
    api.admin
      .listAuditActions()
      .then((res) => {
        if (!cancelled) setActions(res.actions);
      })
      .catch(() => {
        /* not critical -- the dropdown just stays "All" */
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // Refetch on filter change.
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    api.admin
      .listAuditLog({
        action: filterAction === 'all' ? undefined : filterAction,
        actorUid: actorUid.trim() || undefined,
        limit: 50,
        beforeOccurredAt: cursor ?? undefined,
      })
      .then((res) => {
        if (cancelled) return;
        setEntries((prev) => (cursor ? [...prev, ...res.entries] : res.entries));
        setNextCursor(res.nextCursor);
      })
      .catch((e: unknown) => {
        if (cancelled) return;
        setError(e instanceof ApiError ? e.message : 'failed to load audit log');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [filterAction, actorUid, cursor]);

  return (
    <main className="mx-auto flex max-w-6xl flex-col px-6 pt-8 pb-16">
      <header>
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-gold-600">
          Phase 20 · Audit
        </p>
        <h1 className="font-serif mt-1 text-3xl font-semibold leading-tight text-ink-900">
          Audit log
        </h1>
        <p className="mt-2 text-sm text-muted-500">
          Append-only record of admin actions. Use this to trace any
          credit grant, content approval, or admin role change back to a
          named operator.
        </p>
      </header>

      <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:items-end">
        <label className="sm:w-72">
          <span className="block text-xs font-medium text-muted-500">Action</span>
          <select
            value={filterAction}
            onChange={(e) => {
              setFilterAction(e.target.value as 'all' | AuditAction);
              setEntries([]);
              setCursor(null);
            }}
            className="input mt-1"
          >
            <option value="all">All actions</option>
            {actions.map((a) => (
              <option key={a} value={a}>
                {prettyAction(a)}
              </option>
            ))}
          </select>
        </label>
        <label className="flex-1">
          <span className="block text-xs font-medium text-muted-500">Actor uid</span>
          <input
            type="search"
            value={actorUid}
            onChange={(e) => setActorUid(e.target.value)}
            onBlur={() => {
              setEntries([]);
              setCursor(null);
            }}
            placeholder="Filter by admin uid"
            className="input mt-1"
          />
        </label>
      </div>

      {error ? (
        <div className="banner banner-error mt-6" role="alert">
          {error}
        </div>
      ) : null}

      <ul className="mt-6 space-y-3">
        {entries.length === 0 && !loading ? (
          <li className="paper-card p-6 text-sm text-muted-500">
            No audit entries match this filter.
          </li>
        ) : null}
        {entries.map((e) => (
          <li key={e.id} className="paper-card p-4">
            <div className="flex flex-wrap items-baseline justify-between gap-3">
              <p className="font-medium text-ink-900">{prettyAction(e.action)}</p>
              <span className="text-xs text-muted-500">
                {formatDateTime(e.occurredAt)}
              </span>
            </div>
            <p className="mt-1 text-xs text-muted-500">
              by {e.actorEmail ?? '(unknown)'} ·{' '}
              <code className="text-[0.7rem]">{e.actorUid}</code>
              {e.targetId ? (
                <>
                  {' · target '}
                  <code className="text-[0.7rem]">{e.targetId}</code>
                </>
              ) : null}
            </p>
            {Object.keys(e.metadata ?? {}).length > 0 ? (
              <pre className="mt-2 overflow-x-auto rounded bg-paper-200 p-2 text-[0.7rem] leading-relaxed">
                {JSON.stringify(e.metadata, null, 2)}
              </pre>
            ) : null}
          </li>
        ))}
      </ul>

      {nextCursor ? (
        <div className="mt-6 flex justify-center">
          <button
            type="button"
            disabled={loading}
            className="btn-ghost"
            onClick={() => setCursor(nextCursor)}
          >
            {loading ? 'Loading…' : 'Load older'}
          </button>
        </div>
      ) : null}
    </main>
  );
}

function prettyAction(a: AuditAction | string): string {
  return a
    .replace(/^admin\./, '')
    .replace(/\./g, ' · ')
    .replace(/_/g, ' ');
}

function formatDateTime(iso: string): string {
  try {
    return new Date(iso).toLocaleString('en-IN', {
      day: '2-digit',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
  } catch {
    return iso;
  }
}
