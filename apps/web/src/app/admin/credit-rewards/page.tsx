'use client';
import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '~/lib/auth-context';
import { api } from '~/lib/api';

/**
 * Display order + human labels for every earn / spend key the admin can
 * edit. The keys mirror the enums in `packages/shared/src/types/credit.ts`
 * and the values in `packages/shared/src/constants/credits.ts`. When PR-04
 * goes live, edits made here override those constants for the running
 * deployment via the platformConfig/creditRewards Firestore doc.
 */
const EARN_ROWS: Array<{ key: string; label: string; hint?: string }> = [
  { key: 'signup_verified', label: 'Sign-up bonus', hint: 'Granted once per user on first /me call.' },
  { key: 'daily_login', label: 'Daily login', hint: 'Granted once per IST day on first /me call of the day.' },
  { key: 'chapter_complete', label: 'Complete a chapter', hint: 'Once per (exam, subject, chapter) regardless of score.' },
  { key: 'mcq_pass', label: 'Pass a quiz', hint: 'Score >= 70%; once per chapter.' },
  { key: 'mcq_fail_attempted', label: 'Attempt a quiz', hint: 'Score < 70%; engagement reward.' },
  { key: 'streak_7d', label: '7-day streak milestone', hint: 'Once per streak cycle.' },
  { key: 'streak_30d', label: '30-day streak milestone', hint: 'Once per streak cycle.' },
  { key: 'referral_signup', label: 'Refer + signup (referrer)', hint: 'Paid to the inviter when invitee signs up.' },
  { key: 'referral_bonus', label: 'Welcome via referral (invitee)', hint: 'Paid to the user who joined via a code.' },
  { key: 'referral_retained_7d', label: 'Referral retention bonus', hint: '0 = disabled (default).' },
  { key: 'admin_grant', label: 'Admin grant (default amount)', hint: 'Sentinel — admin-issued grants always pass an explicit amount.' },
  { key: 'subscription_grant', label: 'Subscription grant', hint: 'Per-tier monthly bonus; sentinel here, set when wired.' },
];

const SPEND_ROWS: Array<{ key: string; label: string; hint?: string }> = [
  { key: 'read_chapter', label: 'Unlock a chapter', hint: 'Free-plan only; paid plans bypass.' },
  { key: 'mock_test', label: 'Mock test' },
  { key: 'ai_tutor_question', label: 'Nexi AI question' },
  { key: 'concept_video', label: 'Watch a video' },
  { key: 'long_answer_grading', label: 'Essay grading' },
  { key: 'focus_session_1h', label: 'Focus session (1h)' },
  { key: 'admin_revoke', label: 'Admin revoke (default amount)', hint: 'Sentinel — admin revocations always pass an explicit amount.' },
];

export default function AdminCreditRewardsPage() {
  const { user, loading } = useAuth();
  const router = useRouter();

  const [earn, setEarn] = useState<Record<string, number>>({});
  const [spend, setSpend] = useState<Record<string, number>>({});
  const [original, setOriginal] = useState<{ earn: Record<string, number>; spend: Record<string, number> }>({ earn: {}, spend: {} });
  const [fetching, setFetching] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [okMsg, setOkMsg] = useState<string | null>(null);

  useEffect(() => { if (!loading && !user) router.replace('/admin/login'); }, [user, loading, router]);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await api.adminGetCreditRewards();
        if (cancelled) return;
        setEarn({ ...res.earn });
        setSpend({ ...res.spend });
        setOriginal({ earn: { ...res.earn }, spend: { ...res.spend } });
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : 'Failed to load');
      } finally {
        if (!cancelled) setFetching(false);
      }
    })();
    return () => { cancelled = true; };
  }, [user]);

  // Compute the patch that needs to be sent. We only ship CHANGED keys to
  // keep audit logs concise and to make sure default/sentinel keys stay
  // untouched if the admin didn't edit them.
  const changes = useMemo(() => {
    const earnDiff: Record<string, number> = {};
    const spendDiff: Record<string, number> = {};
    for (const k of Object.keys(earn)) {
      if (earn[k] !== original.earn[k]) earnDiff[k] = earn[k]!;
    }
    for (const k of Object.keys(spend)) {
      if (spend[k] !== original.spend[k]) spendDiff[k] = spend[k]!;
    }
    return { earn: earnDiff, spend: spendDiff };
  }, [earn, spend, original]);

  const dirty = Object.keys(changes.earn).length > 0 || Object.keys(changes.spend).length > 0;

  async function save() {
    if (!dirty) return;
    setSaving(true);
    setError(null);
    setOkMsg(null);
    try {
      const res = await api.adminUpdateCreditRewards(changes);
      setEarn({ ...res.earn });
      setSpend({ ...res.spend });
      setOriginal({ earn: { ...res.earn }, spend: { ...res.spend } });
      setOkMsg('Saved. New values take effect within ~60 seconds.');
      setTimeout(() => setOkMsg(null), 2500);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Save failed');
    } finally {
      setSaving(false);
    }
  }

  function reset() {
    setEarn({ ...original.earn });
    setSpend({ ...original.spend });
  }

  if (loading || !user) return (
    <div className="space-y-4">
      <div className="h-7 w-32 rounded bg-paper-300 animate-pulse" />
      <div className="h-40 rounded bg-paper-300 animate-pulse" />
    </div>
  );

  return (
    <div>
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="font-serif text-2xl font-bold text-ink-900">Credit Rewards</h1>
          <p className="mt-1 text-sm text-muted-500">
            Edit the credits awarded for each earn source and the cost of each spend reason.
            Changes propagate within ~60 seconds (config cache TTL).
          </p>
        </div>
        <div className="flex gap-2">
          <button onClick={reset} disabled={!dirty || saving} className="btn-ghost text-sm disabled:opacity-50">Reset</button>
          <button onClick={save} disabled={!dirty || saving} className="btn-primary text-sm disabled:opacity-50">
            {saving ? 'Saving…' : dirty ? `Save (${Object.keys(changes.earn).length + Object.keys(changes.spend).length})` : 'Saved'}
          </button>
        </div>
      </div>

      {error && <div className="banner banner-error mt-4">{error}</div>}
      {okMsg && <div className="banner mt-4 bg-amber-100 dark:bg-amber-900/30 text-amber-800 dark:text-amber-300 border border-amber-200 dark:border-amber-800 rounded-lg px-3 py-2 text-sm">{okMsg}</div>}

      {fetching ? (
        <div className="mt-6 space-y-3">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="h-12 rounded bg-paper-300 animate-pulse" />
          ))}
        </div>
      ) : (
        <>
          {/* Earn rates */}
          <section className="paper-card mt-6 overflow-hidden">
            <div className="px-4 py-3 border-b border-line">
              <h2 className="text-sm font-semibold text-ink-900">Earn rates (credits awarded)</h2>
            </div>
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-line text-left">
                  <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wider text-muted-500">Source</th>
                  <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wider text-muted-500">Credits</th>
                  <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wider text-muted-500">When</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {EARN_ROWS.map((row) => {
                  const value = earn[row.key] ?? 0;
                  const changed = value !== original.earn[row.key];
                  return (
                    <tr key={row.key}>
                      <td className="px-4 py-3 font-medium text-ink-900">
                        {row.label}
                        <p className="mt-0.5 text-[10px] text-muted-400">{row.key}</p>
                      </td>
                      <td className="px-4 py-3">
                        <input
                          type="number"
                          min={0}
                          value={value}
                          onChange={(e) => setEarn((prev) => ({ ...prev, [row.key]: Math.max(0, Math.floor(Number(e.target.value) || 0)) }))}
                          className={`input w-24 text-sm ${changed ? 'ring-2 ring-amber-400' : ''}`}
                        />
                      </td>
                      <td className="px-4 py-3 text-xs text-muted-500">{row.hint ?? ''}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </section>

          {/* Spend rates */}
          <section className="paper-card mt-6 overflow-hidden">
            <div className="px-4 py-3 border-b border-line">
              <h2 className="text-sm font-semibold text-ink-900">Spend rates (credits charged)</h2>
              <p className="mt-0.5 text-xs text-muted-500">Free-plan users pay these costs; paid plans bypass deduction.</p>
            </div>
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-line text-left">
                  <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wider text-muted-500">Reason</th>
                  <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wider text-muted-500">Credits</th>
                  <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wider text-muted-500">Notes</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {SPEND_ROWS.map((row) => {
                  const value = spend[row.key] ?? 0;
                  const changed = value !== original.spend[row.key];
                  return (
                    <tr key={row.key}>
                      <td className="px-4 py-3 font-medium text-ink-900">
                        {row.label}
                        <p className="mt-0.5 text-[10px] text-muted-400">{row.key}</p>
                      </td>
                      <td className="px-4 py-3">
                        <input
                          type="number"
                          min={0}
                          value={value}
                          onChange={(e) => setSpend((prev) => ({ ...prev, [row.key]: Math.max(0, Math.floor(Number(e.target.value) || 0)) }))}
                          className={`input w-24 text-sm ${changed ? 'ring-2 ring-amber-400' : ''}`}
                        />
                      </td>
                      <td className="px-4 py-3 text-xs text-muted-500">{row.hint ?? ''}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </section>

          <p className="mt-6 text-[11px] leading-relaxed text-muted-400">
            Heads up: the credit ledger is append-only. Changing a rate here does NOT rewrite past awards — it
            only changes future grants. The /credits page on the student app shows the current rates fetched from
            the same source, so a student who reloads after a change sees the new numbers.
          </p>
        </>
      )}
    </div>
  );
}
