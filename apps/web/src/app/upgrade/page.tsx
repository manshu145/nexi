'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '~/lib/auth-context';
import { api } from '~/lib/api';
import { Logo } from '~/components/Logo';

declare global { interface Window { Razorpay: new (options: Record<string, unknown>) => { open(): void }; } }

interface PlanDisplay { id: string; name: string; price: number; yearlyPrice: number; badge?: string; popular?: boolean; features: string[]; }

const PLANS: PlanDisplay[] = [
  { id: 'scholar', name: 'Scholar', price: 99, yearlyPrice: 949, features: ['10 Daily MCQs', '2 Mock Tests/month', 'AI Tutor (limited)', 'Current Affairs', 'Basic analytics'] },
  { id: 'aspirant', name: 'Aspirant', price: 299, yearlyPrice: 2869, badge: 'Popular', popular: true, features: ['30 Daily MCQs', '10 Mock Tests/month', 'AI Tutor (unlimited)', 'Current Affairs', 'Essay Grading', 'Performance analytics'] },
  { id: 'achiever', name: 'Achiever', price: 599, yearlyPrice: 5750, badge: 'Best Value', features: ['Unlimited MCQs', 'Unlimited Mock Tests', 'AI Tutor (priority)', 'Current Affairs', 'Essay Grading', 'Mentor support', 'Priority support'] },
];

export default function UpgradePage() {
  const { user, loading } = useAuth();
  const router = useRouter();
  const [period, setPeriod] = useState<'monthly' | 'yearly'>('monthly');
  const [currentPlan, setCurrentPlan] = useState<string>('free');
  const [processing, setProcessing] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => { if (!loading && !user) router.replace('/signin'); }, [user, loading, router]);

  useEffect(() => {
    if (!user) return;
    api.getSubscription().then(r => setCurrentPlan(r.plan)).catch(() => {});
  }, [user]);

  useEffect(() => {
    if (typeof window !== 'undefined' && !document.getElementById('razorpay-script')) {
      const script = document.createElement('script');
      script.id = 'razorpay-script';
      script.src = 'https://checkout.razorpay.com/v1/checkout.js';
      script.async = true;
      document.head.appendChild(script);
    }
  }, []);

  const handleBuy = async (plan: PlanDisplay) => {
    if (processing) return;
    setError(null);
    setProcessing(plan.id);
    try {
      const order = await api.createOrder(plan.id, period);
      const options = {
        key: order.key,
        amount: order.amount,
        currency: order.currency,
        name: 'Nexigrate',
        description: `${plan.name} Plan (${period})`,
        order_id: order.orderId,
        handler: async (response: { razorpay_order_id: string; razorpay_payment_id: string; razorpay_signature: string }) => {
          try {
            await api.verifyPayment({ ...response, planId: plan.id, period });
            setSuccess(`Successfully upgraded to ${plan.name}!`);
            setCurrentPlan(plan.id);
          } catch (e) { setError(e instanceof Error ? e.message : 'Payment verification failed'); }
          finally { setProcessing(null); }
        },
        modal: { ondismiss: () => setProcessing(null) },
        theme: { color: '#f59e0b' },
      };
      const rzp = new window.Razorpay(options);
      rzp.open();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to create order');
      setProcessing(null);
    }
  };

  if (loading || !user) return <main className="flex min-h-dvh items-center justify-center"><span className="spinner" /></main>;

  return (
    <main className="mx-auto flex min-h-dvh max-w-3xl flex-col px-5 pt-6 pb-28">
      <header className="flex items-center justify-between">
        <Logo />
        <button onClick={() => router.push('/dashboard')} className="btn-ghost-sm">← Back</button>
      </header>

      <section className="mt-8 text-center">
        <h1 className="font-serif text-2xl font-bold text-ink-900 dark:text-paper-50">Upgrade Your Plan</h1>
        <p className="mt-2 text-sm text-muted-500">Unlock premium features to accelerate your preparation.</p>
      </section>

      {/* Period toggle */}
      <div className="mt-6 flex items-center justify-center gap-1 rounded-full bg-paper-200 dark:bg-ink-700 p-1">
        <button onClick={() => setPeriod('monthly')} className={`rounded-full px-5 py-2 text-sm font-medium transition-colors ${period === 'monthly' ? 'bg-paper-50 dark:bg-ink-900 text-ink-900 dark:text-paper-50 shadow-sm' : 'text-muted-500'}`}>
          Monthly
        </button>
        <button onClick={() => setPeriod('yearly')} className={`rounded-full px-5 py-2 text-sm font-medium transition-colors ${period === 'yearly' ? 'bg-paper-50 dark:bg-ink-900 text-ink-900 dark:text-paper-50 shadow-sm' : 'text-muted-500'}`}>
          Yearly <span className="text-xs text-gold-500 ml-1">Save 20%</span>
        </button>
      </div>

      {success && <div className="banner mt-6 text-center bg-emerald-50 dark:bg-emerald-900/20 text-emerald-700 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800">{success}</div>}
      {error && <div className="banner banner-error mt-6">{error}</div>}

      {/* Plan cards */}
      <div className="mt-8 grid gap-4 grid-cols-1 sm:grid-cols-3">
        {PLANS.map(plan => {
          const isCurrent = currentPlan === plan.id;
          const price = period === 'monthly' ? plan.price : plan.yearlyPrice;
          return (
            <div key={plan.id} className={`paper-card relative flex flex-col p-5 ${plan.popular ? 'border-gold-500 shadow-[0_0_0_1px_#B8862F]' : ''} ${isCurrent ? 'ring-2 ring-gold-500' : ''}`}>
              {plan.badge && (
                <span className="absolute -top-2 right-3 rounded-full bg-gold-500 px-3 py-0.5 text-xs font-semibold text-paper-50">{plan.badge}</span>
              )}
              {isCurrent && (
                <span className="absolute -top-2 left-3 rounded-full bg-emerald-600 px-3 py-0.5 text-xs font-semibold text-paper-50">Current Plan</span>
              )}
              <h3 className="font-serif text-lg font-bold text-ink-900 dark:text-paper-50">{plan.name}</h3>
              <p className="mt-2">
                <span className="font-serif text-3xl font-bold text-ink-900 dark:text-paper-50">₹{price ?? plan.price}</span>
                <span className="text-sm text-muted-500">/{period === 'monthly' ? 'mo' : 'yr'}</span>
              </p>
              <ul className="mt-4 flex-1 space-y-2">
                {plan.features.map(f => (
                  <li key={f} className="flex items-start gap-2 text-sm text-ink-900 dark:text-paper-100">
                    <span className="text-gold-500 mt-0.5">✓</span>{f}
                  </li>
                ))}
              </ul>
              <button
                onClick={() => handleBuy(plan)}
                disabled={isCurrent || processing === plan.id}
                className={`mt-5 w-full rounded-xl py-3 text-sm font-semibold transition-colors ${isCurrent ? 'bg-paper-200 dark:bg-ink-700 text-muted-500 cursor-not-allowed' : 'btn-primary'}`}
              >
                {processing === plan.id ? 'Processing...' : isCurrent ? 'Current Plan' : 'Buy Now'}
              </button>
            </div>
          );
        })}
      </div>

      <p className="mt-8 text-center text-xs text-muted-500">Payments are processed securely via Razorpay. Cancel anytime from your profile.</p>
    </main>
  );
}
