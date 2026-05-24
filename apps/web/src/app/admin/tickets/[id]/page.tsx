'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { api, type TicketWithMessages } from '~/lib/api';

export default function AdminTicketDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [ticket, setTicket] = useState<TicketWithMessages | null>(null);
  const [loading, setLoading] = useState(true);
  const [reply, setReply] = useState('');
  const [sending, setSending] = useState(false);
  const [status, setStatus] = useState('');

  const load = async () => {
    try {
      const t = await api.admin.comms.getTicket(id);
      setTicket(t);
      setStatus(t.status);
    } catch { /* tolerate */ }
    setLoading(false);
  };

  useEffect(() => { load(); }, [id]);

  const handleReply = async () => {
    if (!reply.trim()) return;
    setSending(true);
    try {
      await api.admin.comms.replyToTicket(id, reply.trim());
      setReply('');
      await load();
    } catch { /* tolerate */ }
    setSending(false);
  };

  const handleStatusChange = async (newStatus: string) => {
    await api.admin.comms.updateTicket(id, { status: newStatus });
    setStatus(newStatus);
    await load();
  };

  if (loading) {
    return (
      <main className="mx-auto max-w-3xl px-6 py-10">
        <p className="text-sm text-muted-500">Loading…</p>
      </main>
    );
  }

  if (!ticket) {
    return (
      <main className="mx-auto max-w-3xl px-6 py-10">
        <p className="text-sm text-ember-600">Ticket not found.</p>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-3xl px-6 py-10">
      <h1 className="font-serif text-2xl font-semibold text-ink-900">{ticket.subject}</h1>
      <p className="mt-2 text-xs text-muted-500">
        From: {ticket.userName || ticket.userEmail} · Created: {new Date(ticket.createdAt).toLocaleString('en-IN')}
      </p>

      <div className="mt-4 flex items-center gap-3">
        <label className="text-sm font-medium text-ink-800">Status:</label>
        <select
          value={status}
          onChange={(e) => handleStatusChange(e.target.value)}
          className="input-field w-40"
        >
          <option value="open">Open</option>
          <option value="in_progress">In progress</option>
          <option value="resolved">Resolved</option>
          <option value="closed">Closed</option>
        </select>
      </div>

      {/* Messages */}
      <div className="mt-8 space-y-4">
        {ticket.messages.map((msg) => (
          <div
            key={msg.id}
            className={`rounded-lg p-4 ${
              msg.authorRole === 'admin'
                ? 'ml-8 border border-gold-200 bg-gold-50/30'
                : 'mr-8 border border-line bg-paper-50'
            }`}
          >
            <p className="text-xs font-medium text-muted-500">
              {msg.authorName} · {msg.authorRole} · {new Date(msg.createdAt).toLocaleString('en-IN')}
            </p>
            <p className="mt-2 whitespace-pre-wrap text-sm text-ink-900">{msg.body}</p>
          </div>
        ))}
      </div>

      {/* Reply form */}
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
          {sending ? 'Sending…' : 'Reply'}
        </button>
      </div>
    </main>
  );
}
