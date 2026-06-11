'use client';
import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';
import { useUser } from '~/lib/userStore';
import { api, type Plan, type StoredUser } from '~/lib/api';
import { planFeatureBullets } from '~/lib/planDisplay';
import { AILoader } from '~/components/ui/AILoader';
import { getClientLocale } from '~/lib/locale';

type PlanId = 'free' | 'scholar' | 'aspirant' | 'achiever';

const PLAN_ICONS: Record<PlanId, string> = {
  free: '🆓',
  scholar: '📚',
  aspirant: '🚀',
  achiever: '🏆',
};

/** Bullet copy per plan; localised in render. */
const PLAN_HIGHLIGHTS: Record<PlanId, { en: string[]; hi: string[] }> = {
  free: {
    en: ['10 daily MCQs', '2 chapters/day', 'Earn credits as you study'],
    hi: ['10 दैनिक MCQ', '2 अध्याय/दिन', 'पढ़ते-पढ़ते क्रेडिट कमाएँ'],
  },
  scholar: {
    en: ['Unlimited chapters & MCQs', 'AI Tutor (Nexi) access', 'Daily Current Affairs', 'No credit deduction — study freely'],
    hi: ['असीमित अध्याय और MCQ', 'AI ट्यूटर (Nexi)', 'दैनिक करंट अफेयर्स', 'क्रेडिट नहीं कटेंगे'],
  },
  aspirant: {
    en: ['Everything in Scholar', 'Advanced analytics', 'Priority support', 'For serious aspirants'],
    hi: ['Scholar की सभी सुविधाएँ', 'उन्नत विश्लेषण', 'प्राथमिकता सहायता'],
  },
  achiever: {
    en: ['Everything in Aspirant', 'Essay grading by AI', '1-on-1 mentorship'],
    hi: ['Aspirant की सभी सुविधाएँ', 'AI निबंध मूल्यांकन', '1-on-1 मार्गदर्शन'],
  },
};

const RECOMMENDED_BADGE = {
  en: 'Recommended for you',
  hi: 'आपके लिए अनुशंसित',
};

/**
 * Plan recommendation shown during onboarding.
 *
 * Industry standard (and founder ask): promote the mid "Pro" tier as the
 * recommended/highlighted plan EVERY time — it's the best value-for-money
 * anchor and what most sites push. All tiers are now purchasable
 * (isActive: true), so recommending Pro no longer dead-ends.
 */
function recommendPlan(_level: StoredUser['onboardingLevel']): PlanId {
  return 'aspirant'; // "Pro" — internal id stays 'aspirant' for DB/billing
}

/**
 * PR-34b (audit #42): merge the admin's live feature numbers (mockTests,
 * dailyMcq, etc.) into the static highlight bullets so the bullets reflect
 * what /admin/plans actually configured. Hindi/English copy stays
 * authored — the admin only edits the matrix.
 *
 * Don't over-engineer: only inject numbers where the bullet clearly
 * references that field (the "MCQ" line for dailyMcq, the "mock" line
 * for mockTests). "Unlimited" stays as-is so we don't flip an admin
 * change of -1 into a misleading literal. */
function highlightsFor(planId: PlanId, plan: Plan | undefined, lang: 'en' | 'hi'): string[] {
  // Prefer the LIVE admin-configured feature caps (plan.features) so the
  // bullets always match /admin/plans. The previous version read
  // `plan.dailyMcq` (a flat field the API never returns — it returns
  // `features.dailyMCQ`), so the injection was a silent no-op and the
  // authored numbers drifted from admin. Fall back to authored copy only
  // when the matrix is unavailable.
  const derived = planFeatureBullets(plan, lang);
  if (derived.length > 0) return derived;
  return PLAN_HIGHLIGHTS[planId][lang];
}

export default function PlanSelectionPage() {
  const ts = useTranslations('onboarding');
  const router = useRouter();
  // PR-32: read the assessment level + onboarding state from the shared
  // user store so the recommendation is computed without firing /me again.
  const { user: me, loading: meLoading, mutate } = useUser();
  const [plans, setPlans] = useState<Plan[]>([]);
  const [signupBonus, setSignupBonus] = useState(100);
  const [selected, setSelected] = useState<PlanId>('scholar');
  const [loadingPage, setLoadingPage] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  // Load the two pieces of data unique to this page (the live plan matrix
  // and the earn-rate table). The user record itself comes from the
  // shared store and was already fetched on dashboard mount.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [plansRes, balRes] = await Promise.all([
          api.getPlans(),
          api.getCreditsBalance(),
        ]);
        if (cancelled) return;
        setPlans(plansRes.plans);
        setSignupBonus(balRes.earnRates?.signup_verified ?? 100);
      } catch (e) {
        toast.error(e instanceof Error ? e.message : 'Failed to load plans');
        // On total failure we still allow the user through with a sensible
        // default, otherwise they'd be stuck mid-onboarding forever.
        setPlans([]);
      } finally {
        if (!cancelled) setLoadingPage(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  // Recommendation drives the initial selection so the page lands on
  // the path we want users to take, not on Free. Re-runs as soon as the
  // shared store delivers the user.
  useEffect(() => {
    if (!me) return;
    setSelected(recommendPlan(me.onboardingLevel));
  }, [me]);

  const lang = getClientLocale();

  const recommended: PlanId = useMemo(
    () => recommendPlan(me?.onboardingLevel ?? null),
    [me?.onboardingLevel],
  );

  // Plans visible to the user: free is always shown; paid tiers only if
  // the admin marks them isActive in /admin/plans (or comingSoon for
  // disabled-but-teased tiers).
  const visiblePlans = useMemo(() => {
    // Cheapest paid plan first, Free last — nudges users toward a paid tier
    // instead of defaulting their eye to Free at the top.
    const order: PlanId[] = ['scholar', 'aspirant', 'achiever', 'free'];
    return order
      .map((id) => plans.find((p) => p.id === id))
      .filter((p): p is Plan => !!p)
      .filter((p) => {
        // free always shown; paid tiers shown if active OR comingSoon
        if (p.id === 'free') return true;
        // The Plan type from the API doesn't expose isActive/comingSoon
        // (it's the public billing/plans response). Fall back to: show
        // anything we received from /v1/billing/plans -- the API filters
        // out fully hidden tiers via isActive logic on the server side
        // when needed. Today both Scholar and Aspirant come back; only
        // Scholar is purchasable.
        return true;
      });
  }, [plans]);

  const handleContinue = async () => {
    if (submitting) return;
    setSubmitting(true);
    try {
      // Always mark the plan-chosen flag BEFORE routing away. That way,
      // even if the user picks Scholar and bails out of /upgrade without
      // paying, they aren't bounced back here on the next dashboard load.
      await api.markPlanChosen(selected);
      // CRITICAL FIX (double-plan bug): patch the SHARED user store cache
      // immediately so the dashboard guard sees onboardingPlanChosen=true
      // on the very next render. Previously we only updated the server, but
      // the dashboard reads `me` from the sessionStorage-backed store —
      // which still had onboardingPlanChosen=false → it bounced the user
      // straight back to /onboarding/plan (the "plan page 2 baar" bug).
      mutate((prev) => (prev ? { ...prev, onboardingPlanChosen: true } : prev));
    } catch {
      // Don't block the user on a non-critical write -- they can still
      // complete onboarding; we'll retry the flag on a future write.
      // Optimistically flip the local flag anyway so they aren't bounced.
      mutate((prev) => (prev ? { ...prev, onboardingPlanChosen: true } : prev));
    }

    // If the selected plan is Coming Soon, treat it as Free selection —
    // don't route to /upgrade for a plan they can't buy yet.
    const selectedPlan = plans.find(p => p.id === selected);
    const isComingSoon = selectedPlan && ('comingSoon' in selectedPlan) && (selectedPlan as any).comingSoon;

    if (selected === 'free' || isComingSoon) {
      router.replace('/dashboard');
    } else {
      router.replace(`/upgrade?plan=${selected}`);
    }
  };

  if (loadingPage || meLoading) {
    return (
      <div className="flex flex-col items-center py-16">
        <AILoader context="general" />
        <p className="mt-4 text-sm text-muted-500">
          {lang === 'hi' ? 'प्लान्स लोड हो रहे हैं…' : 'Loading plans…'}
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center">
      <div className="pill">{ts('step', { current: 5, total: 5 })}</div>
      <div className="mt-4 flex w-full max-w-xs gap-1">
        {[1, 2, 3, 4, 5].map((s) => (
          <div key={s} className="h-1.5 flex-1 rounded-full bg-ember-500" />
        ))}
      </div>

      <h1 className="font-serif mt-8 text-center text-2xl font-semibold text-ink-900">
        {lang === 'hi' ? 'अपना प्लान चुनें' : 'Choose Your Plan'}
      </h1>
      {me?.onboardingLevel && (
        <p className="mt-2 text-center text-sm text-muted-500">
          {lang === 'hi' ? (
            <>आपका स्तर: <span className="font-medium text-ink-900 capitalize">{me.onboardingLevel === 'beginner' ? 'शुरुआती' : me.onboardingLevel === 'intermediate' ? 'मध्यम' : 'उन्नत'}</span></>
          ) : (
            <>Your assessment level: <span className="font-medium text-ink-900 capitalize">{me.onboardingLevel}</span></>
          )}
        </p>
      )}
      <p className="mt-1 text-center text-xs text-muted-400">
        {lang === 'hi'
          ? `आपको ${signupBonus} वेलकम क्रेडिट मिल चुके हैं`
          : `You've already received ${signupBonus} welcome credits`}
      </p>

      <div className="mt-8 w-full space-y-4">
        {visiblePlans.map((plan) => {
          const planId = plan.id as PlanId;
          const isSelected = selected === planId;
          const isRecommended = planId === recommended;
          // PR-34b (audit #42): inject admin-edited matrix counts (e.g.
          // dailyMcq) into the bullets so the displayed copy matches
          // whatever was configured in /admin/plans.
          const highlights = highlightsFor(planId, plan, lang === 'hi' ? 'hi' : 'en');

          return (
            <button
              key={planId}
              type="button"
              onClick={() => setSelected(planId)}
              className={`paper-card card-selectable relative w-full p-5 text-left transition-all ${
                isSelected ? 'card-selected ring-2 ring-amber-500' : ''
              }`}
            >
              {isRecommended && (
                <span className="absolute -top-2.5 left-4 rounded-full bg-ember-500 px-3 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-paper-50">
                  ⭐ {lang === 'hi' ? RECOMMENDED_BADGE.hi : RECOMMENDED_BADGE.en}
                </span>
              )}
              {('comingSoon' in plan) && (plan as any).comingSoon && !isRecommended && (
                <span className="absolute -top-2.5 right-4 rounded-full bg-paper-300 px-3 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-muted-600">
                  {lang === 'hi' ? 'जल्द आ रहा है' : 'Coming Soon'}
                </span>
              )}
              <div className="flex items-start gap-3">
                <span className="text-2xl">{PLAN_ICONS[planId]}</span>
                <div className="flex-1">
                  <div className="flex items-center justify-between">
                    <h3 className="text-lg font-semibold text-ink-900">
                      {lang === 'hi' ? plan.nameHi : plan.name}
                    </h3>
                    <div className="text-right">
                      {plan.price === 0 ? (
                        <span className="text-sm font-medium text-muted-500">
                          {lang === 'hi' ? 'मुफ़्त' : 'Free'}
                        </span>
                      ) : (
                        <div>
                          <span className="text-lg font-bold text-ink-900">₹{plan.price}</span>
                          <span className="text-xs text-muted-500">/mo</span>
                          {plan.yearlyPrice > 0 && (
                            <p className="text-[10px] text-muted-400 mt-0.5">
                              ₹{plan.yearlyPrice}/yr
                            </p>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                  <ul className="mt-3 space-y-1.5">
                    {highlights.map((h, i) => (
                      <li key={i} className="flex items-center gap-2 text-xs text-muted-600">
                        <svg className="h-3.5 w-3.5 flex-shrink-0 text-amber-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                        </svg>
                        {h}
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            </button>
          );
        })}
      </div>

      <button
        type="button"
        onClick={handleContinue}
        disabled={submitting}
        className="btn-primary mt-8 w-full disabled:opacity-60"
      >
        {submitting
          ? (lang === 'hi' ? 'सहेजा जा रहा है…' : 'Saving…')
          : selected === 'free'
            ? (lang === 'hi' ? 'मुफ़्त में शुरू करें' : 'Continue with Free')
            : (() => {
                const selectedPlan = plans.find(p => p.id === selected);
                const isComingSoon = selectedPlan && ('comingSoon' in selectedPlan) && (selectedPlan as any).comingSoon;
                if (isComingSoon) return lang === 'hi' ? 'जल्द आ रहा है — मुफ़्त में शुरू करें' : 'Coming Soon — Continue with Free';
                return lang === 'hi'
                  ? `${selectedPlan?.nameHi ?? ''} में अपग्रेड करें`
                  : `Upgrade to ${selectedPlan?.name ?? selected}`;
              })()}
      </button>

      <p className="mt-4 text-center text-[11px] leading-relaxed text-muted-400">
        {lang === 'hi'
          ? 'आप बाद में कभी भी प्रोफ़ाइल से प्लान बदल सकते हैं।'
          : 'You can change your plan anytime from your profile.'}
      </p>
    </div>
  );
}
