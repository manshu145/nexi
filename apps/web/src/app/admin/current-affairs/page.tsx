'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import {
  type CurrentAffairsDigestDraft,
  type CurrentAffairsDigestStatus,
} from '@nexigrate/shared';
import { Logo } from '~/components/Logo';
import { useAuth } from '~/lib/auth-context';
import { api } from '~/lib/api';

/**
 * /admin/current-affairs -- Phase 19 admin authoring + drafts list.
 *
 * Two panels stacked:
 *   1. New digest -- date + raw notes + optional focus hint -> generates
 *      a draft via the 3-AI pipeline (~30s).
 *   2. Recent drafts -- pending / approved / rejected, latest first.
 *      Click a row to open the per-draft review page.
 */
export default function AdminCurrentAffairsPage() {
  const { user, loading } = useAuth();
  const [drafts, setDrafts] = useState<CurrentAffairsDigestDraft[] | null>(null);
  const [filter, setFilter] = useState<CurrentAffairsDigestStatus | ''>('pending');
  const [loadError, setLoadError] = useState<string | null>(null);

  const [date, setDate] = useState(istToday());
  const [rawNotes, setRawNotes] = useState('');
  const [focusHint, setFocusHint] = useState('');
  const [busy, setBusy] = useState(false);
  const [genError, setGenError] = useState<string | null>(null);
  const [flash, setFlash] = useState<string | null>(null);

  async function reload() {
    try {
      const opts: Parameters<typeof api.admin.listCurrentAffairsDrafts>[0] = {
        limit: 100,
      };
      if (filter) opts.status = filter;
      const res = await api.admin.listCurrentAffairsDrafts(opts);
      setDrafts(res.drafts);
      setLoadError(null);
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : 'failed to load');
    }
  }

  useEffect(() => {
    if (!user) return;
    void reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, filter]);

  async function generate() {
    if (busy) return;
    if (rawNotes.trim().length < 40) {
      setGenError('Paste at least a few headlines / press release notes (40+ chars)');
      return;
    }
    setBusy(true);
    setGenError(null);
    try {
      const input: Parameters<typeof api.admin.generateCurrentAffairs>[0] = {
        date,
        rawNotes,
      };
      if (focusHint.trim()) input.focusHint = focusHint.trim();
      const res = await api.admin.generateCurrentAffairs(input);
      setFlash(`Generated draft for ${res.draft.date} (${res.draft.items.length} items)`);
      setRawNotes('');
      setFocusHint('');
      await reload();
    } catch (e) {
      setGenError(e instanceof Error ? e.message : 'generation failed');
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

  return (
    <main className="mx-auto flex min-h-screen max-w-4xl flex-col px-6 pt-8 pb-16">
      <header className="flex items-start justify-between">
        <Logo />
        <Link href="/admin" className="btn-ghost-sm">
          Admin home
        </Link>
      </header>

      <section className="mt-10">
        <p className="pill mb-3">Current affairs · daily digest</p>
        <h1 className="font-serif text-3xl font-semibold leading-tight text-ink-900 sm:text-4xl">
          Author today&apos;s digest.
        </h1>
        <p className="mt-2 text-ink-800">
          Paste raw notes from PIB, Ministry releases, RBI bulletins, or
          reputable mainstream press. The 3-AI pipeline structures, neutralises,
          and verifies; you review and approve.
        </p>
      </section>

      {flash ? (
        <div className="banner banner-success mt-4" role="status">
          {flash}
        </div>
      ) : null}
      {loadError ? (
        <div className="banner banner-error mt-4" role="alert">
          {loadError}
        </div>
      ) : null}

      <section className="paper-card mt-6 p-5 sm:p-6">
        <h2 className="font-serif text-xl font-semibold text-ink-900">New digest</h2>
        <div className="mt-4 grid gap-3">
          <label className="block">
            <span className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-500">
              Date (IST, YYYY-MM-DD)
            </span>
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              disabled={busy}
              className="input mt-1 w-full sm:w-64"
            />
          </label>

          <label className="block">
            <span className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-500">
              Raw notes (paste headlines, press releases, links)
            </span>
            <textarea
              value={rawNotes}
              onChange={(e) => setRawNotes(e.target.value)}
              disabled={busy}
              rows={10}
              placeholder="Paste a list of bullet points, headlines, or press release excerpts here. The generator will structure them into items, write neutral summaries, and tag exam-relevance."
              className="input mt-1 w-full font-mono text-sm"
            />
          </label>

          <label className="block">
            <span className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-500">
              Focus hint (optional)
            </span>
            <input
              type="text"
              value={focusHint}
              onChange={(e) => setFocusHint(e.target.value)}
              disabled={busy}
              placeholder="e.g. emphasise economy items for Banking aspirants today"
              className="input mt-1 w-full"
            />
          </label>

          {genError ? (
            <div className="banner banner-error" role="alert">
              {genError}
            </div>
          ) : null}

          <div>
            <button
              type="button"
              disabled={busy}
              onClick={generate}
              className="btn-primary"
            >
              {busy ? 'Generating (~30s)...' : 'Generate via 3 AIs'}
            </button>
          </div>
        </div>
      </section>

      <section className="mt-8">
        <div className="flex items-center justify-between">
          <h2 className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-500">
            Drafts
          </h2>
          <select
            value={filter}
            onChange={(e) =>
              setFilter(e.target.value as CurrentAffairsDigestStatus | '')
            }
            className="input"
          >
            <option value="">All statuses</option>
            <option value="pending">Pending</option>
            <option value="approved">Approved</option>
            <option value="rejected">Rejected</option>
          </select>
        </div>

        <div className="mt-4 flex flex-col gap-2">
          {drafts && drafts.length === 0 ? (
            <p className="text-sm text-muted-500">
              No drafts match this filter.
            </p>
          ) : null}
          {drafts?.map((d) => (
            <Link
              key={d.id}
              href={`/admin/current-affairs/${encodeURIComponent(d.id)}`}
              className="paper-card flex items-start justify-between gap-3 p-4 transition hover:bg-paper-200/40"
            >
              <div className="min-w-0 flex-1">
                <p className="text-xs font-semibold uppercase tracking-[0.14em] text-ember-600">
                  {d.date} · {d.items.length} items
                </p>
                <p className="font-serif mt-1 line-clamp-2 text-base text-ink-900">
                  {d.summary}
                </p>
                <p className="mt-1 text-xs text-muted-500">
                  Verified {Math.round(d.verificationScore * 100)}%
                </p>
              </div>
              <StatusPill status={d.status} />
            </Link>
          ))}
        </div>
      </section>
    </main>
  );
}

function StatusPill({ status }: { status: CurrentAffairsDigestStatus }) {
  if (status === 'approved') {
    return (
      <span className="rounded-full bg-gold-100 px-2 py-1 text-xs font-semibold text-gold-700">
        Published
      </span>
    );
  }
  if (status === 'rejected') {
    return (
      <span className="rounded-full bg-ember-100 px-2 py-1 text-xs font-semibold text-ember-600">
        Rejected
      </span>
    );
  }
  return (
    <span className="rounded-full bg-paper-300 px-2 py-1 text-xs font-semibold text-ink-800">
      Pending
    </span>
  );
}

function istToday(): string {
  const ist = new Date(Date.now() + 5.5 * 60 * 60 * 1000);
  return ist.toISOString().slice(0, 10);
}
