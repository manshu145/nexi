'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';
import { EXAMS } from '@nexigrate/shared';
import { api } from '~/lib/api';

const CAT_LABELS: Record<string, string> = { 'school': 'School (Class 8-12)', 'engineering': 'Engineering', 'medical': 'Medical', 'civil-services': 'Civil Services & SSC', 'banking': 'Banking', 'defence': 'Defence', 'state': 'State Exams' };

export default function ExamPage() {
  const t = useTranslations('onboarding.exam');
  const ts = useTranslations('onboarding');
  const tc = useTranslations('common');
  const router = useRouter();
  const [selected, setSelected] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const categories = new Map<string, typeof EXAMS[number][]>();
  for (const exam of EXAMS) { const arr = categories.get(exam.category) ?? []; arr.push(exam); categories.set(exam.category, arr); }

  const handleSubmit = async () => {
    if (!selected) { toast.error('Please select an exam'); return; }
    setSaving(true);
    try { await api.saveOnboarding({ targetExam: selected }); router.push('/onboarding/assessment'); }
    catch (err) { toast.error(err instanceof Error ? err.message : 'Failed'); setSaving(false); }
  };

  return (
    <div className="flex flex-col items-center">
      <div className="pill">{ts('step', { current: 3, total: 5 })}</div>
      <div className="mt-4 flex w-full max-w-xs gap-1">{[1,2,3,4,5].map(s => <div key={s} className={`h-1.5 flex-1 rounded-full ${s <= 3 ? 'bg-ember-500' : 'bg-paper-300'}`} />)}</div>
      <h1 className="font-serif mt-8 text-center text-2xl font-semibold text-ink-900 dark:text-paper-50">{t('title')}</h1>
      <p className="mt-2 text-center text-sm text-muted-500">{t('subtitle')}</p>
      <div className="mt-8 w-full space-y-6">
        {Array.from(categories.entries()).map(([cat, exams]) => (
          <div key={cat}>
            <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-500">{CAT_LABELS[cat] ?? cat}</h3>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              {exams.map((ex) => (
                <button key={ex.id} type="button" onClick={() => setSelected(ex.id)} className={`paper-card card-selectable px-3 py-3 text-left text-sm font-medium ${selected === ex.id ? 'card-selected' : ''}`}>{ex.name}</button>
              ))}
            </div>
          </div>
        ))}
      </div>
      <div className="mt-8 flex w-full gap-3"><button type="button" onClick={() => router.back()} className="btn-ghost flex-1">{tc('back')}</button><button type="button" onClick={handleSubmit} disabled={!selected || saving} className="btn-primary flex-1">{saving ? tc('loading') : tc('next')}</button></div>
    </div>
  );
}
