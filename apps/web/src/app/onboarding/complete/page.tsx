'use client';
import { useEffect, useState, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import type { AssessmentResult } from '~/lib/api';
import { api } from '~/lib/api';
import { AILoader } from '~/components/ui/AILoader';

function CreditCounter({ target }: { target: number }) {
  const [count, setCount] = useState(0);
  const [sparkle, setSparkle] = useState(false);
  const rafRef = useRef<number | null>(null);

  useEffect(() => {
    const duration = 2000; // 2 seconds
    const startTime = Date.now();

    const animate = () => {
      const elapsed = Date.now() - startTime;
      const progress = Math.min(elapsed / duration, 1);
      // Ease-out cubic
      const eased = 1 - Math.pow(1 - progress, 3);
      const current = Math.round(eased * target);
      setCount(current);

      if (progress < 1) {
        rafRef.current = requestAnimationFrame(animate);
      } else {
        setSparkle(true);
      }
    };

    rafRef.current = requestAnimationFrame(animate);
    return () => { if (rafRef.current) cancelAnimationFrame(rafRef.current); };
  }, [target]);

  return (
    <div className="relative inline-flex flex-col items-center">
      <span className={`font-serif text-5xl font-bold text-amber-500 transition-transform ${sparkle ? 'scale-110' : ''}`}>
        {count}
      </span>
      {sparkle && (
        <>
          <span className="absolute -top-2 -right-3 text-amber-500 animate-ping text-lg">✨</span>
          <span className="absolute -top-1 -left-3 text-amber-500 animate-ping text-sm" style={{ animationDelay: '150ms' }}>✨</span>
          <span className="absolute -bottom-1 right-0 text-amber-500 animate-ping text-base" style={{ animationDelay: '300ms' }}>✨</span>
        </>
      )}
      <span className="mt-1 text-xs font-medium text-stone-200 uppercase tracking-wider">credits</span>
    </div>
  );
}

export default function CompletePage() {
  const t = useTranslations('onboarding.complete');
  const ts = useTranslations('onboarding');
  const router = useRouter();
  const [result, setResult] = useState<AssessmentResult | null>(null);
  const [pageLoading, setPageLoading] = useState(true);
  const [referralBonus, setReferralBonus] = useState<number | null>(null);

  useEffect(() => {
    try {
      const s = sessionStorage.getItem('nexigrate-assessment-result');
      if (s) {
        const parsed = JSON.parse(s) as AssessmentResult;
        setResult(parsed);
        sessionStorage.removeItem('nexigrate-assessment-result');
      }
    } catch (e) {
      console.error('Failed to parse assessment result:', e);
    } finally {
      setPageLoading(false);
    }

    // Apply pending referral code if exists
    const pendingRef = localStorage.getItem('pendingReferral');
    if (pendingRef) {
      localStorage.removeItem('pendingReferral');
      api.applyReferral(pendingRef).then(res => {
        if (res.success && res.bonusCredits) {
          setReferralBonus(res.bonusCredits);
        }
      }).catch(() => {});
      // Also complete the referral to award the referrer
      api.completeReferral().catch(() => {});
    }
  }, []);

  const lang = typeof window !== 'undefined' ? (() => {
    const m = document.cookie.match(/nexigrate-language=(en|hi)/);
    if (m) return m[1] as 'en' | 'hi';
    return (localStorage.getItem('nexigrate-language') as 'en'|'hi') || 'en';
  })() : 'en';

  if (pageLoading) {
    return (
      <div className="flex flex-col items-center justify-center py-24">
        <AILoader context="general" />
        <p className="mt-3 text-sm text-muted-500">Loading results...</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center">
      <div className="pill">{ts('step', { current: 5, total: 5 })}</div>
      <div className="mt-4 flex w-full max-w-xs gap-1">{[1,2,3,4,5].map(s => <div key={s} className="h-1.5 flex-1 rounded-full bg-ember-500" />)}</div>
      <div className="mt-12 text-center">
        <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-paper-200 border border-gold-500">
          <svg className="h-8 w-8 text-gold-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>
        </div>
        <h1 className="font-serif mt-6 text-2xl font-semibold text-ink-900">{t('title')}</h1>

        {/* Animated Credit Counter */}
        <div className="mt-6 flex justify-center">
          <div className="rounded-2xl bg-stone-900 border border-amber-500/30 px-8 py-6">
            <CreditCounter target={100} />
          </div>
        </div>

        {/* Welcome message */}
        <div className="mt-5 px-4">
          {lang === 'hi' ? (
            <p className="text-sm font-medium text-ink-800 leading-relaxed">
              🎉 Nexigrate में आपका स्वागत है! आपको 100 क्रेडिट्स मिले हैं।
            </p>
          ) : (
            <p className="text-sm font-medium text-ink-800 leading-relaxed">
              🎉 Welcome to Nexigrate! You&apos;ve received 100 credits.
            </p>
          )}
        </div>

        {result && (<>
          <p className="mt-4 text-lg text-ink-800">{t('score', { score: result.score, total: result.total })}</p>
          <p className="mt-2 text-xl font-bold text-ember-600">{t('level', { level: t(result.level) })}</p>
          <p className="mt-4 text-sm text-muted-500 leading-relaxed">{lang === 'hi' ? result.messageHi : result.message}</p>
        </>)}
      </div>
      <button type="button" onClick={() => router.replace('/onboarding/plan')} className="btn-primary mt-10 w-full">{t('startLearning')}</button>
      {referralBonus && (
        <div className="mt-4 rounded-xl bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-800 p-4 text-center">
          <p className="text-sm font-medium text-amber-700 dark:text-amber-400">🎉 Referral applied! You got {referralBonus} bonus credits</p>
        </div>
      )}
    </div>
  );
}
