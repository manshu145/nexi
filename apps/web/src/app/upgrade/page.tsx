'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { SUBSCRIPTION_PLANS, type SubscriptionPlan } from '@nexigrate/shared';
import { Logo } from '~/components/Logo';
import { useAuth } from '~/lib/auth-context';
import { api } from '~/lib/api';
import { openRazorpayCheckout } from '~/lib/razorpay';

/**
 * Pricing + upgrade page.
 *
 * One CTA per plan; clicking it creates a Razorpay one-time order on the
 * server, opens the Razorpay checkout modal, then verifies the payment
 * signature on success and shows a confirmation state.
 *
 * Subscriptions in Phase 3 are time-bounded one-time payments (30 or 365
 * days). Recurring auto-debit will land in Phase 4 once we have demand
 * signal and a proper refund-policy page on the marketing site.
 */
type Interval = 'monthly' | 'yearly';

const PLAN_ORDER: SubscriptionPlan[] = ['scholar', 'aspirant', 'achiever'];

export default function UpgradePage() {
  const { user, loading } = useAuth();
  const router = useRouter();
  const [interval, setInterval] = useState<Interval>('monthly');
  const [busyPlan, setBusyPlan] = useState<SubscriptionPlan | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [activated, setActivated] = useState<{ plan: SubscriptionPlan; interval: Interval } | null>(
    null,
  );

  useEffect(() => {
    if (!loading && !user) router.replace('/signin');
  }, [user, loading, router]);

  async function onPay(plan: SubscriptionPlan) {
    if (busyPlan) return;
    setError(null);
    setBusyPlan(plan);
    try {
      const order = await api.createBillingOrder({ plan, interval });
      const resp = await openRazorpayCheckout({
        keyId: order.keyId,
        orderId: order.orderId,
        amount: order.amount,
        currency: order.currency,
        name: 'Nexigrate',
        description: `${SUBSCRIPTION_PLANS[plan].label} \u00b7 ${interval}`,
        prefill: {
          name: user?.displayName ?? undefined,
          email: user?.email ?? undefined,
        },
      });
      if (!resp) {
        // User dismissed the modal.
        setBusyPlan(null);
        return;
      }
      await api.verifyBilling({
        razorpay_order_id: resp.razorpay_order_id,
        razorpay_payment_id: resp.razorpay_payment_id,
        razorpay_signature: resp.razorpay_signature,
        plan,
        interval,
      });
      setActivated({ plan, interval });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'something went wrong');
    } finally {
      setBusyPlan(null);
    }
  }

  if (loading || !user) {
    return (
      <main className="flex min-h-[60vh] items-center justify-center px-6">
        <span className="inline-flex items-center gap-2 text-sm text-muted-500">
          <span className="spinner" aria-hidden="true" />
          Loading…
        </span>
      </main>
    );
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-3xl flex-col px-6 pt-8 pb-16">
      <header className="flex items-start justify-between">
        <Logo />
        <button
          type="button"
          onClick={() => router.replace('/dashboard')}
          className="btn-ghost-sm"
        >
          Back to dashboard
        </button>
      </header>

      {activated ? (
        <section className="paper-card mt-12 p-7 text-center sm:p-9">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-ember-600">
            You’re in
          </p>
          <h1 className="font-serif mt-3 text-3xl font-semibold text-ink-900">
            Welcome to {SUBSCRIPTION_PLANS[activated.plan].label}
          </h1>
          <p className="mt-3 text-ink-800">
            Your {activated.interval} access is active.{' '}
            {activated.interval === 'yearly' ? '365 days' : '30 days'} from today.
          </p>
          <button
            type="button"
            onClick={() => router.replace('/dashboard')}
            className="btn-primary mt-7"
          >
            Go to dashboard
          </button>
        </section>
      ) : (
        <>
          <section className="mt-10">
            <p className="pill mb-5">Pricing</p>
            <h1 className="font-serif text-3xl font-semibold leading-tight text-ink-900 sm:text-4xl">
              Plans built for Indian students
            </h1>
            <p className="mt-3 text-ink-800">
              Free forever to take the daily MCQ. Upgrade when you want unlimited
              credits, mock tests, and PYQ vault. Cancel any time.
            </p>

            <div className="mt-7 inline-flex rounded-full border border-line bg-paper-50 p-1">
              {(['monthly', 'yearly'] as const).map((i) => (
                <button
                  key={i}
                  type="button"
                  onClick={() => setInterval(i)}
                  className={`rounded-full px-4 py-1.5 text-sm font-medium transition ${
                    interval === i
                      ? 'bg-ink-900 text-paper-100'
                      : 'text-muted-500 hover:text-ink-900'
                  }`}
                >
                  {i === 'monthly' ? 'Monthly' : 'Yearly · save 30%+'}
                </button>
              ))}
            </div>
          </section>

          <section className="mt-8 grid gap-4 sm:grid-cols-3">
            {PLAN_ORDER.map((slug) => {
              const cfg = SUBSCRIPTION_PLANS[slug];
              const inr = interval === 'yearly' ? cfg.yearlyInr : cfg.monthlyInr;
              const perMonth = interval === 'yearly' ? Math.round(cfg.yearlyInr / 12) : null;
              const isBusy = busyPlan === slug;
              return (
                <article key={slug} className="paper-card flex flex-col p-6">
                  <h2 className="font-serif text-xl font-semibold text-ink-900">{cfg.label}</h2>
                  <p className="mt-2 text-sm text-ink-800">{cfg.description}</p>
                  <p className="mt-5 font-serif text-3xl font-semibold tabular-nums text-ink-900">
                    ₹{inr}
                    <span className="ml-1 text-sm font-normal text-muted-500">
                      /{interval === 'yearly' ? 'yr' : 'mo'}
                    </span>
                  </p>
                  {perMonth ? (
                    <p className="mt-1 text-xs text-muted-500">
                      ≈ ₹{perMonth}/mo billed yearly
                    </p>
                  ) : null}
                  <button
                    type="button"
                    onClick={() => onPay(slug)}
                    disabled={isBusy || busyPlan !== null}
                    className="btn-primary mt-6 w-full"
                  >
                    {isBusy ? (
                      <>
                        <span className="spinner" aria-hidden="true" />
                        Opening Razorpay…
                      </>
                    ) : (
                      `Choose ${cfg.label}`
                    )}
                  </button>
                </article>
              );
            })}
          </section>

          {error ? (
            <p className="mt-6 text-sm text-ember-600" role="alert">
              {error}
            </p>
          ) : null}

          <p className="mt-10 text-xs text-muted-500">
            Payments are processed securely by{' '}
            <a
              href="https://razorpay.com"
              target="_blank"
              rel="noopener noreferrer"
              className="underline hover:text-ink-900"
            >
              Razorpay
            </a>
            . Test mode during private beta — use test card 4111 1111 1111 1111.
          </p>
        </>
      )}
    </main>
  );
}
