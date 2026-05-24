'use client';

import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { PublishedChapter } from '~/lib/api';
import { Logo } from '~/components/Logo';
import { VisualizeButton } from '~/components/AIVisualization';
import { useAuth } from '~/lib/auth-context';
import { api } from '~/lib/api';

/**
 * /read/<exam>/<subject>/<slug>
 *
 * True Kindle-style paginated reader (Phase 10b).
 *
 * Each page is a single section. The student flips with:
 *   - Keyboard: ArrowLeft / ArrowRight / Space / J / K
 *   - Tap zones: left third = back, right two-thirds = forward
 *   - Footer arrows
 *
 * Page sequence is [cover, ...sections, end]. The cover is a typeset
 * title page (like opening a book), the end is a brief outro that
 * routes the student to the daily MCQ or back to the library.
 *
 * Reading position is persisted to localStorage per-chapter so a refresh
 * or accidental close lands the student back on the same page.
 *
 * Design principles:
 *   - Lora serif body, generous line-height, narrow column.
 *   - Drop cap on the first paragraph of every section.
 *   - Justified text + auto-hyphenation.
 *   - Internal scroll inside a single page (rather than the document
 *     itself growing) so flipping always lands at the top of the next page.
 *   - We never inject HTML from AI output -- a tiny inline markdown renderer
 *     handles **bold** and `code` only.
 */
export default function ChapterReadPage() {
  const params = useParams<{ exam: string; subject: string; slug: string }>();
  const exam = params?.exam ?? '';
  const subject = params?.subject ?? '';
  const slug = params?.slug ?? '';

  const { user, loading } = useAuth();
  const router = useRouter();

  const [chapter, setChapter] = useState<PublishedChapter | null>(null);
  const [isRead, setIsRead] = useState(false);
  const [markReadBusy, setMarkReadBusy] = useState(false);
  const [markReadError, setMarkReadError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(0);
  const pageRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!loading && !user) router.replace('/signin');
  }, [user, loading, router]);

  const load = useCallback(async () => {
    if (!user || !exam || !subject || !slug) return;
    try {
      setError(null);
      const res = await api.chapters.get(exam, subject, slug);
      setChapter(res.chapter);
      setIsRead(!!res.isRead);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'failed to load chapter');
    }
  }, [user, exam, subject, slug]);

  const onMarkRead = useCallback(async () => {
    if (!chapter) return;
    try {
      setMarkReadBusy(true);
      setMarkReadError(null);
      await api.chapters.markRead(chapter.exam, chapter.subject, chapter.slug);
      setIsRead(true);
    } catch (e) {
      setMarkReadError(e instanceof Error ? e.message : 'could not mark as read');
    } finally {
      setMarkReadBusy(false);
    }
  }, [chapter]);

  useEffect(() => {
    void load();
  }, [load]);

  // Number of pages = 1 (cover) + N sections + 1 (end).
  const totalPages = useMemo(
    () => (chapter ? 1 + chapter.sections.length + 1 : 0),
    [chapter],
  );

  // Storage key for persisting the reading position. Keyed by
  // (chapter.id) so two devices opened to the same chapter agree.
  const storageKey = useMemo(
    () => (chapter ? `nexi.read.${chapter.id}` : null),
    [chapter],
  );

  // Restore last page on mount (after chapter loads).
  useEffect(() => {
    if (!storageKey || totalPages === 0) return;
    try {
      const raw = window.localStorage.getItem(storageKey);
      const idx = raw == null ? 0 : Math.max(0, Math.min(totalPages - 1, Number(raw)));
      setPage(Number.isFinite(idx) ? idx : 0);
    } catch {
      setPage(0);
    }
  }, [storageKey, totalPages]);

  // Persist current page whenever it changes.
  useEffect(() => {
    if (!storageKey) return;
    try {
      window.localStorage.setItem(storageKey, String(page));
    } catch {
      /* ignore quota / private-mode failures */
    }
  }, [page, storageKey]);

  // Whenever we flip pages, scroll the page container back to the top so
  // the next section starts at its first line, not where the previous
  // one was scrolled to.
  useEffect(() => {
    pageRef.current?.scrollTo({ top: 0, behavior: 'auto' });
  }, [page]);

  const goPrev = useCallback(() => {
    setPage((p) => Math.max(0, p - 1));
  }, []);
  const goNext = useCallback(() => {
    setPage((p) => Math.min(totalPages - 1, p + 1));
  }, [totalPages]);

  // Keyboard navigation. Don't intercept while the user is typing in
  // a form (e.g. a future highlight/note editor) -- guard on target.
  useEffect(() => {
    if (!chapter) return;
    function isTyping(t: EventTarget | null): boolean {
      if (!t) return false;
      if (!(t instanceof HTMLElement)) return false;
      const tag = t.tagName.toLowerCase();
      return tag === 'input' || tag === 'textarea' || t.isContentEditable;
    }
    function onKey(ev: KeyboardEvent) {
      if (isTyping(ev.target)) return;
      switch (ev.key) {
        case 'ArrowLeft':
        case 'k':
        case 'K':
          ev.preventDefault();
          goPrev();
          break;
        case 'ArrowRight':
        case ' ':
        case 'j':
        case 'J':
          ev.preventDefault();
          goNext();
          break;
        case 'Home':
          ev.preventDefault();
          setPage(0);
          break;
        case 'End':
          ev.preventDefault();
          setPage(totalPages - 1);
          break;
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [chapter, goPrev, goNext, totalPages]);

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

  if (error) {
    return (
      <main className="mx-auto max-w-2xl px-6 py-10">
        <div className="banner banner-error" role="alert">
          <span className="flex-1">{error}</span>
          <button
            type="button"
            className="text-xs underline"
            onClick={() => void load()}
          >
            retry
          </button>
        </div>
        <Link href="/chapters" className="btn-ghost mt-4 inline-flex">
          Back to library
        </Link>
      </main>
    );
  }

  if (!chapter) {
    return (
      <main className="flex min-h-[60vh] items-center justify-center px-6">
        <span className="inline-flex items-center gap-2 text-sm text-muted-500">
          <span className="spinner" aria-hidden="true" />
          Opening chapter...
        </span>
      </main>
    );
  }

  const sortedSections = [...chapter.sections].sort((a, b) => a.order - b.order);
  const isCover = page === 0;
  const isEnd = page === totalPages - 1;
  const sectionIndex = isCover || isEnd ? -1 : page - 1;
  const currentSection = sectionIndex >= 0 ? sortedSections[sectionIndex] : null;

  // Progress bar fill -- 0% on cover, 100% on the end page.
  const progressPct = totalPages <= 1 ? 0 : (page / (totalPages - 1)) * 100;

  return (
    <div className="kindle-frame">
      {/* Subtle top header. Inside the frame so it scrolls with content
          on overflow but stays at top on a single-page view. */}
      <header className="mx-auto flex w-full max-w-prose items-center justify-between px-6 pt-5 sm:px-8">
        <Logo />
        <Link href="/chapters" className="btn-ghost-sm">
          Library
        </Link>
      </header>

      {/*
       * Tap zones for mobile / non-keyboard flipping.
       *
       * Rendered ONLY on cover + section pages. The end page has CTAs
       * (Take chapter test / Daily MCQ / Library) inside the article body,
       * and a fixed-positioned tap zone would intercept those clicks.
       * Header is cleared via `top: 4rem` in CSS so the "Library" link
       * in the top-right header stays clickable on every page.
       */}
      {!isEnd ? (
        <>
          <button
            type="button"
            aria-label="Previous page"
            className="kindle-tap kindle-tap-left"
            onClick={goPrev}
            tabIndex={-1}
          />
          <button
            type="button"
            aria-label="Next page"
            className="kindle-tap kindle-tap-right"
            onClick={goNext}
            tabIndex={-1}
          />
        </>
      ) : null}

      {/* The reading column. */}
      <article
        ref={pageRef}
        className="kindle-page reader"
        aria-live="polite"
      >
        {isCover ? (
          <div className="kindle-cover">
            <p className="kindle-cover-eyebrow">
              {chapter.exam} · {prettySubject(chapter.subject)} · {chapter.classLevel}
            </p>
            <h1 className="kindle-cover-title">{chapter.title}</h1>
            <p className="kindle-cover-summary">{chapter.summary}</p>
            <div className="kindle-cover-rule" aria-hidden="true" />
            <p className="kindle-cover-meta">
              ~{chapter.estimatedReadMinutes} min read
            </p>
            <p className="kindle-cover-meta">Source: {chapter.source}</p>
          </div>
        ) : isEnd ? (
          <div className="kindle-end">
            <p className="text-xs uppercase tracking-[0.18em] text-muted-500">
              End of chapter
            </p>
            <h2 className="font-serif mt-3 text-3xl font-semibold text-ink-900">
              {chapter.title}
            </h2>
            <p className="mt-4 max-w-md text-ink-800">
              You&apos;ve finished reading. Mark it complete and take the
              chapter test -- {countSuggestion(chapter.estimatedReadMinutes)}.
            </p>
            {markReadError ? (
              <p className="mt-3 text-xs text-ember-600" role="alert">
                {markReadError}
              </p>
            ) : null}
            <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
              {isRead ? (
                <span className="pill pill-success">Marked as read</span>
              ) : (
                <button
                  type="button"
                  onClick={onMarkRead}
                  disabled={markReadBusy}
                  className="btn-ghost"
                >
                  {markReadBusy ? 'Marking...' : 'Mark as read'}
                </button>
              )}
              <Link
                href={`/test/${encodeURIComponent(chapter.exam)}/${encodeURIComponent(chapter.subject)}/${encodeURIComponent(chapter.slug)}`}
                className="btn-primary"
              >
                Take chapter test
              </Link>
              <Link href="/mcq" className="btn-ghost">
                Daily MCQ
              </Link>
              <Link href="/chapters" className="btn-ghost">
                Library
              </Link>
            </div>
          </div>
        ) : currentSection ? (
          <section>
            <h2 className="reader-heading font-serif">{currentSection.heading}</h2>
            <div className="reader-body">{renderBody(currentSection.body)}</div>
            <VisualizeButton
              sectionText={currentSection.body}
              sectionHeading={currentSection.heading}
            />
          </section>
        ) : null}
      </article>

      {/* Footer toolbar with page indicator + flip arrows + progress bar. */}
      <div className="kindle-toolbar" role="navigation" aria-label="Reader navigation">
        <div
          className="kindle-progress"
          style={{ width: `${progressPct}%` }}
          aria-hidden="true"
        />
        <button
          type="button"
          onClick={goPrev}
          disabled={page === 0}
          aria-label="Previous page"
        >
          ←
        </button>
        <span aria-live="polite">
          {isCover
            ? 'Cover'
            : isEnd
              ? 'End'
              : `Page ${page} of ${totalPages - 2}`}
        </span>
        <button
          type="button"
          onClick={goNext}
          disabled={page >= totalPages - 1}
          aria-label="Next page"
        >
          →
        </button>
      </div>
    </div>
  );
}

function prettySubject(s: string): string {
  return s
    .split('-')
    .map((w) => (w[0]?.toUpperCase() ?? '') + w.slice(1))
    .join(' ');
}

/**
 * Tiny helper for the end-of-chapter outro that suggests a question count.
 * Read time isn't a perfect signal but it's the only chapter-level metric
 * we have today; longer chapter -> longer test in the student's mind.
 */
function countSuggestion(estReadMinutes: number): string {
  if (estReadMinutes <= 6) return '10 questions, 10 minutes';
  if (estReadMinutes <= 12) return '10 questions, 10 minutes';
  return '10-15 questions, ~15 minutes';
}

/**
 * Lightweight markdown rendering for a section body.
 *
 * Splits on blank lines into paragraphs, renders **bold** and `code`,
 * and applies a drop cap to the first paragraph of every section.
 * Intentionally does NOT use a markdown library and never injects HTML.
 */
function renderBody(body: string): React.ReactNode {
  const paragraphs = body.split(/\n\s*\n/).filter((p) => p.trim().length > 0);
  return paragraphs.map((p, i) => {
    const inline = renderInline(p.trim());
    if (i === 0) {
      return (
        <p key={i} className="reader-paragraph reader-dropcap">
          {inline}
        </p>
      );
    }
    return (
      <p key={i} className="reader-paragraph">
        {inline}
      </p>
    );
  });
}

function renderInline(text: string): React.ReactNode[] {
  const out: React.ReactNode[] = [];
  let key = 0;
  const re = /(\*\*([^*]+)\*\*)|(`([^`]+)`)/g;
  let lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) {
    if (m.index > lastIndex) {
      out.push(text.slice(lastIndex, m.index));
    }
    if (m[1]) {
      out.push(<strong key={`b${key++}`}>{m[2]}</strong>);
    } else if (m[3]) {
      out.push(
        <code
          key={`c${key++}`}
          className="rounded bg-paper-200 px-1.5 py-0.5 font-mono text-[0.92em]"
        >
          {m[4]}
        </code>,
      );
    }
    lastIndex = m.index + m[0].length;
  }
  if (lastIndex < text.length) {
    out.push(text.slice(lastIndex));
  }
  return out;
}
