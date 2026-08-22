'use client';

/**
 * My support tickets page (PR-34c, audit #28).
 *
 * Read-only listing of the signed-in user's tickets — subject, status,
 * timestamp, full message thread (expandable). Pre-PR-34c there was no
 * way for a student to see admin replies because there was no way for
 * a student to even create a ticket. /support now has a creation form
 * (audit #27) and this page closes the loop.
 *
 * Brand-tokens only. Uses the shared useUser() store for the auth gate
 * (PR-32 single source of truth).
 */

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { useAuth } from '~/lib/auth-context';
import { useUser } from '~/lib/userStore';
import { api } from '~/lib/api';
import { AILoader } from '~/components/ui/AILoader';
import { Logo } from '~/components/Logo';

interface TicketMessage {
  role: 'user' | 'admin';
  content: string;
  timestamp: string;
}

interface Ticket {
  id: string;
  userId: string;
  subject: string;
  status: string;
  messages: TicketMessage[];
  createdAt: string;
}

function statusColour(status: string): string {
  // Brand-token-only mapping. We avoid red-/green- because the brand
  // doesn't have those tokens; ember covers "needs attention" and gold
  // covers "trust / resolved" elsewhere in the app.
  switch (status) {
    case 'closed':
      return 'bg-paper-300 text-muted-500';
    case 'in_progress':
      return 'bg-gold-500/15 text-gold-600';
    case 'open':
    default:
      return 'bg-ember-500/15 text-ember-700';
  }
}

function statusLabel(status: string): string {
  if (status === 'in_progress') return 'In progress';
  if (status === 'closed') return 'Closed';
  return 'Open';
}

function fmtDate(iso: string): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('en-IN', {
    day: 'numeric', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
}

export default function MyTicketsPage() {
  const router = useRouter();
  const { user, loading: authLoading } = useAuth();
  const { user: me, loading: meLoading } = useUser();
  const [tickets, setTickets] = useState<Ticket[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  useEffect(() => { if (!authLoading && !user) router.replace('/signin'); }, [authLoading, user, router]);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await api.listMyTickets();
        if (!cancelled) setTickets(res.tickets as Ticket[]);
      } catch (e) {
        if (!cancelled) {
          toast.error(e instanceof Error ? e.message : 'Failed to load tickets');
          setTickets([]);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [user]);

  const toggle = (id: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  if (authLoading || !user || meLoading || !me || loading) {
    return <main className="flex min-h-dvh items-center justify-center"><AILoader context="general" /></main>;
  }

  return (
    <main className="mx-auto flex min-h-dvh max-w-lg flex-col px-5 pt-6 pb-16">
      <header className="flex items-center justify-between">
        <button type="button" onClick={() => router.back()} className="btn-ghost-sm">← Back</button>
        <Logo height={36} />
      </header>

      <section className="mt-6 flex items-start justify-between gap-3">
        <div>
          <h1 className="font-serif text-2xl font-bold text-ink-900">My Support Tickets</h1>
          <p className="mt-1 text-sm text-muted-500">Read-only view of tickets you&apos;ve submitted and admin replies.</p>
        </div>
        <button
          type="button"
          onClick={() => router.push('/support')}
          className="btn-ghost-sm flex-shrink-0 text-xs"
        >
          + New
        </button>
      </section>

      <section className="mt-6 space-y-3">
        {tickets && tickets.length === 0 ? (
          <div className="paper-card p-6 text-center">
            <p className="text-sm text-muted-500">You haven&apos;t opened a ticket yet.</p>
            <button
              type="button"
              onClick={() => router.push('/support')}
              className="mt-3 text-sm font-medium text-ember-600 hover:underline"
            >
              Create a ticket →
            </button>
          </div>
        ) : (
          tickets?.map((t) => {
            const isOpen = expanded.has(t.id);
            const latest = t.messages[t.messages.length - 1];
            const preview = latest?.content?.slice(0, 140) ?? '';
            const previewClipped = (latest?.content?.length ?? 0) > 140;
            return (
              <div
                key={t.id}
                className="paper-card p-4 transition-colors hover:border-ember-500/40 hover:bg-ember-500/5"
              >
                <button
                  type="button"
                  onClick={() => toggle(t.id)}
                  className="w-full text-left"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <p className="font-serif text-base font-semibold text-ink-900">{t.subject}</p>
                      <p className="mt-1 text-xs text-muted-500">{fmtDate(t.createdAt)}</p>
                    </div>
                    <span className={`pill flex-shrink-0 text-[10px] font-semibold uppercase tracking-wider ${statusColour(t.status)}`}>
                      {statusLabel(t.status)}
                    </span>
                  </div>
                  {!isOpen && latest && (
                    <p className="mt-3 line-clamp-2 text-sm text-ink-700">
                      <span className="font-semibold">{latest.role === 'admin' ? 'Admin' : 'You'}:</span>{' '}
                      {preview}{previewClipped ? '…' : ''}
                    </p>
                  )}
                  <p className="mt-2 text-[11px] font-medium text-ember-600">
                    {isOpen ? 'Hide thread' : `Show full thread (${t.messages.length})`} {isOpen ? '↑' : '↓'}
                  </p>
                </button>

                {isOpen && (
                  <div className="mt-4 space-y-3 border-t border-line pt-4">
                    {t.messages.map((m, i) => {
                      const isAdmin = m.role === 'admin';
                      return (
                        <div key={i} className={`flex ${isAdmin ? 'justify-start' : 'justify-end'}`}>
                          <div className={`max-w-[85%] rounded-2xl px-4 py-3 text-sm leading-relaxed ${
                            isAdmin
                              ? 'bg-paper-200 text-ink-900'
                              : 'bg-ember-500 text-paper-50'
                          }`}>
                            <div className="mb-1 flex items-center gap-2 text-[10px] font-semibold uppercase tracking-wider opacity-80">
                              <span className={`pill text-[9px] ${
                                isAdmin
                                  ? 'bg-gold-500/20 text-gold-600'
                                  : 'bg-paper-50/30 text-paper-50'
                              }`}>
                                {isAdmin ? 'Admin' : 'You'}
                              </span>
                              <span className={isAdmin ? 'text-muted-500' : 'text-paper-50/80'}>
                                {fmtDate(m.timestamp)}
                              </span>
                            </div>
                            <p className="whitespace-pre-wrap">{m.content}</p>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })
        )}
      </section>
    </main>
  );
}
