'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '~/lib/auth-context';
import { getFirebaseAuthClient } from '~/lib/firebase';
import { AILoader } from '~/components/ui/AILoader';

interface AdminUser {
  id: string;
  email: string;
  name: string;
  phone?: string | null;
  photoURL?: string | null;
  targetExam: string | null;
  plan: string;
  credits: number;
  role: string;
  currentStreak?: number;
  bestStreak?: number;
  onboardingLevel?: string;
  createdAt: string;
}

interface ActivityItem {
  type: string;
  description: string;
  timestamp: string;
}

const API = process.env['NEXT_PUBLIC_API_URL'] ?? 'https://api.nexigrate.com';

export default function AdminUsersPage() {
  const { user, loading } = useAuth();
  const router = useRouter();
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [error, setError] = useState<string | null>(null);
  const [fetching, setFetching] = useState(true);
  const [search, setSearch] = useState('');
  const [searchDebounce, setSearchDebounce] = useState('');
  const [selectedUser, setSelectedUser] = useState<AdminUser | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [activity, setActivity] = useState<ActivityItem[]>([]);
  const [loadingActivity, setLoadingActivity] = useState(false);
  const [changingPlan, setChangingPlan] = useState(false);

  useEffect(() => {
    if (!loading && !user) router.replace('/signin');
  }, [user, loading, router]);

  useEffect(() => {
    const timer = setTimeout(() => { setSearchDebounce(search); setPage(1); }, 300);
    return () => clearTimeout(timer);
  }, [search]);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    (async () => {
      setFetching(true);
      try {
        const auth = getFirebaseAuthClient();
        const token = await auth.currentUser?.getIdToken();
        const searchParam = searchDebounce ? `&search=${encodeURIComponent(searchDebounce)}` : '';
        const res = await fetch(`${API}/v1/admin/users?page=${page}&limit=20${searchParam}`, { headers: { Authorization: `Bearer ${token}` } });
        if (!res.ok) throw new Error(`Failed: ${res.status}`);
        const data = await res.json() as { users: AdminUser[]; total: number };
        if (!cancelled) { setUsers(data.users); setTotal(data.total); }
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : 'Failed to load users');
      } finally {
        if (!cancelled) setFetching(false);
      }
    })();
    return () => { cancelled = true; };
  }, [user, page, searchDebounce]);

  const openUserDrawer = async (u: AdminUser) => {
    setSelectedUser(u);
    setDrawerOpen(true);
    setLoadingActivity(true);
    try {
      const auth = getFirebaseAuthClient();
      const token = await auth.currentUser?.getIdToken();
      const res = await fetch(`${API}/v1/admin/users/${u.id}/activity`, { headers: { Authorization: `Bearer ${token}` } });
      if (res.ok) {
        const data = await res.json() as { activity: ActivityItem[] };
        setActivity(data.activity);
      } else {
        setActivity([]);
      }
    } catch { setActivity([]); }
    finally { setLoadingActivity(false); }
  };

  const closeDrawer = () => {
    setDrawerOpen(false);
    setTimeout(() => { setSelectedUser(null); setActivity([]); }, 200);
  };

  const handleChangePlan = async (uid: string, newPlan: string) => {
    setChangingPlan(true);
    try {
      const auth = getFirebaseAuthClient();
      const token = await auth.currentUser?.getIdToken();
      await fetch(`${API}/v1/admin/users/${uid}/plan`, {
        method: 'PATCH',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ plan: newPlan }),
      });
      setUsers(prev => prev.map(u => u.id === uid ? { ...u, plan: newPlan } : u));
      if (selectedUser?.id === uid) setSelectedUser({ ...selectedUser, plan: newPlan });
    } catch { /* silent */ }
    finally { setChangingPlan(false); }
  };

  const handleResetPassword = async (email: string) => {
    try {
      const auth = getFirebaseAuthClient();
      const token = await auth.currentUser?.getIdToken();
      await fetch(`${API}/v1/admin/users/reset-password`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      });
      alert('Password reset email sent!');
    } catch { alert('Failed to send reset email'); }
  };

  if (loading || !user) return <div className="flex items-center justify-center py-20"><AILoader context="general" /></div>;
  if (error) return <div className="banner banner-error">{error}</div>;

  return (
    <div className="relative">
      <h1 className="font-serif text-2xl font-bold text-ink-900">Users</h1>
      <p className="mt-1 text-sm text-muted-500">{total} total users</p>

      {/* Search bar */}
      <div className="mt-4">
        <input
          type="text"
          placeholder="Search by name, email, phone, or exam..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="input w-full"
        />
      </div>

      {fetching ? (
        <div className="flex items-center justify-center py-12"><AILoader context="general" /></div>
      ) : (
        <div className="mt-6 space-y-2">
          {users.map((u) => (
            <button
              key={u.id}
              className="paper-card p-4 w-full text-left flex items-center justify-between hover:border-amber-500/50 transition-colors cursor-pointer"
              onClick={() => openUserDrawer(u)}
            >
              <div className="flex items-center gap-3 min-w-0">
                <div className="h-9 w-9 rounded-full bg-paper-300 flex items-center justify-center text-sm font-bold text-gold-500 flex-shrink-0">
                  {u.name?.[0]?.toUpperCase() || '?'}
                </div>
                <div className="min-w-0">
                  <p className="font-medium text-sm text-ink-900 truncate">{u.name || 'Unnamed'}</p>
                  <p className="text-xs text-muted-500 truncate">{u.email}</p>
                </div>
              </div>
              <div className="flex items-center gap-2 flex-shrink-0">
                <span className={`inline-flex items-center rounded px-2 py-0.5 text-[10px] font-medium ${u.plan === 'scholar' ? 'bg-gold-500/10 text-gold-500' : u.plan === 'free' ? 'bg-paper-400 text-ink-700' : 'bg-paper-200 text-ink-800'}`}>
                  {u.plan}
                </span>
                <span className="text-xs text-muted-500">{u.credits} cr</span>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-muted-400"><polyline points="9 18 15 12 9 6"/></svg>
              </div>
            </button>
          ))}
          {users.length === 0 && <p className="text-center text-sm text-muted-500 py-8">No users found.</p>}
        </div>
      )}

      {/* Pagination */}
      {total > 20 && (
        <div className="mt-6 flex items-center justify-center gap-3">
          <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1} className="btn-ghost-sm disabled:opacity-50">← Prev</button>
          <span className="text-sm text-muted-500">Page {page} of {Math.ceil(total / 20)}</span>
          <button onClick={() => setPage(p => p + 1)} disabled={page * 20 >= total} className="btn-ghost-sm disabled:opacity-50">Next →</button>
        </div>
      )}

      {/* User Detail Drawer */}
      {drawerOpen && (
        <div className="fixed inset-0 z-50 flex justify-end" onClick={closeDrawer}>
          <div className="absolute inset-0 bg-black/40" />
          <div
            className="relative w-full max-w-md bg-paper-50 border-l border-line h-full overflow-y-auto shadow-2xl animate-slideInRight"
            onClick={e => e.stopPropagation()}
          >
            {selectedUser && (
              <div className="p-6 space-y-6">
                {/* Header with close */}
                <div className="flex items-center justify-between">
                  <h2 className="text-lg font-bold text-ink-900">User Detail</h2>
                  <button onClick={closeDrawer} className="h-8 w-8 rounded-lg bg-paper-200 flex items-center justify-center text-muted-500 hover:text-ink-900 hover:bg-paper-300 transition-colors">
                    ✕
                  </button>
                </div>

                {/* Profile Header */}
                <div className="flex items-center gap-4">
                  <div className="h-14 w-14 rounded-full bg-paper-300 flex items-center justify-center text-xl font-bold text-gold-500">
                    {selectedUser.name?.[0]?.toUpperCase() || '?'}
                  </div>
                  <div>
                    <h3 className="font-bold text-ink-900">{selectedUser.name || 'Unnamed'}</h3>
                    <p className="text-sm text-muted-500">{selectedUser.email}</p>
                    {selectedUser.phone && <p className="text-xs text-muted-400">{selectedUser.phone}</p>}
                    <p className="text-xs text-muted-400 mt-1">Joined {new Date(selectedUser.createdAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}</p>
                  </div>
                </div>

                {/* Quick Stats */}
                <div className="grid grid-cols-3 gap-3">
                  <div className="bg-paper-200 rounded-lg p-3 text-center">
                    <p className="text-lg font-bold text-ink-900">{selectedUser.credits}</p>
                    <p className="text-[10px] text-muted-500 uppercase tracking-wider">Credits</p>
                  </div>
                  <div className="bg-paper-200 rounded-lg p-3 text-center">
                    <p className="text-lg font-bold text-ink-900">{selectedUser.currentStreak ?? 0}</p>
                    <p className="text-[10px] text-muted-500 uppercase tracking-wider">Streak</p>
                  </div>
                  <div className="bg-paper-200 rounded-lg p-3 text-center">
                    <p className={`text-sm font-bold capitalize ${selectedUser.plan === 'scholar' ? 'text-gold-500' : 'text-ink-700'}`}>{selectedUser.plan}</p>
                    <p className="text-[10px] text-muted-500 uppercase tracking-wider">Plan</p>
                  </div>
                </div>

                {/* Info Grid */}
                <div className="bg-paper-200 rounded-lg p-4 space-y-2 text-sm">
                  <div className="flex justify-between"><span className="text-muted-500">Exam</span><span className="text-ink-800">{selectedUser.targetExam ?? '—'}</span></div>
                  <div className="flex justify-between"><span className="text-muted-500">Level</span><span className="text-ink-800 capitalize">{selectedUser.onboardingLevel ?? '—'}</span></div>
                  <div className="flex justify-between"><span className="text-muted-500">Role</span><span className="text-ink-800">{selectedUser.role}</span></div>
                  <div className="flex justify-between"><span className="text-muted-500">Best Streak</span><span className="text-ink-800">{selectedUser.bestStreak ?? 0} days</span></div>
                </div>

                {/* Activity Timeline */}
                <div>
                  <h4 className="text-xs font-bold uppercase tracking-wider text-muted-500 mb-3">Activity Timeline</h4>
                  {loadingActivity ? (
                    <div className="space-y-2">
                      {[1,2,3].map(i => <div key={i} className="h-10 bg-paper-200 rounded animate-pulse" />)}
                    </div>
                  ) : activity.length === 0 ? (
                    <p className="text-sm text-muted-400 text-center py-4">No activity data available</p>
                  ) : (
                    <div className="space-y-2 max-h-60 overflow-y-auto">
                      {activity.slice(0, 20).map((item, i) => (
                        <div key={i} className="flex items-start gap-3 bg-paper-200/50 rounded-lg p-3">
                          <span className="text-sm mt-0.5">{getActivityEmoji(item.type)}</span>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm text-ink-800 truncate">{item.description}</p>
                            <p className="text-[10px] text-muted-400">{formatTimeAgo(item.timestamp)}</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Admin Actions */}
                <div>
                  <h4 className="text-xs font-bold uppercase tracking-wider text-muted-500 mb-3">Admin Actions</h4>
                  <div className="space-y-2">
                    {/* Change Plan */}
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-muted-500 w-20">Plan:</span>
                      <select
                        value={selectedUser.plan}
                        onChange={e => handleChangePlan(selectedUser.id, e.target.value)}
                        disabled={changingPlan}
                        className="flex-1 rounded-lg bg-paper-200 border border-line text-ink-800 text-sm px-3 py-1.5"
                      >
                        <option value="free">Free</option>
                        <option value="scholar">Scholar</option>
                        <option value="aspirant">Aspirant</option>
                        <option value="achiever">Achiever</option>
                      </select>
                    </div>
                    {/* Action buttons */}
                    <button
                      onClick={() => handleResetPassword(selectedUser.email)}
                      className="w-full rounded-lg bg-paper-200 border border-line px-4 py-2 text-sm text-ink-800 hover:bg-paper-300 transition-colors text-left"
                    >
                      🔑 Send Password Reset Email
                    </button>
                    <button
                      onClick={() => { if (confirm(`Ban user ${selectedUser.name}?`)) { /* TODO: implement ban */ } }}
                      className="w-full rounded-lg bg-paper-200 border border-ember-500 px-4 py-2 text-sm text-ember-500 hover:bg-paper-200 transition-colors text-left"
                    >
                      🚫 Ban User
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      <style jsx>{`
        @keyframes slideInRight {
          from { transform: translateX(100%); }
          to { transform: translateX(0); }
        }
        .animate-slideInRight {
          animation: slideInRight 0.2s ease-out;
        }
      `}</style>
    </div>
  );
}

function getActivityEmoji(type: string): string {
  const map: Record<string, string> = {
    chapter_open: '📖', quiz_complete: '✅', chat_message: '💬',
    ca_quiz: '📰', signin: '🔑', credits_earned: '💎',
    chapter_complete: '🎉', assessment: '📝',
  };
  return map[type] ?? '📌';
}

function formatTimeAgo(timestamp: string): string {
  const diff = Date.now() - new Date(timestamp).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}
