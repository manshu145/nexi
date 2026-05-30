'use client';

/**
 * Payment history page (PR-34c, audit #26).
 *
 * Backend has stored every completed payment in `billingOrders` since
 * the Razorpay integration shipped, but the web app never had a page
 * to read them — only `/admin/users/[id]/payments` could see them. This
 * page closes that loop: students see what they paid, when, with what
 * coupon, and which plan they got. Linked from /profile.
 *
 * Brand-tokens only (no stone- / amber- added here). Uses the shared
 * useUser() store for the auth gate per PR-32 single-source-of-truth
 * convention.
 */

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { useAuth } from '~/lib/auth-context';
import { useUser } from '~/lib/userStore';
import { api } from '~/lib/api';
import { AILoader } from '~/components/ui/AILoader';
import { Logo } from '~/components/Logo';

interface Payment {
  orderId: string;
  amount: number;
  currency: string;
  planId: string;
  period: 'monthly' | 'yearly';
  status: string;
  completedAt?: string;
  couponCode?: string;
  paymentId?: string;
}

export default function PaymentHistoryPage() {
  const router = useRouter();
  const { user, loading: authLoading } = useAuth();
  // Auth gate via shared store — no api.me() round-trip per page (PR-32).
  const { user: me, loading: meLoading } = useUser();
  const [payments, setPayments] = useState<Payment[] | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => { if (!authLoading && !user) router.replace('/signin'); }, [authLoading, user, router]);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await api.getBillingHistory();
        if (!cancelled) setPayments(res.payments);
      } catch (e) {
        if (!cancelled) {
          toast.error(e instanceof Error ? e.message : 'Failed to load payment history');
          setPayments([]);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [user]);

  if (authLoading || !user || meLoading || !me || loading) {
    return <main className="flex min-h-dvh items-center justify-center"><AILoader context="general" /></main>;
  }

  return (
    <main className="mx-auto flex min-h-dvh max-w-lg flex-col px-5 pt-6 pb-16">
      <header className="flex items-center justify-between">
        <button type="button" onClick={() => router.back()} className="btn-ghost-sm">← Back</button>
        <Logo height={36} />
      </header>

      <section className="mt-6">
        <h1 className="font-serif text-2xl font-bold text-ink-900">Payment History</h1>
        <p className="mt-1 text-sm text-muted-500">Your last 10 completed payments.</p>
      </section>

      <section className="mt-6 space-y-3">
        {payments && payments.length === 0 ? (
          <div className="paper-card p-6 text-center">
            <p className="text-sm text-muted-500">No payments yet.</p>
            <Link
              href="/upgrade"
              className="mt-3 inline-block text-sm font-medium text-ember-600 hover:underline"
            >
              View plans →
            </Link>
          </div>
        ) : (
          payments?.map((p) => {
            // Server stores amount in paise — divide by 100 for ₹.
            const rupees = Math.round(p.amount / 100).toLocaleString('en-IN');
            const dateLabel = p.completedAt
              ? new Date(p.completedAt).toLocaleDateString('en-IN', {
                day: 'numeric', month: 'short', year: 'numeric',
              })
              : '—';
            return (
              <div
                key={p.orderId}
                className="paper-card p-4 transition-colors hover:border-ember-500/40 hover:bg-ember-500/5"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <p className="font-serif text-base font-semibold capitalize text-ink-900">
                      {p.planId} <span className="text-sm font-normal text-muted-500">· {p.period}</span>
                    </p>
                    <p className="mt-1 text-xs text-muted-500">{dateLabel}</p>
                    {p.couponCode && (
                      <p className="mt-1 inline-block rounded-md bg-paper-200 px-2 py-0.5 text-[11px] font-medium text-ink-700">
                        Coupon: <span className="font-mono">{p.couponCode}</span>
                      </p>
                    )}
                  </div>
                  <div className="text-right">
                    <p className="font-serif text-lg font-bold text-ink-900">₹{rupees}</p>
                    <span className="pill mt-1 inline-block bg-ember-500/15 text-[10px] font-semibold uppercase tracking-wider text-ember-700">
                      Completed
                    </span>
                  </div>
                </div>
                {p.paymentId && (
                  <p className="mt-3 truncate border-t border-line pt-2 text-[10px] text-muted-400">
                    Payment ID: <span className="font-mono">{p.paymentId}</span>
                  </p>
                )}
              </div>
            );
          })
        )}
      </section>
    </main>
  );
}
