'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { type Chapter } from '@nexigrate/shared';
import { Logo } from '~/components/Logo';
import { Markdown } from '~/components/Markdown';
import { useAuth } from '~/lib/auth-context';
import { api } from '~/lib/api';

/**
 * /read/[exam]/[subject]/[chapter]
 *
 * Kindle-style reading view. The student lands here, reads the chapter
 * top-to-bottom, then taps "Mark as read" at the bottom -- which:
 *   1. POSTs to /v1/chapters/{id}/read (idempotent on user+chapter)
 *   2. Flips the local UI state to "Read"
 *   3. Reveals the "Take chapter test" CTA, which routes to /test/{slug}
 *      (test page lands in the next phase; for now it just shows the
 *      chapter summary to the user).
 */
export default function ReadChapterPage() {
  const { user, loading } = useAuth();
  const router = useRouter();
  const params = useParams<{ exam: string; subject: string; chapter: string }>();

  const examSlug = params?.exam ?? '';
  const subjectSlug = params?.subject ?? '';
  const chapterSlug = params?.chapter ?? '';
  const chapterDocId = `${examSlug}-${subjectSlug}-${chapterSlug}`;

  const [chapter, setChapter] = useState<Chapter | null>(null);
  const [isRead, setIsRead] = useState(false);
  const [busy, setBusy] = useState(true);
  const [marking, setMarking] = useState(false);
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
        const res = await api.chapters.get(chapterDocId);
        if (cancelled) return;
        setChapter(res.chapter);
        setIsRead(res.isRead);
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : 'failed to load chapter');
        }
      } finally {
        if (!cancelled) setBusy(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [user, chapterDocId]);

  async function onMarkRead() {
    if (!chapter) return;
    setMarking(true);
    setError(null);
    try {
      await api.chapters.markRead(chapter.id);
      setIsRead(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'mark-as-read failed');
    } finally {
      setMarking(false);
    }
  }

  if (loading || (busy && !chapter)) {
    return (
      <main className="flex min-h-[60vh] items-center justify-center px-6">
        <span className="inline-flex items-center gap-2 text-sm text-muted-500">
          <span className="spinner" aria-hidden="true" />
          Loading chapter…
        </span>
      </main>
    );
  }

  if (error && !chapter) {
    return (
      <main className="mx-auto max-w-3xl px-6 py-16 text-center">
        <p className="pill mb-3">Not found</p>
        <h1 className="font-serif text-2xl font-semibold text-ink-900">
          We couldn’t open this chapter
        </h1>
        <p className="mt-2 text-sm text-muted-500">{error}</p>
        <Link href="/chapters" className="btn-primary mt-6 inline-flex">
          Back to library
        </Link>
      </main>
    );
  }
  if (!chapter) return null;

  return (
    <div
      className="mx-auto max-w-2xl px-6 pt-6 pb-24"
      style={{
        fontFamily:
          'var(--font-serif), "Lora", "Georgia", "Cambria", "Times New Roman", serif',
      }}
    >
      <header className="flex items-start justify-between gap-4">
        <Logo />
        <Link href="/chapters" className="btn-ghost-sm">
          Library
        </Link>
      </header>

      <article className="mt-10">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-ember-600">
          {chapter.subject} · {chapter.exam}
        </p>
        <h1 className="font-serif mt-3 text-3xl font-semibold leading-tight text-ink-900 sm:text-4xl">
          {chapter.title}
        </h1>
        <p className="mt-3 text-sm text-muted-500">
          <span className="tabular-nums">{chapter.readingTimeMinutes} min read</span>
          {' · '}
          {chapter.sections.length} section
          {chapter.sections.length === 1 ? '' : 's'}
          {' · '}
          source: <span className="text-ink-800">{chapter.source}</span>
        </p>
        <p className="font-serif mt-5 text-lg italic text-ink-800">
          {chapter.summary}
        </p>

        <hr className="mt-6 border-line" />

        {chapter.sections.map((s, i) => (
          <section key={i} className="mt-8">
            <h2 className="font-serif text-2xl font-semibold leading-snug text-ink-900">
              {s.heading}
            </h2>
            <div className="mt-3">
              <Markdown source={s.body} />
            </div>
          </section>
        ))}

        <hr className="mt-12 border-line" />

        {/* Footer actions */}
        <div className="mt-8">
          {error ? (
            <div className="banner banner-error mb-4" role="alert">
              <span>{error}</span>
            </div>
          ) : null}

          {isRead ? (
            <div className="paper-card p-5">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-ember-600">
                Read · {chapter.readingTimeMinutes} min
              </p>
              <h3 className="font-serif mt-2 text-xl font-semibold text-ink-900">
                Ready to test what you’ve learned?
              </h3>
              <p className="mt-2 text-sm text-ink-800">
                Take the chapter test. Pass it and earn credits, exactly
                like the daily MCQ. We pull questions from this chapter only.
              </p>
              <div className="mt-5 flex flex-wrap gap-3">
                <Link
                  href={`/test/${encodeURIComponent(chapter.chapterSlug)}?exam=${encodeURIComponent(
                    chapter.exam,
                  )}&subject=${encodeURIComponent(chapter.subject)}`}
                  className="btn-primary"
                >
                  Take chapter test
                </Link>
                <Link href="/chapters" className="btn-ghost">
                  Back to library
                </Link>
              </div>
            </div>
          ) : (
            <div className="paper-card p-5 text-center">
              <p className="text-sm text-ink-800">
                Done reading? Mark this chapter complete to unlock the test.
              </p>
              <button
                type="button"
                onClick={onMarkRead}
                disabled={marking}
                className="btn-primary mt-4"
              >
                {marking ? 'Saving…' : 'Mark as read'}
              </button>
            </div>
          )}
        </div>
      </article>
    </div>
  );
}
