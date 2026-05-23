'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { LIVE_EXAMS, SOON_EXAMS, type ExamSlug } from '@nexigrate/shared';
import { Logo } from '~/components/Logo';
import { useAuth } from '~/lib/auth-context';
import {
  api,
  type AdminMcqDraft,
  type DraftStatus,
  type Difficulty,
  type GenerateDraftRequest,
} from '~/lib/api';

/**
 * /admin/mcq-drafts
 *
 * Owner workspace. Generate via 3-AI, review, approve / reject.
 * Gated by Firebase custom claim `admin: true`. Non-admins see a polite 403.
 */
export default function AdminMcqDraftsPage() {
  const { user, loading, signOut } = useAuth();
  const router = useRouter();

  const [adminCheck, setAdminCheck] = useState<'unknown' | 'admin' | 'denied'>('unknown');
  const [filter, setFilter] = useState<DraftStatus | 'all'>('pending');
  const [drafts, setDrafts] = useState<AdminMcqDraft[]>([]);
  const [listError, setListError] = useState<string | null>(null);
  const [listLoading, setListLoading] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  useEffect(() => {
    if (!loading && !user) router.replace('/signin');
  }, [user, loading, router]);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    (async () => {
      try {
        const r = await user.getIdTokenResult(true);
        const isAdmin = Boolean(r.claims['admin']);
        if (!cancelled) setAdminCheck(isAdmin ? 'admin' : 'denied');
      } catch {
        if (!cancelled) setAdminCheck('denied');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [user]);

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
    if (adminCheck !== 'admin') return;
    void refreshDrafts();
  }, [adminCheck, refreshDrafts]);

  if (loading || adminCheck === 'unknown') {
    return (
      <main className="flex min-h-[60vh] items-center justify-center px-6">
        <span className="inline-flex items-center gap-2 text-sm text-muted-500">
          <span className="spinner" aria-hidden="true" />
          Loading...
        </span>
      </main>
    );
  }

  if (adminCheck === 'denied') {
    return (
      <main className="mx-auto flex min-h-screen max-w-md flex-col px-6 pt-10">
        <Logo />
        <section className="paper-card mt-12 p-7 text-center">
          <p className="pill mb-5">403</p>
          <h1 className="font-serif text-2xl font-semibold text-ink-900">
            You don't have admin access.
          </h1>
          <p className="mt-3 text-ink-800">
            This area is for the Nexigrate team. If this is a mistake, email{' '}
            <a className="text-ember-600 underline" href="mailto:hello@nexigrate.com">
              hello@nexigrate.com
            </a>
            .
          </p>
          <button
            type="button"
            onClick={() => router.push('/dashboard')}
            className="btn-primary mt-7 w-full"
          >
            Back to your dashboard
          </button>
        </section>
      </main>
    );
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-4xl flex-col px-6 pt-8 pb-16">
      <header className="flex items-start justify-between">
        <Logo />
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => router.push('/dashboard')}
            className="btn-ghost-sm"
          >
            Student view
          </button>
          <button
            type="button"
            onClick={() => signOut().then(() => router.replace('/signin'))}
            className="btn-ghost-sm"
          >
            Sign out
          </button>
        </div>
      </header>

      <section className="mt-10">
        <p className="pill mb-3">Admin</p>
        <h1 className="font-serif text-3xl font-semibold leading-tight text-ink-900 sm:text-4xl">
          MCQ drafts
        </h1>
        <p className="mt-2 text-sm text-muted-500">
          Generate. Review what 3 AIs wrote. Publish only what passes.
        </p>
      </section>

      <section className="paper-card mt-8 p-6 sm:p-8">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-ember-600">
              Generate
            </p>
            <h2 className="font-serif mt-1 text-xl font-semibold text-ink-900">
              New MCQ from a chapter section
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
          <GenerateDraftForm
            onSuccess={(draft) => {
              setShowForm(false);
              setToast(
                `Draft generated. Verifier: ${
                  draft.verifier?.approved
                    ? 'approved'
                    : draft.verifier?.approved === false
                      ? 'flagged'
                      : 'no verdict'
                }.`,
              );
              setFilter('pending');
              setExpandedId(draft.id);
              void refreshDrafts();
            }}
          />
        ) : null}
      </section>

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

        {drafts.length === 0 && !listLoading ? (
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

function GenerateDraftForm({
  onSuccess,
}: {
  onSuccess: (draft: AdminMcqDraft) => void;
}) {
  const [exam, setExam] = useState<ExamSlug | string>(LIVE_EXAMS[0]?.slug ?? 'jee-main');
  const [subject, setSubject] = useState('');
  const [chapter, setChapter] = useState('');
  const [sourceText, setSourceText] = useState('');
  const [sourceCitation, setSourceCitation] = useState('');
  const [difficulty, setDifficulty] = useState<Difficulty>('medium');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const examChoices = useMemo(
    () => [
      ...LIVE_EXAMS.map((e) => ({ slug: e.slug, name: `${e.name} (live)` })),
      ...SOON_EXAMS.map((e) => ({ slug: e.slug, name: `${e.name} (coming soon)` })),
    ],
    [],
  );

  async function onSubmit(ev: React.FormEvent) {
    ev.preventDefault();
    if (!subject.trim() || !chapter.trim() || !sourceText.trim() || !sourceCitation.trim()) {
      setError('Fill every field. Source text needs at least 40 characters.');
      return;
    }
    if (sourceText.length < 40) {
      setError('Source text needs at least 40 characters so the AI has enough context.');
      return;
    }
    try {
      setError(null);
      setSubmitting(true);
      const body: GenerateDraftRequest = {
        exam,
        subject: subject.trim(),
        chapter: chapter.trim(),
        sourceText: sourceText.trim(),
        sourceCitation: sourceCitation.trim(),
        difficulty,
      };
      const res = await api.admin.generateDraft(body);
      onSuccess(res.draft);
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
              <option key={c.slug} value={c.slug}>
                {c.name}
              </option>
            ))}
          </select>
        </label>
        <label className="block text-sm">
          <span className="block font-medium text-ink-900">Difficulty</span>
          <select
            value={difficulty}
            onChange={(e) => setDifficulty(e.target.value as Difficulty)}
            className="input mt-1 w-full"
            disabled={submitting}
          >
            <option value="easy">Easy</option>
            <option value="medium">Medium</option>
            <option value="hard">Hard</option>
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
      <label className="block text-sm">
        <span className="block font-medium text-ink-900">Source citation</span>
        <input
          value={sourceCitation}
          onChange={(e) => setSourceCitation(e.target.value)}
          placeholder="NCERT Class 11 Physics, Chapter 1, page 12"
          className="input mt-1 w-full"
          disabled={submitting}
        />
      </label>
      <label className="block text-sm">
        <span className="block font-medium text-ink-900">
          Source text{' '}
          <span className="text-muted-500">
            ({sourceText.length} chars; min 40)
          </span>
        </span>
        <textarea
          value={sourceText}
          onChange={(e) => setSourceText(e.target.value)}
          rows={6}
          placeholder="Paste the chapter excerpt the AI should generate the question from. Be specific -- the AI will not invent facts beyond what you give it."
          className="input mt-1 w-full font-mono text-sm leading-relaxed"
          disabled={submitting}
        />
      </label>
      <button type="submit" disabled={submitting} className="btn-primary">
        {submitting ? 'Generating via 3 AIs...' : 'Generate via OpenAI + Gemini + Groq'}
      </button>
      {error ? (
        <p className="text-sm text-ember-600" role="alert">
          {error}
        </p>
      ) : null}
      <p className="text-xs text-muted-500">
        The 3 AIs run in parallel. The verifier (a 4th model) cross-checks the
        consensus. Expect 5-15 seconds.
      </p>
    </form>
  );
}

function DraftRow({
  draft,
  expanded,
  onToggle,
  onChanged,
}: {
  draft: AdminMcqDraft;
  expanded: boolean;
  onToggle: () => void;
  onChanged: (message: string) => void;
}) {
  const ctx = draft.prompt ?? draft.generationContext;
  const candidate = pickPrimaryCandidate(draft);
  const verifier = draft.verifier;
  const verifierApproved = verifier?.approved === true;
  const verifierFlagged = verifier?.approved === false;

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
            {ctx ? (
              <span className="font-medium uppercase tracking-wide">
                {ctx.exam} · {ctx.subject} · {ctx.chapter}
              </span>
            ) : null}
            {verifierApproved ? (
              <span className="text-emerald-700">verifier ok</span>
            ) : verifierFlagged ? (
              <span className="text-ember-600">verifier flagged</span>
            ) : null}
          </div>
          <p className="font-serif mt-2 line-clamp-2 text-ink-900">
            {candidate?.output?.question ?? draft.content?.question ?? '(no question yet)'}
          </p>
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

function StatusPill({ status }: { status: DraftStatus }) {
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
  draft: AdminMcqDraft;
  onChanged: (message: string) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showRejectInput, setShowRejectInput] = useState(false);
  const [rejectNote, setRejectNote] = useState('');
  const [approveNote, setApproveNote] = useState('');

  const ctx = draft.prompt ?? draft.generationContext;
  const candidates = draft.candidates ?? [];
  const chosenIndex = draft.chosenCandidateIndex ?? 0;

  async function onApprove() {
    try {
      setBusy(true);
      setError(null);
      await api.admin.approveDraft(draft.id, approveNote || undefined);
      onChanged('Draft approved and published to the live MCQ bank.');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'approve failed');
    } finally {
      setBusy(false);
    }
  }

  async function onReject() {
    if (!rejectNote.trim()) {
      setError('Reason is required when rejecting.');
      return;
    }
    try {
      setBusy(true);
      setError(null);
      await api.admin.rejectDraft(draft.id, rejectNote.trim());
      onChanged('Draft rejected.');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'reject failed');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-6 text-sm">
      {ctx?.sourceText ? (
        <details className="rounded-md border border-ink-900/10 bg-paper-200/40 p-3">
          <summary className="cursor-pointer text-xs font-semibold uppercase tracking-wide text-muted-500">
            Source material{ctx.sourceCitation ? ` · ${ctx.sourceCitation}` : ''}
          </summary>
          <p className="mt-2 whitespace-pre-wrap text-ink-800">{ctx.sourceText}</p>
        </details>
      ) : null}

      <div className="grid gap-3 sm:grid-cols-3">
        {candidates.length === 0 && draft.content ? (
          <CandidateCard label="Chosen content" output={draft.content} highlight />
        ) : null}
        {candidates.map((c, i) => (
          <CandidateCard
            key={i}
            label={c.modelId ?? c.providerId ?? `model ${i + 1}`}
            output={c.output ?? null}
            error={c.errorMessage}
            highlight={i === chosenIndex}
          />
        ))}
      </div>

      {draft.verifier ? (
        <div className="rounded-md border border-ink-900/10 p-3">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-500">
            Verifier ({draft.verifier.modelId ?? 'unknown model'})
          </p>
          <p className="mt-2 text-ink-900">
            <span className="font-medium">
              {draft.verifier.approved ? 'Approved' : 'Flagged'}
            </span>
            {' · '}
            confidence{' '}
            <span className="tabular-nums">
              {(draft.verifier.confidence * 100).toFixed(0)}%
            </span>
          </p>
          {draft.verifier.reasoning ? (
            <p className="mt-2 text-ink-800">{draft.verifier.reasoning}</p>
          ) : null}
          {draft.verifier.issues && draft.verifier.issues.length > 0 ? (
            <ul className="mt-2 list-disc pl-5 text-ember-700">
              {draft.verifier.issues.map((iss, i) => (
                <li key={i}>{iss}</li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : draft.verifications && draft.verifications.length > 0 ? (
        <div className="space-y-2">
          {draft.verifications.map((v, i) => (
            <div key={i} className="rounded-md border border-ink-900/10 p-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-500">
                Verifier {v.modelId ?? v.providerId ?? `#${i + 1}`}
              </p>
              <p className="mt-1 text-ink-900">
                {v.agreesCorrect === true
                  ? 'Agrees'
                  : v.agreesCorrect === false
                    ? 'Disagrees'
                    : '—'}
                {typeof v.score === 'number'
                  ? ` · score ${(v.score * 100).toFixed(0)}%`
                  : ''}
              </p>
              {v.reasoning ? (
                <p className="mt-1 text-ink-800">{v.reasoning}</p>
              ) : null}
            </div>
          ))}
        </div>
      ) : null}

      {draft.status === 'pending' ? (
        <div className="space-y-3 border-t border-ink-900/10 pt-5">
          {!showRejectInput ? (
            <>
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
              <input
                value={approveNote}
                onChange={(e) => setApproveNote(e.target.value)}
                placeholder="Optional note for the audit log..."
                className="input w-full"
                disabled={busy}
              />
            </>
          ) : (
            <>
              <textarea
                value={rejectNote}
                onChange={(e) => setRejectNote(e.target.value)}
                rows={3}
                placeholder="Why are you rejecting this draft? (required)"
                className="input w-full"
                disabled={busy}
              />
              <div className="flex flex-wrap gap-3">
                <button
                  type="button"
                  onClick={onReject}
                  disabled={busy || !rejectNote.trim()}
                  className="btn-primary"
                >
                  {busy ? 'Rejecting...' : 'Confirm reject'}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setShowRejectInput(false);
                    setRejectNote('');
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
        <div className="border-t border-ink-900/10 pt-5 text-xs text-muted-500">
          {draft.status === 'approved'
            ? `Approved${draft.publishedMcqId ? ` · published as ${draft.publishedMcqId}` : ''}`
            : `Rejected${draft.reviewNote ? ` · "${draft.reviewNote}"` : ''}`}
        </div>
      )}

      {error ? (
        <p className="text-sm text-ember-600" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}

function CandidateCard({
  label,
  output,
  error,
  highlight,
}: {
  label: string;
  output: {
    question: string;
    options: { key: 'A' | 'B' | 'C' | 'D'; text: string }[];
    correctOption: 'A' | 'B' | 'C' | 'D';
    explanation: string;
  } | null;
  error?: string | null;
  highlight?: boolean;
}) {
  return (
    <div
      className={
        'rounded-md border p-3 ' +
        (highlight
          ? 'border-ember-600 bg-paper-200/60'
          : 'border-ink-900/10 bg-paper-100')
      }
    >
      <p className="text-xs font-semibold uppercase tracking-wide text-muted-500">
        {label}
        {highlight ? ' · chosen' : ''}
      </p>
      {output ? (
        <>
          <p className="font-serif mt-2 text-ink-900">{output.question}</p>
          <ul className="mt-2 space-y-1">
            {output.options.map((opt) => (
              <li
                key={opt.key}
                className={
                  opt.key === output.correctOption
                    ? 'rounded bg-emerald-100 px-2 py-0.5 text-emerald-900'
                    : 'px-2 py-0.5 text-ink-800'
                }
              >
                <span className="font-medium">{opt.key}.</span> {opt.text}
              </li>
            ))}
          </ul>
          <p className="mt-2 text-xs text-ink-700">{output.explanation}</p>
        </>
      ) : (
        <p className="mt-2 text-xs text-ember-600">
          Failed: {error ?? 'no output'}
        </p>
      )}
    </div>
  );
}

function pickPrimaryCandidate(draft: AdminMcqDraft) {
  if (
    typeof draft.chosenCandidateIndex === 'number' &&
    draft.candidates?.[draft.chosenCandidateIndex]
  ) {
    return draft.candidates[draft.chosenCandidateIndex];
  }
  return draft.candidates?.find((c) => c.output) ?? null;
}
