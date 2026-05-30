'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '~/lib/auth-context';
import { getFirebaseAuthClient } from '~/lib/firebase';
import { AILoader } from '~/components/ui/AILoader';
import { toast } from 'sonner';

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
  banned?: boolean;
  bannedAt?: string | null;
  banReason?: string | null;
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
  const [chatSessions, setChatSessions] = useState<{id:string;title:string;createdAt:string;updatedAt:string;messageCount:number}[]>([]);
  const [loadingChats, setLoadingChats] = useState(false);
  const [expandedChat, setExpandedChat] = useState<string | null>(null);
  const [chatMessages, setChatMessages] = useState<{role:string;content:string;timestamp?:string}[]>([]);
  // PR-34a: replace window.prompt() with an in-app modal so the ban flow
  // is brand-consistent and works inside iframes / PWAs that disable
  // native prompts.
  const [banModalOpen, setBanModalOpen] = useState(false);
  const [banReason, setBanReason] = useState('');
  const [banSubmitting, setBanSubmitting] = useState(false);

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
    setLoadingChats(true);
    setChatSessions([]);
    setExpandedChat(null);
    setChatMessages([]);
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
    // Fetch chat sessions
    try {
      const auth = getFirebaseAuthClient();
      const token = await auth.currentUser?.getIdToken();
      const res = await fetch(`${API}/v1/admin/users/${u.id}/chat`, { headers: { Authorization: `Bearer ${token}` } });
      if (res.ok) {
        const data = await res.json() as { sessions: {id:string;title:string;createdAt:string;updatedAt:string;messageCount:number}[] };
        setChatSessions(data.sessions);
      }
    } catch { /* ignore */ }
    finally { setLoadingChats(false); }
  };

  const closeDrawer = () => {
    setDrawerOpen(false);
    setTimeout(() => { setSelectedUser(null); setActivity([]); setChatSessions([]); setExpandedChat(null); setChatMessages([]); }, 200);
  };

  const loadChatMessages = async (uid: string, sessionId: string) => {
    if (expandedChat === sessionId) { setExpandedChat(null); setChatMessages([]); return; }
    setExpandedChat(sessionId);
    setChatMessages([]);
    try {
      const auth = getFirebaseAuthClient();
      const token = await auth.currentUser?.getIdToken();
      const res = await fetch(`${API}/v1/admin/users/${uid}/chat/${sessionId}`, { headers: { Authorization: `Bearer ${token}` } });
      if (res.ok) {
        const data = await res.json() as { messages: {role:string;content:string;timestamp?:string}[] };
        setChatMessages(data.messages);
      }
    } catch { /* ignore */ }
  };

  const handleChangePlan = async (uid: string, newPlan: string) => {
    setChangingPlan(true);
    try {
      const auth = getFirebaseAuthClient();
      const token = await auth.currentUser?.getIdToken();
      const res = await fetch(`${API}/v1/admin/users/${uid}`, {
        method: 'PATCH',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ plan: newPlan }),
      });
      if (!res.ok) throw new Error('Failed to update plan');
      const data = await res.json() as { success: boolean; user?: any };
      // Optimistic update in local state
      setUsers(prev => prev.map(u => u.id === uid ? { ...u, plan: newPlan } : u));
      if (selectedUser?.id === uid) setSelectedUser({ ...selectedUser, plan: newPlan });
      // Toast feedback (replaces the legacy alert(), which interrupted
      // the admin's flow with a native dialog).
      const userName = users.find(u => u.id === uid)?.name ?? 'User';
      toast.success(`Plan updated to ${newPlan} for ${userName}`);
    } catch { toast.error('Failed to update plan. Please try again.'); }
    finally { setChangingPlan(false); }
  };

  const handleResetPassword = async (email: string) => {
    try {
      const auth = getFirebaseAuthClient();
      const token = await auth.currentUser?.getIdToken();
      const res = await fetch(`${API}/v1/admin/users/reset-password`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      });
      if (!res.ok) throw new Error('reset failed');
      toast.success(`Password reset email sent to ${email}`);
    } catch { toast.error('Failed to send reset email'); }
  };

  // Soft ban / unban toggle. The endpoint flips a `banned` flag on the
  // user doc and writes an audit log entry; route-level enforcement
  // (banned users hit 403 on study/chat) lands in a follow-up so this
  // PR can ship the working button without dragging the whole route
  // tree along.
  //
  // PR-34a: instead of window.prompt(), banning now opens an in-app modal
  // with a textarea for the reason. Unbanning still goes through directly
  // (no reason needed). The modal is rendered at z-[110] so it clears the
  // BottomNav (z-[100]) on the rare case the admin shell ever surfaces it.
  const handleBanToggle = async (uid: string, currentlyBanned: boolean) => {
    if (!selectedUser) return;
    if (currentlyBanned) {
      // Unban path: no reason prompt, just submit.
      await submitBan(uid, false, undefined);
      return;
    }
    // Ban path: open the modal and let the admin type a reason.
    setBanReason('');
    setBanModalOpen(true);
  };

  const submitBan = async (uid: string, ban: boolean, reason: string | undefined) => {
    if (!selectedUser) return;
    const action = ban ? 'Ban' : 'Unban';
    setBanSubmitting(true);
    try {
      const auth = getFirebaseAuthClient();
      const token = await auth.currentUser?.getIdToken();
      const res = await fetch(`${API}/v1/admin/users/${uid}/ban`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ banned: ban, reason }),
      });
      if (!res.ok) throw new Error('ban toggle failed');
      const data = (await res.json()) as { user?: { banned?: boolean; bannedAt?: string | null; banReason?: string | null } };
      // Reflect the new state locally so the badge + button label flip
      // without a refresh.
      setSelectedUser(prev => prev ? { ...prev, banned: data.user?.banned ?? ban } : prev);
      setUsers(prev => prev.map(u => u.id === uid ? { ...u, banned: data.user?.banned ?? ban } : u));
      toast.success(`${action}ned ${selectedUser.name}`);
      setBanModalOpen(false);
      setBanReason('');
    } catch { toast.error(`Failed to ${action.toLowerCase()} user`); }
    finally { setBanSubmitting(false); }
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
                <div className="h-9 w-9 rounded-full bg-paper-300 flex items-center justify-center text-sm font-bold text-ink-800 flex-shrink-0">
                  {u.name?.[0]?.toUpperCase() || '?'}
                </div>
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="font-medium text-sm text-ink-900 truncate">{u.name || 'Unnamed'}</p>
                    {/* PR-34b (audit #38): surface a "Banned" badge on
                         the row so admin can spot banned users without
                         opening the drawer. The drawer already had the
                         ban button; this just makes the state visible
                         in the list. ember-500 is already in the file's
                         existing palette so no new colour is introduced. */}
                    {u.banned && (
                      <span className="inline-flex items-center gap-1 rounded-full bg-ember-500/10 px-2 py-0.5 text-[10px] font-semibold text-ember-600 flex-shrink-0">
                        🚫 Banned
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-muted-500 truncate">{u.email}</p>
                </div>
              </div>
              <div className="flex items-center gap-2 flex-shrink-0">
                <span className={`inline-flex items-center rounded px-2 py-0.5 text-[10px] font-medium ${u.plan === 'scholar' ? 'bg-ember-500/10 text-ember-600' : u.plan === 'free' ? 'bg-paper-400 text-ink-700' : 'bg-paper-200 text-ink-800'}`}>
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
                  <div className="h-14 w-14 rounded-full bg-paper-300 flex items-center justify-center text-xl font-bold text-ink-800">
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
                    <p className={`text-sm font-bold capitalize ${selectedUser.plan === 'scholar' ? 'text-ember-600' : 'text-ink-700'}`}>{selectedUser.plan}</p>
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
                  <h4 className="text-xs font-bold uppercase tracking-wider text-muted-500 mb-3">Chat History</h4>
                  {loadingChats ? (
                    <div className="space-y-2">
                      {[1,2,3].map(i => <div key={i} className="h-10 bg-paper-200 rounded animate-pulse" />)}
                    </div>
                  ) : chatSessions.length === 0 ? (
                    <p className="text-sm text-muted-400 text-center py-4">No chat sessions found</p>
                  ) : (
                    <div className="space-y-2 max-h-80 overflow-y-auto">
                      {chatSessions.map((session) => (
                        <div key={session.id} className="bg-paper-200/50 rounded-lg overflow-hidden">
                          <button
                            onClick={() => selectedUser && loadChatMessages(selectedUser.id, session.id)}
                            className="w-full text-left px-3 py-2.5 flex items-center justify-between hover:bg-paper-200 transition-colors"
                          >
                            <div className="min-w-0 flex-1">
                              <p className="text-sm text-ink-800 truncate">{session.title || 'Untitled'}</p>
                              <p className="text-[10px] text-muted-400">{session.messageCount} messages &middot; {formatTimeAgo(session.updatedAt)}</p>
                            </div>
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className={`text-muted-400 transition-transform ${expandedChat === session.id ? 'rotate-90' : ''}`}><polyline points="9 18 15 12 9 6"/></svg>
                          </button>
                          {expandedChat === session.id && (
                            <div className="px-3 pb-3 space-y-2 border-t border-line/50 pt-2 max-h-60 overflow-y-auto">
                              {chatMessages.length === 0 ? (
                                <p className="text-xs text-muted-400 text-center py-2">Loading...</p>
                              ) : (
                                chatMessages.map((msg, i) => (
                                  <div key={i} className={`rounded-lg px-3 py-2 text-xs ${msg.role === 'user' ? 'bg-amber-500/10 text-ink-800 ml-4' : 'bg-paper-300 text-ink-700 mr-4'}`}>
                                    <span className="font-bold text-[10px] uppercase tracking-wider text-muted-500 block mb-0.5">{msg.role}</span>
                                    <p className="whitespace-pre-wrap break-words">{msg.content.slice(0, 500)}{msg.content.length > 500 ? '...' : ''}</p>
                                  </div>
                                ))
                              )}
                            </div>
                          )}
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
                      onClick={() => handleBanToggle(selectedUser.id, Boolean(selectedUser.banned))}
                      className={`w-full rounded-lg border px-4 py-2 text-left text-sm transition-colors ${
                        selectedUser.banned
                          ? 'border-line bg-paper-200 text-ink-800 hover:bg-paper-300'
                          : 'border-ember-500 bg-paper-200 text-ember-600 hover:bg-paper-300'
                      }`}
                    >
                      {selectedUser.banned ? '✓ Unban User' : '🚫 Ban User'}
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

      {/* Ban-user modal — PR-34a in-app replacement for window.prompt().
          z-[110] sits above the BottomNav (z-[100]) per the new convention. */}
      {banModalOpen && selectedUser && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="ban-user-title"
          className="fixed inset-0 z-[110] flex items-end justify-center sm:items-center bg-black/50 backdrop-blur-sm p-3"
          onClick={(e) => { if (e.target === e.currentTarget && !banSubmitting) setBanModalOpen(false); }}
        >
          <div className="paper-card w-full max-w-md p-5 sm:p-6 animate-in fade-in zoom-in-95">
            <h3 id="ban-user-title" className="font-serif text-lg font-semibold text-ink-900">
              Ban {selectedUser.name}?
            </h3>
            <p className="mt-2 text-sm text-muted-500">
              They will be blocked from study, chat, and other authenticated surfaces. The reason is logged for audit.
            </p>

            <div className="mt-4">
              <label className="mb-1 block text-xs font-medium text-muted-500">
                Reason for banning <span className="text-muted-400">(optional but recommended)</span>
              </label>
              <textarea
                value={banReason}
                onChange={(e) => setBanReason(e.target.value.slice(0, 500))}
                rows={3}
                placeholder="Spam, abusive behaviour, payment fraud, ..."
                className="input w-full resize-none text-sm"
                autoFocus
              />
              <p className="mt-1 text-right text-[10px] text-muted-400">{banReason.length}/500</p>
            </div>

            <div className="mt-4 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <button
                type="button"
                onClick={() => setBanModalOpen(false)}
                disabled={banSubmitting}
                className="btn-ghost flex-1 sm:flex-initial"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => submitBan(selectedUser.id, true, banReason.trim() || undefined)}
                disabled={banSubmitting}
                className="rounded-xl border border-ember-500 bg-ember-500/10 px-4 py-3 text-sm font-medium text-ember-600 hover:bg-ember-500/20 transition-colors disabled:opacity-60"
              >
                {banSubmitting ? 'Banning…' : 'Ban User'}
              </button>
            </div>
          </div>
        </div>
      )}
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
