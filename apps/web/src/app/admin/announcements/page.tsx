'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '~/lib/auth-context';
import { getFirebaseAuthClient } from '~/lib/firebase';

/**
 * Admin: Announcements (PR-36 — Hindi support added).
 *
 * Founder report (30 May 2026): "Announcement abhi bhi popup me nhi
 * hai our admin panel me jo announcement bnane ka option diya hai
 * usko Hindi ka option dena taki hindi users ke liye bhi bnaya ja
 * ske".
 *
 * Two changes shipped here:
 *   1. Optional Hindi fields (titleHi + bodyHi) on the create/edit
 *      form. When the student app loads with `language === 'hi'` it
 *      prefers these; otherwise it falls back to the English fields.
 *   2. Clearer "Modal Popup" hint right below the type selector so
 *      admin understands the difference between a banner (top strip)
 *      and a popup (centred dialog with countdown). The founder's
 *      "popup nhi aa raha" was actually because they were saving as
 *      type='banner' which is a top strip, not a popup.
 *
 * Backend already accepts titleHi / bodyHi optionally (PR-36 admin.ts).
 */
interface Announcement {
  id: string;
  title: string;
  body: string;
  titleHi?: string;
  bodyHi?: string;
  type: 'banner' | 'modal' | 'email' | 'all';
  targetAudience: string;
  createdAt: string;
  isActive: boolean;
  /** Admin-configurable popup timing (modal/all only). */
  durationSeconds?: number;
  showDelaySeconds?: number;
}

const API = process.env['NEXT_PUBLIC_API_URL'] ?? 'https://api.nexigrate.com';

export default function AdminAnnouncementsPage() {
  const { user, loading } = useAuth();
  const router = useRouter();
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [fetching, setFetching] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState<{
    title: string; body: string;
    titleHi: string; bodyHi: string;
    type: 'banner' | 'modal' | 'email' | 'all';
    targetAudience: string;
    durationSeconds: number; showDelaySeconds: number;
  }>({ title: '', body: '', titleHi: '', bodyHi: '', type: 'all', targetAudience: 'all', durationSeconds: 10, showDelaySeconds: 2 });
  const [showHindi, setShowHindi] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);
  const [preview, setPreview] = useState(false);

  useEffect(() => {
    if (!loading && !user) router.replace('/admin/login');
  }, [user, loading, router]);

  const getToken = async () => {
    const auth = getFirebaseAuthClient();
    return auth.currentUser?.getIdToken();
  };

  const fetchAnnouncements = async () => {
    try {
      const token = await getToken();
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
      const token = await getToken();
      // Build payload — only send Hindi fields when non-empty so backend
      // can store / clear them correctly.
      const payload: Record<string, unknown> = {
        title: form.title,
        body: form.body,
        type: form.type,
        targetAudience: form.targetAudience,
        durationSeconds: form.durationSeconds,
        showDelaySeconds: form.showDelaySeconds,
      };
      if (form.titleHi.trim()) payload['titleHi'] = form.titleHi.trim();
      if (form.bodyHi.trim()) payload['bodyHi'] = form.bodyHi.trim();
      if (editingId) {
        // Update existing announcement
        const res = await fetch(`${API}/v1/admin/announcements/${editingId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify(payload),
        });
        if (!res.ok) throw new Error(`Failed: ${res.status}`);
        setAnnouncements(prev => prev.map(a => a.id === editingId
          ? { ...a, ...form, titleHi: form.titleHi.trim() || undefined, bodyHi: form.bodyHi.trim() || undefined }
          : a));
        setEditingId(null);
      } else {
        // Create new
        const res = await fetch(`${API}/v1/admin/announcements`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify(payload),
        });
        if (!res.ok) throw new Error(`Failed: ${res.status}`);
        const data = (await res.json()) as { announcement: Announcement };
        setAnnouncements(prev => [data.announcement, ...prev]);
      }
      setForm({ title: '', body: '', titleHi: '', bodyHi: '', type: 'banner', targetAudience: 'all', durationSeconds: 10, showDelaySeconds: 2 });
      setShowHindi(false);
      setShowForm(false);
    } catch (e) { setError(e instanceof Error ? e.message : 'Failed to save'); }
    finally { setCreating(false); }
  };

  const handleDelete = async (id: string) => {
    try {
      const token = await getToken();
      const res = await fetch(`${API}/v1/admin/announcements/${id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error(`Failed: ${res.status}`);
      setAnnouncements(prev => prev.filter(a => a.id !== id));
      setDeleteConfirm(null);
    } catch (e) { setError(e instanceof Error ? e.message : 'Failed to delete'); }
  };

  const handleToggleActive = async (id: string, currentlyActive: boolean) => {
    try {
      const token = await getToken();
      const res = await fetch(`${API}/v1/admin/announcements/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ isActive: !currentlyActive }),
      });
      if (!res.ok) throw new Error(`Failed: ${res.status}`);
      setAnnouncements(prev => prev.map(a => a.id === id ? { ...a, isActive: !currentlyActive } : a));
    } catch (e) { setError(e instanceof Error ? e.message : 'Failed to update'); }
  };

  /**
   * PR-36 helper — clears `dismissedAnnouncements` localStorage so the
   * admin can re-test their banner/popup creations without going
   * incognito. The founder reported "popup nhi aa raha" — usually this
   * is because they dismissed it once during testing and the key
   * persists. This button gives them a one-click reset.
   */
  const handleResetDismissals = () => {
    try {
      localStorage.removeItem('dismissedAnnouncements');
      // Legacy key (pre-PR-34a) — clear too in case anything stale.
      localStorage.removeItem('dismissed-announcements');
      alert('Cleared. Reload the app tab to see banners/popups again.');
    } catch {
      alert('Could not clear localStorage in this context.');
    }
  };

  const startEdit = (a: Announcement) => {
    setForm({
      title: a.title,
      body: a.body,
      titleHi: a.titleHi ?? '',
      bodyHi: a.bodyHi ?? '',
      type: a.type,
      targetAudience: a.targetAudience,
      durationSeconds: a.durationSeconds ?? 10,
      showDelaySeconds: a.showDelaySeconds ?? 2,
    });
    setShowHindi(!!(a.titleHi || a.bodyHi));
    setEditingId(a.id);
    setShowForm(true);
  };

  if (loading || !user) return (
    <div className="space-y-4">
      <div className="h-7 w-40 rounded bg-paper-300 animate-pulse" />
      <div className="h-32 rounded bg-paper-300 animate-pulse" />
    </div>
  );

  return (
    <div>
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h1 className="font-serif text-2xl font-bold text-ink-900">Announcements</h1>
          <p className="mt-1 text-sm text-muted-500">Send in-app banners and popup notifications. Banner = top strip · Modal Popup = centred dialog with countdown · All = both surfaces.</p>
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={handleResetDismissals}
            className="btn-ghost text-xs"
            title="Clears your local 'dismissed' list so you can re-test announcements"
          >
            Reset my dismissals
          </button>
          <button onClick={() => { setShowForm(!showForm); setEditingId(null); setShowHindi(false); setForm({ title: '', body: '', titleHi: '', bodyHi: '', type: 'banner', targetAudience: 'all', durationSeconds: 10, showDelaySeconds: 2 }); }} className="btn-primary text-sm">
            {showForm ? 'Cancel' : '+ New Announcement'}
          </button>
        </div>
      </div>

      {error && <div className="banner banner-error mt-4">{error}</div>}

      {/* Create/Edit form */}
      {showForm && (
        <div className="paper-card mt-6 p-5 space-y-4">
          <p className="text-sm font-semibold text-ink-700">{editingId ? 'Edit Announcement' : 'New Announcement'}</p>
          <div>
            <label className="text-xs font-medium text-ink-700">Title (English)</label>
            <input value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} className="input mt-1" placeholder="Announcement title" />
          </div>
          <div>
            <label className="text-xs font-medium text-ink-700">Body (English) — Markdown supported</label>
            <textarea value={form.body} onChange={e => setForm(f => ({ ...f, body: e.target.value }))} className="input mt-1" rows={4} placeholder="Write your announcement..." />
          </div>

          {/* Optional Hindi version (PR-36) */}
          <div className="rounded-lg border border-line bg-paper-100 p-3">
            <button
              type="button"
              onClick={() => setShowHindi(s => !s)}
              className="flex w-full items-center justify-between text-xs font-medium text-ink-700"
            >
              <span>Hindi version (अनुवाद) — optional</span>
              <span className="text-muted-500">{showHindi ? '▾' : '▸'}</span>
            </button>
            {showHindi && (
              <div className="mt-3 space-y-3">
                <div>
                  <label className="text-xs font-medium text-ink-700">शीर्षक (Title in Hindi)</label>
                  <input
                    value={form.titleHi}
                    onChange={e => setForm(f => ({ ...f, titleHi: e.target.value }))}
                    className="input mt-1"
                    placeholder="उदाहरण: नया फ़ीचर लॉन्च"
                    lang="hi"
                  />
                </div>
                <div>
                  <label className="text-xs font-medium text-ink-700">विवरण (Body in Hindi)</label>
                  <textarea
                    value={form.bodyHi}
                    onChange={e => setForm(f => ({ ...f, bodyHi: e.target.value }))}
                    className="input mt-1"
                    rows={4}
                    placeholder="अपना संदेश यहाँ लिखें..."
                    lang="hi"
                  />
                </div>
                <p className="text-[11px] text-muted-500">
                  If filled, Hindi-language users see this version instead of the English one. Leave blank to show the English text to all users.
                </p>
              </div>
            )}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="text-xs font-medium text-ink-700">Type</label>
              <select value={form.type} onChange={e => setForm(f => ({ ...f, type: e.target.value as 'banner' | 'modal' | 'email' | 'all' }))} className="input mt-1">
                <option value="banner">Banner (top strip)</option>
                <option value="modal">Modal Popup (centred dialog)</option>
                <option value="all">All (banner + popup)</option>
                <option value="email">Email Only</option>
              </select>
              <p className="mt-1 text-[11px] text-muted-500">
                {form.type === 'banner' && 'A thin strip at the top of every page. Dismissible. Best for ongoing promos.'}
                {form.type === 'modal' && 'Centred popup that auto-dismisses after the duration you set below (default 10s). Best for one-time messages.'}
                {form.type === 'all' && 'Shows both — popup first on load, banner stays.'}
                {form.type === 'email' && 'Email-only — no in-app surface. Use the Email tab to send.'}
              </p>
            </div>
            <div>
              <label className="text-xs font-medium text-ink-700">Target</label>
              <select value={form.targetAudience} onChange={e => setForm(f => ({ ...f, targetAudience: e.target.value }))} className="input mt-1">
                <option value="all">All Users</option>
                <option value="free">Free Plan Only</option>
                <option value="paid">Paid Users Only</option>
              </select>
            </div>
          </div>

          {/* Popup timing — only meaningful for the centred popup (modal/all). */}
          {(form.type === 'modal' || form.type === 'all') && (
            <div className="rounded-lg border border-line bg-paper-100 p-3">
              <p className="text-xs font-medium text-ink-700">Popup timing</p>
              <p className="mt-0.5 text-[11px] text-muted-500">Controls the centred popup only — the banner strip ignores these.</p>
              <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="text-xs font-medium text-ink-700">
                    Visible for: <span className="text-ember-600 font-semibold">{form.durationSeconds}s</span>
                  </label>
                  <input
                    type="range" min={3} max={120} step={1}
                    value={form.durationSeconds}
                    onChange={e => setForm(f => ({ ...f, durationSeconds: Number(e.target.value) }))}
                    className="mt-2 w-full accent-ember-500"
                  />
                  <p className="text-[11px] text-muted-500">How long the popup stays before auto-closing (3–120s).</p>
                </div>
                <div>
                  <label className="text-xs font-medium text-ink-700">
                    Appears after: <span className="text-ember-600 font-semibold">{form.showDelaySeconds}s</span>
                  </label>
                  <input
                    type="range" min={0} max={30} step={1}
                    value={form.showDelaySeconds}
                    onChange={e => setForm(f => ({ ...f, showDelaySeconds: Number(e.target.value) }))}
                    className="mt-2 w-full accent-ember-500"
                  />
                  <p className="text-[11px] text-muted-500">Delay before the popup appears on app open (0–30s).</p>
                </div>
              </div>
            </div>
          )}
          <div className="flex gap-3">
            <button onClick={handleCreate} disabled={creating || !form.title.trim() || !form.body.trim()} className="btn-primary flex-1">
              {creating ? 'Saving...' : editingId ? 'Update Announcement' : 'Send Announcement'}
            </button>
            {form.title.trim() && (
              <button
                type="button"
                onClick={() => setPreview(true)}
                className="rounded-lg border border-ember-500/40 bg-ember-500/5 px-4 py-2 text-sm font-medium text-ember-600 hover:bg-ember-500/10"
              >
                👁 Preview
              </button>
            )}
          </div>
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
              <div className="flex items-start justify-between flex-wrap gap-2">
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-sm text-ink-900">{a.title}</p>
                  <p className="mt-1 text-xs text-muted-500 line-clamp-2">{a.body}</p>
                  {/* PR-36: show Hindi pill if titleHi/bodyHi set */}
                  {(a.titleHi || a.bodyHi) && (
                    <div className="mt-2 rounded-md border border-line bg-paper-100 p-2" lang="hi">
                      <p className="text-xs font-medium text-ink-900">{a.titleHi || a.title}</p>
                      <p className="mt-0.5 text-[11px] text-muted-500 line-clamp-2">{a.bodyHi || a.body}</p>
                    </div>
                  )}
                  <div className="mt-2 flex items-center gap-2 flex-wrap">
                    <span className="pill text-xs">{a.type}</span>
                    <span className="pill text-xs">{a.targetAudience}</span>
                    {(a.titleHi || a.bodyHi) && <span className="pill text-xs" title="Hindi version available">🇮🇳 hi</span>}
                    <span className="text-xs text-muted-400">{new Date(a.createdAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}</span>
                    <span className={`text-xs font-medium ${a.isActive ? 'text-amber-600' : 'text-muted-400'}`}>
                      {a.isActive ? 'Active' : 'Inactive'}
                    </span>
                  </div>
                </div>
                <div className="flex items-center gap-1 ml-3 flex-wrap">
                  {/* Toggle Active/Inactive */}
                  <button
                    onClick={() => handleToggleActive(a.id, a.isActive)}
                    className={`rounded px-2 py-1 text-xs font-medium ${a.isActive ? 'bg-stone-200 text-stone-700' : 'bg-amber-100 text-amber-700'}`}
                    title={a.isActive ? 'Deactivate' : 'Activate'}
                  >
                    {a.isActive ? 'Deactivate' : 'Activate'}
                  </button>
                  {/* Edit button */}
                  <button
                    onClick={() => startEdit(a)}
                    className="rounded px-2 py-1 text-xs font-medium bg-paper-200 text-ink-700 hover:bg-paper-300"
                    title="Edit"
                  >
                    Edit
                  </button>
                  {/* Delete button */}
                  {deleteConfirm === a.id ? (
                    <div className="flex items-center gap-1">
                      <button onClick={() => handleDelete(a.id)} className="rounded px-2 py-1 text-xs font-medium bg-ember-100 text-ember-700">Confirm</button>
                      <button onClick={() => setDeleteConfirm(null)} className="rounded px-2 py-1 text-xs font-medium bg-paper-200 text-muted-600">Cancel</button>
                    </div>
                  ) : (
                    <button
                      onClick={() => setDeleteConfirm(a.id)}
                      className="rounded px-2 py-1 text-xs font-medium bg-ember-50 text-ember-600 hover:bg-ember-100"
                      title="Delete"
                    >
                      Delete
                    </button>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Preview modal */}
      {preview && form.title.trim() && (
        <div className="fixed inset-0 z-[110] flex items-center justify-center px-4" onClick={() => setPreview(false)}>
          <div className="absolute inset-0 bg-ink-950/60 backdrop-blur-sm" />
          <div className="relative w-full max-w-[420px] rounded-2xl border border-ember-500/50 bg-paper-50 dark:bg-paper-900 p-6 shadow-2xl" onClick={e => e.stopPropagation()}>
            <button onClick={() => setPreview(false)} className="absolute right-3 top-3 flex h-7 w-7 items-center justify-center rounded-full text-muted-500 hover:bg-paper-200 hover:text-ink-900 transition-colors">✕</button>
            <p className="text-[10px] uppercase tracking-wider text-muted-400 mb-2">Preview — {form.type}</p>
            {form.type === 'banner' || form.type === 'all' ? (
              <div className="rounded-lg bg-ember-500 text-paper-50 px-4 py-2 mb-3">
                <p className="text-sm font-bold">{form.title}</p>
                <p className="text-xs text-paper-50/80 mt-0.5">{form.body}</p>
              </div>
            ) : null}
            {form.type === 'modal' || form.type === 'all' ? (
              <div className="rounded-xl border border-line-200 dark:border-line-700 p-4">
                <h3 className="font-serif text-lg font-bold text-ink-900 dark:text-ink-100">{form.title}</h3>
                <p className="mt-2 text-sm text-ink-800 dark:text-ink-200">{form.body}</p>
                <div className="mt-3 h-1 w-full rounded-full bg-paper-300 dark:bg-paper-700">
                  <div className="h-full w-[70%] rounded-full bg-ember-500" />
                </div>
                <p className="mt-1 text-[10px] text-muted-400">Closing in {form.durationSeconds} seconds...</p>
              </div>
            ) : null}
            {showHindi && form.titleHi && (
              <div className="mt-3 rounded-lg border border-line-200 dark:border-line-700 p-3" lang="hi">
                <p className="text-[10px] uppercase tracking-wider text-muted-400 mb-1">Hindi version</p>
                <p className="text-sm font-bold text-ink-900 dark:text-ink-100">{form.titleHi}</p>
                <p className="text-xs text-ink-700 dark:text-ink-300 mt-1">{form.bodyHi}</p>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
