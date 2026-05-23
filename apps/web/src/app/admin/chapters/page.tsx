'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  LIVE_EXAMS,
  SOON_EXAMS,
  type Chapter,
  type ChapterStatus,
} from '@nexigrate/shared';
import { api } from '~/lib/api';

/**
 * /admin/chapters
 *
 * Authoring queue for the chapter library.
 *
 *   - Filter pills: Draft / Published / Archived / All
 *   - "New chapter" button -> /admin/chapters/new
 *   - List of chapter rows; click a row to open the editor
 *
 * The list query is server-paged at 200 max; we display the first 200 and
 * show a hint when truncated. A real pager lands when we have >200
 * chapters, which is not for a while.
 */
export default function AdminChaptersPage() {
  const router = useRouter();
  const [filter, setFilter] = useState<ChapterStatus | 'all'>('draft');
  const [examFilter, setExamFilter] = useState<string>('');
  const [chapters, setChapters] = useState<Chapter[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const opts: Parameters<typeof api.admin.chapters.list>[0] = { limit: 200 };
      if (filter !== 'all') opts.status = filter;
      if (examFilter) opts.exam = examFilter;
      const res = await api.admin.chapters.list(opts);
      setChapters(res.chapters ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'failed to load chapters');
    } finally {
      setLoading(false);
    }
  }, [filter, examFilter]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return (
    <main className="mx-auto flex max-w-5xl flex-col px-6 py-10">
      <section className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <p className="pill mb-3">Admin</p>
          <h1 className="font-serif text-3xl font-semibold leading-tight text-ink-900 sm:text-4xl">
            Chapters
          </h1>
          <p className="mt-2 max-w-xl text-sm text-muted-500">
            Reading material the student goes through before each chapter
            test fires. Drafts are invisible to students until you publish.
          </p>
        </div>
        <button
          type="button"
          onClick={() => router.push('/admin/chapters/new')}
          className="btn-primary"
        >
          + New chapter
        </button>
      </section>

      <section className="mt-8 flex flex-wrap items-center gap-3">
        <div className="flex flex-wrap items-center gap-2">
          {(['draft', 'published', 'archived', 'all'] as const).map((f) => (
            <button
              key={f}
              type="button"
              onClick={() => setFilter(f)}
              className={
                filter === f
                  ? 'rounded-full bg-ink-900 px-4 py-1.5 text-sm font-medium text-paper-100'
                  : 'rounded-full bg-paper-200 px-4 py-1.5 text-sm font-medium text-ink-800 hover:bg-paper-300'
              }
            >
              {f === 'all' ? 'All' : f[0]?.toUpperCase() + f.slice(1)}
            </button>
          ))}
        </div>
        <label className="ml-auto block text-sm">
          <span className="sr-only">Exam</span>
          <select
            value={examFilter}
            onChange={(e) => setExamFilter(e.target.value)}
            className="input w-56"
          >
            <option value="">All exams</option>
            {LIVE_EXAMS.map((e) => (
              <option key={e.id} value={e.id}>
                {e.name}
              </option>
            ))}
            {SOON_EXAMS.map((e) => (
              <option key={e.id} value={e.id}>
                {e.name} (coming soon)
              </option>
            ))}
          </select>
        </label>
        <button
          type="button"
          onClick={() => void refresh()}
          className="btn-ghost-sm"
          disabled={loading}
        >
          {loading ? 'Loading...' : 'Refresh'}
        </button>
      </section>

      {error ? (
        <div className="banner banner-error mt-6" role="alert">
          <span className="flex-1">{error}</span>
          <button
            type="button"
            className="text-xs underline"
            onClick={() => void refresh()}
          >
            retry
          </button>
        </div>
      ) : null}

      <section className="mt-6 space-y-3">
        {!loading && !error && chapters.length === 0 ? (
          <p className="text-sm text-muted-500">
            No chapters in <strong>{filter}</strong>
            {examFilter ? <> for <strong>{examFilter}</strong></> : null}. Click
            "+ New chapter" above to author one.
          </p>
        ) : null}

        {chapters.map((ch) => (
          <Link
            key={ch.id}
            href={`/admin/chapters/${encodeURIComponent(ch.id)}`}
            className="paper-card block px-5 py-4 transition hover:-translate-y-0.5"
          >
            <div className="flex flex-wrap items-center gap-2 text-xs text-muted-500">
              <StatusPill status={ch.status} />
              <span className="font-medium uppercase tracking-wide">
                {ch.exam} · {ch.subject} · {ch.chapterSlug}
              </span>
              {ch.classLevel ? (
                <span className="rounded bg-paper-200 px-2 py-0.5 font-medium text-ink-800">
                  {ch.classLevel}
                </span>
              ) : null}
              <span className="ml-auto tabular-nums">
                {ch.readingTimeMinutes} min · {ch.sections.length} section
                {ch.sections.length === 1 ? '' : 's'}
              </span>
            </div>
            <p className="font-serif mt-2 text-base font-semibold text-ink-900">
              {ch.title}
            </p>
            <p className="mt-1 line-clamp-2 text-sm text-ink-800">{ch.summary}</p>
          </Link>
        ))}
      </section>
    </main>
  );
}

function StatusPill({ status }: { status: ChapterStatus }) {
  if (status === 'published') return <span className="pill pill-success">published</span>;
  if (status === 'archived') return <span className="pill pill-warn">archived</span>;
  return <span className="pill pill-neutral">draft</span>;
}
