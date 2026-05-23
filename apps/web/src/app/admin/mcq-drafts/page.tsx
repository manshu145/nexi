'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  LIVE_EXAMS,
  SOON_EXAMS,
  type ExamSlug,
  type McqDifficulty,
  type McqDraft,
  type McqDraftStatus,
} from '@nexigrate/shared';
import { api, type GenerateDraftRequest } from '~/lib/api';

/**
 * /admin/mcq-drafts
 *
 * Owner workspace. Generate via 3-AI, review, approve / reject. Gating
 * lives in /admin/layout.tsx; this page just assumes the layout has
 * already proven the user is a content_admin or higher.
 *
 * One screen, no sub-routes:
 *   1. "Generate" form (collapsible) -- exam + subject + chapter +
 *      classLevel + difficulty + N drafts at once. POSTs to
 *      /v1/admin/mcq-drafts/generate which returns { created: McqDraft[],
 *      errors: [...] }.
 *   2. Filter pills (Pending / Approved / Rejected / All).
 *   3. Drafts list. Click a row to expand inline -- the McqDraft shape on
 *      `main` is FLAT (top-level question/options/correctOption), not
 *      nested per-candidate. We display the chosen content + the verifier
 *      scores side by side, plus Approve / Reject controls.
 */
export default function AdminMcqDraftsPage() {
  const [filter, setFilter] = useState<McqDraftStatus | 'all'>('pending');
  const [drafts, setDrafts] = useState<McqDraft[]>([]);
  const [listError, setListError] = useState<string | null>(null);
  const [listLoading, setListLoading] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  const refreshDrafts = useCallback(async () => {
    setListLoading(true);
    setListError(null);
    try {
      const opts = filter === 'all' ? {} : { status: filter };
      const res = await api.admin.listDrafts(opts);
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
          MCQ drafts
        </h1>
        <p className="mt-2 text-sm text-muted-500">
          Generate via 3 AIs (OpenAI generator, Gemini + Groq verifiers).
          Review what they wrote. Publish only what passes.
        </p>
      </section>

      {/* Generate form */}
      <section className="paper-card mt-8 p-6 sm:p-8">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-ember-600">
              Generate
            </p>
            <h2 className="font-serif mt-1 text-xl font-semibold text-ink-900">
              New drafts from a chapter
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
          <GenerateForm
            onSuccess={(created, errors) => {
              setShowForm(false);
              const note =
                created.length === 1 && errors.length === 0
                  ? '1 draft generated.'
                  : `${created.length} draft${created.length === 1 ? '' : 's'} generated${
                      errors.length ? `, ${errors.length} failed` : ''
                    }.`;
              setToast(note);
              setFilter('pending');
              if (created.length > 0) setExpandedId(created[0]!.id);
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
              onClick={() => {
                setFilter(f);
                setExpandedId(null);
              }}
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
        <div
          className="paper-card mt-4 border-l-4 border-ember-600 px-4 py-3 text-sm text-ink-800"
          role="status"
        >
          {toast}
          <button
            type="button"
            className="ml-3 text-xs text-muted-500 underline"
            onClick={() => setToast(null)}
          >
            dismiss
          </button>
        </div>
      ) : null}

      <section className="mt-6 space-y-3">
        {listError ? (
          <p className="text-sm text-ember-600" role="alert">
            {listError}
          </p>
        ) : null}

        {drafts.length === 0 && !listLoading && !listError ? (
          <p className="text-sm text-muted-500">
            No drafts in <strong>{filter}</strong>. Generate one above.
          </p>
        ) : null}

        {drafts.map((d) => (
          <DraftRow
            key={d.id}
            draft={d}
            expanded={expandedId === d.id}
            onToggle={() => setExpandedId((id) => (id === d.id ? null : d.id))}
            onChanged={(message) => {
              setToast(message);
              void refreshDrafts();
            }}
          />
        ))}
      </section>
    </main>
  );
}

// ============================================================================
// Generate form
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

function GenerateForm({
  onSuccess,
}: {
  onSuccess: (created: McqDraft[], errors: { index: number; error: string }[]) => void;
}) {
  const [exam, setExam] = useState<ExamSlug | string>(LIVE_EXAMS[0]?.id ?? 'jee-main');
  const [subject, setSubject] = useState('physics');
  const [chapter, setChapter] = useState('');
  const [classLevel, setClassLevel] = useState<string>('class-11');
  const [difficulty, setDifficulty] = useState<McqDifficulty>('medium');
  const [count, setCount] = useState(1);
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

  async function onSubmit(ev: React.FormEvent) {
    ev.preventDefault();
    if (!subject.trim() || !chapter.trim()) {
      setError('Subject and chapter are required.');
      return;
    }
    try {
      setError(null);
      setSubmitting(true);
      const body: GenerateDraftRequest = {
        exam,
        subject: subject.trim(),
        chapter: chapter.trim(),
        classLevel,
        difficulty,
        count,
        ...(sourceHint.trim() ? { sourceHint: sourceHint.trim() } : {}),
      };
      const res = await api.admin.generateDrafts(body);
      onSuccess(res.created ?? [], res.errors ?? []);
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
          <input
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            placeholder="physics"
            className="input mt-1 w-full"
            disabled={submitting}
          />
        </label>
        <label className="block text-sm">
          <span className="block font-medium text-ink-900">Chapter</span>
          <input
            value={chapter}
            onChange={(e) => setChapter(e.target.value)}
            placeholder="units-and-measurements"
            className="input mt-1 w-full"
            disabled={submitting}
          />
        </label>
      </div>
      <div className="grid gap-2 sm:grid-cols-2">
        <label className="block text-sm">
          <span className="block font-medium text-ink-900">Difficulty</span>
          <select
            value={difficulty}
            onChange={(e) => setDifficulty(e.target.value as McqDifficulty)}
            className="input mt-1 w-full"
            disabled={submitting}
          >
            <option value="easy">Easy</option>
            <option value="medium">Medium</option>
            <option value="hard">Hard</option>
          </select>
        </label>
        <label className="block text-sm">
          <span className="block font-medium text-ink-900">How many drafts?</span>
          <input
            type="number"
            min={1}
            max={10}
            value={count}
            onChange={(e) =>
              setCount(Math.min(10, Math.max(1, Number(e.target.value) || 1)))
            }
            className="input mt-1 w-full"
            disabled={submitting}
          />
        </label>
      </div>
      <label className="block text-sm">
        <span className="block font-medium text-ink-900">
          Source hint{' '}
          <span className="text-muted-500">(optional, helps the AI cite a source)</span>
        </span>
        <input
          value={sourceHint}
          onChange={(e) => setSourceHint(e.target.value)}
          placeholder="NCERT Class 11 Physics, Ch 1, page 12"
          className="input mt-1 w-full"
          disabled={submitting}
        />
      </label>
      <button type="submit" disabled={submitting} className="btn-primary">
        {submitting
          ? `Generating ${count} draft${count === 1 ? '' : 's'} via 3 AIs...`
          : `Generate ${count} draft${count === 1 ? '' : 's'} via OpenAI + Gemini + Groq`}
      </button>
      {error ? (
        <p className="text-sm text-ember-600" role="alert">
          {error}
        </p>
      ) : null}
      <p className="text-xs text-muted-500">
        Each draft takes 5-15 seconds (3 LLM calls). Drafts land in
        "Pending" -- nothing reaches students until you Approve.
      </p>
    </form>
  );
}

// ============================================================================
// Draft list row + detail
// ============================================================================

function DraftRow({
  draft,
  expanded,
  onToggle,
  onChanged,
}: {
  draft: McqDraft;
  expanded: boolean;
  onToggle: () => void;
  onChanged: (message: string) => void;
}) {
  return (
    <article className="paper-card overflow-hidden">
      <button
        type="button"
        onClick={onToggle}
        className="flex w-full items-start justify-between gap-3 p-5 text-left hover:bg-paper-200/40"
      >
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2 text-xs text-muted-500">
            <StatusPill status={draft.status} />
            <span className="font-medium uppercase tracking-wide">
              {draft.exam} · {draft.subject} · {draft.chapter}
            </span>
            <span className="rounded bg-paper-200 px-2 py-0.5 font-medium text-ink-800">
              {draft.difficulty}
            </span>
            <span className="text-muted-500">
              verifier {(draft.verificationScore * 100).toFixed(0)}%
            </span>
          </div>
          <p className="font-serif mt-2 line-clamp-2 text-ink-900">{draft.question}</p>
        </div>
        <span className="mt-1 shrink-0 text-xs text-muted-500">
          {expanded ? '▾' : '▸'}
        </span>
      </button>

      {expanded ? (
        <div className="border-t border-ink-900/10 bg-paper-100 p-5 sm:p-7">
          <DraftDetail draft={draft} onChanged={onChanged} />
        </div>
      ) : null}
    </article>
  );
}

function StatusPill({ status }: { status: McqDraftStatus }) {
  if (status === 'approved') {
    return (
      <span className="rounded-full bg-emerald-100 px-2.5 py-0.5 text-xs font-medium text-emerald-800">
        approved
      </span>
    );
  }
  if (status === 'rejected') {
    return (
      <span className="rounded-full bg-rose-100 px-2.5 py-0.5 text-xs font-medium text-rose-800">
        rejected
      </span>
    );
  }
  return (
    <span className="rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-medium text-amber-800">
      pending
    </span>
  );
}

function DraftDetail({
  draft,
  onChanged,
}: {
  draft: McqDraft;
  onChanged: (message: string) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showRejectInput, setShowRejectInput] = useState(false);
  const [rejectReason, setRejectReason] = useState('');

  async function onApprove() {
    try {
      setBusy(true);
      setError(null);
      await api.admin.approveDraft(draft.id);
      onChanged('Draft approved and published to the live MCQ bank.');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'approve failed');
    } finally {
      setBusy(false);
    }
  }

  async function onReject() {
    if (!rejectReason.trim()) {
      setError('Reason is required when rejecting.');
      return;
    }
    try {
      setBusy(true);
      setError(null);
      await api.admin.rejectDraft(draft.id, rejectReason.trim());
      onChanged('Draft rejected.');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'reject failed');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-6 text-sm">
      {/* Question + options */}
      <div>
        <p className="font-serif text-base text-ink-900">{draft.question}</p>
        <ul className="mt-3 space-y-2">
          {draft.options.map((opt) => (
            <li
              key={opt.key}
              className={
                opt.key === draft.correctOption
                  ? 'rounded border border-emerald-300 bg-emerald-50 px-3 py-2 text-emerald-900'
                  : 'rounded border border-ink-900/10 bg-paper-100 px-3 py-2 text-ink-800'
              }
            >
              <span className="font-medium">{opt.key}.</span> {opt.text}
              {opt.key === draft.correctOption ? (
                <span className="ml-2 text-xs font-medium text-emerald-700">correct</span>
              ) : null}
            </li>
          ))}
        </ul>
      </div>

      {/* Explanation */}
      <details className="rounded-md border border-ink-900/10 bg-paper-200/40 p-3">
        <summary className="cursor-pointer text-xs font-semibold uppercase tracking-wide text-muted-500">
          Explanation
        </summary>
        <p className="mt-2 whitespace-pre-wrap text-ink-800">{draft.explanation}</p>
      </details>

      {/* Source */}
      <p className="text-xs text-muted-500">
        Source: <span className="text-ink-800">{draft.source}</span>
        {' · '}
        Generated by <span className="text-ink-800">{draft.generatedBy}</span>
      </p>

      {/* Verifier scores */}
      <div className="space-y-2">
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-500">
          Verifier scores
        </p>
        {draft.verifiers.map((v, i) => (
          <div key={i} className="rounded-md border border-ink-900/10 bg-paper-100 p-3">
            <p className="text-xs font-medium text-ink-900">
              {v.modelId} ·{' '}
              <span className="tabular-nums">{(v.score * 100).toFixed(0)}%</span>
            </p>
            <p className="mt-1 text-xs text-ink-800">{v.reasoning}</p>
          </div>
        ))}
      </div>

      {/* Rejection reason if already rejected */}
      {draft.status === 'rejected' && draft.rejectionReason ? (
        <div className="rounded border border-rose-300 bg-rose-50 px-3 py-2 text-xs text-rose-900">
          <span className="font-medium">Rejected:</span> {draft.rejectionReason}
        </div>
      ) : null}

      {/* Action controls */}
      {draft.status === 'pending' ? (
        <div className="space-y-3 border-t border-ink-900/10 pt-5">
          {!showRejectInput ? (
            <div className="flex flex-wrap gap-3">
              <button
                type="button"
                onClick={onApprove}
                disabled={busy}
                className="btn-primary"
              >
                {busy ? 'Publishing...' : 'Approve and publish'}
              </button>
              <button
                type="button"
                onClick={() => setShowRejectInput(true)}
                disabled={busy}
                className="btn-ghost"
              >
                Reject
              </button>
            </div>
          ) : (
            <>
              <textarea
                value={rejectReason}
                onChange={(e) => setRejectReason(e.target.value)}
                rows={3}
                placeholder="Why are you rejecting this draft? (required)"
                className="input w-full"
                disabled={busy}
              />
              <div className="flex flex-wrap gap-3">
                <button
                  type="button"
                  onClick={onReject}
                  disabled={busy || !rejectReason.trim()}
                  className="btn-primary"
                >
                  {busy ? 'Rejecting...' : 'Confirm reject'}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setShowRejectInput(false);
                    setRejectReason('');
                    setError(null);
                  }}
                  disabled={busy}
                  className="btn-ghost"
                >
                  Cancel
                </button>
              </div>
            </>
          )}
        </div>
      ) : (
        <p className="border-t border-ink-900/10 pt-5 text-xs text-muted-500">
          {draft.status === 'approved'
            ? `Approved by ${draft.reviewedBy ?? 'unknown'} · published as ${draft.id}`
            : `Rejected by ${draft.reviewedBy ?? 'unknown'}`}
        </p>
      )}

      {error ? (
        <p className="text-sm text-ember-600" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}
