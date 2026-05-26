'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '~/lib/auth-context';
import { getFirebaseAuthClient } from '~/lib/firebase';

interface Announcement {
  id: string;
  title: string;
  body: string;
  type: 'banner' | 'modal' | 'email' | 'all';
  targetAudience: string;
  createdAt: string;
  isActive: boolean;
}

const API = process.env['NEXT_PUBLIC_API_URL'] ?? 'https://api.nexigrate.com';

export default function AdminAnnouncementsPage() {
  const { user, loading } = useAuth();
  const router = useRouter();
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [fetching, setFetching] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState({ title: '', body: '', type: 'banner' as const, targetAudience: 'all' });
  const [showForm, setShowForm] = useState(false);

  useEffect(() => {
    if (!loading && !user) router.replace('/admin/login');
  }, [user, loading, router]);

  const fetchAnnouncements = async () => {
    try {
      const auth = getFirebaseAuthClient();
      const token = await auth.currentUser?.getIdToken();
      const res = await fetch(`${API}/v1/admin/announcements`, { headers: { Authorization: `Bearer ${token}` } });
      if (!res.ok) throw new Error(`Failed: ${res.status}`);
      const data = (await res.json()) as { announcements: Announcement[] };
      setAnnouncements(data.announcements);
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Failed';
      if (!msg.includes('404')) setError(msg);
    }
    finally { setFetching(false); }
  };

  useEffect(() => { if (user) fetchAnnouncements(); }, [user]);

  const handleCreate = async () => {
    if (!form.title.trim() || !form.body.trim()) return;
    setCreating(true);
    try {
      const auth = getFirebaseAuthClient();
      const token = await auth.currentUser?.getIdToken();
      const res = await fetch(`${API}/v1/admin/announcements`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify(form),
      });
      if (!res.ok) throw new Error(`Failed: ${res.status}`);
      const data = (await res.json()) as { announcement: Announcement };
      setAnnouncements(prev => [data.announcement, ...prev]);
      setForm({ title: '', body: '', type: 'banner', targetAudience: 'all' });
      setShowForm(false);
    } catch (e) { setError(e instanceof Error ? e.message : 'Failed to create'); }
    finally { setCreating(false); }
  };

  if (loading || !user) return (
    <div className="space-y-4">
      <div className="h-7 w-40 rounded bg-paper-300 animate-pulse" />
      <div className="h-32 rounded bg-paper-300 animate-pulse" />
    </div>
  );

  return (
    <div>
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-serif text-2xl font-bold text-ink-900 dark:text-paper-50">Announcements</h1>
          <p className="mt-1 text-sm text-muted-500">Send in-app banners and notifications to users</p>
        </div>
        <button onClick={() => setShowForm(!showForm)} className="btn-primary text-sm">
          {showForm ? 'Cancel' : '+ New Announcement'}
        </button>
      </div>

      {error && <div className="banner banner-error mt-4">{error}</div>}

      {/* Create form */}
      {showForm && (
        <div className="paper-card mt-6 p-5 space-y-4">
          <div>
            <label className="text-xs font-medium text-ink-700 dark:text-paper-300">Title</label>
            <input value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} className="input mt-1" placeholder="Announcement title" />
          </div>
          <div>
            <label className="text-xs font-medium text-ink-700 dark:text-paper-300">Body (Markdown supported)</label>
            <textarea value={form.body} onChange={e => setForm(f => ({ ...f, body: e.target.value }))} className="input mt-1" rows={4} placeholder="Write your announcement..." />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-xs font-medium text-ink-700 dark:text-paper-300">Type</label>
              <select value={form.type} onChange={e => setForm(f => ({ ...f, type: e.target.value as any }))} className="input mt-1">
                <option value="banner">In-App Banner</option>
                <option value="modal">Modal Popup</option>
                <option value="email">Email Only</option>
                <option value="all">All Channels</option>
              </select>
            </div>
            <div>
              <label className="text-xs font-medium text-ink-700 dark:text-paper-300">Target</label>
              <select value={form.targetAudience} onChange={e => setForm(f => ({ ...f, targetAudience: e.target.value }))} className="input mt-1">
                <option value="all">All Users</option>
                <option value="free">Free Plan Only</option>
                <option value="paid">Paid Users Only</option>
              </select>
            </div>
          </div>
          <button onClick={handleCreate} disabled={creating || !form.title.trim() || !form.body.trim()} className="btn-primary w-full">
            {creating ? 'Sending...' : 'Send Announcement'}
          </button>
        </div>
      )}

      {/* List */}
      {fetching ? (
        <div className="mt-6 space-y-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="paper-card p-4 space-y-2">
              <div className="h-4 w-40 rounded bg-paper-300 animate-pulse" />
              <div className="h-3 w-64 rounded bg-paper-300 animate-pulse" />
            </div>
          ))}
        </div>
      ) : announcements.length === 0 ? (
        <div className="paper-card mt-6 p-8 text-center">
          <p className="text-2xl">📢</p>
          <p className="mt-2 text-sm text-muted-500">No announcements yet</p>
          <p className="text-xs text-muted-400 mt-1">Create one to notify your users.</p>
        </div>
      ) : (
        <div className="mt-6 space-y-3">
          {announcements.map(a => (
            <div key={a.id} className="paper-card p-4">
              <div className="flex items-start justify-between">
                <div>
                  <p className="font-medium text-sm text-ink-900 dark:text-paper-50">{a.title}</p>
                  <p className="mt-1 text-xs text-muted-500 line-clamp-2">{a.body}</p>
                  <div className="mt-2 flex items-center gap-2">
                    <span className="pill text-xs">{a.type}</span>
                    <span className="pill text-xs">{a.targetAudience}</span>
                    <span className="text-xs text-muted-400">{new Date(a.createdAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}</span>
                  </div>
                </div>
                <span className={`h-2 w-2 rounded-full ${a.isActive ? 'bg-gold-500' : 'bg-muted-400'}`} />
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
