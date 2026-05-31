'use client';

import { useState, useEffect } from 'react';
import { api } from '~/lib/api';
import { toast } from 'sonner';

interface TeamInvite {
  id: string;
  email: string;
  role: 'admin' | 'editor' | 'viewer';
  invitedBy: string;
  acceptedAt?: string | null;
  createdAt: string;
}

export default function AdminTeamPage() {
  const [invites, setInvites] = useState<TeamInvite[]>([]);
  const [loading, setLoading] = useState(true);
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<'editor' | 'viewer'>('editor');
  const [sending, setSending] = useState(false);
  const [revokeConfirmId, setRevokeConfirmId] = useState<string | null>(null);

  const fetchInvites = async () => {
    try {
      const res = await api.adminGetTeamInvites();
      setInvites(res.invites);
    } catch {
      toast.error('Failed to load team invites');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void fetchInvites(); }, []);

  const handleInvite = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.includes('@')) { toast.error('Enter a valid email'); return; }
    setSending(true);
    try {
      await api.adminCreateTeamInvite(email.trim().toLowerCase(), role);
      toast.success(`Invite sent to ${email}`);
      setEmail('');
      void fetchInvites();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to send invite');
    } finally {
      setSending(false);
    }
  };

  const handleRevoke = async (id: string) => {
    try {
      await api.adminRevokeTeamInvite(id);
      toast.success('Invite revoked');
      setRevokeConfirmId(null);
      void fetchInvites();
    } catch {
      toast.error('Failed to revoke invite');
    }
  };

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-ink-900 dark:text-ink-100">Team Access</h1>
      <p className="text-muted-600 dark:text-muted-400">
        Invite team members to access the admin panel. They&apos;ll need to sign in with the same email to gain access.
      </p>

      {/* Invite form */}
      <form onSubmit={handleInvite} className="flex flex-col sm:flex-row gap-3 p-4 rounded-xl border border-line-200 dark:border-line-800 bg-paper-50 dark:bg-paper-900">
        <input
          type="email"
          placeholder="team@example.com"
          value={email}
          onChange={e => setEmail(e.target.value)}
          className="flex-1 rounded-lg border border-line-200 dark:border-line-700 bg-paper-100 dark:bg-paper-800 px-3 py-2 text-sm text-ink-900 dark:text-ink-100 placeholder:text-muted-400"
          required
        />
        <select
          value={role}
          onChange={e => setRole(e.target.value as 'editor' | 'viewer')}
          className="rounded-lg border border-line-200 dark:border-line-700 bg-paper-100 dark:bg-paper-800 px-3 py-2 text-sm text-ink-900 dark:text-ink-100"
        >
          <option value="editor">Editor</option>
          <option value="viewer">Viewer</option>
        </select>
        <button
          type="submit"
          disabled={sending}
          className="rounded-lg bg-ember-600 px-4 py-2 text-sm font-medium text-white hover:bg-ember-700 disabled:opacity-50"
        >
          {sending ? 'Sending...' : '+ Invite'}
        </button>
      </form>

      {/* Invites list */}
      {loading ? (
        <div className="text-muted-500 text-sm">Loading...</div>
      ) : invites.length === 0 ? (
        <div className="text-center py-8 text-muted-500">
          <p className="text-lg">No team members invited yet</p>
          <p className="text-sm mt-1">Use the form above to invite your first team member</p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-line-200 dark:border-line-800">
          <table className="w-full text-sm">
            <thead className="bg-paper-100 dark:bg-paper-800">
              <tr>
                <th className="px-4 py-3 text-left font-medium text-muted-600 dark:text-muted-400">Email</th>
                <th className="px-4 py-3 text-left font-medium text-muted-600 dark:text-muted-400">Role</th>
                <th className="px-4 py-3 text-left font-medium text-muted-600 dark:text-muted-400">Status</th>
                <th className="px-4 py-3 text-left font-medium text-muted-600 dark:text-muted-400">Invited</th>
                <th className="px-4 py-3 text-right font-medium text-muted-600 dark:text-muted-400">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line-100 dark:divide-line-800">
              {invites.map(inv => (
                <tr key={inv.id} className="hover:bg-paper-50 dark:hover:bg-paper-800/50">
                  <td className="px-4 py-3 text-ink-900 dark:text-ink-100">{inv.email}</td>
                  <td className="px-4 py-3">
                    <span className="inline-flex items-center rounded-full bg-ember-500/10 px-2 py-0.5 text-xs font-medium text-ember-600 dark:text-ember-400">
                      {inv.role}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    {inv.acceptedAt ? (
                      <span className="text-green-600 dark:text-green-400 text-xs font-medium">✓ Active</span>
                    ) : (
                      <span className="text-muted-500 text-xs">Pending</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-muted-500 text-xs">
                    {new Date(inv.createdAt).toLocaleDateString()}
                  </td>
                  <td className="px-4 py-3 text-right">
                    {revokeConfirmId === inv.id ? (
                      <span className="inline-flex gap-2">
                        <button onClick={() => handleRevoke(inv.id)} className="text-xs text-red-600 font-medium hover:underline">Confirm</button>
                        <button onClick={() => setRevokeConfirmId(null)} className="text-xs text-muted-500 hover:underline">Cancel</button>
                      </span>
                    ) : (
                      <button onClick={() => setRevokeConfirmId(inv.id)} className="text-xs text-muted-500 hover:text-red-600">
                        Revoke
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Info box */}
      <div className="rounded-lg bg-paper-100 dark:bg-paper-800 border border-line-200 dark:border-line-700 p-4 text-sm text-muted-600 dark:text-muted-400">
        <p className="font-medium text-ink-800 dark:text-ink-200 mb-1">How it works:</p>
        <ul className="list-disc list-inside space-y-1">
          <li><strong>Editor:</strong> Full admin access — can manage content, users, settings</li>
          <li><strong>Viewer:</strong> Read-only access — can view stats and reports</li>
          <li>Invited users must sign in with the exact email address listed above</li>
          <li>After signing in, you may need to manually set their role to &quot;admin&quot; in the Users panel</li>
        </ul>
      </div>
    </div>
  );
}
