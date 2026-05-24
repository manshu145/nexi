'use client';

import { useEffect, useState } from 'react';
import { api, type AnnouncementSummary } from '~/lib/api';

export default function AdminAnnouncementsPage() {
  const [items, setItems] = useState<AnnouncementSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [type, setType] = useState<'banner' | 'card'>('card');
  const [saving, setSaving] = useState(false);

  const load = async () => {
    try {
      const res = await api.admin.comms.listAnnouncements();
      setItems(res.announcements);
    } catch { /* tolerate */ }
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const handleCreate = async () => {
    if (!title.trim() || !body.trim()) return;
    setSaving(true);
    try {
      await api.admin.comms.createAnnouncement({ type, title: title.trim(), body: body.trim() });
      setTitle('');
      setBody('');
      setShowForm(false);
      await load();
    } catch { /* tolerate */ }
    setSaving(false);
  };

  const handleToggle = async (id: string, isActive: boolean) => {
    await api.admin.comms.updateAnnouncement(id, { isActive: !isActive });
    await load();
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this announcement?')) return;
    await api.admin.comms.deleteAnnouncement(id);
    await load();
  };

  return (
    <main className="mx-auto max-w-5xl px-6 py-10">
      <div className="flex items-center justify-between">
        <h1 className="font-serif text-2xl font-semibold text-ink-900">Announcements</h1>
        <button type="button" onClick={() => setShowForm(!showForm)} className="btn-primary">
          {showForm ? 'Cancel' : 'New announcement'}
        </button>
      </div>

      {showForm && (
        <div className="paper-card mt-6 space-y-4 p-6">
          <div className="flex items-center gap-4">
            <label className="text-sm font-medium text-ink-800">Type</label>
            <select value={type} onChange={(e) => setType(e.target.value as 'banner' | 'card')} className="input-field w-32">
              <option value="card">Card</option>
              <option value="banner">Banner</option>
            </select>
          </div>
          <input
            type="text"
            placeholder="Title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className="input-field w-full"
          />
          <textarea
            placeholder="Body (markdown-ish)"
            value={body}
            onChange={(e) => setBody(e.target.value)}
            rows={4}
            className="input-field w-full"
          />
          <button type="button" onClick={handleCreate} disabled={saving} className="btn-primary">
            {saving ? 'Creating…' : 'Publish'}
          </button>
        </div>
      )}

      {loading ? (
        <p className="mt-8 text-sm text-muted-500">Loading…</p>
      ) : items.length === 0 ? (
        <p className="mt-8 text-sm text-muted-500">No announcements yet.</p>
      ) : (
        <div className="mt-6 space-y-3">
          {items.map((a) => (
            <div key={a.id} className="paper-card flex items-start justify-between gap-4 p-4">
              <div>
                <p className="text-xs uppercase tracking-wider text-muted-500">
                  {a.type} · {a.isActive ? 'Active' : 'Inactive'}
                </p>
                <p className="mt-1 font-medium text-ink-900">{a.title}</p>
                <p className="mt-1 text-sm text-ink-800">{a.body.slice(0, 120)}</p>
              </div>
              <div className="flex shrink-0 gap-2">
                <button
                  type="button"
                  onClick={() => handleToggle(a.id, a.isActive)}
                  className="btn-ghost-sm"
                >
                  {a.isActive ? 'Deactivate' : 'Activate'}
                </button>
                <button
                  type="button"
                  onClick={() => handleDelete(a.id)}
                  className="btn-ghost-sm text-ember-600"
                >
                  Delete
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </main>
  );
}
