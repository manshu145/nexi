'use client';

import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';
import {
  api,
  type AdminChapterDraft,
  type ChapterEditPayload,
} from '~/lib/api';

/**
 * /admin/chapters/[id]
 *
 * Review the AI-generated chapter content. The reviewer can:
 *   - Read the full chapter as a student will see it
 *   - See per-verifier scores (factual accuracy / coverage / clarity)
 *   - See specific factual issues each verifier flagged
 *   - Edit any section's heading or body inline (light fixes)
 *   - Approve -> publishes to the chapters collection
 *   - Reject -> drops the draft with a reason
 *   - Regenerate -> fresh 3-AI pass with the same slot params
 */
export default function AdminChapterReviewPage() {
  const params = useParams<{ id: string }>();
  const id = params?.id ?? '';
  const router = useRouter();

  const [draft, setDraft] = useState<AdminChapterDraft | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [editMode, setEditMode] = useState(false);
  const [editState, setEditState] = useState<ChapterEditPayload | null>(null);
  const [showRejectInput, setShowRejectInput] = useState(false);
  const [rejectReason, setRejectReason] = useState('');

  const load = useCallback(async () => {
    if (!id) return;
    try {
      setError(null);
      const res = await api.admin.getChapterDraft(id);
      setDraft(res.draft);
      setEditState(null);
      setEditMode(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'failed to load draft');
    }
  }, [id]);

  useEffect(() => {
    void load();
  }, [load]);

  if (!draft) {
    return (
      <main className="mx-auto flex min-h-[40vh] max-w-3xl items-center justify-center px-6 py-10">
        {error ? (
          <div className="banner banner-error">
            <span className="flex-1">{error}</span>
            <button
              type="button"
              className="text-xs underline"
              onClick={() => void load()}
            >
              retry
            </button>
          </div>
        ) : (
          <span className="inline-flex items-center gap-2 text-sm text-muted-500">
            <span className="spinner" aria-hidden="true" />
            Loading draft...
          </span>
        )}
      </main>
    );
  }

  const isPending = draft.status === 'pending';

  const onApprove = async () => {
    try {
      setBusy(true);
      setError(null);
      // Save edits first if any are pending.
      if (editState && Object.keys(editState).length > 0) {
        await api.admin.editChapterDraft(draft.id, editState);
      }
      await api.admin.approveChapterDraft(draft.id);
      setToast('Approved and published. Students can read it now.');
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'approve failed');
    } finally {
      setBusy(false);
    }
  };

  const onReject = async () => {
    if (!rejectReason.trim()) {
      setError('Reason is required when rejecting.');
      return;
    }
    try {
      setBusy(true);
      setError(null);
      await api.admin.rejectChapterDraft(draft.id, rejectReason.trim());
      setToast('Draft rejected.');
      setShowRejectInput(false);
      setRejectReason('');
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'reject failed');
    } finally {
      setBusy(false);
    }
  };

  const onRegenerate = async () => {
    try {
      setBusy(true);
      setError(null);
      const res = await api.admin.regenerateChapterDraft(draft.id);
      setToast('Fresh draft generated. Redirecting...');
      router.push(`/admin/chapters/${encodeURIComponent(res.draft.id)}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'regenerate failed');
    } finally {
      setBusy(false);
    }
  };

  const onSaveEdits = async () => {
    if (!editState) return;
    try {
      setBusy(true);
      setError(null);
      await api.admin.editChapterDraft(draft.id, editState);
      setToast('Edits saved.');
      setEditMode(false);
      setEditState(null);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'save failed');
    } finally {
      setBusy(false);
    }
  };

  const currentTitle = editState?.title ?? draft.title;
  const currentSummary = editState?.summary ?? draft.summary;
  const currentSections = editState?.sections ?? draft.sections;

  function patchEdit(p: Partial<ChapterEditPayload>) {
    setEditState((prev) => ({
      ...(prev ?? {}),
      ...p,
    }));
  }

  return (
    <main className="mx-auto flex max-w-3xl flex-col px-6 py-10">
      <Link
        href="/admin/chapters"
        className="text-sm text-muted-500 hover:text-ink-900"
      >
        ← All chapters
      </Link>

      <section className="mt-3">
        <div className="flex flex-wrap items-center gap-2 text-xs text-muted-500">
          <ChapterStatusPill status={draft.status} />
          <span className="font-medium uppercase tracking-wide">
            {draft.exam} · {draft.subject} · {draft.classLevel}
          </span>
          <span className="rounded bg-paper-200 px-2 py-0.5 font-medium text-ink-800">
            slug: {draft.slug}
          </span>
          <span>verifier {(draft.verificationScore * 100).toFixed(0)}%</span>
          <span>~{draft.estimatedReadMinutes} min read</span>
        </div>
        {editMode ? (
          <input
            value={currentTitle}
            onChange={(e) => patchEdit({ title: e.target.value })}
            className="input mt-3 w-full font-serif text-2xl font-semibold"
            disabled={busy}
          />
        ) : (
          <h1 className="font-serif mt-3 text-3xl font-semibold leading-tight text-ink-900 sm:text-4xl">
            {currentTitle}
          </h1>
        )}
        {editMode ? (
          <textarea
            value={currentSummary}
            onChange={(e) => patchEdit({ summary: e.target.value })}
            rows={2}
            className="input mt-2 w-full"
            disabled={busy}
          />
        ) : (
          <p className="mt-2 text-base text-ink-800">{currentSummary}</p>
        )}
        <p className="mt-2 text-xs text-muted-500">
          Source: <span className="text-ink-800">{draft.source}</span> ·
          Generated by <span className="text-ink-800">{draft.generatedBy}</span>
        </p>
      </section>

      {toast ? (
        <div className="banner banner-success mt-6" role="status">
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

      {error ? (
        <div className="banner banner-error mt-6" role="alert">
          <span>{error}</span>
        </div>
      ) : null}

      {/* Verifier scores */}
      <section className="mt-8 grid gap-3 sm:grid-cols-2">
        {draft.verifiers.map((v, i) => (
          <article
            key={i}
            className={
              v.agreesAccurate
                ? 'paper-card border-gold-500/60 p-4'
                : 'paper-card border-ember-500/60 p-4'
            }
          >
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-500">
              {v.modelId}
            </p>
            <p className="mt-1 text-sm">
              <span className="font-medium text-ink-900">
                {v.agreesAccurate ? 'Agrees accurate' : 'Flags issues'}
              </span>
              <span className="ml-2 tabular-nums text-muted-500">
                fact {(v.factualAccuracy * 100).toFixed(0)}% · cover{' '}
                {(v.coverage * 100).toFixed(0)}% · clarity{' '}
                {(v.clarity * 100).toFixed(0)}%
              </span>
            </p>
            <p className="mt-2 text-sm text-ink-800">{v.reasoning}</p>
            {v.factualErrors.length > 0 ? (
              <ul className="mt-2 space-y-1 text-xs text-ember-700">
                {v.factualErrors.map((err, j) => (
                  <li key={j}>• {err}</li>
                ))}
              </ul>
            ) : null}
          </article>
        ))}
      </section>

      {/* Sections */}
      <section className="paper-card mt-8 p-6 sm:p-8">
        <div className="flex items-center justify-between">
          <h2 className="font-serif text-xl font-semibold text-ink-900">
            Chapter content
          </h2>
          {isPending ? (
            <button
              type="button"
              onClick={() => {
                if (editMode) {
                  setEditState(null);
                  setEditMode(false);
                } else {
                  setEditState({});
                  setEditMode(true);
                }
              }}
              className="btn-ghost-sm"
              disabled={busy}
            >
              {editMode ? 'Cancel edits' : 'Edit text'}
            </button>
          ) : null}
        </div>
        <div className="mt-5 space-y-7">
          {currentSections.map((s, i) => (
            <div key={s.id ?? i}>
              {editMode ? (
                <input
                  value={s.heading}
                  onChange={(e) => {
                    const next = [...currentSections];
                    next[i] = { ...next[i]!, heading: e.target.value };
                    patchEdit({ sections: next });
                  }}
                  className="input w-full font-serif text-lg font-semibold"
                  disabled={busy}
                />
              ) : (
                <h3 className="font-serif text-lg font-semibold text-ink-900">
                  {s.heading}
                </h3>
              )}
              {editMode ? (
                <textarea
                  value={s.body}
                  onChange={(e) => {
                    const next = [...currentSections];
                    next[i] = { ...next[i]!, body: e.target.value };
                    patchEdit({ sections: next });
                  }}
                  rows={Math.max(4, Math.ceil(s.body.length / 80))}
                  className="input mt-2 w-full font-serif"
                  disabled={busy}
                />
              ) : (
                <div className="prose-paper font-serif mt-2 whitespace-pre-wrap text-ink-800">
                  {s.body}
                </div>
              )}
            </div>
          ))}
        </div>
        {editMode ? (
          <div className="mt-6 flex gap-3">
            <button
              type="button"
              onClick={onSaveEdits}
              className="btn-primary"
              disabled={busy || !editState || Object.keys(editState).length === 0}
            >
              {busy ? 'Saving...' : 'Save edits'}
            </button>
            <button
              type="button"
              onClick={() => {
                setEditState(null);
                setEditMode(false);
              }}
              className="btn-ghost"
              disabled={busy}
            >
              Discard
            </button>
          </div>
        ) : null}
      </section>

      {/* Rejection note if applicable */}
      {draft.status === 'rejected' && draft.rejectionReason ? (
        <div className="banner banner-error mt-6">
          <span>
            <span className="font-medium">Rejected:</span> {draft.rejectionReason}
          </span>
        </div>
      ) : null}

      {/* Action bar */}
      {isPending ? (
        <section className="mt-8 border-t border-ink-900/10 pt-6">
          {!showRejectInput ? (
            <div className="flex flex-wrap gap-3">
              <button
                type="button"
                onClick={onApprove}
                className="btn-primary"
                disabled={busy}
              >
                {busy ? 'Publishing...' : 'Approve & publish'}
              </button>
              <button
                type="button"
                onClick={() => setShowRejectInput(true)}
                className="btn-ghost"
                disabled={busy}
              >
                Reject
              </button>
              <button
                type="button"
                onClick={onRegenerate}
                className="btn-ghost"
                disabled={busy}
                title="Regenerate fresh draft with the same slot params"
              >
                Regenerate
              </button>
            </div>
          ) : (
            <div className="space-y-3">
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
                  }}
                  className="btn-ghost"
                  disabled={busy}
                >
                  Cancel
                </button>
              </div>
            </div>
          )}
        </section>
      ) : (
        <p className="mt-8 border-t border-ink-900/10 pt-6 text-sm text-muted-500">
          {draft.status === 'approved'
            ? `Approved by ${draft.reviewedBy ?? 'unknown'} -- live on /chapters/${draft.exam}/${draft.subject}/${draft.slug}`
            : `Rejected by ${draft.reviewedBy ?? 'unknown'}`}
        </p>
      )}
    </main>
  );
}

function ChapterStatusPill({
  status,
}: {
  status: AdminChapterDraft['status'];
}) {
  if (status === 'approved') {
    return <span className="pill pill-success">approved</span>;
  }
  if (status === 'rejected') {
    return <span className="pill pill-warn">rejected</span>;
  }
  return <span className="pill pill-neutral">pending</span>;
}
