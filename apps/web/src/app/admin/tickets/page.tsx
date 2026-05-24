'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { api, type SupportTicket } from '~/lib/api';

const STATUS_TABS = ['all', 'open', 'in_progress', 'resolved', 'closed'] as const;

export default function AdminTicketsPage() {
  const router = useRouter();
  const [tickets, setTickets] = useState<SupportTicket[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<string>('all');

  const load = async (status?: string) => {
    setLoading(true);
    try {
      const s = status === 'all' ? undefined : status;
      const res = await api.admin.comms.listTickets(s);
      setTickets(res.tickets);
    } catch { /* tolerate */ }
    setLoading(false);
  };

  useEffect(() => { load(tab); }, [tab]);

  return (
    <main className="mx-auto max-w-5xl px-6 py-10">
      <h1 className="font-serif text-2xl font-semibold text-ink-900">Support tickets</h1>

      <nav className="mt-4 flex gap-2 overflow-x-auto">
        {STATUS_TABS.map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => setTab(s)}
            className={`rounded-full px-3 py-1 text-sm font-medium ${
              tab === s ? 'bg-ink-900 text-paper-100' : 'text-ink-800 hover:bg-paper-200'
            }`}
          >
            {s.replace('_', ' ')}
          </button>
        ))}
      </nav>

      {loading ? (
        <p className="mt-8 text-sm text-muted-500">Loading…</p>
      ) : tickets.length === 0 ? (
        <p className="mt-8 text-sm text-muted-500">No tickets.</p>
      ) : (
        <div className="mt-6 space-y-3">
          {tickets.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => router.push(`/admin/tickets/${t.id}`)}
              className="paper-card w-full p-4 text-left transition hover:bg-paper-200/40"
            >
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="font-medium text-ink-900">{t.subject}</p>
                  <p className="mt-1 text-xs text-muted-500">
                    {t.userName || t.userEmail} · {new Date(t.updatedAt).toLocaleString('en-IN')}
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
    </main>
  );
}
