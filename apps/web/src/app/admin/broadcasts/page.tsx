'use client';

import { useEffect, useState } from 'react';
import { api, type BroadcastSummary } from '~/lib/api';

export default function AdminBroadcastsPage() {
  const [items, setItems] = useState<BroadcastSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [channel, setChannel] = useState<'email' | 'sms' | 'push'>('email');
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [saving, setSaving] = useState(false);

  const load = async () => {
    try {
      const res = await api.admin.comms.listBroadcasts();
      setItems(res.broadcasts);
    } catch { /* tolerate */ }
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const handleCreate = async () => {
    if (!body.trim()) return;
    setSaving(true);
    try {
      await api.admin.comms.createBroadcast({
        channel,
        subject: subject.trim() || undefined,
        body: body.trim(),
      });
      setSubject('');
      setBody('');
      setShowForm(false);
      await load();
    } catch { /* tolerate */ }
    setSaving(false);
  };

  const handleSend = async (id: string) => {
    if (!confirm('Send this broadcast? (v1: no real delivery — marks as sent)')) return;
    try {
      await api.admin.comms.sendBroadcast(id);
      await load();
    } catch { /* tolerate */ }
  };

  return (
    <main className="mx-auto max-w-5xl px-6 py-10">
      <div className="flex items-center justify-between">
        <h1 className="font-serif text-2xl font-semibold text-ink-900">Broadcasts</h1>
        <button type="button" onClick={() => setShowForm(!showForm)} className="btn-primary">
          {showForm ? 'Cancel' : 'New broadcast'}
        </button>
      </div>

      <p className="mt-2 text-xs text-muted-500">
        v1: No real SMTP/SMS gateway yet. &quot;Send&quot; marks as sent but delivers nothing.
        Real delivery ships with Resend / Twilio integration.
      </p>

      {showForm && (
        <div className="paper-card mt-6 space-y-4 p-6">
          <div className="flex items-center gap-4">
            <label className="text-sm font-medium text-ink-800">Channel</label>
            <select value={channel} onChange={(e) => setChannel(e.target.value as any)} className="input-field w-32">
              <option value="email">Email</option>
              <option value="sms">SMS</option>
              <option value="push">Push</option>
            </select>
          </div>
          {channel === 'email' && (
            <input
              type="text"
              placeholder="Subject (email only)"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              className="input-field w-full"
            />
          )}
          <textarea
            placeholder="Message body"
            value={body}
            onChange={(e) => setBody(e.target.value)}
            rows={5}
            className="input-field w-full"
          />
          <button type="button" onClick={handleCreate} disabled={saving} className="btn-primary">
            {saving ? 'Creating…' : 'Create draft'}
          </button>
        </div>
      )}

      {loading ? (
        <p className="mt-8 text-sm text-muted-500">Loading…</p>
      ) : items.length === 0 ? (
        <p className="mt-8 text-sm text-muted-500">No broadcasts yet.</p>
      ) : (
        <div className="mt-6 space-y-3">
          {items.map((b) => (
            <div key={b.id} className="paper-card flex items-start justify-between gap-4 p-4">
              <div>
                <p className="text-xs uppercase tracking-wider text-muted-500">
                  {b.channel} · {b.status}
                </p>
                {b.subject && <p className="mt-1 font-medium text-ink-900">{b.subject}</p>}
                <p className="mt-1 text-xs text-muted-500">
                  {new Date(b.createdAt).toLocaleDateString('en-IN')} · {b.recipientCount} recipients
                </p>
              </div>
              {b.status === 'draft' && (
                <button
                  type="button"
                  onClick={() => handleSend(b.id)}
                  className="btn-ghost-sm shrink-0"
                >
                  Send
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </main>
  );
}
