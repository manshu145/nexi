'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { PLANS, type PlanId } from '@nexigrate/shared';

const PLAN_ORDER: PlanId[] = ['free', 'scholar', 'aspirant'];

const PLAN_ICONS: Record<PlanId, string> = {
  free: '🆓',
  scholar: '📚',
  aspirant: '🚀',
  achiever: '🏆',
};

const PLAN_HIGHLIGHTS: Record<PlanId, string[]> = {
  free: ['10 daily MCQs', '2 chapters/day', '100 credits to start'],
  scholar: ['Unlimited chapters & MCQs', 'AI Tutor access', 'Current Affairs', 'No credit deduction'],
  aspirant: ['Everything in Scholar', 'Advanced analytics', 'Priority support'],
  achiever: ['Everything in Aspirant', 'Essay grading', '1-on-1 mentorship'],
};

export default function PlanSelectionPage() {
  const ts = useTranslations('onboarding');
  const router = useRouter();
  const [selected, setSelected] = useState<PlanId>('free');

  const handleContinue = () => {
    if (selected === 'free') {
      router.replace('/dashboard');
    } else {
      // For paid plans, redirect to upgrade page with plan pre-selected
      router.replace(`/upgrade?plan=${selected}`);
    }
  };

  const lang = typeof window !== 'undefined' ? (() => {
    const m = document.cookie.match(/nexigrate-language=(en|hi)/);
    if (m) return m[1] as 'en' | 'hi';
    return (localStorage.getItem('nexigrate-language') as 'en' | 'hi') || 'en';
  })() : 'en';

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
      <p className="mt-2 text-center text-sm text-muted-500">
        {lang === 'hi'
          ? 'आप बाद में कभी भी अपग्रेड कर सकते हैं'
          : 'You can always upgrade later from your profile'}
      </p>

      <div className="mt-8 w-full space-y-4">
        {PLAN_ORDER.map((planId) => {
          const plan = PLANS[planId];
          const isSelected = selected === planId;
          const highlights = PLAN_HIGHLIGHTS[planId];

          return (
            <button
              key={planId}
              type="button"
              onClick={() => setSelected(planId)}
              className={`paper-card card-selectable w-full p-5 text-left transition-all ${
                isSelected ? 'card-selected ring-2 ring-amber-500' : ''
              }`}
            >
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
                        </div>
                      )}
                    </div>
                  </div>
                  {plan.comingSoon && (
                    <span className="mt-1 inline-block rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-medium text-amber-700">
                      Coming Soon
                    </span>
                  )}
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
        className="btn-primary mt-8 w-full"
      >
        {selected === 'free'
          ? (lang === 'hi' ? 'मुफ़्त में शुरू करें' : 'Continue with Free')
          : (lang === 'hi' ? 'अपग्रेड करें' : `Upgrade to ${PLANS[selected].name}`)}
      </button>

      {selected !== 'free' && (
        <button
          type="button"
          onClick={() => router.replace('/dashboard')}
          className="btn-ghost mt-3 w-full text-sm"
        >
          {lang === 'hi' ? 'बाद में, मुफ़्त में जारी रखें' : 'Maybe later, continue with Free'}
        </button>
      )}
    </div>
  );
}
