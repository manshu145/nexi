'use client';

import { useEffect, useState } from 'react';
import { api, type AdminUserListRow, type AdminUserDetail } from '~/lib/api';

export default function AdminUsersPage() {
  const [users, setUsers] = useState<AdminUserListRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [selectedUser, setSelectedUser] = useState<AdminUserDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);

  // Grant credits
  const [grantAmount, setGrantAmount] = useState('');
  const [grantReason, setGrantReason] = useState('');
  const [granting, setGranting] = useState(false);
  const [grantSuccess, setGrantSuccess] = useState<string | null>(null);

  useEffect(() => {
    loadUsers();
  }, []);

  async function loadUsers(q?: string) {
    try {
      setLoading(true);
      const res = await api.admin.listUsers({ q, limit: 50 });
      setUsers(res.users);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load users');
    } finally {
      setLoading(false);
    }
  }

  async function handleSearch() {
    await loadUsers(search || undefined);
  }

  async function openUserDetail(uid: string) {
    setDetailLoading(true);
    setSelectedUser(null);
    setGrantSuccess(null);
    try {
      const detail = await api.admin.getUserDetail(uid);
      setSelectedUser(detail);
    } catch {
      setError('Failed to load user details');
    } finally {
      setDetailLoading(false);
    }
  }

  async function handleGrantCredits() {
    if (!selectedUser || !grantAmount || !grantReason) return;
    setGranting(true);
    try {
      const res = await api.admin.grantCreditsToUser(selectedUser.user.id, {
        amount: parseInt(grantAmount),
        reason: grantReason,
      });
      setGrantSuccess(`Granted ${grantAmount} credits. New balance: ${res.balance.total}`);
      setGrantAmount('');
      setGrantReason('');
      // Refresh detail
      openUserDetail(selectedUser.user.id);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Grant failed');
    } finally {
      setGranting(false);
    }
  }

  return (
    <div>
      <h1 className="font-serif text-2xl font-bold text-ink-900">Users</h1>

      {/* Search */}
      <div className="mt-4 flex gap-2">
        <input
          type="text"
          className="input flex-1"
          placeholder="Search by name, email, or uid..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && handleSearch()}
        />
        <button onClick={handleSearch} className="btn-primary px-4">Search</button>
      </div>

      {error && <div className="banner banner-error mt-4">{error}</div>}

      {/* User detail panel */}
      {selectedUser && (
        <div className="mt-4 paper-card p-5 border-l-4 border-ember-500">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-serif text-lg font-semibold">{selectedUser.user.name}</h2>
            <button onClick={() => setSelectedUser(null)} className="text-xs text-muted-500 hover:text-ink-900">✕ Close</button>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 text-sm">
            <div><span className="text-muted-500">Email:</span> <span className="font-medium">{selectedUser.user.email}</span></div>
            <div><span className="text-muted-500">Exam:</span> <span className="font-medium">{selectedUser.user.targetExam ?? '—'}</span></div>
            <div><span className="text-muted-500">Balance:</span> <span className="font-bold text-ember-600">{selectedUser.balance.total}</span></div>
            <div><span className="text-muted-500">Streak:</span> <span className="font-medium">{selectedUser.user.currentStreak ?? 0}</span></div>
            <div><span className="text-muted-500">Verified:</span> <span className="font-medium">{selectedUser.user.isVerified ? '✅' : '❌'}</span></div>
            <div><span className="text-muted-500">Referrals:</span> <span className="font-medium">{selectedUser.referralStats.totalReferred}</span></div>
          </div>

          {/* Recent ledger */}
          {selectedUser.recentLedger.length > 0 && (
            <div className="mt-4">
              <h3 className="text-xs font-semibold uppercase text-muted-500 mb-2">Recent Credits</h3>
              <div className="space-y-1 max-h-32 overflow-y-auto">
                {selectedUser.recentLedger.slice(0, 10).map(ev => (
                  <div key={ev.id} className="flex justify-between text-xs">
                    <span className="text-muted-500">{ev.event.kind === 'earn' ? `+${ev.amount} (${ev.event.source})` : `${ev.amount} (${ev.event.kind === 'spend' ? ev.event.reason : 'expire'})`}</span>
                    <span className="text-muted-400">{new Date(ev.occurredAt).toLocaleDateString('en-IN')}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Grant credits */}
          <div className="mt-4 border-t border-paper-200 pt-4">
            <h3 className="text-xs font-semibold uppercase text-muted-500 mb-2">Grant Credits</h3>
            {grantSuccess && <p className="text-xs text-green-700 mb-2">{grantSuccess}</p>}
            <div className="flex gap-2">
              <input type="number" className="input w-24" placeholder="Amount" value={grantAmount} onChange={e => setGrantAmount(e.target.value)} />
              <input type="text" className="input flex-1" placeholder="Reason" value={grantReason} onChange={e => setGrantReason(e.target.value)} />
              <button onClick={handleGrantCredits} disabled={granting || !grantAmount || !grantReason} className="btn-primary px-3 text-sm">
                {granting ? '...' : 'Grant'}
              </button>
            </div>
          </div>
        </div>
      )}

      {detailLoading && <div className="mt-4 flex items-center gap-2 text-sm text-muted-500"><span className="spinner" /> Loading user...</div>}

      {/* Users list */}
      <div className="mt-4">
        {loading ? (
          <div className="flex items-center gap-2 text-sm text-muted-500"><span className="spinner" /> Loading users...</div>
        ) : (
          <div className="space-y-2">
            <p className="text-xs text-muted-500">{users.length} users</p>
            {users.map(u => (
              <button
                key={u.id}
                onClick={() => openUserDetail(u.id)}
                className="paper-card w-full p-3 text-left hover:shadow-md transition-shadow flex items-center gap-3"
              >
                <div className="h-9 w-9 rounded-full bg-gradient-to-br from-ember-400 to-gold-500 flex items-center justify-center text-white text-xs font-bold">
                  {(u.name ?? 'U').charAt(0).toUpperCase()}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-ink-900 truncate">{u.name}</p>
                  <p className="text-xs text-muted-500 truncate">{u.email}</p>
                </div>
                <div className="text-right">
                  <p className="text-xs text-muted-500">{u.targetExam ?? '—'}</p>
                  <p className="text-[10px] text-muted-400">{new Date(u.createdAt).toLocaleDateString('en-IN')}</p>
                </div>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
