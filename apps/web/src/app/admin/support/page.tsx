'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '~/lib/auth-context';
import { getFirebaseAuthClient } from '~/lib/firebase';
import { AILoader } from '~/components/ui/AILoader';

interface Ticket {
  id: string;
  userId: string;
  userEmail: string;
  userName: string;
  subject: string;
  message: string;
  status: 'open' | 'in_progress' | 'resolved' | 'closed';
  createdAt: string;
  replies?: { role: string; content: string; timestamp: string }[];
}

const API = process.env['NEXT_PUBLIC_API_URL'] ?? 'https://api.nexigrate.com';

export default function AdminSupportPage() {
  const { user, loading } = useAuth();
  const router = useRouter();
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [fetching, setFetching] = useState(true);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [replyText, setReplyText] = useState('');
  const [replying, setReplying] = useState(false);

  useEffect(() => {
    if (!loading && !user) router.replace('/admin/login');
  }, [user, loading, router]);

  const fetchTickets = async () => {
    try {
      const auth = getFirebaseAuthClient();
      const token = await auth.currentUser?.getIdToken();
      const res = await fetch(`${API}/v1/admin/support`, { headers: { Authorization: `Bearer ${token}` } });
      if (!res.ok) throw new Error(`Failed: ${res.status}`);
      const data = await res.json() as { tickets: Ticket[] };
      setTickets(data.tickets);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load tickets');
    } finally {
      setFetching(false);
    }
  };

  useEffect(() => {
    if (!user) return;
    fetchTickets();
  }, [user]);

  const handleReply = async (ticketId: string) => {
    if (!replyText.trim() || replying) return;
    setReplying(true);
    try {
      const auth = getFirebaseAuthClient();
      const token = await auth.currentUser?.getIdToken();
      const res = await fetch(`${API}/v1/admin/support/${ticketId}/reply`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ message: replyText.trim() }),
      });
      if (!res.ok) throw new Error(`Failed: ${res.status}`);
      setReplyText('');
      await fetchTickets();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to send reply');
    } finally {
      setReplying(false);
    }
  };

  if (loading || !user) return <div className="flex items-center justify-center py-20"><AILoader context="general" /></div>;

  const openTickets = tickets.filter(t => t.status === 'open' || t.status === 'in_progress');
  const closedTickets = tickets.filter(t => t.status === 'resolved' || t.status === 'closed');

  return (
    <div>
      <h1 className="font-serif text-2xl font-bold text-ink-900 dark:text-paper-50">Support Tickets</h1>
      <p className="mt-1 text-sm text-muted-500">{openTickets.length} open · {closedTickets.length} resolved</p>

      {error && <div className="banner banner-error mt-4">{error}</div>}

      {fetching ? (
        <div className="flex items-center justify-center py-12"><AILoader context="general" /></div>
      ) : tickets.length === 0 ? (
        <div className="paper-card mt-6 p-8 text-center">
          <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="mx-auto text-muted-400">
            <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
          <p className="mt-3 text-sm text-muted-500">No support tickets yet.</p>
          <p className="text-xs text-muted-400 mt-1">Tickets will appear when users request help.</p>
        </div>
      ) : (
        <div className="mt-6 space-y-3">
          {tickets.map((ticket) => (
            <div key={ticket.id} className={`paper-card overflow-hidden ${ticket.status === 'open' ? 'border-ember-500' : ''}`}>
              <button
                className="w-full p-4 text-left flex items-center justify-between"
                onClick={() => setExpandedId(expandedId === ticket.id ? null : ticket.id)}
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className={`inline-block h-2 w-2 rounded-full ${ticket.status === 'open' ? 'bg-ember-500' : ticket.status === 'in_progress' ? 'bg-gold-500' : 'bg-emerald-500'}`} />
                    <p className="text-sm font-medium text-ink-900 truncate">{ticket.subject || 'Support Request'}</p>
                  </div>
                  <p className="mt-1 text-xs text-muted-500">{ticket.userName || ticket.userEmail} · {new Date(ticket.createdAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}</p>
                </div>
                <span className={`pill text-xs flex-shrink-0 ${ticket.status === 'open' ? 'pill-warn' : ticket.status === 'resolved' ? 'pill-success' : ''}`}>
                  {ticket.status}
                </span>
              </button>

              {expandedId === ticket.id && (
                <div className="border-t border-line px-4 pb-4 pt-3">
                  {/* Original message */}
                  <div className="bg-paper-200 rounded-lg p-3">
                    <p className="text-xs font-medium text-muted-500 mb-1">User message:</p>
                    <p className="text-sm text-ink-900 whitespace-pre-wrap">{ticket.message}</p>
                  </div>

                  {/* Replies */}
                  {ticket.replies && ticket.replies.length > 0 && (
                    <div className="mt-3 space-y-2">
                      {ticket.replies.map((reply, idx) => (
                        <div key={idx} className={`rounded-lg p-3 text-sm ${reply.role === 'admin' ? 'bg-ember-500/10 border border-ember-500/20' : 'bg-paper-200'}`}>
                          <p className="text-xs font-medium text-muted-500 mb-1">{reply.role === 'admin' ? 'Admin' : 'User'}:</p>
                          <p className="text-ink-900 whitespace-pre-wrap">{reply.content}</p>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Reply input */}
                  {(ticket.status === 'open' || ticket.status === 'in_progress') && (
                    <div className="mt-3 flex gap-2">
                      <input
                        type="text"
                        value={expandedId === ticket.id ? replyText : ''}
                        onChange={e => setReplyText(e.target.value)}
                        placeholder="Type admin reply..."
                        className="input flex-1"
                        onKeyDown={e => { if (e.key === 'Enter') handleReply(ticket.id); }}
                      />
                      <button
                        onClick={() => handleReply(ticket.id)}
                        disabled={!replyText.trim() || replying}
                        className="btn-primary px-4 text-sm"
                      >
                        {replying ? '...' : 'Reply'}
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
