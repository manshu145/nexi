'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import {
  CURRENT_AFFAIRS_CATEGORY_LABELS,
  EXAM_BY_SLUG,
  type CurrentAffairsDigestDraft,
} from '@nexigrate/shared';
import { Logo } from '~/components/Logo';
import { useAuth } from '~/lib/auth-context';
import { api } from '~/lib/api';

/**
 * /admin/current-affairs/[id] -- Phase 19 admin review screen.
 *
 * Per-verifier scorecards + raw notes + per-item preview, with approve /
 * reject / regenerate actions. Edit-in-place is intentionally NOT in v1
 * (admin can regenerate with different raw notes if needed); we add a
 * lightweight summary editor only.
 */
export default function AdminCurrentAffairsReviewPage() {
  const params = useParams<{ id: string }>();
  const id = params?.id ?? '';
  const router = useRouter();
  const { user, loading } = useAuth();

  const [draft, setDraft] = useState<CurrentAffairsDigestDraft | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [flash, setFlash] = useState<string | null>(null);
  const [rejectReason, setRejectReason] = useState('');

  async function reload() {
    try {
      const res = await api.admin.getCurrentAffairsDraft(id);
      setDraft(res.draft);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'failed to load draft');
    }
  }

  useEffect(() => {
    if (!user || !id) return;
    void reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, id]);

  async function handleApprove() {
    if (busy || !draft) return;
    setBusy(true);
    setError(null);
    try {
      const res = await api.admin.approveCurrentAffairsDraft(draft.id);
      setFlash(`Published for ${res.digest.date}`);
      await reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'approve failed');
    } finally {
      setBusy(false);
    }
  }

  async function handleReject() {
    if (busy || !draft) return;
    if (!rejectReason.trim()) {
      setError('Reason required');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await api.admin.rejectCurrentAffairsDraft(draft.id, rejectReason.trim());
      setFlash('Rejected');
      await reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'reject failed');
    } finally {
      setBusy(false);
    }
  }

  async function handleRegenerate() {
    if (busy || !draft) return;
    if (!window.confirm('Re-run the 3-AI pipeline against the same raw notes?')) {
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const res = await api.admin.regenerateCurrentAffairsDraft(draft.id);
      setFlash(`Regenerated (${res.draft.items.length} items)`);
      await reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'regenerate failed');
    } finally {
      setBusy(false);
    }
  }

  if (loading) {
    return (
      <main className="flex min-h-[60vh] items-center justify-center px-6">
        <span className="inline-flex items-center gap-2 text-sm text-muted-500">
          <span className="spinner" aria-hidden="true" />
          Loading...
        </span>
      </main>
    );
  }

  if (error && !draft) {
    return (
      <main className="mx-auto max-w-2xl px-6 pt-8">
        <Logo />
        <div className="banner banner-error mt-8">{error}</div>
        <Link href="/admin/current-affairs" className="btn-ghost mt-4 inline-flex">
          Back
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

  return (
    <main className="mx-auto flex min-h-screen max-w-4xl flex-col px-6 pt-8 pb-16">
      <header className="flex items-start justify-between">
        <Logo />
        <div className="flex items-center gap-2">
          <Link href="/admin/current-affairs" className="btn-ghost-sm">
            All drafts
          </Link>
          <button
            type="button"
            onClick={() => router.push('/admin')}
            className="btn-ghost-sm"
          >
            Admin home
          </button>
        </div>
      </header>

      <section className="mt-10">
        <p className="pill mb-3">
          Draft for {draft.date} ·{' '}
          {draft.status === 'approved'
            ? 'Published'
            : draft.status === 'rejected'
            ? 'Rejected'
            : 'Pending'}
        </p>
        <h1 className="font-serif text-3xl font-semibold leading-tight text-ink-900 sm:text-4xl">
          {draft.summary}
        </h1>
        <p className="mt-2 text-sm text-muted-500">
          Verified {Math.round(draft.verificationScore * 100)}% · {draft.items.length}{' '}
          items · generated by {draft.generatedBy}
        </p>
      </section>

      {flash ? (
        <div className="banner banner-success mt-4" role="status">
          {flash}
        </div>
      ) : null}
      {error ? (
        <div className="banner banner-error mt-4" role="alert">
          {error}
        </div>
      ) : null}

      {/* Verifier scorecards ------------------------------------------ */}
      <section className="mt-6 grid gap-3 sm:grid-cols-2">
        {draft.verifiers.map((v, i) => (
          <article key={i} className="paper-card p-4">
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-500">
              Verifier {i + 1} · {v.modelId}
            </p>
            <p
              className={
                'font-serif mt-1 text-sm font-semibold ' +
                (v.agreesAccurate ? 'text-gold-700' : 'text-ember-600')
              }
            >
              {v.agreesAccurate ? 'Passes' : 'Flagged'}
            </p>
            <div className="mt-2 grid grid-cols-3 gap-2 text-xs">
              <Pct label="Factual" value={v.factualAccuracy} />
              <Pct label="Neutrality" value={v.neutrality} />
              <Pct label="Clarity" value={v.clarity} />
            </div>
            {v.factualErrors.length > 0 ? (
              <ul className="mt-3 list-disc space-y-1 pl-5 text-xs text-ember-600">
                {v.factualErrors.map((e, j) => (
                  <li key={j}>{e}</li>
                ))}
              </ul>
            ) : null}
            {v.reasoning ? (
              <p className="mt-2 text-xs text-muted-500">{v.reasoning}</p>
            ) : null}
          </article>
        ))}
      </section>

      {/* Raw notes ---------------------------------------------------- */}
      <section className="paper-card mt-4 p-5">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-500">
          Admin&apos;s raw notes
        </p>
        <pre className="mt-2 max-h-48 overflow-y-auto whitespace-pre-wrap font-mono text-xs text-ink-800">
          {draft.rawNotes}
        </pre>
      </section>

      {/* Items preview ----------------------------------------------- */}
      <section className="mt-6 flex flex-col gap-3">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-500">
          Items ({draft.items.length})
        </p>
        {draft.items.map((it) => (
          <article key={it.id} className="paper-card p-4">
            <div className="flex items-center justify-between gap-2">
              <p className="text-xs font-semibold uppercase tracking-[0.14em] text-ember-600">
                {CURRENT_AFFAIRS_CATEGORY_LABELS[it.category]}
              </p>
              {it.relevantExams.length > 0 ? (
                <p className="text-[11px] text-muted-500">
                  {it.relevantExams
                    .map((e) => EXAM_BY_SLUG.get(e)?.name ?? e)
                    .join(' · ')}
                </p>
              ) : null}
            </div>
            <h3 className="font-serif mt-1 text-base font-semibold leading-snug text-ink-900">
              {it.headline}
            </h3>
            <p className="mt-1 whitespace-pre-wrap text-sm text-ink-800">{it.body}</p>
            {it.sources.length > 0 ? (
              <p className="mt-2 text-[11px] text-muted-500">
                Sources: {it.sources.join(' · ')}
              </p>
            ) : null}
          </article>
        ))}
      </section>

      {/* Actions ----------------------------------------------------- */}
      {draft.status === 'pending' ? (
        <section className="paper-card mt-6 p-5">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-500">
            Actions
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={handleApprove}
              disabled={busy}
              className="btn-primary"
            >
              {busy ? 'Working...' : 'Approve & publish'}
            </button>
            <button
              type="button"
              onClick={handleRegenerate}
              disabled={busy}
              className="btn-ghost"
            >
              Regenerate
            </button>
          </div>
          <div className="mt-4">
            <label className="block">
              <span className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-500">
                Reject reason (required to reject)
              </span>
              <input
                type="text"
                value={rejectReason}
                onChange={(e) => setRejectReason(e.target.value)}
                disabled={busy}
                placeholder="e.g. partisan framing on item 3, regenerate with neutral hint"
                className="input mt-1 w-full"
              />
            </label>
            <button
              type="button"
              onClick={handleReject}
              disabled={busy || !rejectReason.trim()}
              className="btn-ghost mt-2"
            >
              Reject
            </button>
          </div>
        </section>
      ) : null}
    </main>
  );
}

function Pct({ label, value }: { label: string; value: number }) {
  const pct = Math.round(value * 100);
  return (
    <div>
      <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-500">
        {label}
      </p>
      <p className="font-serif text-base font-semibold tabular-nums text-ink-900">
        {pct}%
      </p>
    </div>
  );
}
