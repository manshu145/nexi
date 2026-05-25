'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import type { AssessmentResult } from '~/lib/api';

export default function CompletePage() {
  const t = useTranslations('onboarding.complete');
  const ts = useTranslations('onboarding');
  const router = useRouter();
  const [result, setResult] = useState<AssessmentResult | null>(null);

  useEffect(() => {
    const stored = sessionStorage.getItem('nexigrate-assessment-result');
    if (stored) { setResult(JSON.parse(stored) as AssessmentResult); sessionStorage.removeItem('nexigrate-assessment-result'); }
  }, []);

  const language = typeof window !== 'undefined' ? (localStorage.getItem('nexigrate-language') as 'en' | 'hi') || 'en' : 'en';
  const levelLabel = result ? t(result.level as 'beginner' | 'intermediate' | 'advanced') : '';
  const levelColor = { beginner: 'text-blue-600 dark:text-blue-400', intermediate: 'text-amber-600 dark:text-amber-400', advanced: 'text-green-600 dark:text-green-400' };

  return (
    <div className="flex flex-col items-center">
      <p className="text-xs font-medium text-slate-500 dark:text-slate-400">{ts('step', { current: 5, total: 5 })}</p>
      <div className="mt-2 h-1.5 w-full max-w-xs overflow-hidden rounded-full bg-slate-200 dark:bg-slate-700"><div className="h-full w-full rounded-full bg-amber-500" /></div>
      <div className="mt-12 text-center">
        <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-green-100 dark:bg-green-900/30">
          <svg className="h-8 w-8 text-green-600 dark:text-green-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>
        </div>
        <h1 className="mt-6 text-2xl font-bold text-slate-900 dark:text-white">{t('title')}</h1>
        {result && (
          <>
            <p className="mt-4 text-lg text-slate-700 dark:text-slate-300">{t('score', { score: result.score, total: result.total })}</p>
            <p className={`mt-2 text-xl font-bold ${levelColor[result.level]}`}>{t('level', { level: levelLabel })}</p>
            <p className="mt-4 text-sm text-slate-500 dark:text-slate-400 leading-relaxed">{language === 'hi' ? result.messageHi : result.message}</p>
          </>
        )}
      </div>
      <button type="button" onClick={() => router.replace('/dashboard')} className="btn-primary mt-10 w-full">{t('startLearning')}</button>
    </div>
  );
}
