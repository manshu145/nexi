'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '~/lib/auth-context';
import { getFirebaseAuthClient } from '~/lib/firebase';
import { AILoader } from '~/components/ui/AILoader';

interface Payment {
  id: string;
  userId: string;
  userEmail: string;
  planId: string;
  period: string;
  amount: number;
  status: string;
  createdAt: string;
}

const API = process.env['NEXT_PUBLIC_API_URL'] ?? 'https://api.nexigrate.com';

export default function AdminRevenuePage() {
  const { user, loading } = useAuth();
  const router = useRouter();
  const [payments, setPayments] = useState<Payment[]>([]);
  const [total, setTotal] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [fetching, setFetching] = useState(true);

  useEffect(() => {
    if (!loading && !user) router.replace('/admin/login');
  }, [user, loading, router]);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    (async () => {
      setFetching(true);
      try {
        const auth = getFirebaseAuthClient();
        const token = await auth.currentUser?.getIdToken();
        const res = await fetch(`${API}/v1/admin/revenue`, { headers: { Authorization: `Bearer ${token}` } });
        if (!res.ok) throw new Error(`Failed: ${res.status}`);
        const data = await res.json() as { payments: Payment[]; total: number };
        if (!cancelled) { setPayments(data.payments); setTotal(data.total); }
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : 'Failed to load revenue data');
      } finally {
        if (!cancelled) setFetching(false);
      }
    })();
    return () => { cancelled = true; };
  }, [user]);

  if (loading || !user) return <div className="flex items-center justify-center py-20"><AILoader context="general" /></div>;

  // Calculate summary stats
  const totalRevenue = payments.reduce((sum, p) => sum + (p.amount || 0), 0);
  const thisMonth = payments.filter(p => {
    const d = new Date(p.createdAt);
    const now = new Date();
    return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
  });
  const monthRevenue = thisMonth.reduce((sum, p) => sum + (p.amount || 0), 0);

  return (
    <div>
      <h1 className="font-serif text-2xl font-bold text-ink-900">Revenue</h1>
      <p className="mt-1 text-sm text-muted-500">Payment history and revenue overview</p>

      {error && <div className="banner banner-error mt-4">{error}</div>}

      {/* Summary Cards */}
      <div className="mt-6 grid gap-4 sm:grid-cols-3">
        <div className="paper-card p-5">
          <p className="text-xs font-semibold uppercase tracking-wider text-muted-500">Total Revenue</p>
          <p className="font-serif mt-2 text-3xl font-bold text-ink-900">₹{totalRevenue.toLocaleString('en-IN')}</p>
        </div>
        <div className="paper-card p-5">
          <p className="text-xs font-semibold uppercase tracking-wider text-muted-500">This Month</p>
          <p className="font-serif mt-2 text-3xl font-bold text-ink-900">₹{monthRevenue.toLocaleString('en-IN')}</p>
        </div>
        <div className="paper-card p-5">
          <p className="text-xs font-semibold uppercase tracking-wider text-muted-500">Total Transactions</p>
          <p className="font-serif mt-2 text-3xl font-bold text-ink-900">{total || payments.length}</p>
        </div>
      </div>

      {/* Payments List */}
      <div className="mt-8">
        <h2 className="text-sm font-semibold text-ink-800">Recent Payments</h2>

        {fetching ? (
          <div className="flex items-center justify-center py-12"><AILoader context="general" /></div>
        ) : payments.length === 0 ? (
          <div className="paper-card mt-4 p-8 text-center">
            <p className="text-sm text-muted-500">No payments recorded yet.</p>
            <p className="text-xs text-muted-400 mt-1">Payments will appear here once users subscribe.</p>
          </div>
        ) : (
          <div className="mt-4 space-y-2">
            {payments.map((p) => (
              <div key={p.id} className="paper-card p-4 flex items-center justify-between">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-ink-900 dark:text-paper-50 truncate">{p.userEmail || p.userId}</p>
                  <p className="text-xs text-muted-500">
                    {p.planId} · {p.period} · {new Date(p.createdAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
                  </p>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  <span className="font-serif font-bold text-ink-900">₹{p.amount}</span>
                  <span className={`pill text-xs ${p.status === 'success' || p.status === 'verified' ? 'pill-success' : p.status === 'failed' ? 'pill-warn' : ''}`}>
                    {p.status}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
