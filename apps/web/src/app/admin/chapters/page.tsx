'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { LIVE_EXAMS, SOON_EXAMS } from '@nexigrate/shared';
import {
  api,
  type AdminChapterDraft,
  type AdminChapterDraftStatus,
  type GenerateChapterRequest,
} from '~/lib/api';

/**
 * /admin/chapters
 *
 * Owner workspace for the AI-driven chapter pipeline.
 *
 * NO MANUAL DATA ENTRY. The "Generate" form takes only:
 *   - exam, subject, slug, chapter title, class level
 *
 * It POSTs to /v1/admin/chapters/generate. The backend orchestrates 3 AIs
 * (OpenAI generates a full chapter, Gemini + Groq verify factual accuracy,
 * coverage, clarity) and returns a draft. The admin reviews, optionally
 * tweaks wording, and approves -- which publishes into the chapters
 * collection that students read.
 */
export default function AdminChaptersPage() {
  const [filter, setFilter] = useState<AdminChapterDraftStatus | 'all'>('pending');
  const [drafts, setDrafts] = useState<AdminChapterDraft[]>([]);
  const [listError, setListError] = useState<string | null>(null);
  const [listLoading, setListLoading] = useState(false);
  const [showForm, setShowForm] = useState(true);
  const [toast, setToast] = useState<string | null>(null);

  const refreshDrafts = useCallback(async () => {
    setListLoading(true);
    setListError(null);
    try {
      const opts = filter === 'all' ? {} : { status: filter };
      const res = await api.admin.listChapterDrafts(opts);
      setDrafts(res.drafts ?? []);
    } catch (e) {
      setListError(e instanceof Error ? e.message : 'failed to load drafts');
    } finally {
      setListLoading(false);
    }
  }, [filter]);

  useEffect(() => {
    void refreshDrafts();
  }, [refreshDrafts]);

  return (
    <main className="mx-auto flex max-w-4xl flex-col px-6 py-10">
      <section>
        <p className="pill mb-3">Admin</p>
        <h1 className="font-serif text-3xl font-semibold leading-tight text-ink-900 sm:text-4xl">
          Chapters
        </h1>
        <p className="mt-2 text-sm text-muted-500">
          AI-generated chapter content, verified by 3 AIs (OpenAI generator,
          Gemini + Groq verifiers). No manual authoring -- you give the slot,
          AI writes the content, you approve only what passes verification.
        </p>
      </section>

      {/* Generate form */}
      <section className="paper-card mt-8 p-6 sm:p-8">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-ember-600">
              Generate new chapter
            </p>
            <h2 className="font-serif mt-1 text-xl font-semibold text-ink-900">
              4 fields. 3 AIs. Verified content in ~30 seconds.
            </h2>
          </div>
          <button
            type="button"
            onClick={() => setShowForm((s) => !s)}
            className="btn-ghost-sm"
          >
            {showForm ? 'Hide' : 'Open form'}
          </button>
        </div>
        {showForm ? (
          <ChapterGenerateForm
            onSuccess={(draft, disagreement) => {
              const note = disagreement
                ? `Draft generated. Verifiers DISAGREED -- review carefully.`
                : `Draft generated and verified. Open to review.`;
              setToast(note);
              setFilter('pending');
              void refreshDrafts();
            }}
          />
        ) : null}
      </section>

      {/* Filter */}
      <section className="mt-8">
        <div className="flex flex-wrap items-center gap-2">
          {(['pending', 'approved', 'rejected', 'all'] as const).map((f) => (
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
          <button
            type="button"
            onClick={() => void refreshDrafts()}
            className="btn-ghost-sm ml-auto"
            disabled={listLoading}
          >
            {listLoading ? 'Loading...' : 'Refresh'}
          </button>
        </div>
      </section>

      {toast ? (
        <div className="banner banner-success mt-4" role="status">
          <span className="flex-1">{toast}</span>
          <button
            type="button"
            className="text-xs text-muted-500 underline"
            onClick={() => setToast(null)}
          >
            dismiss
          </button>
        </div>
      ) : null}

      <section className="mt-6 space-y-3">
        {listError ? (
          <div className="banner banner-error" role="alert">
            <span className="flex-1">{listError}</span>
            <button
              type="button"
              className="text-xs underline"
              onClick={() => void refreshDrafts()}
            >
              retry
            </button>
          </div>
        ) : null}

        {drafts.length === 0 && !listLoading && !listError ? (
          <p className="text-sm text-muted-500">
            No drafts in <strong>{filter}</strong>. Generate one above.
          </p>
        ) : null}

        {drafts.map((d) => (
          <ChapterDraftRow key={d.id} draft={d} />
        ))}
      </section>
    </main>
  );
}

// ============================================================================
// Generate form -- 4 fields, no manual content entry.
// ============================================================================

const CLASS_LEVELS = [
  'class-5',
  'class-6',
  'class-7',
  'class-8',
  'class-9',
  'class-10',
  'class-11',
  'class-12',
  'graduation',
  'post-graduation',
] as const;

const SUBJECTS = [
  'physics',
  'chemistry',
  'biology',
  'mathematics',
  'english',
  'hindi',
  'computer-science',
  'general-knowledge',
  'reasoning',
  'history',
  'geography',
  'civics',
  'economics',
  'environmental-science',
] as const;

function ChapterGenerateForm({
  onSuccess,
}: {
  onSuccess: (draft: AdminChapterDraft, verifierDisagreement: boolean) => void;
}) {
  const [exam, setExam] = useState<string>(LIVE_EXAMS[0]?.id ?? 'jee-main');
  const [subject, setSubject] = useState('physics');
  const [chapterTitle, setChapterTitle] = useState('');
  const [slug, setSlug] = useState('');
  const [classLevel, setClassLevel] = useState<string>('class-11');
  const [sourceHint, setSourceHint] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const examChoices = useMemo(
    () => [
      ...LIVE_EXAMS.map((e) => ({ id: e.id, label: `${e.name} (live)` })),
      ...SOON_EXAMS.map((e) => ({ id: e.id, label: `${e.name} (coming soon)` })),
    ],
    [],
  );

  // Auto-derive slug from title as the user types, unless they've manually
  // edited the slug already.
  const [slugTouched, setSlugTouched] = useState(false);
  useEffect(() => {
    if (slugTouched) return;
    const auto = chapterTitle
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 64);
    setSlug(auto);
  }, [chapterTitle, slugTouched]);

  async function onSubmit(ev: React.FormEvent) {
    ev.preventDefault();
    if (!subject.trim() || !chapterTitle.trim() || !slug.trim()) {
      setError('Subject, chapter title, and slug are required.');
      return;
    }
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) {
      setError('Slug must be kebab-case lowercase, e.g. units-and-measurements.');
      return;
    }
    try {
      setError(null);
      setSubmitting(true);
      const body: GenerateChapterRequest = {
        exam,
        subject: subject.trim(),
        slug: slug.trim(),
        chapterTitle: chapterTitle.trim(),
        classLevel,
        ...(sourceHint.trim() ? { sourceHint: sourceHint.trim() } : {}),
      };
      const res = await api.admin.generateChapter(body);
      onSuccess(res.draft, res.verifierDisagreement);
      // Reset for the next chapter
      setChapterTitle('');
      setSlug('');
      setSlugTouched(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'generation failed');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="mt-5 grid gap-4">
      <div className="grid gap-2 sm:grid-cols-2">
        <label className="block text-sm">
          <span className="block font-medium text-ink-900">Exam</span>
          <select
            value={exam}
            onChange={(e) => setExam(e.target.value)}
            className="input mt-1 w-full"
            disabled={submitting}
          >
            {examChoices.map((c) => (
              <option key={c.id} value={c.id}>
                {c.label}
              </option>
            ))}
          </select>
        </label>
        <label className="block text-sm">
          <span className="block font-medium text-ink-900">Class level</span>
          <select
            value={classLevel}
            onChange={(e) => setClassLevel(e.target.value)}
            className="input mt-1 w-full"
            disabled={submitting}
          >
            {CLASS_LEVELS.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </label>
      </div>
      <div className="grid gap-2 sm:grid-cols-2">
        <label className="block text-sm">
          <span className="block font-medium text-ink-900">Subject</span>
          <select
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            className="input mt-1 w-full"
            disabled={submitting}
          >
            {SUBJECTS.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </label>
        <label className="block text-sm">
          <span className="block font-medium text-ink-900">Chapter title</span>
          <input
            value={chapterTitle}
            onChange={(e) => setChapterTitle(e.target.value)}
            placeholder="Units and Measurements"
            className="input mt-1 w-full"
            disabled={submitting}
          />
        </label>
      </div>
      <label className="block text-sm">
        <span className="block font-medium text-ink-900">
          Slug{' '}
          <span className="text-muted-500">
            (auto from title; you can edit)
          </span>
        </span>
        <input
          value={slug}
          onChange={(e) => {
            setSlug(e.target.value);
            setSlugTouched(true);
          }}
          placeholder="units-and-measurements"
          className="input mt-1 w-full"
          disabled={submitting}
        />
      </label>
      <label className="block text-sm">
        <span className="block font-medium text-ink-900">
          Source hint{' '}
          <span className="text-muted-500">
            (optional, e.g. "NCERT Class 11 Physics, Ch. 1")
          </span>
        </span>
        <input
          value={sourceHint}
          onChange={(e) => setSourceHint(e.target.value)}
          placeholder="NCERT Class 11 Physics, Ch. 1"
          className="input mt-1 w-full"
          disabled={submitting}
        />
      </label>
      <button type="submit" disabled={submitting} className="btn-primary">
        {submitting
          ? 'Generating via OpenAI + Gemini + Groq (20-40s)...'
          : 'Generate chapter via 3 AIs'}
      </button>
      {error ? (
        <div className="banner banner-error" role="alert">
          <span>{error}</span>
        </div>
      ) : null}
      <p className="text-xs text-muted-500">
        Generation takes 20-40 seconds (3 LLM calls including a long
        chapter draft + 2 parallel verifications). The draft lands in
        "Pending" -- nothing reaches students until you Approve.
      </p>
    </form>
  );
}

// ============================================================================
// Draft list row
// ============================================================================

function ChapterDraftRow({ draft }: { draft: AdminChapterDraft }) {
  return (
    <Link
      href={`/admin/chapters/${encodeURIComponent(draft.id)}`}
      className="paper-card flex items-start justify-between gap-3 p-5 transition hover:bg-paper-200/40"
    >
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2 text-xs text-muted-500">
          <ChapterStatusPill status={draft.status} />
          <span className="font-medium uppercase tracking-wide">
            {draft.exam} · {draft.subject} · {draft.classLevel}
          </span>
          <span className="rounded bg-paper-200 px-2 py-0.5 font-medium text-ink-800">
            {draft.sections.length} sections
          </span>
          <span className="text-muted-500">
            verifier {(draft.verificationScore * 100).toFixed(0)}%
          </span>
          <span className="text-muted-500">
            ~{draft.estimatedReadMinutes} min read
          </span>
        </div>
        <h3 className="font-serif mt-2 text-lg text-ink-900">{draft.title}</h3>
        <p className="mt-1 line-clamp-2 text-sm text-muted-500">{draft.summary}</p>
      </div>
      <span className="mt-1 shrink-0 text-sm text-muted-500">→</span>
    </Link>
  );
}

function ChapterStatusPill({ status }: { status: AdminChapterDraftStatus }) {
  if (status === 'approved') {
    return <span className="pill pill-success">approved</span>;
  }
  if (status === 'rejected') {
    return <span className="pill pill-warn">rejected</span>;
  }
  return <span className="pill pill-neutral">pending</span>;
}
