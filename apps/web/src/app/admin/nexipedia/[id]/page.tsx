'use client';

import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';
import {
  EXAM_BY_SLUG,
  NEXIPEDIA_CATEGORY_LABELS,
} from '@nexigrate/shared';
import {
  api,
  type AdminNexipediaDraft,
  type NexipediaArticleEditPayload,
} from '~/lib/api';

/**
 * /admin/nexipedia/[id]
 *
 * Per-draft review page. Same structure as /admin/chapters/[id]:
 *   - Verifier scorecards at the top (factual / structure / clarity per
 *     verifier, plus listed factualErrors)
 *   - Article body rendered as the student will see it (Lora serif via
 *     the .reader / .reader-section classes)
 *   - Edit toggle for light pre-approval tweaks to title/summary/sections
 *   - Approve / reject / regenerate actions
 */
export default function AdminNexipediaReviewPage() {
  const params = useParams<{ id: string }>();
  const id = params?.id ?? '';
  const router = useRouter();

  const [draft, setDraft] = useState<AdminNexipediaDraft | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<'approve' | 'reject' | 'regenerate' | 'edit' | null>(null);
  const [editing, setEditing] = useState(false);
  const [rejReason, setRejReason] = useState('');
  const [editBuf, setEditBuf] = useState<NexipediaArticleEditPayload>({});

  const load = useCallback(async () => {
    try {
      const res = await api.admin.getNexipediaDraft(id);
      setDraft(res.draft);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'failed to load draft');
    }
  }, [id]);

  useEffect(() => {
    if (id) void load();
  }, [id, load]);

  if (error) {
    return (
      <main className="mx-auto max-w-3xl px-6 py-10">
        <div className="banner banner-error" role="alert">
          <span>{error}</span>
        </div>
        <Link href="/admin/nexipedia" className="btn-ghost mt-4 inline-flex">
          Back to drafts
        </Link>
      </main>
    );
  }

  if (!draft) {
    return (
      <main className="flex min-h-[60vh] items-center justify-center px-6">
        <span className="inline-flex items-center gap-2 text-sm text-muted-500">
          <span className="spinner" aria-hidden="true" />
          Loading draft...
        </span>
      </main>
    );
  }

  async function approve() {
    if (!draft) return;
    setBusy('approve');
    try {
      await api.admin.approveNexipediaDraft(draft.id);
      router.push('/admin/nexipedia');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'approve failed');
    } finally {
      setBusy(null);
    }
  }

  async function reject() {
    if (!draft) return;
    if (!rejReason.trim()) {
      setError('rejection reason is required');
      return;
    }
    setBusy('reject');
    try {
      await api.admin.rejectNexipediaDraft(draft.id, rejReason.trim());
      router.push('/admin/nexipedia');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'reject failed');
    } finally {
      setBusy(null);
    }
  }

  async function regenerate() {
    if (!draft) return;
    setBusy('regenerate');
    try {
      const res = await api.admin.regenerateNexipediaDraft(draft.id);
      router.push(`/admin/nexipedia/${encodeURIComponent(res.draft.id)}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'regenerate failed');
    } finally {
      setBusy(null);
    }
  }

  async function saveEdits() {
    if (!draft) return;
    setBusy('edit');
    try {
      await api.admin.editNexipediaDraft(draft.id, editBuf);
      setEditBuf({});
      setEditing(false);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'edit failed');
    } finally {
      setBusy(null);
    }
  }

  return (
    <main className="mx-auto max-w-3xl px-6 py-8">
      <div className="flex items-start justify-between">
        <div>
          <p className="pill mb-3">Nexipedia draft</p>
          <h1 className="font-serif text-2xl font-semibold leading-tight text-ink-900 sm:text-3xl">
            {draft.title}
          </h1>
          <p className="mt-1 text-sm text-muted-500">
            {NEXIPEDIA_CATEGORY_LABELS[draft.category]} · slug{' '}
            <code className="rounded bg-paper-200 px-1 py-0.5 text-xs">{draft.slug}</code>{' '}
            · {draft.sections.length} sections · ~{draft.estimatedReadMinutes} min
          </p>
        </div>
        <Link href="/admin/nexipedia" className="btn-ghost-sm">
          All drafts
        </Link>
      </div>

      {/* Verifier scorecards */}
      <section className="mt-6 grid gap-4 sm:grid-cols-2">
        {draft.verifiers.map((v, i) => (
          <article key={`${v.modelId}-${i}`} className="paper-card p-5">
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-500">
              Verifier {i + 1} · {v.modelId}
            </p>
            <p className="mt-1 text-sm text-ink-800">
              {v.agreesAccurate ? '\u2713 Accepted' : '\u2717 Flagged'}
            </p>
            <dl className="mt-3 grid grid-cols-3 gap-2 text-xs">
              <ScoreCell label="Factual" value={v.factualAccuracy} />
              <ScoreCell label="Structure" value={v.structure} />
              <ScoreCell label="Clarity" value={v.clarity} />
            </dl>
            <p className="mt-3 text-sm text-ink-800">{v.reasoning}</p>
            {v.factualErrors.length > 0 ? (
              <ul className="mt-2 list-inside list-disc text-xs text-ember-700">
                {v.factualErrors.map((e, ei) => (
                  <li key={ei}>{e}</li>
                ))}
              </ul>
            ) : null}
          </article>
        ))}
      </section>

      <section className="paper-card mt-6 p-5">
        <p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-500">
          Combined verification score
        </p>
        <p className="font-serif mt-2 text-3xl font-semibold tabular-nums text-ink-900">
          {Math.round(draft.verificationScore * 100)}%
        </p>
        <p className="mt-1 text-xs text-muted-500">
          Source claimed: {draft.source}
        </p>
        {draft.relatedExams.length > 0 ? (
          <p className="mt-2 text-xs text-muted-500">
            Related exams: {draft.relatedExams.map((e) => EXAM_BY_SLUG.get(e)?.name ?? e).join(', ')}
          </p>
        ) : null}
      </section>

      {/* Action bar */}
      <section className="mt-6 flex flex-wrap items-center gap-2">
        {draft.status === 'pending' ? (
          <>
            <button
              type="button"
              onClick={() => setEditing((v) => !v)}
              className="btn-ghost"
              disabled={busy !== null}
            >
              {editing ? 'Stop editing' : 'Edit text'}
            </button>
            <button
              type="button"
              onClick={approve}
              disabled={busy !== null}
              className="btn-primary"
            >
              {busy === 'approve' ? 'Publishing...' : 'Approve & publish'}
            </button>
            <button
              type="button"
              onClick={regenerate}
              disabled={busy !== null}
              className="btn-ghost"
            >
              {busy === 'regenerate' ? 'Regenerating...' : 'Regenerate'}
            </button>
          </>
        ) : (
          <span className="pill pill-neutral">Status: {draft.status}</span>
        )}
      </section>

      {draft.status === 'pending' ? (
        <section className="mt-4 flex flex-wrap items-end gap-2">
          <label className="flex-1">
            <span className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-500">
              Rejection reason (required to reject)
            </span>
            <input
              type="text"
              value={rejReason}
              onChange={(e) => setRejReason(e.target.value)}
              placeholder="e.g. Multiple unsourced claims; verifier flagged numbers."
              className="input mt-1"
              maxLength={500}
            />
          </label>
          <button
            type="button"
            onClick={reject}
            disabled={busy !== null || !rejReason.trim()}
            className="btn-ghost"
          >
            {busy === 'reject' ? 'Rejecting...' : 'Reject'}
          </button>
        </section>
      ) : null}

      {/* Body preview / editor. */}
      <section className="reader mt-8">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-ember-600">
          Article body preview (student view)
        </p>
        {editing ? (
          <div className="mt-4 flex flex-col gap-4">
            <label className="flex flex-col gap-1">
              <span className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-500">
                Title
              </span>
              <input
                type="text"
                defaultValue={draft.title}
                onChange={(e) =>
                  setEditBuf((b) => ({ ...b, title: e.target.value }))
                }
                className="input"
                maxLength={160}
              />
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-500">
                Summary
              </span>
              <textarea
                defaultValue={draft.summary}
                onChange={(e) =>
                  setEditBuf((b) => ({ ...b, summary: e.target.value }))
                }
                className="input min-h-[80px]"
                maxLength={600}
              />
            </label>
            {draft.sections
              .slice()
              .sort((a, b) => a.order - b.order)
              .map((s, i) => (
                <div key={s.id} className="paper-card p-4">
                  <p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-500">
                    Section {i + 1}
                  </p>
                  <input
                    type="text"
                    defaultValue={s.heading}
                    onChange={(e) =>
                      setEditBuf((b) => ({
                        ...b,
                        sections: nextSections(draft, b.sections, i, {
                          heading: e.target.value,
                        }),
                      }))
                    }
                    className="input mt-2"
                    maxLength={160}
                  />
                  <textarea
                    defaultValue={s.body}
                    onChange={(e) =>
                      setEditBuf((b) => ({
                        ...b,
                        sections: nextSections(draft, b.sections, i, {
                          body: e.target.value,
                        }),
                      }))
                    }
                    className="input mt-2 min-h-[140px] font-mono text-sm"
                    maxLength={20_000}
                  />
                </div>
              ))}
            <div>
              <button
                type="button"
                onClick={saveEdits}
                disabled={busy !== null}
                className="btn-primary"
              >
                {busy === 'edit' ? 'Saving...' : 'Save edits'}
              </button>
            </div>
          </div>
        ) : (
          <>
            <h2 className="font-serif mt-4 text-xl font-semibold text-ink-900">
              {draft.title}
            </h2>
            <p className="mt-2 text-ink-800">{draft.summary}</p>
            {draft.sections
              .slice()
              .sort((a, b) => a.order - b.order)
              .map((s) => (
                <section key={s.id} className="reader-section mt-6">
                  <h3 className="reader-heading font-serif text-lg font-semibold text-ink-900">
                    {s.heading}
                  </h3>
                  <div className="reader-body mt-2 whitespace-pre-line text-ink-800">
                    {s.body}
                  </div>
                </section>
              ))}
          </>
        )}
      </section>
    </main>
  );
}

function ScoreCell({ label, value }: { label: string; value: number }) {
  return (
    <div>
      <dt className="text-muted-500">{label}</dt>
      <dd className="font-serif text-base font-semibold tabular-nums text-ink-900">
        {Math.round(value * 100)}%
      </dd>
    </div>
  );
}

/**
 * Build the next sections array for the edit buffer. Mutating a single
 * section preserves the others as-is.
 */
function nextSections(
  draft: AdminNexipediaDraft,
  bufSections: NexipediaArticleEditPayload['sections'] | undefined,
  index: number,
  patch: Partial<{ heading: string; body: string }>,
): NexipediaArticleEditPayload['sections'] {
  const sorted = draft.sections.slice().sort((a, b) => a.order - b.order);
  const base = bufSections ?? sorted.map((s) => ({ ...s }));
  const target = base[index];
  if (!target) return base;
  base[index] = { ...target, ...patch };
  return base;
}
