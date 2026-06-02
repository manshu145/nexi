'use client';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import Script from 'next/script';
import { useAuth } from '~/lib/auth-context';
import { api, authedFetch, newIdempotencyKey, type Plan } from '~/lib/api';
import { planFeatureBullets, planDisplayName } from '~/lib/planDisplay';
import { Logo } from '~/components/Logo';

declare global { interface Window { Razorpay: new (options: Record<string, unknown>) => { open(): void }; } }

type BillingPeriod = 'monthly' | 'yearly';

const SCHOLAR_FEATURES = [
  '30 Daily MCQs',
  '5 Mock Tests / month',
  '8 Chapters / day (no credits)',
  'AI Tutor — 30 messages / day',
  'Essay Grading — 3 / day',
  'AI Image Generation — 6 / day',
  'Current Affairs Daily Digest',
  'Ad-free, no distractions',
];

const ASPIRANT_FEATURES = [
  'Everything in Starter',
  '100 Daily MCQs · 25 Chapters/day',
  '15 Mock Tests / month',
  'AI Tutor — 100 messages / day',
  'Essay Grading — 10 / day',
  'Priority AI (GPT-4o)',
];

const ACHIEVER_FEATURES = [
  'Everything in Pro',
  'Unlimited MCQs & Chapters',
  '40 Mock Tests / month',
  'Unlimited Essay Grading',
  'AI Images — 50 / day',
  'Dedicated mentor support',
];

// Hardcoded fallback used only when the live admin matrix is unreachable
// (network down, API outage). The /upgrade page would otherwise render
// ₹0 / NaN for half a beat which is worse than slightly-stale numbers.
// The live values come from `api.getPlans()` and override these on mount.
const PRICING_FALLBACK = {
  scholar:  { monthly: 79,  yearly: 599  },
  aspirant: { monthly: 249, yearly: 1899 },
  achiever: { monthly: 599, yearly: 4499 },
} as const;

type PlanKey = keyof typeof PRICING_FALLBACK;

type CouponResult = { valid: boolean; discount: number; finalAmount: number; error?: string };

// Static display-name + feature fallbacks per purchasable plan, used by the
// focused checkout view when the live admin matrix is unavailable.
const FALLBACK_NAME: Record<PlanKey, string> = { scholar: 'Scholar', aspirant: 'Pro', achiever: 'Elite' };
const FALLBACK_FEATURES: Record<PlanKey, string[]> = { scholar: SCHOLAR_FEATURES, aspirant: ASPIRANT_FEATURES, achiever: ACHIEVER_FEATURES };

export default function UpgradePage() {
  const { user, loading } = useAuth();
  const router = useRouter();
  const [currentPlan, setCurrentPlan] = useState<string>('free');
  const [credits, setCredits] = useState(0);
  const [period, setPeriod] = useState<BillingPeriod>('monthly');
  const [processing, setProcessing] = useState(false);
  const [success, setSuccess] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  // Per-plan coupon state. A coupon can be restricted (by the admin, via
  // `applicablePlans`) to specific plans, so each purchasable plan gets its
  // own code box + validation result. Keyed by PlanKey (scholar/aspirant/
  // achiever). Previously this was a single Scholar-only field, so coupons
  // could never be applied to Pro/Elite even when the admin allowed them.
  const emptyCoupons = (): Record<PlanKey, string> => ({ scholar: '', aspirant: '', achiever: '' });
  const emptyResults = (): Record<PlanKey, CouponResult | null> => ({ scholar: null, aspirant: null, achiever: null });
  const [couponCodes, setCouponCodes] = useState<Record<PlanKey, string>>(emptyCoupons);
  const [couponResults, setCouponResults] = useState<Record<PlanKey, CouponResult | null>>(emptyResults);
  const [validatingPlan, setValidatingPlan] = useState<PlanKey | null>(null);

  // When set (from /upgrade?plan=X, e.g. the onboarding flow), the page shows
  // a FOCUSED single-plan checkout — chosen plan + coupon box + an explicit
  // Pay button — instead of the full grid + an auto-opened gateway. This is
  // what lets onboarding users enter a coupon and avoids the busy plan grid
  // flashing behind Razorpay.
  const [checkoutPlan, setCheckoutPlan] = useState<PlanKey | null>(null);

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

  /** Feature bullets derived from the LIVE admin matrix (features object),
   *  falling back to the static lists only if the matrix is unreachable.
   *  This is what makes /admin/plans edits actually show up here. */
  const featuresOf = (planId: string, fallback: string[]): string[] => {
    const live = livePlans?.find((p) => p.id === planId);
    const derived = planFeatureBullets(live, 'en');
    return derived.length > 0 ? derived : fallback;
  };
  /** Live (admin-editable) plan display name with a static fallback. */
  const nameOf = (planId: string, fallback: string): string =>
    planDisplayName(livePlans, planId, fallback);

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

  // Reset all coupon results whenever the billing period changes — discounts
  // apply to the base price for that period, so a re-validate is required.
  useEffect(() => {
    setCouponResults(emptyResults());
  }, [period]);

  /** Update a single plan's coupon code, clearing any stale result. */
  const setCouponCode = (planId: PlanKey, value: string) => {
    setCouponCodes((prev) => ({ ...prev, [planId]: value }));
    setCouponResults((prev) => ({ ...prev, [planId]: null }));
  };

  /** Validate the entered coupon for a specific plan. Sends the plan's own
   *  planId + period so the backend can honour `applicablePlans` and the
   *  per-plan discount. */
  const applyCoupon = async (planId: PlanKey) => {
    const code = couponCodes[planId].trim();
    if (!code) return;
    setValidatingPlan(planId);
    setCouponResults((prev) => ({ ...prev, [planId]: null }));
    try {
      const res = await authedFetch('/v1/billing/validate-coupon', {
        method: 'POST',
        body: JSON.stringify({ couponCode: code, planId, period }),
      });
      const data = await res.json() as CouponResult;
      setCouponResults((prev) => ({ ...prev, [planId]: data }));
    } catch {
      setCouponResults((prev) => ({
        ...prev,
        [planId]: { valid: false, discount: 0, finalAmount: pricingFor(planId)[period] * 100, error: 'Failed to validate coupon' },
      }));
    } finally {
      setValidatingPlan(null);
    }
  };

  /** Final (possibly discounted) price in ₹ for a plan's current period. */
  const finalPriceFor = (planId: PlanKey): number => {
    const basePaise = pricingFor(planId)[period] * 100;
    const result = couponResults[planId];
    const paise = result?.valid ? result.finalAmount : basePaise;
    return paise / 100;
  };

  /** Original (struck-through) ₹ price when a valid coupon is applied, else null. */
  const strikeFor = (planId: PlanKey): number | null =>
    couponResults[planId]?.valid ? pricingFor(planId)[period] : null;

  const handleBuyPlan = async (planId: 'scholar' | 'aspirant' | 'achiever') => {
    if (processing) return;
    setError(null);
    setProcessing(true);

    const idempotencyKey = newIdempotencyKey();
    const planLabel = planId.charAt(0).toUpperCase() + planId.slice(1);

    try {
      const couponResult = couponResults[planId];
      const couponToSend = couponResult?.valid ? couponCodes[planId].trim() : undefined;
      const order = await api.createOrder(planId, period, couponToSend);

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

      // Check Razorpay script is loaded before opening checkout
      if (typeof window.Razorpay === 'undefined') {
        // Script hasn't loaded yet (lazyOnload). Wait up to 3 seconds.
        await new Promise<void>((resolve, reject) => {
          let waited = 0;
          const interval = setInterval(() => {
            if (typeof window.Razorpay !== 'undefined') { clearInterval(interval); resolve(); }
            waited += 200;
            if (waited > 3000) { clearInterval(interval); reject(new Error('Payment gateway is loading. Please try again in a moment.')); }
          }, 200);
        });
      }

      const rzp = new window.Razorpay(options);
      rzp.open();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to create order');
      setProcessing(false);
    }
  };

  // Onboarding / deep-link checkout. /onboarding/plan routes here as
  // /upgrade?plan=X. Previously we auto-opened Razorpay for X — but that gave
  // the user no chance to enter a coupon and rendered the full plan grid
  // behind the gateway. Instead we surface a FOCUSED checkout view for plan X
  // (coupon box + explicit Pay button). Runs once, only for a purchasable
  // plan that isn't already the user's current plan.
  const checkoutInit = useRef(false);
  useEffect(() => {
    if (checkoutInit.current) return;
    if (loading || !user || livePlans === null) return;
    const wanted = new URLSearchParams(window.location.search).get('plan');
    if (!wanted || !['scholar', 'aspirant', 'achiever'].includes(wanted)) return;
    if (wanted === currentPlan) return;
    const wantedPlan = livePlans.find((p) => p.id === wanted);
    if (wantedPlan && (wantedPlan as { comingSoon?: boolean }).comingSoon) return;
    checkoutInit.current = true;
    setCheckoutPlan(wanted as PlanKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [livePlans, currentPlan, loading, user]);

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

  const isCurrentScholar = currentPlan === 'scholar';

  /** Reusable coupon input + result for a purchasable plan. Each plan keeps
   *  its own code/result so an admin-restricted coupon validates against the
   *  right planId. */
  const renderCoupon = (planId: PlanKey) => {
    const result = couponResults[planId];
    return (
      <div className="mt-4 space-y-2">
        <div className="flex gap-2">
          <input
            type="text"
            value={couponCodes[planId]}
            onChange={(e) => setCouponCode(planId, e.target.value.toUpperCase())}
            placeholder="Coupon code"
            className="input flex-1 text-sm"
          />
          <button
            onClick={() => applyCoupon(planId)}
            disabled={!couponCodes[planId].trim() || validatingPlan === planId}
            className="btn-ghost-sm text-xs px-3 disabled:opacity-50"
          >
            {validatingPlan === planId ? '...' : 'Apply'}
          </button>
        </div>
        {result?.valid && (
          <p className="text-xs text-amber-600 dark:text-amber-400">✓ Code applied! ₹{result.discount / 100} off</p>
        )}
        {result && !result.valid && (
          <p className="text-xs text-red-500">✗ {result.error || 'Invalid code'}</p>
        )}
      </div>
    );
  };

  // ── Focused single-plan checkout (onboarding / deep-link ?plan=X) ──
  // Shows just the chosen plan, a coupon box, and an explicit Pay button.
  // No auto-opened gateway and no busy grid behind it.
  if (checkoutPlan) {
    const goBackToPlans = () => {
      setCheckoutPlan(null);
      // Drop the ?plan= param so a refresh / back doesn't re-enter checkout.
      router.replace('/upgrade');
    };
    const planName = nameOf(checkoutPlan, FALLBACK_NAME[checkoutPlan]);
    return (
      <main className="mx-auto flex min-h-dvh max-w-md flex-col px-5 pt-6 pb-28">
        <Script src="https://checkout.razorpay.com/v1/checkout.js" strategy="lazyOnload" />

        <header className="flex items-center justify-between">
          <Logo height={36} />
          <button onClick={() => router.push('/dashboard')} className="btn-ghost-sm">← Back</button>
        </header>

        <section className="mt-8 text-center">
          <h1 className="font-serif text-2xl font-bold text-ink-900">Complete your upgrade</h1>
          <p className="mt-2 text-sm text-muted-500">Review your plan and apply a coupon before you pay.</p>
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

        <div className="paper-card mt-6 p-5">
          <div className="flex items-start justify-between">
            <h3 className="font-serif text-lg font-bold text-ink-900">{planName}</h3>
            <p className="text-right">
              <span className="font-serif text-2xl font-bold text-ink-900">₹{finalPriceFor(checkoutPlan)}</span>
              <span className="text-sm text-muted-500">/{period === 'yearly' ? 'yr' : 'mo'}</span>
              {strikeFor(checkoutPlan) !== null && (
                <span className="ml-2 text-sm line-through text-muted-400">₹{strikeFor(checkoutPlan)}</span>
              )}
            </p>
          </div>
          {period === 'yearly' && (
            <p className="text-xs text-muted-500 mt-1">
              ≈ ₹{yearlyEquivMonthly('yearly', checkoutPlan)}/mo · Save ₹{yearlySavings.saved} per year
            </p>
          )}
          <ul className="mt-4 space-y-2">
            {featuresOf(checkoutPlan, FALLBACK_FEATURES[checkoutPlan]).map(f => (
              <li key={f} className="flex items-start gap-2 text-sm text-ink-800">
                <span className="text-amber-500 mt-0.5 flex-shrink-0">✓</span>{f}
              </li>
            ))}
          </ul>

          {renderCoupon(checkoutPlan)}

          <button
            onClick={() => handleBuyPlan(checkoutPlan)}
            disabled={processing}
            className="btn-primary mt-5 w-full disabled:opacity-60"
          >
            {processing ? 'Processing...' : `Pay ₹${finalPriceFor(checkoutPlan)} — ${planName}`}
          </button>
        </div>

        <button onClick={goBackToPlans} className="btn-ghost-sm mt-4 self-center text-sm">← Choose a different plan</button>

        <p className="mt-6 text-center text-xs text-muted-400">
          Payments processed securely via Razorpay. Plans are one-time charges for the period chosen — there is no auto-renewal. <strong className="text-muted-500">No refunds</strong> on paid plans.
        </p>
      </main>
    );
  }

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
          <h3 className="font-serif text-lg font-bold text-ink-900">{nameOf('free', 'Free')}</h3>
          <p className="mt-2"><span className="font-serif text-3xl font-bold text-ink-900">₹0</span></p>
          <ul className="mt-4 flex-1 space-y-2 text-sm text-muted-600 dark:text-muted-400">
            {featuresOf('free', ['10 Daily MCQs', '2 free chapters/day', 'Credits deducted per feature', 'Basic access']).map(f => (
              <li key={f} className="flex items-start gap-2"><span className="text-muted-400">•</span>{f}</li>
            ))}
          </ul>
          <button disabled className="mt-5 w-full rounded-xl py-3 text-sm font-semibold bg-paper-200 text-muted-500 cursor-not-allowed">
            {currentPlan === 'free' ? '✓ Your Current Plan' : 'Free Plan'}
          </button>
        </div>

        {/* STARTER — ACTIVE */}
        <div className={`paper-card relative flex flex-col p-5 ${isCurrentScholar ? 'border-2 border-amber-400' : ''}`}>
          <h3 className="font-serif text-lg font-bold text-ink-900">{nameOf('scholar', 'Scholar')}</h3>
          <p className="mt-2">
            <span className="font-serif text-3xl font-bold text-ink-900">₹{finalPriceFor('scholar')}</span>
            <span className="text-sm text-muted-500">/{period === 'yearly' ? 'yr' : 'mo'}</span>
            {strikeFor('scholar') !== null && (
              <span className="ml-2 text-sm line-through text-muted-400">₹{strikeFor('scholar')}</span>
            )}
          </p>
          {period === 'yearly' && (
            <p className="text-xs text-muted-500 mt-1">
              ≈ ₹{yearlyEquivMonthly('yearly', 'scholar')}/mo · Save ₹{yearlySavings.saved} per year
            </p>
          )}
          <ul className="mt-4 flex-1 space-y-2">
            {featuresOf('scholar', SCHOLAR_FEATURES).map(f => (
              <li key={f} className="flex items-start gap-2 text-sm text-ink-800">
                <span className="text-amber-500 mt-0.5 flex-shrink-0">✓</span>{f}
              </li>
            ))}
          </ul>

          {/* Coupon input */}
          {!isCurrentScholar && renderCoupon('scholar')}

          <button
            onClick={() => handleBuyPlan('scholar')}
            disabled={isCurrentScholar || processing}
            className={`mt-4 w-full rounded-xl py-3 text-sm font-semibold transition-colors ${isCurrentScholar ? 'bg-paper-200 text-muted-500 cursor-not-allowed' : 'btn-primary'}`}
          >
            {processing
              ? 'Processing...'
              : isCurrentScholar
                ? '✓ Your Current Plan'
                : `Buy Now — ₹${finalPriceFor('scholar')}/${period === 'yearly' ? 'yr' : 'mo'}`}
          </button>
        </div>

        {/* PRO (aspirant) — RECOMMENDED (industry-standard middle-tier highlight) */}
        <div className={`paper-card relative flex flex-col p-5 border-amber-500 shadow-[0_0_0_2px_rgba(245,158,11,0.3)] ${currentPlan === 'aspirant' ? 'border-2 border-amber-400' : ''}`}>
          <span className="absolute -top-2.5 right-3 rounded-full bg-amber-500 px-3 py-0.5 text-xs font-semibold text-ink-900">Recommended</span>
          <h3 className="font-serif text-lg font-bold text-ink-900">{nameOf('aspirant', 'Pro')}</h3>
          <p className="mt-2">
            <span className="font-serif text-3xl font-bold text-ink-900">₹{finalPriceFor('aspirant')}</span>
            <span className="text-sm text-muted-500">/{period === 'yearly' ? 'yr' : 'mo'}</span>
            {strikeFor('aspirant') !== null && (
              <span className="ml-2 text-sm line-through text-muted-400">₹{strikeFor('aspirant')}</span>
            )}
          </p>
          <ul className="mt-4 flex-1 space-y-2">
            {featuresOf('aspirant', ASPIRANT_FEATURES).map(f => (
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
              <>
                {currentPlan !== 'aspirant' && !isComingSoon && renderCoupon('aspirant')}
                <button
                  onClick={() => handleBuyPlan('aspirant')}
                  disabled={isDisabled}
                  className={`mt-4 w-full rounded-xl py-3 text-sm font-semibold transition-colors ${isComingSoon ? 'bg-paper-200 text-muted-500 cursor-not-allowed' : 'bg-ink-900 text-paper-100 hover:bg-ember-600 disabled:opacity-50 disabled:cursor-not-allowed'}`}
                >
                  {currentPlan === 'aspirant'
                    ? '✓ Current Plan'
                    : isComingSoon
                      ? 'Coming Soon'
                      : processing
                        ? 'Processing...'
                        : `Choose Pro — ₹${finalPriceFor('aspirant')}/${period === 'yearly' ? 'yr' : 'mo'}`}
                </button>
              </>
            );
          })()}
        </div>

        {/* ELITE (achiever) — ACTIVE */}
        <div className="paper-card relative flex flex-col p-5">
          <h3 className="font-serif text-lg font-bold text-ink-900">{nameOf('achiever', 'Elite')}</h3>
          <p className="mt-2">
            <span className="font-serif text-3xl font-bold text-ink-900">₹{finalPriceFor('achiever')}</span>
            <span className="text-sm text-muted-500">/{period === 'yearly' ? 'yr' : 'mo'}</span>
            {strikeFor('achiever') !== null && (
              <span className="ml-2 text-sm line-through text-muted-400">₹{strikeFor('achiever')}</span>
            )}
          </p>
          <ul className="mt-4 flex-1 space-y-2">
            {featuresOf('achiever', ACHIEVER_FEATURES).map(f => (
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
              <>
                {currentPlan !== 'achiever' && !isComingSoon && renderCoupon('achiever')}
                <button
                  onClick={() => handleBuyPlan('achiever')}
                  disabled={isDisabled}
                  className={`mt-4 w-full rounded-xl py-3 text-sm font-semibold transition-colors ${isComingSoon ? 'bg-paper-200 text-muted-500 cursor-not-allowed' : 'bg-ink-900 text-paper-100 hover:bg-ember-600 disabled:opacity-50 disabled:cursor-not-allowed'}`}
                >
                  {currentPlan === 'achiever'
                    ? '✓ Current Plan'
                    : isComingSoon
                      ? 'Coming Soon'
                      : processing
                        ? 'Processing...'
                        : `Choose Elite — ₹${finalPriceFor('achiever')}/${period === 'yearly' ? 'yr' : 'mo'}`}
                </button>
              </>
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

