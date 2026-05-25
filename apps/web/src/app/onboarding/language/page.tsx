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
    try { await api.saveOnboarding({ language }); localStorage.setItem('nexigrate-language', language); router.push('/onboarding/profile'); }
    catch (err) { toast.error(err instanceof Error ? err.message : 'Failed to save'); setSaving(false); }
  };

  return (
    <div className="flex flex-col items-center">
      <div className="pill">{ts('step', { current: 1, total: 5 })}</div>
      <div className="mt-4 flex w-full max-w-xs gap-1">{[1,2,3,4,5].map(s => <div key={s} className={`h-1.5 flex-1 rounded-full ${s <= 1 ? 'bg-ember-500' : 'bg-paper-300'}`} />)}</div>
      <h1 className="font-serif mt-8 text-center text-2xl font-semibold text-ink-900">{t('title')}</h1>
      <p className="mt-2 text-center text-sm text-muted-500">{t('subtitle')}</p>
      <div className="mt-8 grid w-full gap-4 sm:grid-cols-2">
        <button type="button" onClick={() => handleSelect('en')} disabled={saving} className="paper-card card-selectable p-8 text-center">
          <p className="text-3xl font-bold text-ink-900">Aa</p>
          <p className="mt-3 text-lg font-semibold text-ink-800">{t('english')}</p>
        </button>
        <button type="button" onClick={() => handleSelect('hi')} disabled={saving} className="paper-card card-selectable p-8 text-center">
          <p className="text-3xl font-bold text-ink-900">अ</p>
          <p className="mt-3 text-lg font-semibold text-ink-800">{t('hindi')}</p>
        </button>
      </div>
    </div>
  );
}
