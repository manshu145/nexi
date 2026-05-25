'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';
import { api } from '~/lib/api';

export default function LanguagePage() {
  const t = useTranslations('onboarding.language');
  const ts = useTranslations('onboarding');
  const router = useRouter();
  const [saving, setSaving] = useState(false);

  const handleSelect = async (language: 'en' | 'hi') => {
    setSaving(true);
    try {
      await api.saveOnboarding({ language });
      localStorage.setItem('nexigrate-language', language);
      router.push('/onboarding/profile');
    } catch (err) { toast.error(err instanceof Error ? err.message : 'Failed to save'); setSaving(false); }
  };

  return (
    <div className="flex flex-col items-center">
      <p className="text-xs font-medium text-slate-500 dark:text-slate-400">{ts('step', { current: 1, total: 5 })}</p>
      <div className="mt-2 h-1.5 w-full max-w-xs overflow-hidden rounded-full bg-slate-200 dark:bg-slate-700"><div className="h-full w-[20%] rounded-full bg-amber-500" /></div>
      <h1 className="mt-8 text-center text-2xl font-bold text-slate-900 dark:text-white">{t('title')}</h1>
      <p className="mt-2 text-center text-sm text-slate-500 dark:text-slate-400">{t('subtitle')}</p>
      <div className="mt-8 grid w-full gap-4 sm:grid-cols-2">
        <button type="button" onClick={() => handleSelect('en')} disabled={saving} className="card cursor-pointer p-8 text-center transition-all hover:border-amber-500 hover:ring-2 hover:ring-amber-500/20 active:scale-[0.98]">
          <p className="text-3xl font-bold text-slate-900 dark:text-white">Aa</p>
          <p className="mt-3 text-lg font-semibold text-slate-700 dark:text-slate-200">{t('english')}</p>
        </button>
        <button type="button" onClick={() => handleSelect('hi')} disabled={saving} className="card cursor-pointer p-8 text-center transition-all hover:border-amber-500 hover:ring-2 hover:ring-amber-500/20 active:scale-[0.98]">
          <p className="text-3xl font-bold text-slate-900 dark:text-white">अ</p>
          <p className="mt-3 text-lg font-semibold text-slate-700 dark:text-slate-200">{t('hindi')}</p>
        </button>
      </div>
    </div>
  );
}
