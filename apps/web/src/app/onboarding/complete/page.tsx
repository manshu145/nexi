'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import type { AssessmentResult } from '~/lib/api';
import { AILoader } from '~/components/ui/AILoader';

export default function CompletePage() {
  const t = useTranslations('onboarding.complete');
  const ts = useTranslations('onboarding');
  const router = useRouter();
  const [result, setResult] = useState<AssessmentResult | null>(null);
  const [pageLoading, setPageLoading] = useState(true);

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
        <h1 className="font-serif mt-6 text-2xl font-semibold text-ink-900 dark:text-paper-50">{t('title')}</h1>
        {result && (<>
          <p className="mt-4 text-lg text-ink-800 dark:text-paper-200">{t('score', { score: result.score, total: result.total })}</p>
          <p className="mt-2 text-xl font-bold text-ember-600">{t('level', { level: t(result.level) })}</p>
          <p className="mt-4 text-sm text-muted-500 leading-relaxed">{lang === 'hi' ? result.messageHi : result.message}</p>
        </>)}
      </div>
      <button type="button" onClick={() => router.replace('/dashboard')} className="btn-primary mt-10 w-full">{t('startLearning')}</button>
    </div>
  );
}
