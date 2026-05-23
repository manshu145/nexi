'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  api,
  type AdminMeResponse,
  type AdminUserRecord,
  type AdminRoleDescriptor,
} from '~/lib/api';

/**
 * /admin/team
 *
 * Super-admin only. List the team, add a new admin (we provision the
 * Firebase Auth user and surface the password reset link the super_admin
 * can DM to them), revoke an existing admin.
 *
 * Layout gating already kept non-admins out of this whole tree. We do one
 * extra check inside this page for super_admin specifically and bounce
 * regular admins to /admin/mcq-drafts politely.
 */
export default function AdminTeamPage() {
  const router = useRouter();
  const [me, setMe] = useState<AdminMeResponse | null>(null);
  const [admins, setAdmins] = useState<AdminUserRecord[]>([]);
  const [roles, setRoles] = useState<AdminRoleDescriptor[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [showAddForm, setShowAddForm] = useState(false);
  const [pendingResetLink, setPendingResetLink] = useState<{
    email: string;
    link: string;
  } | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [meRes, listRes, rolesRes] = await Promise.all([
        api.admin.auth.me(),
        api.admin.auth.listAdmins(),
        api.admin.auth.listRoles(),
      ]);
      setMe(meRes);
      setAdmins(listRes.admins ?? []);
      setRoles(rolesRes.roles ?? []);
      if (meRes.role !== 'super_admin') {
        // Layout already gates by "any admin" -- this is the stricter check.
        router.replace('/admin/mcq-drafts');
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'failed to load team');
    } finally {
      setLoading(false);
    }
  }, [router]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  if (loading) {
    return (
      <main className="flex min-h-[60vh] items-center justify-center px-6">
        <span className="inline-flex items-center gap-2 text-sm text-muted-500">
          <span className="spinner" aria-hidden="true" />
          Loading team...
        </span>
      </main>
    );
  }

  if (error) {
    return (
      <main className="mx-auto max-w-3xl px-6 py-10">
        <p className="text-sm text-ember-600" role="alert">
          {error}
        </p>
      </main>
    );
  }

  if (me?.role !== 'super_admin') {
    return (
      <main className="mx-auto max-w-md px-6 py-16 text-center">
        <p className="pill mb-3">403</p>
        <h1 className="font-serif text-2xl font-semibold text-ink-900">
          Super admin only
        </h1>
        <p className="mt-2 text-sm text-muted-500">
          Only the super admin can manage the team.
        </p>
      </main>
    );
  }

  const assignableRoles = roles.filter((r) => r.id !== 'super_admin');

  return (
    <main className="mx-auto max-w-4xl px-6 py-10">
      <section>
        <p className="pill mb-3">Admin</p>
        <h1 className="font-serif text-3xl font-semibold leading-tight text-ink-900 sm:text-4xl">
          Team
        </h1>
        <p className="mt-2 text-sm text-muted-500">
          Mint admins, set roles, revoke access. The super admin is fixed in
          the deploy config and never appears as revocable here.
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

      {pendingResetLink ? (
        <div className="paper-card mt-6 p-5">
          <p className="text-xs font-semibold uppercase tracking-wide text-ember-600">
            Hand this to {pendingResetLink.email}
          </p>
          <p className="mt-2 text-sm text-ink-800">
            Firebase generated a one-time password-reset link. Send it via DM
            or email -- it expires in 1 hour and lets the new admin set
            their own password.
          </p>
          <textarea
            readOnly
            value={pendingResetLink.link}
            className="input mt-3 w-full font-mono text-xs"
            rows={3}
            onFocus={(e) => e.currentTarget.select()}
          />
          <div className="mt-3 flex flex-wrap gap-3">
            <button
              type="button"
              onClick={() => {
                navigator.clipboard.writeText(pendingResetLink.link).catch(() => {
                  /* clipboard may be blocked */
                });
                setToast('Reset link copied.');
              }}
              className="btn-primary"
            >
              Copy link
            </button>
            <button
              type="button"
              onClick={() => setPendingResetLink(null)}
              className="btn-ghost"
            >
              Done
            </button>
          </div>
        </div>
      ) : null}

      {/* Add admin form */}
      <section className="paper-card mt-8 p-6 sm:p-8">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-ember-600">
              Add
            </p>
            <h2 className="font-serif mt-1 text-xl font-semibold text-ink-900">
              Mint a new admin
            </h2>
          </div>
          <button
            type="button"
            onClick={() => setShowAddForm((s) => !s)}
            className="btn-ghost-sm"
          >
            {showAddForm ? 'Hide' : 'Open form'}
          </button>
        </div>

        {showAddForm ? (
          <AddAdminForm
            roles={assignableRoles}
            onAdded={(record, resetLink) => {
              setShowAddForm(false);
              setToast(`${record.email} added as ${prettyRole(record.role)}.`);
              if (resetLink) setPendingResetLink({ email: record.email, link: resetLink });
              void refresh();
            }}
          />
        ) : null}
      </section>

      {/* Admin list */}
      <section className="mt-8 space-y-3">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-500">
          Current team ({admins.length})
        </p>
        {admins.length === 0 ? (
          <p className="text-sm text-muted-500">
            No admins yet. Add one above.
          </p>
        ) : null}
        {admins.map((a) => (
          <AdminRow
            key={a.uid}
            admin={a}
            onRevoked={(message) => {
              setToast(message);
              void refresh();
            }}
          />
        ))}
      </section>
    </main>
  );
}

// ============================================================================

function AddAdminForm({
  roles,
  onAdded,
}: {
  roles: AdminRoleDescriptor[];
  onAdded: (record: AdminUserRecord, resetLink: string | null) => void;
}) {
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<'admin' | 'content_admin' | 'support_admin'>(
    'content_admin',
  );
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(ev: React.FormEvent) {
    ev.preventDefault();
    if (!email.trim()) {
      setError('Email is required.');
      return;
    }
    try {
      setError(null);
      setSubmitting(true);
      const res = await api.admin.auth.addAdmin({ email: email.trim(), role });
      onAdded(res.admin, res.resetLink);
      setEmail('');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'add failed');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="mt-5 grid gap-4">
      <label className="block text-sm">
        <span className="block font-medium text-ink-900">Email</span>
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="content-lead@nexigrate.com"
          className="input mt-1 w-full"
          disabled={submitting}
        />
      </label>
      <label className="block text-sm">
        <span className="block font-medium text-ink-900">Role</span>
        <select
          value={role}
          onChange={(e) =>
            setRole(e.target.value as 'admin' | 'content_admin' | 'support_admin')
          }
          className="input mt-1 w-full"
          disabled={submitting}
        >
          {roles.map((r) => (
            <option key={r.id} value={r.id}>
              {r.name}
            </option>
          ))}
        </select>
      </label>
      <p className="text-xs text-muted-500">
        {roles.find((r) => r.id === role)?.description ?? ''}
      </p>
      <button type="submit" disabled={submitting} className="btn-primary">
        {submitting ? 'Provisioning...' : 'Add admin and generate reset link'}
      </button>
      {error ? (
        <p className="text-sm text-ember-600" role="alert">
          {error}
        </p>
      ) : null}
      <p className="text-xs text-muted-500">
        We create (or reuse) the Firebase Auth user, mint a one-time
        password-reset link, and store the role in <code>admin_users</code>.
        You'll see the link in a banner above so you can share it.
      </p>
    </form>
  );
}

function AdminRow({
  admin,
  onRevoked,
}: {
  admin: AdminUserRecord;
  onRevoked: (message: string) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const isEnvBootstrapped = admin.uid === '(env)';
  const isInactive = !admin.isActive;

  async function onRevoke() {
    if (isEnvBootstrapped) return;
    if (!confirm(`Revoke admin access for ${admin.email}?`)) return;
    try {
      setBusy(true);
      setError(null);
      await api.admin.auth.revokeAdmin(admin.uid);
      onRevoked(`Revoked admin access for ${admin.email}.`);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'revoke failed');
    } finally {
      setBusy(false);
    }
  }

  return (
    <article className="paper-card p-4 sm:p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate font-medium text-ink-900">{admin.email}</p>
          <p className="mt-0.5 text-xs text-muted-500">
            <span className="font-medium text-ink-800">{prettyRole(admin.role)}</span>
            {isEnvBootstrapped ? (
              <>
                {' · '}
                <span className="rounded bg-paper-200 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-ink-800">
                  env-bootstrapped
                </span>
              </>
            ) : null}
            {isInactive ? (
              <>
                {' · '}
                <span className="text-ember-600">disabled</span>
              </>
            ) : null}
            {admin.lastSeenAt ? (
              <>
                {' · '}
                last seen {new Date(admin.lastSeenAt).toLocaleString()}
              </>
            ) : null}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {!isEnvBootstrapped && admin.isActive ? (
            <button
              type="button"
              onClick={onRevoke}
              disabled={busy}
              className="btn-ghost-sm text-ember-600 hover:bg-paper-200"
            >
              {busy ? 'Revoking...' : 'Revoke'}
            </button>
          ) : null}
        </div>
      </div>
      {error ? (
        <p className="mt-2 text-xs text-ember-600" role="alert">
          {error}
        </p>
      ) : null}
    </article>
  );
}

function prettyRole(role: string): string {
  switch (role) {
    case 'super_admin':
      return 'Super admin';
    case 'admin':
      return 'Admin';
    case 'content_admin':
      return 'Content admin';
    case 'support_admin':
      return 'Support admin';
    default:
      return role;
  }
}
