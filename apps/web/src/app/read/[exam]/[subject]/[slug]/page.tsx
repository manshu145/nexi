'use client';

import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { PublishedChapter } from '~/lib/api';
import { Logo } from '~/components/Logo';
import { useAuth } from '~/lib/auth-context';
import { api } from '~/lib/api';
import { TextToSpeech } from '~/components/TextToSpeech';
import { VisualizeButton } from '~/components/VisualizeButton';

/**
 * /read/<exam>/<subject>/<slug>
 *
 * Book-style paginated reader. Navigation:
 *   - Keyboard: ArrowLeft / ArrowRight / Space
 *   - Horizontal swipe on mobile (touch)
 *   - Footer arrow buttons (always visible)
 *
 * NO invisible tap zones — they cause accidental flips.
 * Swipe requires intentional horizontal drag (>60px threshold).
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
  const [flipDir, setFlipDir] = useState<'forward' | 'back' | null>(null);
  const pageRef = useRef<HTMLElement | null>(null);

  // Swipe state
  const touchStartX = useRef<number | null>(null);
  const touchStartY = useRef<number | null>(null);
  const swiping = useRef(false);

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

  useEffect(() => { void load(); }, [load]);

  const totalPages = useMemo(
    () => (chapter ? 1 + chapter.sections.length + 1 : 0),
    [chapter],
  );

  const storageKey = useMemo(
    () => (chapter ? `nexi.read.${chapter.id}` : null),
    [chapter],
  );

  useEffect(() => {
    if (!storageKey || totalPages === 0) return;
    try {
      const raw = window.localStorage.getItem(storageKey);
      if (raw == null) { setPage(0); return; }
      const idx = Math.max(0, Math.min(totalPages - 1, Number(raw)));
      if (idx >= totalPages - 1) { setPage(0); return; }
      setPage(Number.isFinite(idx) ? idx : 0);
    } catch { setPage(0); }
  }, [storageKey, totalPages]);

  useEffect(() => {
    if (!storageKey) return;
    try { window.localStorage.setItem(storageKey, String(page)); } catch {}
  }, [page, storageKey]);

  useEffect(() => {
    pageRef.current?.scrollTo({ top: 0, behavior: 'auto' });
  }, [page]);

  useEffect(() => {
    if (!flipDir) return;
    const t = setTimeout(() => setFlipDir(null), 350);
    return () => clearTimeout(t);
  }, [flipDir, page]);

  const goPrev = useCallback(() => {
    if (page <= 0) return;
    setFlipDir('back');
    setPage((p) => Math.max(0, p - 1));
  }, [page]);

  const goNext = useCallback(() => {
    if (page >= totalPages - 1) return;
    setFlipDir('forward');
    setPage((p) => Math.min(totalPages - 1, p + 1));
  }, [page, totalPages]);

  // Swipe gesture handlers
  const onTouchStart = useCallback((e: React.TouchEvent) => {
    const touch = e.touches[0];
    if (!touch) return;
    touchStartX.current = touch.clientX;
    touchStartY.current = touch.clientY;
    swiping.current = false;
  }, []);

  const onTouchEnd = useCallback((e: React.TouchEvent) => {
    if (touchStartX.current === null || touchStartY.current === null) return;
    const touch = e.changedTouches[0];
    if (!touch) return;
    const dx = touch.clientX - touchStartX.current;
    const dy = touch.clientY - touchStartY.current;
    touchStartX.current = null;
    touchStartY.current = null;

    // Only trigger if horizontal swipe is dominant and > 60px
    if (Math.abs(dx) > 60 && Math.abs(dx) > Math.abs(dy) * 1.5) {
      if (dx < 0) goNext(); // swipe left = next
      else goPrev(); // swipe right = prev
    }
  }, [goNext, goPrev]);

  // Keyboard navigation
  useEffect(() => {
    if (!chapter) return;
    function isTyping(t: EventTarget | null): boolean {
      if (!t || !(t instanceof HTMLElement)) return false;
      const tag = t.tagName.toLowerCase();
      return tag === 'input' || tag === 'textarea' || t.isContentEditable;
    }
    function onKey(ev: KeyboardEvent) {
      if (isTyping(ev.target)) return;
      switch (ev.key) {
        case 'ArrowLeft': case 'k': case 'K':
          ev.preventDefault(); goPrev(); break;
        case 'ArrowRight': case ' ': case 'j': case 'J':
          ev.preventDefault(); goNext(); break;
        case 'Home': ev.preventDefault(); setPage(0); break;
        case 'End': ev.preventDefault(); setPage(totalPages - 1); break;
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [chapter, goPrev, goNext, totalPages]);

  if (loading || !user) {
    return (
      <main className="flex min-h-[60vh] items-center justify-center px-6">
        <span className="inline-flex items-center gap-2 text-sm text-muted-500">
          <span className="spinner" aria-hidden="true" /> Loading...
        </span>
      </main>
    );
  }

  if (error) {
    return (
      <main className="mx-auto max-w-2xl px-6 py-10">
        <div className="banner banner-error" role="alert">
          <span className="flex-1">{error}</span>
          <button type="button" className="text-xs underline" onClick={() => void load()}>retry</button>
        </div>
        <Link href="/chapters" className="btn-ghost mt-4 inline-flex">Back to library</Link>
      </main>
    );
  }

  if (!chapter) {
    return (
      <main className="flex min-h-[60vh] items-center justify-center px-6">
        <span className="inline-flex items-center gap-2 text-sm text-muted-500">
          <span className="spinner" aria-hidden="true" /> Opening chapter...
        </span>
      </main>
    );
  }

  const sortedSections = [...chapter.sections].sort((a, b) => a.order - b.order);
  const isCover = page === 0;
  const isEnd = page === totalPages - 1;
  const sectionIndex = isCover || isEnd ? -1 : page - 1;
  const currentSection = sectionIndex >= 0 ? sortedSections[sectionIndex] : null;
  const progressPct = totalPages <= 1 ? 0 : (page / (totalPages - 1)) * 100;

  return (
    <div className="kindle-frame">
      {/* Header */}
      <header className="kindle-header">
        <Logo />
        <div className="flex items-center gap-2">
          <span className="hidden sm:inline text-xs text-muted-500">
            {chapter.title.length > 30 ? chapter.title.slice(0, 30) + '…' : chapter.title}
          </span>
          <Link href="/chapters" className="btn-ghost-sm">Library</Link>
        </div>
      </header>

      {/* Book body — swipeable */}
      <div className="kindle-book-wrapper" onTouchStart={onTouchStart} onTouchEnd={onTouchEnd}>
        <article
          ref={pageRef}
          className={`kindle-page reader ${flipDir === 'forward' ? 'kindle-flip-next' : flipDir === 'back' ? 'kindle-flip-prev' : ''}`}
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
              <p className="kindle-cover-meta">~{chapter.estimatedReadMinutes} min read</p>
              <p className="kindle-cover-meta">Source: {chapter.source}</p>
              <p className="mt-6 text-xs text-muted-400 animate-pulse">Swipe left or tap → to start reading</p>
            </div>
          ) : isEnd ? (
            <div className="kindle-end">
              <p className="text-xs uppercase tracking-[0.18em] text-muted-500">End of chapter</p>
              <h2 className="font-serif mt-3 text-2xl sm:text-3xl font-semibold text-ink-900">{chapter.title}</h2>
              <p className="mt-4 max-w-md text-ink-800">
                You&apos;ve finished reading. Mark it complete and take the chapter test.
              </p>
              {markReadError && <p className="mt-3 text-xs text-ember-600" role="alert">{markReadError}</p>}
              <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
                {isRead ? (
                  <span className="pill pill-success">Marked as read</span>
                ) : (
                  <button type="button" onClick={onMarkRead} disabled={markReadBusy} className="btn-ghost">
                    {markReadBusy ? 'Marking...' : 'Mark as read'}
                  </button>
                )}
                <Link
                  href={`/test/${encodeURIComponent(chapter.exam)}/${encodeURIComponent(chapter.subject)}/${encodeURIComponent(chapter.slug)}`}
                  className="btn-primary"
                >Take chapter test</Link>
                <Link href="/chapters" className="btn-ghost">Library</Link>
              </div>
            </div>
          ) : currentSection ? (
            <section>
              <h2 className="reader-heading font-serif">{currentSection.heading}</h2>
              <div className="flex items-center gap-3 mt-2 mb-5 flex-wrap">
                <TextToSpeech text={currentSection.body} />
                <VisualizeButton text={currentSection.body} title={currentSection.heading} />
              </div>
              <div className="reader-body">{renderBody(currentSection.body)}</div>
            </section>
          ) : null}
        </article>
      </div>

      {/* Footer toolbar */}
      <div className="kindle-toolbar" role="navigation" aria-label="Reader navigation">
        <div className="kindle-progress" style={{ width: `${progressPct}%` }} aria-hidden="true" />
        <button type="button" onClick={goPrev} disabled={page === 0} aria-label="Previous page">
          ← Prev
        </button>
        <span className="kindle-page-indicator" aria-live="polite">
          {isCover ? 'Cover' : isEnd ? 'End' : `${page} / ${totalPages - 2}`}
        </span>
        <button type="button" onClick={goNext} disabled={page >= totalPages - 1} aria-label="Next page">
          Next →
        </button>
      </div>
    </div>
  );
}

function prettySubject(s: string): string {
  return s.split('-').map((w) => (w[0]?.toUpperCase() ?? '') + w.slice(1)).join(' ');
}

function renderBody(body: string): React.ReactNode {
  const paragraphs = body.split(/\n\s*\n/).filter((p) => p.trim().length > 0);
  return paragraphs.map((p, i) => {
    const inline = renderInline(p.trim());
    if (i === 0) return <p key={i} className="reader-paragraph reader-dropcap">{inline}</p>;
    return <p key={i} className="reader-paragraph">{inline}</p>;
  });
}

function renderInline(text: string): React.ReactNode[] {
  const out: React.ReactNode[] = [];
  let key = 0;
  const re = /(\*\*([^*]+)\*\*)|(`([^`]+)`)/g;
  let lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) {
    if (m.index > lastIndex) out.push(text.slice(lastIndex, m.index));
    if (m[1]) out.push(<strong key={`b${key++}`}>{m[2]}</strong>);
    else if (m[3]) out.push(<code key={`c${key++}`} className="rounded bg-paper-200 px-1.5 py-0.5 font-mono text-[0.92em]">{m[4]}</code>);
    lastIndex = m.index + m[0].length;
  }
  if (lastIndex < text.length) out.push(text.slice(lastIndex));
  return out;
}
