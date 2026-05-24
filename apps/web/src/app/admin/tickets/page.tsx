'use client';

import { useEffect, useState } from 'react';
import { api, type SupportTicket, type TicketWithMessages } from '~/lib/api';

export default function AdminTicketsPage() {
  const [tickets, setTickets] = useState<SupportTicket[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [selectedTicket, setSelectedTicket] = useState<TicketWithMessages | null>(null);
  const [replyText, setReplyText] = useState('');
  const [replying, setReplying] = useState(false);

  useEffect(() => { loadTickets(); }, []);

  async function loadTickets(status?: string) {
    try {
      setLoading(true);
      const res = await api.admin.comms.listTickets(status || undefined);
      setTickets(res.tickets);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load tickets');
    } finally {
      setLoading(false);
    }
  }

  async function openTicket(id: string) {
    try {
      const res = await api.admin.comms.getTicket(id);
      setSelectedTicket(res);
    } catch {
      setError('Failed to load ticket');
    }
  }

  async function handleReply() {
    if (!selectedTicket || !replyText.trim()) return;
    setReplying(true);
    try {
      await api.admin.comms.replyToTicket(selectedTicket.ticket.id, replyText);
      setReplyText('');
      // Reload ticket
      await openTicket(selectedTicket.ticket.id);
    } catch {
      setError('Failed to send reply');
    } finally {
      setReplying(false);
    }
  }

  async function handleStatusChange(id: string, newStatus: string) {
    try {
      await api.admin.comms.updateTicket(id, { status: newStatus });
      loadTickets(statusFilter || undefined);
      if (selectedTicket?.ticket.id === id) {
        openTicket(id);
      }
    } catch {
      setError('Failed to update status');
    }
  }

  return (
    <div>
      <h1 className="font-serif text-2xl font-bold text-ink-900">Support Tickets</h1>

      {/* Status filter */}
      <div className="mt-4 flex gap-2">
        {['', 'open', 'in_progress', 'resolved', 'closed'].map(s => (
          <button
            key={s}
            onClick={() => { setStatusFilter(s); loadTickets(s || undefined); }}
            className={`rounded-full px-3 py-1.5 text-xs font-medium transition ${
              statusFilter === s ? 'bg-ink-900 text-paper-100' : 'bg-paper-200 text-ink-700 hover:bg-paper-300'
            }`}
          >
            {s || 'All'}
          </button>
        ))}
      </div>

      {error && <div className="banner banner-error mt-4">{error}</div>}

      {/* Selected ticket detail */}
      {selectedTicket && (
        <div className="mt-4 paper-card p-5 border-l-4 border-ember-500">
          <div className="flex items-center justify-between mb-3">
            <h2 className="font-semibold text-ink-900">{selectedTicket.ticket.subject}</h2>
            <button onClick={() => setSelectedTicket(null)} className="text-xs text-muted-500 hover:text-ink-900">✕</button>
          </div>
          <div className="flex items-center gap-3 text-xs text-muted-500 mb-4">
            <span>Status: <span className="font-semibold text-ink-800">{selectedTicket.ticket.status}</span></span>
            <select
              className="input text-xs py-1 px-2 w-32"
              value={selectedTicket.ticket.status}
              onChange={e => handleStatusChange(selectedTicket.ticket.id, e.target.value)}
            >
              <option value="open">Open</option>
              <option value="in_progress">In Progress</option>
              <option value="resolved">Resolved</option>
              <option value="closed">Closed</option>
            </select>
          </div>

          {/* Messages */}
          <div className="space-y-3 max-h-64 overflow-y-auto mb-4">
            {selectedTicket.messages.map((msg, i) => (
              <div key={i} className={`rounded-lg p-3 text-sm ${
                msg.senderRole === 'admin' ? 'bg-ember-50 border border-ember-200' : 'bg-paper-200'
              }`}>
                <p className="text-xs text-muted-500 mb-1">
                  {msg.senderRole === 'admin' ? '👤 Admin' : '🎓 Student'} · {new Date(msg.createdAt).toLocaleString('en-IN')}
                </p>
                <p className="text-ink-800">{msg.body}</p>
              </div>
            ))}
          </div>

          {/* Reply */}
          <div className="flex gap-2">
            <input
              type="text"
              className="input flex-1"
              placeholder="Type admin reply..."
              value={replyText}
              onChange={e => setReplyText(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleReply()}
            />
            <button onClick={handleReply} disabled={replying || !replyText.trim()} className="btn-primary px-4 text-sm">
              {replying ? '...' : 'Reply'}
            </button>
          </div>
        </div>
      )}

      {/* Tickets list */}
      <div className="mt-4 space-y-2">
        {loading ? (
          <div className="flex items-center gap-2 text-sm text-muted-500"><span className="spinner" /> Loading tickets...</div>
        ) : tickets.length === 0 ? (
          <p className="text-sm text-muted-500 py-8 text-center">No tickets found.</p>
        ) : tickets.map(ticket => (
          <button
            key={ticket.id}
            onClick={() => openTicket(ticket.id)}
            className="paper-card w-full p-4 text-left hover:shadow-md transition-shadow"
          >
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-medium text-ink-900">{ticket.subject}</h3>
              <span className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded-full ${
                ticket.status === 'open' ? 'bg-amber-100 text-amber-800' :
                ticket.status === 'in_progress' ? 'bg-blue-100 text-blue-800' :
                ticket.status === 'resolved' ? 'bg-green-100 text-green-800' :
                'bg-paper-200 text-muted-500'
              }`}>
                {ticket.status.replace('_', ' ')}
              </span>
            </div>
            <p className="text-xs text-muted-500 mt-1">
              {new Date(ticket.createdAt).toLocaleString('en-IN')}
            </p>
          </button>
        ))}
      </div>
    </div>
  );
}
