'use client';

/**
 * Admin: Team & Roles (PR-40).
 *
 * Founder lock §3.6:
 *   "abhi koi team nhi hai sirf mai hu ek hi rahega. ab access dene
 *    ka option de dena"
 *
 * Solo today, but this page exists so the founder can delegate
 * granular admin access to future co-founders / content moderators /
 * support agents / finance admins WITHOUT a code deploy. Pending
 * invites are auto-applied on the invitee's next /me call.
 *
 * Per-route enforcement of granular roles is a follow-up — this PR
 * stores the data shape so future route guards can check
 * `principal.adminRole` without a schema migration.
 *
 * Brand tokens only. No raw amber/stone/hex.
 */

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '~/lib/auth-context';
import { getFirebaseAuthClient } from '~/lib/firebase';
import { toast } from 'sonner';

const API = process.env['NEXT_PUBLIC_API_URL'] ?? 'https://api.nexigrate.com';

type AdminRole = 'super_admin' | 'content' | 'support' | 'finance';

interface AdminMember {
  uid: string;
  email: string;
  name: string;
  adminRole: AdminRole;
  isHardcoded: boolean;
  createdAt: string;
}
interface PendingInvite {
  email: string;
  adminRole: AdminRole;
  invitedAt: string;
  expiresAt: string;
  invitedBy: string;
}
interface TeamResponse {
  admins: AdminMember[];
  pending: PendingInvite[];
  roleLabels: Record<AdminRole, string>;
}

export default function AdminTeamPage() {
  const { user, loading } = useAuth();
  const router = useRouter();
  const [team, setTeam] = useState<TeamResponse | null>(null);
  const [pageLoading, setPageLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Invite form
  const [showInvite, setShowInvite] = useState(false);
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState<AdminRole>('content');
  const [submitting, setSubmitting] = useState(false);
  const [revokingEmail, setRevokingEmail] = useState<string | null>(null);

  useEffect(() => {
    if (!loading && !user) router.replace('/admin/login');
  }, [user, loading, router]);

  const getToken = async () => {
    const auth = getFirebaseAuthClient();
    return auth.currentUser?.getIdToken();
  };

  const loadTeam = async () => {
    try {
      const token = await getToken();
      const res = await fetch(`${API}/v1/admin/team`, { headers: { Authorization: `Bearer ${token}` } });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setTeam((await res.json()) as TeamResponse);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load team');
    } finally { setPageLoading(false); }
  };

  useEffect(() => { if (user) void loadTeam(); }, [user]);

  const handleInvite = async () => {
    if (!inviteEmail.trim() || !inviteEmail.includes('@')) {
      toast.error('Enter a valid email address');
      return;
    }
    setSubmitting(true);
    try {
      const token = await getToken();
      const res = await fetch(`${API}/v1/admin/team/invite`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ email: inviteEmail.trim().toLowerCase(), adminRole: inviteRole }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { message?: string };
        throw new Error(body.message ?? `HTTP ${res.status}`);
      }
      toast.success(`Invite sent to ${inviteEmail}`);
      setInviteEmail('');
      setInviteRole('content');
      setShowInvite(false);
      await loadTeam();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Invite failed');
    } finally { setSubmitting(false); }
  };

  const handleRevoke = async (email: string) => {
    setRevokingEmail(email);
    try {
      const token = await getToken();
      const res = await fetch(`${API}/v1/admin/team/${encodeURIComponent(email)}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { message?: string };
        throw new Error(body.message ?? `HTTP ${res.status}`);
      }
      toast.success(`Revoked access for ${email}`);
      await loadTeam();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Revoke failed');
    } finally { setRevokingEmail(null); }
  };

  if (loading || !user || pageLoading) {
    return (
      <div className="space-y-4">
        <div className="h-7 w-56 animate-pulse rounded bg-paper-200" />
        <div className="h-32 animate-pulse rounded-xl bg-paper-200" />
      </div>
    );
  }

  return (
    <div className="max-w-3xl">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h1 className="font-serif text-2xl font-bold text-ink-900">Team & Roles</h1>
          <p className="mt-1 text-sm text-muted-500">
            Delegate admin access to co-founders / content / support / finance staff. Invites auto-apply on the invitee&rsquo;s next sign-in.
          </p>
        </div>
        <button
          onClick={() => setShowInvite(s => !s)}
          className="rounded-lg bg-ember-500 px-4 py-2 text-sm font-medium text-paper-50 hover:bg-ember-600"
        >
          {showInvite ? 'Cancel' : '+ Invite admin'}
        </button>
      </div>

      {error && (
        <div className="mt-4 rounded-lg border border-ember-500/40 bg-ember-500/5 px-3 py-2 text-xs text-ember-600">
          ⚠ {error}
        </div>
      )}

      {/* Invite form */}
      {showInvite && (
        <section className="mt-6 rounded-xl border border-line bg-paper-50 p-5 space-y-4">
          <p className="text-sm font-semibold text-ink-700">Invite a new admin</p>
          <div>
            <label className="block text-xs font-medium text-ink-700">Email</label>
            <input
              type="email"
              value={inviteEmail}
              onChange={(e) => setInviteEmail(e.target.value)}
              placeholder="someone@example.com"
              className="mt-1 w-full rounded-lg border border-line bg-paper-100 px-3 py-2 text-sm text-ink-900 placeholder:text-muted-400 focus:border-ember-500 focus:outline-none"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-ink-700">Role</label>
            <select
              value={inviteRole}
              onChange={(e) => setInviteRole(e.target.value as AdminRole)}
              className="mt-1 w-full rounded-lg border border-line bg-paper-100 px-3 py-2 text-sm text-ink-900 focus:border-ember-500 focus:outline-none"
            >
              {team?.roleLabels && Object.entries(team.roleLabels).map(([key, label]) => (
                <option key={key} value={key}>{label}</option>
              ))}
            </select>
            <p className="mt-1 text-[11px] text-muted-500">
              All roles can sign into the admin panel today. Per-route enforcement is coming — for now, label only.
            </p>
          </div>
          <button
            onClick={handleInvite}
            disabled={submitting || !inviteEmail.trim()}
            className="rounded-lg bg-ember-500 px-4 py-2 text-sm font-medium text-paper-50 hover:bg-ember-600 disabled:opacity-50"
          >
            {submitting ? 'Sending invite…' : 'Send invite'}
          </button>
        </section>
      )}

      {/* Active admins */}
      <section className="mt-6">
        <h2 className="mb-3 px-1 text-xs font-semibold uppercase tracking-wider text-muted-500">Active admins</h2>
        {team?.admins.length === 0 ? (
          <div className="paper-card p-6 text-center text-sm text-muted-500">No admins yet.</div>
        ) : (
          <ul className="space-y-2">
            {team?.admins.map(a => (
              <li key={a.uid} className="rounded-xl border border-line bg-paper-50 p-4 flex items-center justify-between gap-3 flex-wrap">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-ink-900 truncate">
                    {a.name || a.email.split('@')[0]}
                    {a.isHardcoded && <span className="ml-2 inline-block rounded-full bg-ember-500/10 px-2 py-0.5 text-[10px] font-semibold text-ember-600 uppercase tracking-wide">Founder</span>}
                  </p>
                  <p className="text-xs text-muted-500 truncate">{a.email}</p>
                  <p className="text-[11px] text-muted-400 mt-1">
                    {team.roleLabels[a.adminRole]}
                  </p>
                </div>
                {!a.isHardcoded && (
                  <button
                    onClick={() => handleRevoke(a.email)}
                    disabled={revokingEmail === a.email}
                    className="rounded-lg border border-line bg-paper-50 px-3 py-1.5 text-xs text-ember-600 hover:bg-ember-500/10 disabled:opacity-50"
                  >
                    {revokingEmail === a.email ? 'Revoking…' : 'Revoke'}
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* Pending invites */}
      <section className="mt-8">
        <h2 className="mb-3 px-1 text-xs font-semibold uppercase tracking-wider text-muted-500">Pending invites</h2>
        {team?.pending.length === 0 ? (
          <div className="paper-card p-6 text-center text-sm text-muted-500">No pending invites.</div>
        ) : (
          <ul className="space-y-2">
            {team?.pending.map(p => {
              const expired = new Date(p.expiresAt) < new Date();
              return (
                <li key={p.email} className="rounded-xl border border-line bg-paper-50 p-4 flex items-center justify-between gap-3 flex-wrap">
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-ink-900 truncate">{p.email}</p>
                    <p className="text-[11px] text-muted-400 mt-1">
                      {team.roleLabels[p.adminRole]}{' · '}
                      Invited {new Date(p.invitedAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}
                      {expired ? ' · expired' : ` · expires ${new Date(p.expiresAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}`}
                    </p>
                  </div>
                  <button
                    onClick={() => handleRevoke(p.email)}
                    disabled={revokingEmail === p.email}
                    className="rounded-lg border border-line bg-paper-50 px-3 py-1.5 text-xs text-ember-600 hover:bg-ember-500/10 disabled:opacity-50"
                  >
                    {revokingEmail === p.email ? 'Revoking…' : 'Cancel invite'}
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <section className="mt-8 rounded-lg border border-line bg-paper-100 p-4 text-xs text-muted-500 space-y-2">
        <p className="font-medium text-ink-800">How it works:</p>
        <ul className="list-disc pl-5 space-y-1">
          <li><strong>Invite</strong> creates a pending entry — no Firebase Auth user is created until they sign in</li>
          <li>On their next sign-in, the role is auto-applied (also: an invite email is sent if Resend is configured)</li>
          <li><strong>Revoke</strong> downgrades active admins back to student + cancels pending invites</li>
          <li><strong>Founder badge</strong> = hardcoded super-admin in <code className="text-[10px]">apps/api/src/lib/adminEmails.ts</code> — cannot be revoked from the UI (requires a code change)</li>
        </ul>
      </section>
    </div>
  );
}
