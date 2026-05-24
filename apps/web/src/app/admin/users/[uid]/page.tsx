'use client';

import { use, useEffect, useState, type FormEvent } from 'react';
import Link from 'next/link';
import { api, ApiError, type AdminUserDetail } from '~/lib/api';

/**
 * /admin/users/[uid] -- Phase 20 per-user detail.
 *
 * Combines profile, balance, recent ledger entries, recent MCQ attempts,
 * referral aggregate, and subscription state in one page so a support
 * agent can answer any question about the user without bouncing between
 * collections.
 *
 * Admin actions live in the right column:
 *   - Grant credits (>= admin role; writes audit log)
 *
 * Future actions go in the same column: suspend / unsuspend, change
 * target exam, force-verify, etc.
 */
export default function AdminUserDetailPage(props: {
  params: Promise<{ uid: string }>;
}) {
  const { uid } = use(props.params);
  const [data, setData] = useState<AdminUserDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [reloadTick, setReloadTick] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setError(null);
    api.admin
      .getUserDetail(uid)
      .then((d) => {
        if (!cancelled) setData(d);
      })
      .catch((e: unknown) => {
        if (cancelled) return;
        setError(e instanceof ApiError ? e.message : 'failed to load user');
      });
    return () => {
      cancelled = true;
    };
  }, [uid, reloadTick]);

  if (error) {
    return (
      <main className="mx-auto max-w-3xl px-6 pt-8 pb-16">
        <Link href="/admin/users" className="btn-ghost-sm">
          ← Back to users
        </Link>
        <div className="banner banner-error mt-6" role="alert">
          {error}
        </div>
      </main>
    );
  }
  if (!data) {
    return (
      <main className="mx-auto max-w-3xl px-6 pt-8 pb-16">
        <span className="inline-flex items-center gap-2 text-sm text-muted-500">
          <span className="spinner" aria-hidden="true" /> Loading user…
        </span>
      </main>
    );
  }

  const { user, balance, recentLedger, recentAttempts, referralStats, subscription } = data;

  return (
    <main className="mx-auto flex max-w-6xl flex-col px-6 pt-8 pb-16">
      <Link href="/admin/users" className="btn-ghost-sm self-start">
        ← Back to users
      </Link>

      <header className="mt-4">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-gold-600">
          Phase 20 · User detail
        </p>
        <h1 className="font-serif mt-1 text-3xl font-semibold leading-tight text-ink-900">
          {user.name || user.email || user.id}
        </h1>
        <p className="mt-2 text-sm text-muted-500">
          {user.email}
          {user.targetExam ? <> · {user.targetExam}</> : null}
          {user.isVerified ? (
            <span className="pill pill-success ml-2">Verified</span>
          ) : (
            <span className="pill pill-neutral ml-2">Unverified</span>
          )}
        </p>
        <p className="mt-1 text-xs text-muted-500">
          uid <code>{user.id}</code> · joined {formatDate(user.createdAt)}
        </p>
      </header>

      <div className="mt-8 grid gap-6 lg:grid-cols-3">
        {/* Left + middle: profile + activity */}
        <div className="space-y-6 lg:col-span-2">
          <div className="grid gap-3 sm:grid-cols-3">
            <Stat label="Credits" value={balance.total.toLocaleString('en-IN')} hint={
              balance.expiringSoon > 0 ? `${balance.expiringSoon} expire in 7d` : ''
            } hintTone={balance.expiringSoon > 0 ? 'warn' : 'muted'} />
            <Stat
              label="Current streak"
              value={String(user.currentStreak ?? 0)}
              hint={`Best ${user.bestStreak ?? 0}`}
            />
            <Stat
              label="Referred"
              value={String(referralStats.totalReferred)}
              hint={`${referralStats.retained} retained`}
            />
          </div>

          <Section title="Recent credit events">
            {recentLedger.length === 0 ? (
              <p className="text-sm text-muted-500">No ledger entries yet.</p>
            ) : (
              <ul className="divide-y divide-line/60 text-sm">
                {recentLedger.map((e) => (
                  <li
                    key={e.id}
                    className="flex items-start justify-between gap-3 py-2 first:pt-0 last:pb-0"
                  >
                    <div>
                      <p className="font-medium text-ink-900">
                        {ledgerLabel(e.event)}
                      </p>
                      <p className="text-xs text-muted-500">
                        {formatDateTime(e.occurredAt)}
                        {e.sourceRef ? ` · ${e.sourceRef}` : ''}
                      </p>
                    </div>
                    <span
                      className={
                        'tabular-nums font-medium ' +
                        (e.amount >= 0 ? 'text-ink-900' : 'text-ember-600')
                      }
                    >
                      {e.amount >= 0 ? '+' : ''}
                      {e.amount}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </Section>

          <Section title="Recent MCQ attempts">
            {recentAttempts.length === 0 ? (
              <p className="text-sm text-muted-500">No attempts yet.</p>
            ) : (
              <ul className="divide-y divide-line/60 text-sm">
                {recentAttempts.map((a) => (
                  <li
                    key={a.id}
                    className="flex items-start justify-between gap-3 py-2 first:pt-0 last:pb-0"
                  >
                    <div>
                      <p className="font-medium text-ink-900">
                        {a.subject} · {a.chapter}
                      </p>
                      <p className="text-xs text-muted-500">
                        {a.exam} · {formatDateTime(a.attemptedAt)}
                      </p>
                    </div>
                    <span
                      className={
                        a.isCorrect
                          ? 'pill pill-success'
                          : 'pill pill-warn'
                      }
                    >
                      {a.isCorrect ? 'Correct' : 'Wrong'}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </Section>

          <Section title="Subscription">
            {subscription ? (
              <pre className="overflow-x-auto rounded-lg bg-paper-200 p-3 text-xs leading-relaxed">
                {JSON.stringify(subscription, null, 2)}
              </pre>
            ) : (
              <p className="text-sm text-muted-500">No active subscription.</p>
            )}
          </Section>
        </div>

        {/* Right column: admin actions */}
        <aside className="space-y-6">
          <GrantCreditsCard
            uid={user.id}
            onGranted={() => setReloadTick((t) => t + 1)}
          />
        </aside>
      </div>
    </main>
  );
}

/* --------------------------------------------------------------------------
 * Inline components
 * ----------------------------------------------------------------------- */

function Stat(props: {
  label: string;
  value: string;
  hint: string;
  hintTone?: 'muted' | 'warn';
}) {
  return (
    <div className="paper-card p-4">
      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-500">
        {props.label}
      </p>
      <p className="font-serif mt-2 text-2xl font-semibold tabular-nums text-ink-900">
        {props.value}
      </p>
      {props.hint ? (
        <p
          className={
            'mt-1 text-xs ' +
            (props.hintTone === 'warn' ? 'text-ember-600' : 'text-muted-500')
          }
        >
          {props.hint}
        </p>
      ) : null}
    </div>
  );
}

function Section(props: { title: string; children: React.ReactNode }) {
  return (
    <section className="paper-card p-5">
      <h2 className="font-serif text-lg font-semibold leading-snug text-ink-900">
        {props.title}
      </h2>
      <div className="mt-3">{props.children}</div>
    </section>
  );
}

function GrantCreditsCard(props: { uid: string; onGranted: () => void }) {
  const [amount, setAmount] = useState(50);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ tone: 'success' | 'error'; text: string } | null>(
    null,
  );

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!reason.trim()) {
      setMsg({ tone: 'error', text: 'Reason is required.' });
      return;
    }
    setBusy(true);
    setMsg(null);
    try {
      const res = await api.admin.grantCreditsToUser(props.uid, {
        amount,
        reason: reason.trim(),
      });
      setMsg({
        tone: 'success',
        text:
          res.result.kind === 'awarded'
            ? `Granted ${amount} credits. New balance: ${res.balance.total}.`
            : 'Already granted (idempotent).',
      });
      setReason('');
      props.onGranted();
    } catch (e) {
      setMsg({
        tone: 'error',
        text: e instanceof ApiError ? e.message : 'failed to grant',
      });
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="paper-card p-5">
      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-ember-600">
        Admin action
      </p>
      <h2 className="font-serif mt-2 text-lg font-semibold leading-snug text-ink-900">
        Grant credits
      </h2>
      <p className="mt-2 text-xs text-muted-500">
        Manual <code>admin_grant</code>. Writes an entry to the audit log
        with your uid, the target uid, the amount, and your reason.
      </p>
      <form onSubmit={submit} className="mt-4 space-y-3">
        <label className="block">
          <span className="block text-xs font-medium text-muted-500">Amount</span>
          <input
            type="number"
            min={1}
            max={50000}
            value={amount}
            onChange={(e) => setAmount(Math.max(1, Number(e.target.value) || 1))}
            className="input mt-1"
            required
          />
        </label>
        <label className="block">
          <span className="block text-xs font-medium text-muted-500">Reason</span>
          <textarea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="e.g. Apology credits for billing error 2026-05-22"
            className="input mt-1 min-h-[5rem]"
            required
          />
        </label>
        <button type="submit" className="btn-primary w-full" disabled={busy}>
          {busy ? 'Granting…' : `Grant ${amount} credits`}
        </button>
        {msg ? (
          <div
            className={
              msg.tone === 'success' ? 'banner banner-success' : 'banner banner-error'
            }
            role={msg.tone === 'error' ? 'alert' : undefined}
          >
            {msg.text}
          </div>
        ) : null}
      </form>
    </section>
  );
}

/* --------------------------------------------------------------------------
 * Helpers
 * ----------------------------------------------------------------------- */

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString('en-IN', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    });
  } catch {
    return iso.slice(0, 10);
  }
}

function formatDateTime(iso: string): string {
  try {
    return new Date(iso).toLocaleString('en-IN', {
      day: '2-digit',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return iso;
  }
}

function ledgerLabel(
  e: { kind: 'earn'; source: string } | { kind: 'spend'; reason: string } | { kind: 'expire' },
): string {
  if (e.kind === 'earn') return `Earn · ${e.source.replace(/_/g, ' ')}`;
  if (e.kind === 'spend') return `Spend · ${e.reason.replace(/_/g, ' ')}`;
  return 'Bucket expired';
}
