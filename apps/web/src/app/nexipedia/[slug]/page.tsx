'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import {
  EXAM_BY_SLUG,
  NEXIPEDIA_CATEGORY_LABELS,
  type NexipediaArticle,
} from '@nexigrate/shared';
import { Logo } from '~/components/Logo';
import { useAuth } from '~/lib/auth-context';
import { api } from '~/lib/api';

/**
 * /nexipedia/[slug] -- single Nexipedia article reader (Phase 14).
 *
 * Reuses the .reader / .reader-section / .reader-body typography
 * tokens shipped with the Kindle chapter reader -- same calm, serif,
 * narrow-column treatment is right for an encyclopedia article.
 *
 * Differences from the chapter reader:
 *   - Single-page scroll, not paged. Encyclopedia articles are short
 *     enough (3-8 minutes typical) that pagination would be overkill,
 *     and people search-and-scan an encyclopedia rather than read it
 *     end-to-end.
 *   - Header surfaces the verification badge (3 AIs + editor approved)
 *     prominently because that IS the brand promise.
 *   - "Related exams" pills if any.
 */
export default function NexipediaArticlePage() {
  const params = useParams<{ slug: string }>();
  const slug = params?.slug ?? '';
  const { user, loading } = useAuth();
  const router = useRouter();

  const [article, setArticle] = useState<NexipediaArticle | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!loading && !user) router.replace('/signin');
  }, [user, loading, router]);

  useEffect(() => {
    if (!user || !slug) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await api.nexipedia.get(slug);
        if (!cancelled) setArticle(res.article);
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : 'failed to load article');
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [user, slug]);

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
        </div>
        <Link href="/nexipedia" className="btn-ghost mt-4 inline-flex">
          Back to Nexipedia
        </Link>
      </main>
    );
  }

  if (!article) {
    return (
      <main className="flex min-h-[60vh] items-center justify-center px-6">
        <span className="inline-flex items-center gap-2 text-sm text-muted-500">
          <span className="spinner" aria-hidden="true" />
          Loading article...
        </span>
      </main>
    );
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-2xl flex-col px-6 pt-6 pb-16">
      <header className="flex items-start justify-between">
        <Logo />
        <Link href="/nexipedia" className="btn-ghost-sm">
          Back to library
        </Link>
      </header>

      <article className="reader mt-10">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-ember-600">
          Nexipedia · {NEXIPEDIA_CATEGORY_LABELS[article.category]}
        </p>
        <h1 className="font-serif mt-2 text-3xl font-semibold leading-tight text-ink-900 sm:text-4xl">
          {article.title}
        </h1>
        <p className="mt-3 text-ink-800">{article.summary}</p>

        <div className="mt-4 flex flex-wrap items-center gap-2 text-xs text-muted-500">
          <span className="pill">
            Verified · {Math.round(article.verificationScore * 100)}%
          </span>
          <span>{article.estimatedReadMinutes} min read</span>
          <span>·</span>
          <span>Source: {article.source}</span>
        </div>

        {article.relatedExams.length > 0 ? (
          <div className="mt-4 flex flex-wrap items-center gap-2">
            <span className="text-xs uppercase tracking-[0.14em] text-muted-500">
              Relevant exams:
            </span>
            {article.relatedExams.map((e) => (
              <span key={e} className="pill pill-neutral">
                {EXAM_BY_SLUG.get(e)?.name ?? e}
              </span>
            ))}
          </div>
        ) : null}

        <hr className="my-6 border-line" />

        {article.sections
          .slice()
          .sort((a, b) => a.order - b.order)
          .map((s) => (
            <section key={s.id} className="reader-section">
              <h2 className="reader-heading font-serif text-xl font-semibold text-ink-900">
                {s.heading}
              </h2>
              <div className="reader-body mt-3 text-ink-800">
                {renderMarkdown(s.body)}
              </div>
            </section>
          ))}

        <p className="mt-12 text-xs text-muted-500">
          Generated by {article.generatedBy} · verified by{' '}
          {article.verifiers.map((v) => v.modelId).join(' + ')} · approved by
          editor.
        </p>
      </article>
    </main>
  );
}

/**
 * Tiny, deliberately-restricted markdown renderer.
 *
 * Same approach as the chapter reader: parse only **bold** + paragraph
 * breaks. Never inject HTML, never render arbitrary tags. Keeps the
 * surface area small and predictable -- if a generator tries to inject
 * an <iframe> it just shows up as text.
 */
function renderMarkdown(md: string): React.ReactNode {
  const paragraphs = md.split(/\n{2,}/);
  return paragraphs.map((p, i) => (
    <p key={i} className="reader-paragraph">
      {parseInline(p)}
    </p>
  ));
}

function parseInline(s: string): React.ReactNode {
  // Split on **bold** spans.
  const parts = s.split(/(\*\*[^*]+\*\*)/g);
  return parts.map((part, i) => {
    if (part.startsWith('**') && part.endsWith('**')) {
      return (
        <strong key={i} className="font-semibold text-ink-900">
          {part.slice(2, -2)}
        </strong>
      );
    }
    return <span key={i}>{part}</span>;
  });
}
