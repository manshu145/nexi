'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useAuth } from '~/lib/auth-context';
import { api, type TicketWithMessages } from '~/lib/api';

export default function SupportTicketPage() {
  const { id } = useParams<{ id: string }>();
  const { user, loading: authLoading } = useAuth();
  const router = useRouter();
  const [ticket, setTicket] = useState<TicketWithMessages | null>(null);
  const [loading, setLoading] = useState(true);
  const [reply, setReply] = useState('');
  const [sending, setSending] = useState(false);

  useEffect(() => {
    if (!authLoading && !user) router.replace('/signin');
  }, [user, authLoading, router]);

  const load = async () => {
    try {
      const t = await api.tickets.get(id);
      setTicket(t);
    } catch { /* tolerate */ }
    setLoading(false);
  };

  useEffect(() => {
    if (user) load();
  }, [user, id]);

  const handleReply = async () => {
    if (!reply.trim()) return;
    setSending(true);
    try {
      await api.tickets.reply(id, reply.trim());
      setReply('');
      await load();
    } catch { /* tolerate */ }
    setSending(false);
  };

  if (authLoading || !user || loading) {
    return (
      <main className="mx-auto max-w-2xl px-6 py-10">
        <p className="text-sm text-muted-500">Loading…</p>
      </main>
    );
  }

  if (!ticket) {
    return (
      <main className="mx-auto max-w-2xl px-6 py-10">
        <p className="text-sm text-ember-600">Ticket not found.</p>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-2xl px-6 py-10">
      <button
        type="button"
        onClick={() => router.push('/support')}
        className="text-sm text-muted-500 hover:text-ink-800"
      >
        &larr; Back to tickets
      </button>

      <h1 className="font-serif mt-4 text-2xl font-semibold text-ink-900">{ticket.subject}</h1>
      <p className="mt-1 text-xs text-muted-500">
        Status: <span className="font-medium">{ticket.status.replace('_', ' ')}</span> ·
        Created: {new Date(ticket.createdAt).toLocaleString('en-IN')}
      </p>

      {/* Messages */}
      <div className="mt-8 space-y-4">
        {ticket.messages.map((msg) => (
          <div
            key={msg.id}
            className={`rounded-lg p-4 ${
              msg.authorRole === 'admin'
                ? 'ml-6 border border-gold-200 bg-gold-50/30'
                : 'mr-6 border border-line bg-paper-50'
            }`}
          >
            <p className="text-xs font-medium text-muted-500">
              {msg.authorRole === 'admin' ? 'Support team' : 'You'} · {new Date(msg.createdAt).toLocaleString('en-IN')}
            </p>
            <p className="mt-2 whitespace-pre-wrap text-sm text-ink-900">{msg.body}</p>
          </div>
        ))}
      </div>

      {/* Reply */}
      {ticket.status !== 'closed' && (
        <div className="mt-6 space-y-3">
          <textarea
            placeholder="Type your reply…"
            value={reply}
            onChange={(e) => setReply(e.target.value)}
            rows={3}
            className="input-field w-full"
          />
          <button
            type="button"
            onClick={handleReply}
            disabled={sending || !reply.trim()}
            className="btn-primary"
          >
            {sending ? 'Sending…' : 'Send reply'}
          </button>
        </div>
      )}

      {ticket.status === 'closed' && (
        <p className="mt-6 rounded-lg bg-paper-200 p-3 text-sm text-muted-500">
          This ticket is closed. Open a new ticket if you still need help.
        </p>
      )}
    </main>
  );
}
