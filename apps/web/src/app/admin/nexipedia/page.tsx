'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  NEXIPEDIA_CATEGORIES,
  NEXIPEDIA_CATEGORY_LABELS,
  type NexipediaCategory,
} from '@nexigrate/shared';
import {
  api,
  type AdminNexipediaArticleStatus,
  type AdminNexipediaDraft,
} from '~/lib/api';

/**
 * /admin/nexipedia
 *
 * Admin-side hub for the Nexipedia 3-AI pipeline. Same structure as
 * /admin/chapters: a Generate form at the top, a status filter, and a
 * list of drafts that drill down into a per-draft review page.
 *
 * No manual data entry path. The whole point of Nexipedia is to leverage
 * the same 3-AI pipeline that powers MCQs and chapters.
 */
export default function AdminNexipediaPage() {
  const [drafts, setDrafts] = useState<AdminNexipediaDraft[] | null>(null);
  const [status, setStatus] = useState<AdminNexipediaArticleStatus | 'all'>('pending');
  const [category, setCategory] = useState<NexipediaCategory | 'all'>('all');
  const [error, setError] = useState<string | null>(null);

  const [showForm, setShowForm] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [genResult, setGenResult] = useState<string | null>(null);

  // Form state
  const [title, setTitle] = useState('');
  const [slug, setSlug] = useState('');
  const [slugManuallyEdited, setSlugManuallyEdited] = useState(false);
  const [formCategory, setFormCategory] = useState<NexipediaCategory>('science');
  const [outlineHint, setOutlineHint] = useState('');
  const [sourceHint, setSourceHint] = useState('');

  // Derive a slug from the title until the admin manually edits it.
  useEffect(() => {
    if (slugManuallyEdited) return;
    const derived = slugify(title);
    setSlug(derived);
  }, [title, slugManuallyEdited]);

  const refresh = useCallback(async () => {
    try {
      const opts: Parameters<typeof api.admin.listNexipediaDrafts>[0] = {};
      if (status !== 'all') opts.status = status;
      if (category !== 'all') opts.category = category;
      const res = await api.admin.listNexipediaDrafts(opts);
      setDrafts(res.drafts);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'failed to load drafts');
    }
  }, [status, category]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  async function handleGenerate(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim() || !slug.trim()) return;
    setGenerating(true);
    setGenResult(null);
    try {
      const payload: Parameters<typeof api.admin.generateNexipediaArticle>[0] = {
        slug: slug.trim(),
        title: title.trim(),
        category: formCategory,
      };
      if (outlineHint.trim()) payload.outlineHint = outlineHint.trim();
      if (sourceHint.trim()) payload.sourceHint = sourceHint.trim();
      const res = await api.admin.generateNexipediaArticle(payload);
      setGenResult(
        `Draft created: ${res.draft.title} (verification ${(
          res.draft.verificationScore * 100
        ).toFixed(0)}%${res.verifierDisagreement ? ', verifiers disagreed' : ''})`,
      );
      setTitle('');
      setSlug('');
      setSlugManuallyEdited(false);
      setOutlineHint('');
      setSourceHint('');
      await refresh();
    } catch (e) {
      setGenResult(e instanceof Error ? e.message : 'generation failed');
    } finally {
      setGenerating(false);
    }
  }

  const filteredDrafts = useMemo(() => drafts ?? [], [drafts]);

  return (
    <main className="mx-auto max-w-5xl px-6 py-8">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="pill mb-3">Nexipedia</p>
          <h1 className="font-serif text-3xl font-semibold leading-tight text-ink-900">
            AI-generated topic articles.
          </h1>
          <p className="mt-2 max-w-2xl text-ink-800">
            Encyclopedia-style articles for Indian students. OpenAI generates,
            Gemini and Groq verify, you approve. No manual data entry.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setShowForm((v) => !v)}
          className="btn-primary shrink-0"
        >
          {showForm ? 'Close' : 'Generate article'}
        </button>
      </div>

      {showForm ? (
        <form
          onSubmit={handleGenerate}
          className="paper-card mt-6 grid gap-4 p-6 sm:grid-cols-2"
        >
          <label className="flex flex-col gap-1 sm:col-span-2">
            <span className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-500">
              Title
            </span>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Photosynthesis"
              className="input"
              required
              maxLength={160}
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-500">
              Slug
            </span>
            <input
              type="text"
              value={slug}
              onChange={(e) => {
                setSlugManuallyEdited(true);
                setSlug(e.target.value);
              }}
              placeholder="photosynthesis"
              className="input font-mono text-sm"
              required
              pattern="[a-z0-9]+(?:-[a-z0-9]+)*"
              maxLength={96}
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-500">
              Category
            </span>
            <select
              value={formCategory}
              onChange={(e) => setFormCategory(e.target.value as NexipediaCategory)}
              className="input"
            >
              {NEXIPEDIA_CATEGORIES.map((cat) => (
                <option key={cat} value={cat}>
                  {NEXIPEDIA_CATEGORY_LABELS[cat]}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1 sm:col-span-2">
            <span className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-500">
              Outline hint (optional)
            </span>
            <textarea
              value={outlineHint}
              onChange={(e) => setOutlineHint(e.target.value)}
              placeholder="e.g. Cover light reactions, Calvin cycle, factors affecting rate. Skip evolutionary history."
              className="input min-h-[80px]"
              maxLength={500}
            />
          </label>
          <label className="flex flex-col gap-1 sm:col-span-2">
            <span className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-500">
              Source hint (optional)
            </span>
            <input
              type="text"
              value={sourceHint}
              onChange={(e) => setSourceHint(e.target.value)}
              placeholder="e.g. NCERT Class 12 Biology, Ch. 13"
              className="input"
              maxLength={256}
            />
          </label>
          <div className="sm:col-span-2 flex items-center gap-3">
            <button
              type="submit"
              disabled={generating || !title.trim() || !slug.trim()}
              className="btn-primary"
            >
              {generating ? 'Generating (20-40s)...' : 'Generate via 3 AIs'}
            </button>
            {genResult ? (
              <span className="text-sm text-muted-500">{genResult}</span>
            ) : null}
          </div>
        </form>
      ) : null}

      <section className="mt-8 flex flex-wrap items-center gap-2">
        <FilterPill active={status === 'all'} onClick={() => setStatus('all')} label="All" />
        <FilterPill
          active={status === 'pending'}
          onClick={() => setStatus('pending')}
          label="Pending"
        />
        <FilterPill
          active={status === 'approved'}
          onClick={() => setStatus('approved')}
          label="Approved"
        />
        <FilterPill
          active={status === 'rejected'}
          onClick={() => setStatus('rejected')}
          label="Rejected"
        />
        <span className="mx-2 text-line">|</span>
        <FilterPill
          active={category === 'all'}
          onClick={() => setCategory('all')}
          label="All categories"
        />
        {NEXIPEDIA_CATEGORIES.map((cat) => (
          <FilterPill
            key={cat}
            active={category === cat}
            onClick={() => setCategory(cat)}
            label={NEXIPEDIA_CATEGORY_LABELS[cat]}
          />
        ))}
      </section>

      {error ? (
        <div className="banner banner-error mt-6" role="alert">
          <span>{error}</span>
        </div>
      ) : null}

      <section className="mt-6 flex flex-col gap-3">
        {filteredDrafts.length === 0 && drafts !== null && !error ? (
          <p className="text-sm text-muted-500">No drafts in this view.</p>
        ) : null}
        {filteredDrafts.map((d) => (
          <Link
            key={d.id}
            href={`/admin/nexipedia/${encodeURIComponent(d.id)}`}
            className="paper-card flex flex-col gap-2 p-5 transition hover:bg-paper-200/40 sm:flex-row sm:items-center sm:justify-between"
          >
            <div className="flex-1">
              <p className="text-xs font-semibold uppercase tracking-[0.14em] text-ember-600">
                {NEXIPEDIA_CATEGORY_LABELS[d.category]}
              </p>
              <h3 className="font-serif mt-1 text-lg font-semibold leading-snug text-ink-900">
                {d.title}
              </h3>
              <p className="mt-1 text-xs text-muted-500">
                {d.slug} · {d.sections.length} sections · ~
                {d.estimatedReadMinutes} min
              </p>
            </div>
            <div className="flex items-center gap-2">
              <span className={statusPillClass(d.status)}>{d.status}</span>
              <span className="pill pill-neutral">
                {Math.round(d.verificationScore * 100)}%
              </span>
            </div>
          </Link>
        ))}
      </section>
    </main>
  );
}

function FilterPill({
  active,
  onClick,
  label,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={
        'rounded-full border px-3 py-1 text-xs font-medium transition ' +
        (active
          ? 'border-ink-900 bg-ink-900 text-paper-100'
          : 'border-line bg-paper-50 text-ink-800 hover:border-ember-500')
      }
    >
      {label}
    </button>
  );
}

function statusPillClass(status: AdminNexipediaArticleStatus): string {
  if (status === 'approved') return 'pill pill-success';
  if (status === 'rejected') return 'pill pill-warn';
  return 'pill pill-neutral';
}

function slugify(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 96);
}
