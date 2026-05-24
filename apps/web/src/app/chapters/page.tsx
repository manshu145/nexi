'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { Logo } from '~/components/Logo';
import { useAuth } from '~/lib/auth-context';
import { api, type ChapterSummary, type MeResponse } from '~/lib/api';

/**
 * /chapters
 *
 * The student library. Lists all published chapters for the user's
 * target exam, grouped by subject. Click a chapter to open the
 * Kindle-style reading view at /read/<exam>/<subject>/<slug>.
 */
export default function ChaptersListPage() {
  const { user, loading } = useAuth();
  const router = useRouter();

  const [me, setMe] = useState<MeResponse['user'] | null>(null);
  const [chapters, setChapters] = useState<ChapterSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);

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
      } catch (e) {
        if (cancelled) return;
        setError(e instanceof Error ? e.message : 'failed to load chapters');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [user, router]);

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

  // Group chapters by subject for tidier listing.
  const bySubject = new Map<string, ChapterSummary[]>();
  (chapters ?? []).forEach((c) => {
    const arr = bySubject.get(c.subject) ?? [];
    arr.push(c);
    bySubject.set(c.subject, arr);
  });
  const subjects = Array.from(bySubject.keys()).sort();

  return (
    <main className="mx-auto flex min-h-screen max-w-3xl flex-col px-6 pt-8 pb-16">
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
        <div className="mt-8 space-y-10">
          {subjects.map((subj) => (
            <section key={subj}>
              <h2 className="font-serif text-xl font-semibold uppercase tracking-wide text-muted-500">
                {prettySubject(subj)}
              </h2>
              <div className="mt-3 space-y-3">
                {(bySubject.get(subj) ?? []).map((c) => (
                  <Link
                    key={c.id}
                    href={`/read/${encodeURIComponent(c.exam)}/${encodeURIComponent(c.subject)}/${encodeURIComponent(c.slug)}`}
                    className="paper-card flex items-start justify-between gap-3 p-5 transition hover:bg-paper-200/40"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="text-xs text-muted-500">
                        {c.classLevel} · ~{c.estimatedReadMinutes} min read ·
                        {' '}
                        {c.sectionCount} sections
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
