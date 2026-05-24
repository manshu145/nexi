'use client';

import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';
import type { PublishedChapter } from '~/lib/api';
import { Logo } from '~/components/Logo';
import { useAuth } from '~/lib/auth-context';
import { api } from '~/lib/api';

/**
 * /read/<exam>/<subject>/<slug>
 *
 * Kindle-style reading view for an AI-generated chapter.
 *
 * Design principles (matches the brand "distraction-free" promise):
 *   - Lora serif body type, generous line-height, narrow column.
 *   - Drop cap on the first paragraph of the first section.
 *   - No nav chrome, no sidebars, no pop-ups while reading.
 *   - "Mark as read" surfaces only at the bottom of the chapter so
 *     the student is not nagged before finishing.
 *
 * Markdown rendering: deliberately minimal. The verifier prompts allow
 * **bold** and inline math. We render bold and paragraphs; everything
 * else passes through as text. We never inject HTML.
 */
export default function ChapterReadPage() {
  const params = useParams<{ exam: string; subject: string; slug: string }>();
  const exam = params?.exam ?? '';
  const subject = params?.subject ?? '';
  const slug = params?.slug ?? '';

  const { user, loading } = useAuth();
  const router = useRouter();

  const [chapter, setChapter] = useState<PublishedChapter | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!loading && !user) router.replace('/signin');
  }, [user, loading, router]);

  const load = useCallback(async () => {
    if (!user || !exam || !subject || !slug) return;
    try {
      setError(null);
      const res = await api.chapters.get(exam, subject, slug);
      setChapter(res.chapter);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'failed to load chapter');
    }
  }, [user, exam, subject, slug]);

  useEffect(() => {
    void load();
  }, [load]);

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

  return (
    <main className="mx-auto flex max-w-prose flex-col px-6 pt-8 pb-24">
      <header className="flex items-start justify-between">
        <Logo />
        <Link href="/chapters" className="btn-ghost-sm">
          Library
        </Link>
      </header>

      <section className="mt-10">
        <p className="text-xs uppercase tracking-[0.18em] text-muted-500">
          {chapter.exam} · {prettySubject(chapter.subject)} · {chapter.classLevel}
        </p>
        <h1 className="font-serif mt-2 text-4xl font-semibold leading-tight text-ink-900 sm:text-5xl">
          {chapter.title}
        </h1>
        <p className="mt-3 text-base text-ink-800">{chapter.summary}</p>
        <p className="mt-3 text-xs text-muted-500">
          ~{chapter.estimatedReadMinutes} min read · Source: {chapter.source}
        </p>
      </section>

      <article className="reader mt-10">
        {sortedSections.map((s, i) => (
          <section key={s.id} className="reader-section">
            <h2 className="reader-heading font-serif">{s.heading}</h2>
            <div className={i === 0 ? 'reader-body reader-body-first' : 'reader-body'}>
              {renderBody(s.body, i === 0)}
            </div>
          </section>
        ))}
      </article>

      <footer className="mt-12 border-t border-ink-900/10 pt-6">
        <p className="text-xs text-muted-500">
          You&apos;ve reached the end. Tomorrow&apos;s daily MCQ will draw on
          this chapter. Take it from your dashboard to earn credits.
        </p>
        <div className="mt-4 flex flex-wrap gap-3">
          <Link href="/mcq" className="btn-primary">
            Take today&apos;s MCQ
          </Link>
          <Link href="/chapters" className="btn-ghost">
            Back to library
          </Link>
        </div>
      </footer>
    </main>
  );
}

function prettySubject(s: string): string {
  return s
    .split('-')
    .map((w) => (w[0]?.toUpperCase() ?? '') + w.slice(1))
    .join(' ');
}

/**
 * Lightweight markdown rendering.
 *
 * Supports paragraphs (blank lines), **bold**, and inline `code`. Anything
 * else is rendered as plain text. This is deliberate: we never inject HTML
 * from AI output, and we never use a heavy markdown library because the
 * verifier prompts forbid HTML, images, and tables anyway.
 */
function renderBody(body: string, dropCap: boolean): React.ReactNode {
  const paragraphs = body.split(/\n\s*\n/).filter((p) => p.trim().length > 0);
  return paragraphs.map((p, i) => {
    const inline = renderInline(p.trim());
    if (i === 0 && dropCap) {
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
  // Tokenize: **bold**, `code`, otherwise plain text.
  const out: React.ReactNode[] = [];
  let rest = text;
  let key = 0;
  const re = /(\*\*([^*]+)\*\*)|(`([^`]+)`)/g;
  let lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(rest))) {
    if (m.index > lastIndex) {
      out.push(rest.slice(lastIndex, m.index));
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
  if (lastIndex < rest.length) {
    out.push(rest.slice(lastIndex));
  }
  return out;
}
