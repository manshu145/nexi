'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';
import { Logo } from '~/components/Logo';
import { useAuth } from '~/lib/auth-context';
import { api, type ChapterSummary, type MeResponse } from '~/lib/api';

/**
 * /chapters
 *
 * The student library, presented as a bookshelf -- one shelf per subject,
 * chapters as paper-cards lined up on it. Clicking a chapter opens the
 * Kindle-style paginated reader at /read/<exam>/<subject>/<slug>.
 *
 * The page also surfaces a "Continue reading" call-out at the top whenever
 * the student has a saved reading position from a previous session
 * (stored in localStorage by /read/[..]/page.tsx).
 */

interface ContinueReading {
  chapterId: string;
  exam: string;
  subject: string;
  slug: string;
  title: string;
  page: number;
  totalPages: number;
}

export default function ChaptersListPage() {
  const { user, loading } = useAuth();
  const router = useRouter();

  const [me, setMe] = useState<MeResponse['user'] | null>(null);
  const [chapters, setChapters] = useState<ChapterSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [continueRow, setContinueRow] = useState<ContinueReading | null>(null);

  useEffect(() => {
    if (!loading && !user) router.replace('/signin');
  }, [user, loading, router]);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    (async () => {
      try {
        const meRes = await api.me();
        if (cancelled) return;
        setMe(meRes.user);
        if (!meRes.user.targetExam) {
          router.replace('/onboarding');
          return;
        }
        const list = await api.chapters.list({ exam: meRes.user.targetExam });
        if (cancelled) return;
        setChapters(list.chapters);

        // Look for any saved reading position (the reader writes
        // localStorage["nexi.read.<chapterId>"] = page index).
        try {
          for (const ch of list.chapters) {
            const raw = window.localStorage.getItem(`nexi.read.${ch.id}`);
            if (raw == null) continue;
            const pageIdx = Number(raw);
            if (!Number.isFinite(pageIdx) || pageIdx <= 0) continue;
            const total = 1 + ch.sectionCount + 1; // cover + sections + end
            if (pageIdx >= total - 1) continue; // already finished
            // Take the first one we find -- if there are several this is
            // not perfect, but it costs nothing and looks good in 99% of
            // cases. Last-modified ordering is a follow-up.
            setContinueRow({
              chapterId: ch.id,
              exam: ch.exam,
              subject: ch.subject,
              slug: ch.slug,
              title: ch.title,
              page: pageIdx,
              totalPages: total,
            });
            break;
          }
        } catch {
          /* ignore localStorage failures (private mode, quota) */
        }
      } catch (e) {
        if (cancelled) return;
        setError(e instanceof Error ? e.message : 'failed to load chapters');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [user, router]);

  // Group chapters by subject for the bookshelf layout.
  const shelves = useMemo(() => {
    const bySubject = new Map<string, ChapterSummary[]>();
    (chapters ?? []).forEach((c) => {
      const arr = bySubject.get(c.subject) ?? [];
      arr.push(c);
      bySubject.set(c.subject, arr);
    });
    return Array.from(bySubject.entries())
      .map(([subject, list]) => ({
        subject,
        chapters: list.slice().sort((a, b) => a.title.localeCompare(b.title)),
      }))
      .sort((a, b) => a.subject.localeCompare(b.subject));
  }, [chapters]);

  if (loading || !user) {
    return (
      <main className="flex min-h-[60vh] items-center justify-center px-6">
        <span className="inline-flex items-center gap-2 text-sm text-muted-500">
          <span className="spinner" aria-hidden="true" />
          Loading...
        </span>
      </main>
    );
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-3xl flex-col px-4 pt-6 pb-24 sm:px-6 sm:pt-8 sm:pb-16">
      <header className="flex items-start justify-between">
        <Logo />
        <Link href="/dashboard" className="btn-ghost-sm">
          Dashboard
        </Link>
      </header>

      <section className="mt-10">
        <p className="pill mb-3">Library</p>
        <h1 className="font-serif text-3xl font-semibold leading-tight text-ink-900 sm:text-4xl">
          Read first. Test after.
        </h1>
        <p className="mt-2 text-sm text-muted-500">
          Every chapter is generated and verified by 3 AIs (OpenAI, Gemini,
          Groq). Pick one and start reading.
        </p>
      </section>

      {error ? (
        <div className="banner banner-error mt-6" role="alert">
          <span>{error}</span>
        </div>
      ) : null}

      {continueRow ? (
        <Link
          href={`/read/${encodeURIComponent(continueRow.exam)}/${encodeURIComponent(continueRow.subject)}/${encodeURIComponent(continueRow.slug)}`}
          className="paper-card mt-6 flex items-center justify-between gap-3 p-5 transition hover:bg-paper-200/40"
        >
          <div className="min-w-0 flex-1">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-ember-600">
              Continue reading
            </p>
            <h2 className="font-serif mt-1 truncate text-lg text-ink-900">
              {continueRow.title}
            </h2>
            <p className="mt-1 text-xs text-muted-500">
              Page {continueRow.page} of {continueRow.totalPages - 2}
            </p>
          </div>
          <span className="shrink-0 text-base text-muted-500">→</span>
        </Link>
      ) : null}

      {chapters === null ? (
        <p className="mt-8 text-sm text-muted-500">Loading library...</p>
      ) : chapters.length === 0 ? (
        <div className="paper-card mt-8 p-6 sm:p-8">
          <p className="text-sm text-muted-500">
            No chapters published yet for{' '}
            <span className="font-medium text-ink-900">{me?.targetExam}</span>.
            New chapters will arrive here as the editorial team approves
            them. Until then, the daily MCQs draw from a starter bank.
          </p>
          <Link href="/dashboard" className="btn-ghost mt-4 inline-flex">
            Back to dashboard
          </Link>
        </div>
      ) : (
        <div className="mt-10 space-y-12">
          {shelves.map(({ subject, chapters: list }) => (
            <section key={subject}>
              <div className="flex items-baseline justify-between border-b border-ink-900/15 pb-2">
                <h2 className="font-serif text-lg font-semibold uppercase tracking-[0.12em] text-ink-900">
                  {prettySubject(subject)}
                </h2>
                <span className="text-xs text-muted-500">
                  {list.length} {list.length === 1 ? 'chapter' : 'chapters'}
                </span>
              </div>
              <div className="mt-4 space-y-3">
                {list.map((c) => (
                  <Link
                    key={c.id}
                    href={`/read/${encodeURIComponent(c.exam)}/${encodeURIComponent(c.subject)}/${encodeURIComponent(c.slug)}`}
                    className="paper-card flex items-start justify-between gap-3 p-5 transition hover:bg-paper-200/40"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="text-xs text-muted-500">
                        {c.classLevel} · ~{c.estimatedReadMinutes} min read
                        {' · '}
                        {c.sectionCount}{' '}
                        {c.sectionCount === 1 ? 'section' : 'sections'}
                      </p>
                      <h3 className="font-serif mt-1 text-lg text-ink-900">
                        {c.title}
                      </h3>
                      <p className="mt-1 line-clamp-2 text-sm text-ink-800">
                        {c.summary}
                      </p>
                    </div>
                    <span className="mt-1 shrink-0 text-sm text-muted-500">
                      →
                    </span>
                  </Link>
                ))}
              </div>
            </section>
          ))}
        </div>
      )}
    </main>
  );
}

function prettySubject(s: string): string {
  return s
    .split('-')
    .map((w) => (w[0]?.toUpperCase() ?? '') + w.slice(1))
    .join(' ');
}
