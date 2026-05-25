'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';
import { EXAMS, EXAM_CATEGORY_LABELS } from '@nexigrate/shared';
import { api } from '~/lib/api';

export default function ExamPage() {
  const t = useTranslations('onboarding.exam');
  const ts = useTranslations('onboarding');
  const tc = useTranslations('common');
  const router = useRouter();
  const [selected, setSelected] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  // Group exams by category
  const categories = new Map<string, typeof EXAMS[number][]>();
  for (const exam of EXAMS) {
    const existing = categories.get(exam.category) ?? [];
    existing.push(exam);
    categories.set(exam.category, existing);
  }

  const handleSubmit = async () => {
    if (!selected) {
      toast.error('Please select an exam');
      return;
    }
    setSaving(true);
    try {
      await api.saveOnboarding({ targetExam: selected });
      router.push('/onboarding/assessment');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to save');
      setSaving(false);
    }
  };

  return (
    <div className="flex flex-col items-center">
      {/* Progress */}
      <p className="text-xs font-medium text-slate-500 dark:text-slate-400">
        {ts('step', { current: 3, total: 5 })}
      </p>
      <div className="mt-2 h-1.5 w-full max-w-xs overflow-hidden rounded-full bg-slate-200 dark:bg-slate-700">
        <div className="h-full w-[60%] rounded-full bg-amber-500 transition-all" />
      </div>

      <h1 className="mt-8 text-center text-2xl font-bold text-slate-900 dark:text-white">
        {t('title')}
      </h1>
      <p className="mt-2 text-center text-sm text-slate-500 dark:text-slate-400">
        {t('subtitle')}
      </p>

      <div className="mt-8 w-full space-y-6">
        {Array.from(categories.entries()).map(([category, exams]) => (
          <div key={category}>
            <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
              {EXAM_CATEGORY_LABELS[category as keyof typeof EXAM_CATEGORY_LABELS] ?? category}
            </h3>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              {exams.map((exam) => (
                <button
                  key={exam.id}
                  type="button"
                  onClick={() => setSelected(exam.id)}
                  className={`rounded-lg border px-3 py-3 text-left text-sm font-medium transition-all ${
                    selected === exam.id
                      ? 'border-amber-500 bg-amber-50 text-amber-700 ring-2 ring-amber-500/20 dark:bg-amber-500/10 dark:text-amber-400'
                      : 'border-slate-200 text-slate-700 hover:border-slate-300 dark:border-slate-700 dark:text-slate-300 dark:hover:border-slate-600'
                  }`}
                >
                  {exam.name}
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>

      <button
        type="button"
        onClick={handleSubmit}
        disabled={!selected || saving}
        className="btn-primary mt-8 w-full"
      >
        {saving ? tc('loading') : tc('next')}
      </button>
    </div>
  );
}
