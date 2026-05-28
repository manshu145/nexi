'use client';
import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import Script from 'next/script';
import { useAuth } from '~/lib/auth-context';
import { api, newIdempotencyKey } from '~/lib/api';
import { Logo } from '~/components/Logo';

declare global { interface Window { Razorpay: new (options: Record<string, unknown>) => { open(): void }; } }

type BillingPeriod = 'monthly' | 'yearly';

const SCHOLAR_FEATURES = [
  'Unlimited Daily MCQs',
  'Unlimited Mock Tests',
  'Unlimited Chapter Access (no credits deducted)',
  'AI Tutor — Nexi AI unlimited',
  'Current Affairs Daily Digest',
  'Daily Quiz + Leaderboard',
  'Hindi + English content',
  'No credit deductions',
  'Priority support',
];

const ASPIRANT_FEATURES = [
  'Everything in Scholar',
  'Advanced AI Tutor with memory',
  'Essay & Answer Grading',
  'Personalized study plans',
  'Mentor support',
];

const ACHIEVER_FEATURES = [
  'Everything in Aspirant',
  'Essay Grading with expert feedback',
  'UPSC-specific mock interviews',
  'Expert AMAs',
  'Dedicated study coach',
];

// Locked at 30% off monthly × 12 — keep in sync with packages/shared/constants/subscriptions.ts
const PRICING = {
  scholar:  { monthly: 99,  yearly: 830  },
  aspirant: { monthly: 299, yearly: 2510 },
  achiever: { monthly: 599, yearly: 5030 },
} as const;

function yearlyEquivMonthly(p: BillingPeriod, planKey: keyof typeof PRICING): number {
  if (p === 'yearly') return Math.round(PRICING[planKey].yearly / 12);
  return PRICING[planKey].monthly;
}

export default function UpgradePage() {
  const { user, loading } = useAuth();
  const router = useRouter();
  const [currentPlan, setCurrentPlan] = useState<string>('free');
  const [credits, setCredits] = useState(0);
  const [period, setPeriod] = useState<BillingPeriod>('monthly');
  const [processing, setProcessing] = useState(false);
  const [success, setSuccess] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [couponCode, setCouponCode] = useState('');
  const [couponApplied, setCouponApplied] = useState<{ valid: boolean; discount: number; finalAmount: number; error?: string } | null>(null);
  const [validatingCoupon, setValidatingCoupon] = useState(false);

  useEffect(() => { if (!loading && !user) router.replace('/signin'); }, [user, loading, router]);

  useEffect(() => {
    if (!user) return;
    api.getSubscription().then(r => {
      setCurrentPlan(r.plan);
      setCredits(r.credits);
    }).catch(() => {});
  }, [user]);

  // Reset coupon state whenever period changes — coupon discounts apply to the
  // base price for that period, so we re-validate on switch.
  useEffect(() => {
    setCouponApplied(null);
  }, [period]);

  const scholarBasePaise = PRICING.scholar[period] * 100;
  const scholarFinalPaise = couponApplied?.valid ? couponApplied.finalAmount : scholarBasePaise;

  const handleApplyCoupon = async () => {
    if (!couponCode.trim()) return;
    setValidatingCoupon(true);
    setCouponApplied(null);
    try {
      const res = await fetch(`${process.env['NEXT_PUBLIC_API_URL'] ?? 'https://api.nexigrate.com'}/v1/billing/validate-coupon`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${await getToken()}` },
        body: JSON.stringify({ couponCode: couponCode.trim(), planId: 'scholar', period }),
      });
      const data = await res.json() as { valid: boolean; discount: number; finalAmount: number; error?: string };
      setCouponApplied(data);
    } catch { setCouponApplied({ valid: false, discount: 0, finalAmount: scholarBasePaise, error: 'Failed to validate coupon' }); }
    finally { setValidatingCoupon(false); }
  };

  const handleBuyScholar = async () => {
    if (processing) return;
    setError(null);
    setProcessing(true);

    // Generated ONCE per checkout attempt and reused on retry — guarantees the
    // server treats a refresh-after-success as a no-op instead of double-granting.
    const idempotencyKey = newIdempotencyKey();

    try {
      const orderRes = await fetch(`${process.env['NEXT_PUBLIC_API_URL'] ?? 'https://api.nexigrate.com'}/v1/billing/order`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${await getToken()}` },
        body: JSON.stringify({ planId: 'scholar', period, couponCode: couponApplied?.valid ? couponCode.trim() : undefined }),
      });
      if (!orderRes.ok) { const e = await orderRes.json().catch(() => ({})) as { message?: string }; throw new Error(e.message || `Order failed: ${orderRes.status}`); }
      const order = await orderRes.json() as { orderId: string; amount: number; currency: string; keyId: string; period: BillingPeriod };

      const displayAmount = order.amount / 100;
      const periodLabel = order.period === 'yearly' ? 'year' : 'month';
      const options = {
        key: order.keyId,
        amount: order.amount,
        currency: order.currency,
        name: 'Nexigrate',
        description: `Scholar Plan — ₹${displayAmount}/${periodLabel}`,
        order_id: order.orderId,
        handler: async (response: { razorpay_order_id: string; razorpay_payment_id: string; razorpay_signature: string }) => {
          try {
            const verifyRes = await fetch(`${process.env['NEXT_PUBLIC_API_URL'] ?? 'https://api.nexigrate.com'}/v1/billing/verify`, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${await getToken()}`,
                // SAME key on retry → server returns the cached response.
                'Idempotency-Key': idempotencyKey,
              },
              body: JSON.stringify(response),
            });
            if (!verifyRes.ok) throw new Error('Verification failed');
            setSuccess('Plan activated! Redirecting...');
            setCurrentPlan('scholar');
            setTimeout(() => router.push('/dashboard'), 2000);
          } catch (e) {
            setError(e instanceof Error ? e.message : 'Payment verification failed');
          } finally { setProcessing(false); }
        },
        modal: { ondismiss: () => setProcessing(false) },
        prefill: { name: user?.displayName ?? '', email: user?.email ?? '' },
        theme: { color: '#F59E0B' },
      };

      const rzp = new window.Razorpay(options);
      rzp.open();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to create order');
      setProcessing(false);
    }
  };

  const yearlySavings = useMemo(() => {
    const monthly12 = PRICING.scholar.monthly * 12;
    const saved = monthly12 - PRICING.scholar.yearly;
    const pct = Math.round((saved / monthly12) * 100);
    return { saved, pct };
  }, []);

  if (loading || !user) return (
    <main className="flex min-h-dvh items-center justify-center">
      <div className="space-y-3 text-center">
        <div className="h-6 w-40 mx-auto rounded bg-paper-200 animate-pulse" />
        <div className="h-4 w-60 mx-auto rounded bg-paper-200 animate-pulse" />
      </div>
    </main>
  );

  const scholarDisplayPrice = scholarFinalPaise / 100;
  const scholarStrikethrough = couponApplied?.valid ? PRICING.scholar[period] : null;
  const isCurrentScholar = currentPlan === 'scholar';

  return (
    <main className="mx-auto flex min-h-dvh max-w-4xl flex-col px-5 pt-6 pb-28">
      <Script src="https://checkout.razorpay.com/v1/checkout.js" strategy="lazyOnload" />

      <header className="flex items-center justify-between">
        <Logo height={36} />
        <button onClick={() => router.push('/dashboard')} className="btn-ghost-sm">← Back</button>
      </header>

      <section className="mt-8 text-center">
        <h1 className="font-serif text-2xl font-bold text-ink-900">Choose Your Plan</h1>
        <p className="mt-2 text-sm text-muted-500">Unlock unlimited access to accelerate your preparation.</p>
      </section>

      {/* Monthly / Yearly toggle */}
      <div className="mx-auto mt-6 inline-flex items-center gap-1 rounded-full border border-line-200 bg-paper-50 p-1 self-center">
        <button
          onClick={() => setPeriod('monthly')}
          className={`px-4 py-1.5 rounded-full text-sm font-medium transition-colors ${period === 'monthly' ? 'bg-ember-500 text-white' : 'text-muted-600 hover:text-ink-900'}`}
        >
          Monthly
        </button>
        <button
          onClick={() => setPeriod('yearly')}
          className={`px-4 py-1.5 rounded-full text-sm font-medium transition-colors flex items-center gap-2 ${period === 'yearly' ? 'bg-ember-500 text-white' : 'text-muted-600 hover:text-ink-900'}`}
        >
          Yearly
          <span className={`text-[10px] font-bold rounded-full px-2 py-0.5 ${period === 'yearly' ? 'bg-white text-ember-600' : 'bg-ember-500 text-white'}`}>
            SAVE {yearlySavings.pct}%
          </span>
        </button>
      </div>

      {success && <div className="mt-6 rounded-xl bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 p-4 text-center text-sm font-medium text-amber-700 dark:text-amber-300">{success}</div>}
      {error && <div className="banner banner-error mt-6">{error}</div>}

      {/* Plan cards */}
      <div className="mt-8 grid gap-5 grid-cols-1 md:grid-cols-2 lg:grid-cols-4">
        {/* FREE */}
        <div className={`paper-card relative flex flex-col p-5 ${currentPlan === 'free' ? 'border-2 border-amber-400 dark:border-amber-600' : ''}`}>
          <h3 className="font-serif text-lg font-bold text-ink-900">Free</h3>
          <p className="mt-2"><span className="font-serif text-3xl font-bold text-ink-900">₹0</span></p>
          <ul className="mt-4 flex-1 space-y-2 text-sm text-muted-600 dark:text-muted-400">
            <li className="flex items-start gap-2"><span className="text-muted-400">•</span>10 Daily MCQs</li>
            <li className="flex items-start gap-2"><span className="text-muted-400">•</span>2 free chapters/day</li>
            <li className="flex items-start gap-2"><span className="text-muted-400">•</span>Credits deducted per feature</li>
            <li className="flex items-start gap-2"><span className="text-muted-400">•</span>Basic access</li>
          </ul>
          <button disabled className="mt-5 w-full rounded-xl py-3 text-sm font-semibold bg-paper-200 text-muted-500 cursor-not-allowed">
            {currentPlan === 'free' ? '✓ Your Current Plan' : 'Free Plan'}
          </button>
        </div>

        {/* SCHOLAR — ACTIVE */}
        <div className={`paper-card relative flex flex-col p-5 border-amber-500 shadow-[0_0_0_2px_rgba(245,158,11,0.3)] ${isCurrentScholar ? 'border-2 border-amber-400' : ''}`}>
          <span className="absolute -top-2.5 right-3 rounded-full bg-amber-500 px-3 py-0.5 text-xs font-semibold text-ink-900">Recommended</span>
          <h3 className="font-serif text-lg font-bold text-ink-900">Scholar</h3>
          <p className="mt-2">
            <span className="font-serif text-3xl font-bold text-ink-900">₹{scholarDisplayPrice}</span>
            <span className="text-sm text-muted-500">/{period === 'yearly' ? 'yr' : 'mo'}</span>
            {scholarStrikethrough !== null && (
              <span className="ml-2 text-sm line-through text-muted-400">₹{scholarStrikethrough}</span>
            )}
          </p>
          {period === 'yearly' && (
            <p className="text-xs text-muted-500 mt-1">
              ≈ ₹{yearlyEquivMonthly('yearly', 'scholar')}/mo · Save ₹{yearlySavings.saved} per year
            </p>
          )}
          <ul className="mt-4 flex-1 space-y-2">
            {SCHOLAR_FEATURES.map(f => (
              <li key={f} className="flex items-start gap-2 text-sm text-ink-800">
                <span className="text-amber-500 mt-0.5 flex-shrink-0">✓</span>{f}
              </li>
            ))}
          </ul>

          {/* Coupon input */}
          {!isCurrentScholar && (
            <div className="mt-4 space-y-2">
              <div className="flex gap-2">
                <input
                  type="text"
                  value={couponCode}
                  onChange={e => { setCouponCode(e.target.value.toUpperCase()); setCouponApplied(null); }}
                  placeholder="Coupon code"
                  className="input flex-1 text-sm"
                />
                <button
                  onClick={handleApplyCoupon}
                  disabled={!couponCode.trim() || validatingCoupon}
                  className="btn-ghost-sm text-xs px-3 disabled:opacity-50"
                >
                  {validatingCoupon ? '...' : 'Apply'}
                </button>
              </div>
              {couponApplied?.valid && (
                <p className="text-xs text-amber-600 dark:text-amber-400">✓ Code applied! ₹{couponApplied.discount / 100} off</p>
              )}
              {couponApplied && !couponApplied.valid && (
                <p className="text-xs text-red-500">✗ {couponApplied.error || 'Invalid code'}</p>
              )}
            </div>
          )}

          <button
            onClick={handleBuyScholar}
            disabled={isCurrentScholar || processing}
            className={`mt-4 w-full rounded-xl py-3 text-sm font-semibold transition-colors ${isCurrentScholar ? 'bg-paper-200 text-muted-500 cursor-not-allowed' : 'btn-primary'}`}
          >
            {processing
              ? 'Processing...'
              : isCurrentScholar
                ? '✓ Your Current Plan'
                : `Buy Now — ₹${scholarDisplayPrice}/${period === 'yearly' ? 'yr' : 'mo'}`}
          </button>
        </div>

        {/* ASPIRANT — COMING SOON */}
        <div className="paper-card relative flex flex-col p-5 opacity-70">
          <span className="absolute -top-2.5 right-3 rounded-full bg-stone-500 px-3 py-0.5 text-xs font-semibold text-paper-50">Coming Soon</span>
          <h3 className="font-serif text-lg font-bold text-ink-900">Aspirant</h3>
          <p className="mt-2">
            <span className="font-serif text-3xl font-bold text-muted-400">₹{PRICING.aspirant[period]}</span>
            <span className="text-sm text-muted-400">/{period === 'yearly' ? 'yr' : 'mo'}</span>
          </p>
          <ul className="mt-4 flex-1 space-y-2">
            {ASPIRANT_FEATURES.map(f => (
              <li key={f} className="flex items-start gap-2 text-sm text-muted-400">
                <span className="text-muted-300 mt-0.5 flex-shrink-0">✓</span>{f}
              </li>
            ))}
          </ul>
          <button disabled className="mt-5 w-full rounded-xl py-3 text-sm font-semibold bg-stone-200 dark:bg-stone-700 text-muted-400 cursor-not-allowed">
            Coming Soon
          </button>
        </div>

        {/* ACHIEVER — COMING SOON */}
        <div className="paper-card relative flex flex-col p-5 opacity-70">
          <span className="absolute -top-2.5 right-3 rounded-full bg-stone-500 px-3 py-0.5 text-xs font-semibold text-paper-50">Coming Soon</span>
          <h3 className="font-serif text-lg font-bold text-ink-900">Achiever</h3>
          <p className="mt-2">
            <span className="font-serif text-3xl font-bold text-muted-400">₹{PRICING.achiever[period]}</span>
            <span className="text-sm text-muted-400">/{period === 'yearly' ? 'yr' : 'mo'}</span>
          </p>
          <ul className="mt-4 flex-1 space-y-2">
            {ACHIEVER_FEATURES.map(f => (
              <li key={f} className="flex items-start gap-2 text-sm text-muted-400">
                <span className="text-muted-300 mt-0.5 flex-shrink-0">✓</span>{f}
              </li>
            ))}
          </ul>
          <button disabled className="mt-5 w-full rounded-xl py-3 text-sm font-semibold bg-stone-200 dark:bg-stone-700 text-muted-400 cursor-not-allowed">
            Coming Soon
          </button>
        </div>
      </div>

      {/* Credits info */}
      <div className="mt-8 paper-card p-4 text-center">
        <p className="text-sm text-muted-600 dark:text-muted-400">
          Your current credits: <span className="font-bold text-ink-900">{credits}</span>
          <span className="text-xs text-muted-500 ml-2">(preserved across plan changes)</span>
        </p>
      </div>

      <p className="mt-6 text-center text-xs text-muted-400">
        Payments processed securely via Razorpay. Plans renew automatically based on the chosen period — cancel anytime to stop the next charge.
      </p>
    </main>
  );
}

async function getToken(): Promise<string> {
  const { getFirebaseAuthClient } = await import('~/lib/firebase');
  const auth = getFirebaseAuthClient();
  return (await auth.currentUser?.getIdToken()) ?? '';
}
