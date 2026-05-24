'use client';

import { useEffect, useState, type FormEvent } from 'react';
import Link from 'next/link';
import { EXAMS, type ExamSlug } from '@nexigrate/shared';
import { api, ApiError, type AdminUserListRow } from '~/lib/api';

/**
 * /admin/users -- Phase 20 user list.
 *
 * Page-by-page admin user search. The query is a substring match against
 * email / name / uid (server-side); the exam filter is a Firestore
 * equality. Pagination uses the createdAt cursor returned by the server.
 *
 * Bulk actions (suspend, mass-grant) live on the per-user detail page;
 * this list is read-only and exists primarily so support staff can find
 * the user they need to act on.
 */
export default function AdminUsersListPage() {
  const [rows, setRows] = useState<AdminUserListRow[]>([]);
  const [q, setQ] = useState('');
  const [exam, setExam] = useState<'all' | ExamSlug>('all');
  const [submittedQ, setSubmittedQ] = useState('');
  const [cursor, setCursor] = useState<string | null>(null);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    api.admin
      .listUsers({
        q: submittedQ || undefined,
        exam: exam === 'all' ? undefined : exam,
        limit: 25,
        beforeCreatedAt: cursor ?? undefined,
      })
      .then((res) => {
        if (cancelled) return;
        // First page replaces; later pages append.
        setRows((prev) => (cursor ? [...prev, ...res.users] : res.users));
        setNextCursor(res.nextCursor);
      })
      .catch((e: unknown) => {
        if (cancelled) return;
        setError(e instanceof ApiError ? e.message : 'failed to load users');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [submittedQ, exam, cursor]);

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    setRows([]);
    setCursor(null);
    setSubmittedQ(q.trim());
  };

  return (
    <main className="mx-auto flex max-w-6xl flex-col px-6 pt-8 pb-16">
      <header>
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-gold-600">
          Phase 20 · Operations
        </p>
        <h1 className="font-serif mt-1 text-3xl font-semibold leading-tight text-ink-900">
          Users
        </h1>
        <p className="mt-2 text-sm text-muted-500">
          Search, filter, and open per-user detail to grant credits or take
          other admin actions. The list is bounded to 25 rows per page.
        </p>
      </header>

      <form
        onSubmit={onSubmit}
        className="mt-6 flex flex-col gap-3 sm:flex-row sm:items-end"
      >
        <label className="flex-1">
          <span className="block text-xs font-medium text-muted-500">
            Search by email / name / uid
          </span>
          <input
            type="search"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="alice@example.com, Aman, etc."
            className="input mt-1"
          />
        </label>
        <label className="sm:w-48">
          <span className="block text-xs font-medium text-muted-500">Target exam</span>
          <select
            value={exam}
            onChange={(e) => {
              setExam(e.target.value as 'all' | ExamSlug);
              setRows([]);
              setCursor(null);
            }}
            className="input mt-1"
          >
            <option value="all">All exams</option>
            {EXAMS.map((ex) => (
              <option key={ex.id} value={ex.id}>
                {ex.name}
              </option>
            ))}
          </select>
        </label>
        <button type="submit" className="btn-primary sm:w-auto">
          Search
        </button>
      </form>

      {error ? (
        <div className="banner banner-error mt-6" role="alert">
          {error}
        </div>
      ) : null}

      <section className="paper-card mt-6 overflow-hidden">
        {/* Desktop table */}
        <table className="hidden w-full text-left text-sm sm:table">
          <thead className="border-b border-line bg-paper-100/50 text-xs uppercase tracking-wide text-muted-500">
            <tr>
              <th className="px-4 py-3 font-medium">Email</th>
              <th className="px-4 py-3 font-medium">Name</th>
              <th className="px-4 py-3 font-medium">Exam</th>
              <th className="px-4 py-3 font-medium">Streak</th>
              <th className="px-4 py-3 font-medium">Verified</th>
              <th className="px-4 py-3 font-medium">Joined</th>
              <th className="px-4 py-3"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line/60 text-ink-900">
            {rows.map((u) => (
              <tr key={u.id} className="hover:bg-paper-200/40">
                <td className="px-4 py-3 font-medium">{u.email || '—'}</td>
                <td className="px-4 py-3">{u.name || '—'}</td>
                <td className="px-4 py-3">{u.targetExam ?? '—'}</td>
                <td className="px-4 py-3 tabular-nums">
                  {u.currentStreak}
                  {u.bestStreak > u.currentStreak ? (
                    <span className="ml-1 text-xs text-muted-500">
                      / best {u.bestStreak}
                    </span>
                  ) : null}
                </td>
                <td className="px-4 py-3">
                  {u.isVerified ? (
                    <span className="pill pill-success">Yes</span>
                  ) : (
                    <span className="pill pill-neutral">No</span>
                  )}
                </td>
                <td className="px-4 py-3 text-xs text-muted-500">
                  {formatDate(u.createdAt)}
                </td>
                <td className="px-4 py-3 text-right">
                  <Link
                    href={`/admin/users/${encodeURIComponent(u.id)}`}
                    className="btn-ghost-sm"
                  >
                    Open
                  </Link>
                </td>
              </tr>
            ))}
            {!loading && rows.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-4 py-8 text-center text-sm text-muted-500">
                  No users match this search.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>

        {/* Mobile cards */}
        <ul className="divide-y divide-line/60 sm:hidden">
          {rows.map((u) => (
            <li key={u.id} className="px-4 py-4">
              <Link
                href={`/admin/users/${encodeURIComponent(u.id)}`}
                className="block"
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="font-medium text-ink-900">{u.email || u.name || u.id}</p>
                    {u.name && u.email ? (
                      <p className="text-xs text-muted-500">{u.name}</p>
                    ) : null}
                  </div>
                  <span className="text-xs text-muted-500">{formatDate(u.createdAt)}</span>
                </div>
                <div className="mt-2 flex flex-wrap gap-2 text-xs">
                  <span className="pill">{u.targetExam ?? 'no exam'}</span>
                  <span className="pill">streak {u.currentStreak}</span>
                  {u.isVerified ? (
                    <span className="pill pill-success">verified</span>
                  ) : null}
                </div>
              </Link>
            </li>
          ))}
        </ul>
      </section>

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

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString('en-IN', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    });
  } catch {
    return iso.slice(0, 10);
  }
}
