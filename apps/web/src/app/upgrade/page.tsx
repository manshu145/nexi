'use client';
import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import Script from 'next/script';
import { useAuth } from '~/lib/auth-context';
import { api, authedFetch, newIdempotencyKey, type Plan } from '~/lib/api';
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

// Hardcoded fallback used only when the live admin matrix is unreachable
// (network down, API outage). The /upgrade page would otherwise render
// ₹0 / NaN for half a beat which is worse than slightly-stale numbers.
// The live values come from `api.getPlans()` and override these on mount —
// see PR-34b (audit #41).
const PRICING_FALLBACK = {
  scholar:  { monthly: 99,  yearly: 830  },
  aspirant: { monthly: 299, yearly: 2510 },
  achiever: { monthly: 599, yearly: 5030 },
} as const;

type PlanKey = keyof typeof PRICING_FALLBACK;

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

  // Live admin-edited plan matrix. PR-34b (audit #41) — the page used to
  // hardcode prices, which silently drifted from whatever the admin set in
  // /admin/plans (PR-04). The backend `GET /v1/billing/plans` already
  // returns the live merged matrix; we just consume it. `null` means the
  // initial fetch is still in flight (skeleton renders); empty array means
  // it failed and we'll fall back to PRICING_FALLBACK so checkout never
  // shows ₹0 / NaN.
  const [livePlans, setLivePlans] = useState<Plan[] | null>(null);

  /** Lookup helper. Returns the live monthly + yearly numbers if the
   *  admin matrix has the plan, otherwise falls back to PRICING_FALLBACK
   *  so /upgrade keeps working even when the API is down. */
  const pricingFor = (planId: PlanKey): { monthly: number; yearly: number } => {
    const live = livePlans?.find((p) => p.id === planId);
    if (live && Number.isFinite(live.price) && Number.isFinite(live.yearlyPrice)) {
      return { monthly: live.price, yearly: live.yearlyPrice };
    }
    return PRICING_FALLBACK[planId];
  };

  function yearlyEquivMonthly(p: BillingPeriod, planKey: PlanKey): number {
    const px = pricingFor(planKey);
    if (p === 'yearly') return Math.round(px.yearly / 12);
    return px.monthly;
  }

  useEffect(() => { if (!loading && !user) router.replace('/signin'); }, [user, loading, router]);

  // PR-34b (audit #41): fetch the live admin-edited price matrix on mount
  // so the page never shows hardcoded prices that drifted from /admin/plans.
  // Failure is non-fatal — pricingFor() falls back to PRICING_FALLBACK.
  useEffect(() => {
    let cancelled = false;
    api.getPlans()
      .then((r) => { if (!cancelled) setLivePlans(r.plans); })
      .catch(() => { if (!cancelled) setLivePlans([]); /* empty array → fallback used */ });
    return () => { cancelled = true; };
  }, []);

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

  const scholarBasePaise = pricingFor('scholar')[period] * 100;
  const scholarFinalPaise = couponApplied?.valid ? couponApplied.finalAmount : scholarBasePaise;

  const handleApplyCoupon = async () => {
    if (!couponCode.trim()) return;
    setValidatingCoupon(true);
    setCouponApplied(null);
    try {
      const res = await authedFetch('/v1/billing/validate-coupon', {
        method: 'POST',
        body: JSON.stringify({ couponCode: couponCode.trim(), planId: 'scholar', period }),
      });
      const data = await res.json() as { valid: boolean; discount: number; finalAmount: number; error?: string };
      setCouponApplied(data);
    } catch { setCouponApplied({ valid: false, discount: 0, finalAmount: scholarBasePaise, error: 'Failed to validate coupon' }); }
    finally { setValidatingCoupon(false); }
  };

  const handleBuyPlan = async (planId: 'scholar' | 'aspirant' | 'achiever') => {
    if (processing) return;
    setError(null);
    setProcessing(true);

    const idempotencyKey = newIdempotencyKey();
    const planLabel = planId.charAt(0).toUpperCase() + planId.slice(1);

    try {
      const order = await api.createOrder(planId, period, couponApplied?.valid ? couponCode.trim() : undefined);

      // If amount is 0 (100% coupon), the server grants the plan directly
      // and returns { granted: true } — no Razorpay checkout needed.
      if (order.amount === 0 && (order as any).granted) {
        setSuccess('Plan activated! Redirecting...');
        setCurrentPlan(planId);
        setTimeout(() => router.push('/dashboard'), 2000);
        setProcessing(false);
        return;
      }

      const displayAmount = order.amount / 100;
      const periodLabel = order.period === 'yearly' ? 'year' : 'month';
      const options = {
        key: order.keyId ?? order.key,
        amount: order.amount,
        currency: order.currency,
        name: 'Nexigrate',
        description: `${planLabel} Plan — ₹${displayAmount}/${periodLabel}`,
        order_id: order.orderId,
        handler: async (response: { razorpay_order_id: string; razorpay_payment_id: string; razorpay_signature: string }) => {
          try {
            await api.verifyPayment(response, idempotencyKey);
            setSuccess('Plan activated! Redirecting...');
            setCurrentPlan(planId);
            setTimeout(() => router.push('/dashboard'), 2000);
          } catch (e) {
            // NOTE: If this fires, payment likely SUCCEEDED (Razorpay's
            // handler callback only fires on successful payments). The
            // webhook will activate the plan server-side. Show a softer
            // message instead of alarming the user.
            setSuccess('Payment received! Your plan is being activated. Redirecting...');
            setTimeout(() => router.push('/dashboard'), 3000);
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
    const px = pricingFor('scholar');
    const monthly12 = px.monthly * 12;
    const saved = monthly12 - px.yearly;
    const pct = monthly12 > 0 ? Math.round((saved / monthly12) * 100) : 0;
    return { saved, pct };
  }, [livePlans]);

  if (loading || !user) return (
    <main className="flex min-h-dvh items-center justify-center">
      <div className="space-y-3 text-center">
        <div className="h-6 w-40 mx-auto rounded bg-paper-200 animate-pulse" />
        <div className="h-4 w-60 mx-auto rounded bg-paper-200 animate-pulse" />
      </div>
    </main>
  );

  const scholarDisplayPrice = scholarFinalPaise / 100;
  const scholarStrikethrough = couponApplied?.valid ? pricingFor('scholar')[period] : null;
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

      {/* Plan cards.
         PR-34b (audit #41): while the live admin matrix is loading
         (`livePlans === null`) we render a paper-card skeleton instead of
         the cards so the page never flashes hardcoded prices for half a
         beat on slow networks. Once the fetch resolves (or fails — empty
         array also lifts the skeleton), the real cards render with the
         live numbers (or fallback constants). */}
      {livePlans === null ? (
        <div className="mt-8 grid gap-5 grid-cols-1 md:grid-cols-2 lg:grid-cols-4" aria-hidden>
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="paper-card relative flex flex-col p-5">
              <div className="h-5 w-20 rounded bg-paper-200 animate-pulse" />
              <div className="mt-4 h-8 w-24 rounded bg-paper-200 animate-pulse" />
              <ul className="mt-4 flex-1 space-y-2">
                {[0, 1, 2, 3].map((j) => (
                  <li key={j} className="h-3 w-3/4 rounded bg-paper-200 animate-pulse" />
                ))}
              </ul>
              <div className="mt-5 h-10 rounded-xl bg-paper-200 animate-pulse" />
            </div>
          ))}
        </div>
      ) : (
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
            onClick={() => handleBuyPlan('scholar')}
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

        {/* ASPIRANT — ACTIVE */}
        <div className="paper-card relative flex flex-col p-5">
          <h3 className="font-serif text-lg font-bold text-ink-900">Aspirant</h3>
          <p className="mt-2">
            <span className="font-serif text-3xl font-bold text-ink-900">₹{pricingFor('aspirant')[period]}</span>
            <span className="text-sm text-muted-500">/{period === 'yearly' ? 'yr' : 'mo'}</span>
          </p>
          <ul className="mt-4 flex-1 space-y-2">
            {ASPIRANT_FEATURES.map(f => (
              <li key={f} className="flex items-start gap-2 text-sm text-ink-800">
                <span className="text-ember-500 mt-0.5 flex-shrink-0">✓</span>{f}
              </li>
            ))}
          </ul>
          {(() => {
            const aspirantPlan = livePlans?.find(p => p.id === 'aspirant');
            const isComingSoon = aspirantPlan && ('comingSoon' in aspirantPlan) && (aspirantPlan as any).comingSoon;
            const isDisabled = currentPlan === 'aspirant' || processing || isComingSoon;
            return (
              <button
                onClick={() => handleBuyPlan('aspirant')}
                disabled={isDisabled}
                className={`mt-5 w-full rounded-xl py-3 text-sm font-semibold transition-colors ${isComingSoon ? 'bg-paper-200 text-muted-500 cursor-not-allowed' : 'bg-ink-900 dark:bg-ink-100 dark:text-ink-900 text-paper-50 hover:bg-ember-600 disabled:opacity-50 disabled:cursor-not-allowed'}`}
              >
                {currentPlan === 'aspirant'
                  ? '✓ Current Plan'
                  : isComingSoon
                    ? 'Coming Soon'
                    : processing
                      ? 'Processing...'
                      : `Choose Aspirant — ₹${pricingFor('aspirant')[period]}/${period === 'yearly' ? 'yr' : 'mo'}`}
              </button>
            );
          })()}
        </div>

        {/* ACHIEVER — ACTIVE */}
        <div className="paper-card relative flex flex-col p-5">
          <h3 className="font-serif text-lg font-bold text-ink-900">Achiever</h3>
          <p className="mt-2">
            <span className="font-serif text-3xl font-bold text-ink-900">₹{pricingFor('achiever')[period]}</span>
            <span className="text-sm text-muted-500">/{period === 'yearly' ? 'yr' : 'mo'}</span>
          </p>
          <ul className="mt-4 flex-1 space-y-2">
            {ACHIEVER_FEATURES.map(f => (
              <li key={f} className="flex items-start gap-2 text-sm text-ink-800">
                <span className="text-ember-500 mt-0.5 flex-shrink-0">✓</span>{f}
              </li>
            ))}
          </ul>
          {(() => {
            const achieverPlan = livePlans?.find(p => p.id === 'achiever');
            const isComingSoon = achieverPlan && ('comingSoon' in achieverPlan) && (achieverPlan as any).comingSoon;
            const isDisabled = currentPlan === 'achiever' || processing || isComingSoon;
            return (
              <button
                onClick={() => handleBuyPlan('achiever')}
                disabled={isDisabled}
                className={`mt-5 w-full rounded-xl py-3 text-sm font-semibold transition-colors ${isComingSoon ? 'bg-paper-200 text-muted-500 cursor-not-allowed' : 'bg-ink-900 dark:bg-ink-100 dark:text-ink-900 text-paper-50 hover:bg-ember-600 disabled:opacity-50 disabled:cursor-not-allowed'}`}
              >
                {currentPlan === 'achiever'
                  ? '✓ Current Plan'
                  : isComingSoon
                    ? 'Coming Soon'
                    : processing
                      ? 'Processing...'
                      : `Choose Achiever — ₹${pricingFor('achiever')[period]}/${period === 'yearly' ? 'yr' : 'mo'}`}
              </button>
            );
          })()}
        </div>
      </div>
      )}

      {/* Credits info */}
      <div className="mt-8 paper-card p-4 text-center">
        <p className="text-sm text-muted-600 dark:text-muted-400">
          Your current credits: <span className="font-bold text-ink-900">{credits}</span>
          <span className="text-xs text-muted-500 ml-2">(preserved across plan changes)</span>
        </p>
      </div>

      <p className="mt-6 text-center text-xs text-muted-400">
        Payments processed securely via Razorpay. Plans are one-time charges for the period chosen — there is no auto-renewal. <strong className="text-muted-500">No refunds</strong> on paid plans; cancel any time from your profile to stop the next charge while keeping access until the current period ends.
      </p>
    </main>
  );
}

