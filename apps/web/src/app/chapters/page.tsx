'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { EXAM_BY_SLUG, type Chapter } from '@nexigrate/shared';
import { Logo } from '~/components/Logo';
import { useAuth } from '~/lib/auth-context';
import { api } from '~/lib/api';

/**
 * /chapters
 *
 * Student-facing chapter library for the user's target exam. Lists all
 * published chapters in display order. Each row links to /read/{exam}/
 * {subject}/{chapter} -- which is the Kindle-style reading view.
 *
 * Today this is a flat list grouped only by display order. When we have
 * 30+ chapters per exam we'll fold them under collapsible Subject
 * headings; for now flat scrolls fine.
 */
export default function ChaptersPage() {
  const { user, loading } = useAuth();
  const router = useRouter();

  const [chapters, setChapters] = useState<(Chapter & { isRead: boolean })[]>([]);
  const [exam, setExam] = useState<string | null>(null);
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!loading && !user) router.replace('/signin');
  }, [user, loading, router]);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    (async () => {
      setBusy(true);
      setError(null);
      try {
        const res = await api.chapters.list({});
        if (cancelled) return;
        setChapters(res.chapters);
        setExam(res.exam);
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : 'failed to load chapters');
        }
      } finally {
        if (!cancelled) setBusy(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [user]);

  const examName = exam ? EXAM_BY_SLUG.get(exam as never)?.name ?? exam : null;
  const total = chapters.length;
  const read = chapters.filter((c) => c.isRead).length;

  if (loading || !user) {
    return (
      <main className="flex min-h-[60vh] items-center justify-center px-6">
        <span className="inline-flex items-center gap-2 text-sm text-muted-500">
          <span className="spinner" aria-hidden="true" />
          Loading…
        </span>
      </main>
    );
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-3xl flex-col px-6 pt-8 pb-16">
      <header className="flex items-start justify-between">
        <Logo />
        <button
          type="button"
          onClick={() => router.push('/dashboard')}
          className="btn-ghost-sm"
        >
          Back to dashboard
        </button>
      </header>

      <section className="mt-10">
        <p className="pill mb-3">Library</p>
        <h1 className="font-serif text-3xl font-semibold leading-tight text-ink-900 sm:text-4xl">
          Read first, then test
        </h1>
        {examName ? (
          <p className="mt-2 text-sm text-muted-500">
            Showing chapters for{' '}
            <span className="font-medium text-ink-800">{examName}</span>
            {total > 0 ? (
              <>
                {' · '}
                <span className="tabular-nums">{read}/{total}</span> read
              </>
            ) : null}
          </p>
        ) : null}
      </section>

      {error ? (
        <div className="banner banner-error mt-6" role="alert">
          <span>{error}</span>
        </div>
      ) : null}

      {busy ? (
        <p className="mt-8 inline-flex items-center gap-2 text-sm text-muted-500">
          <span className="spinner" aria-hidden="true" />
          Loading chapters…
        </p>
      ) : !error && chapters.length === 0 ? (
        <div className="paper-card mt-8 p-6 text-center">
          <p className="font-serif text-xl font-semibold text-ink-900">
            No chapters yet
          </p>
          <p className="mt-2 text-sm text-muted-500">
            Our team is still authoring content for{' '}
            {examName ?? 'your exam'}. New chapters land here as they're
            published.
          </p>
        </div>
      ) : (
        <ol className="mt-8 space-y-3">
          {chapters.map((ch) => (
            <li key={ch.id}>
              <Link
                href={`/read/${encodeURIComponent(ch.exam)}/${encodeURIComponent(
                  ch.subject,
                )}/${encodeURIComponent(ch.chapterSlug)}`}
                className="paper-card block px-5 py-4 transition hover:-translate-y-0.5"
              >
                <div className="flex flex-wrap items-center gap-2 text-xs text-muted-500">
                  {ch.isRead ? (
                    <span className="pill pill-success">Read</span>
                  ) : (
                    <span className="pill pill-neutral">Not read</span>
                  )}
                  <span className="font-medium uppercase tracking-wide">
                    {ch.subject}
                  </span>
                  {ch.classLevel ? (
                    <span className="rounded bg-paper-200 px-2 py-0.5 font-medium text-ink-800">
                      {prettyClass(ch.classLevel)}
                    </span>
                  ) : null}
                  <span className="ml-auto tabular-nums">
                    {ch.readingTimeMinutes} min
                  </span>
                </div>
                <p className="font-serif mt-2 text-base font-semibold text-ink-900">
                  {ch.title}
                </p>
                <p className="mt-1 line-clamp-2 text-sm text-ink-800">
                  {ch.summary}
                </p>
              </Link>
            </li>
          ))}
        </ol>
      )}
    </main>
  );
}

function prettyClass(c: NonNullable<Chapter['classLevel']>): string {
  switch (c) {
    case 'class-8':
      return 'Class 8';
    case 'class-9':
      return 'Class 9';
    case 'class-10':
      return 'Class 10';
    case 'class-11':
      return 'Class 11';
    case 'class-12':
      return 'Class 12';
    case 'graduation':
      return 'Graduation';
    case 'post-graduation':
      return 'Post-graduation';
    default:
      return c;
  }
}
