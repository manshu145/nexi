'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '~/lib/auth-context';
import { api, type SupportTicket } from '~/lib/api';

export default function SupportPage() {
  const { user, loading: authLoading } = useAuth();
  const router = useRouter();
  const [tickets, setTickets] = useState<SupportTicket[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState('');

  useEffect(() => {
    if (!authLoading && !user) router.replace('/signin');
  }, [user, authLoading, router]);

  useEffect(() => {
    if (!user) return;
    (async () => {
      try {
        const res = await api.tickets.list();
        setTickets(res.tickets);
      } catch { /* tolerate */ }
      setLoading(false);
    })();
  }, [user]);

  const handleSubmit = async () => {
    if (!subject.trim() || !body.trim()) return;
    setSubmitting(true);
    try {
      await api.tickets.create({ subject: subject.trim(), body: body.trim() });
      setSubject('');
      setBody('');
      setShowForm(false);
      setSuccess('Ticket created! We usually respond within 24 hours.');
      const res = await api.tickets.list();
      setTickets(res.tickets);
    } catch { /* tolerate */ }
    setSubmitting(false);
  };

  if (authLoading || !user) {
    return (
      <main className="flex min-h-[60vh] items-center justify-center px-6">
        <span className="text-sm text-muted-500">Loading…</span>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-2xl px-6 py-10">
      <h1 className="font-serif text-3xl font-semibold text-ink-900">Help &amp; support</h1>
      <p className="mt-2 text-sm text-muted-500">
        Raise a ticket and our team will respond within 24 hours.
      </p>

      {success && (
        <p className="mt-4 rounded-lg bg-gold-50 p-3 text-sm text-gold-700">{success}</p>
      )}

      <button
        type="button"
        onClick={() => { setShowForm(!showForm); setSuccess(''); }}
        className="btn-primary mt-6"
      >
        {showForm ? 'Cancel' : 'New ticket'}
      </button>

      {showForm && (
        <div className="paper-card mt-4 space-y-4 p-6">
          <input
            type="text"
            placeholder="Subject — brief description"
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            className="input-field w-full"
          />
          <textarea
            placeholder="Describe your issue in detail…"
            value={body}
            onChange={(e) => setBody(e.target.value)}
            rows={5}
            className="input-field w-full"
          />
          <button
            type="button"
            onClick={handleSubmit}
            disabled={submitting}
            className="btn-primary"
          >
            {submitting ? 'Submitting…' : 'Submit ticket'}
          </button>
        </div>
      )}

      <section className="mt-10">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-500">
          Your tickets
        </h2>
        {loading ? (
          <p className="mt-4 text-sm text-muted-500">Loading…</p>
        ) : tickets.length === 0 ? (
          <p className="mt-4 text-sm text-muted-500">No tickets yet.</p>
        ) : (
          <div className="mt-4 space-y-3">
            {tickets.map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => router.push(`/support/${t.id}`)}
                className="paper-card w-full p-4 text-left transition hover:bg-paper-200/40"
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="font-medium text-ink-900">{t.subject}</p>
                    <p className="mt-1 text-xs text-muted-500">
                      {new Date(t.updatedAt).toLocaleString('en-IN')}
                    </p>
                  </div>
                  <span
                    className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-medium ${
                      t.status === 'open'
                        ? 'bg-ember-100 text-ember-700'
                        : t.status === 'in_progress'
                          ? 'bg-gold-100 text-gold-700'
                          : 'bg-paper-200 text-ink-800'
                    }`}
                  >
                    {t.status.replace('_', ' ')}
                  </span>
                </div>
              </button>
            ))}
          </div>
        )}
      </section>
    </main>
  );
}
