'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';
import { api } from '~/lib/api';

export default function ProfilePage() {
  const t = useTranslations('onboarding.profile');
  const ts = useTranslations('onboarding');
  const tc = useTranslations('common');
  const router = useRouter();

  const [name, setName] = useState('');
  const [dob, setDob] = useState('');
  const [phone, setPhone] = useState('');
  const [school, setSchool] = useState('');
  const [aim, setAim] = useState('');
  const [saving, setSaving] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      toast.error('Name is required');
      return;
    }
    if (!dob) {
      toast.error('Date of birth is required');
      return;
    }
    if (!phone.trim()) {
      toast.error('Mobile number is required');
      return;
    }

    setSaving(true);
    try {
      await api.saveOnboarding({
        name: name.trim(),
        dob,
        phone: phone.trim(),
        school: school.trim() || undefined,
        aim: aim.trim() || undefined,
      });
      router.push('/onboarding/exam');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to save');
      setSaving(false);
    }
  };

  return (
    <div className="flex flex-col items-center">
      {/* Progress */}
      <p className="text-xs font-medium text-slate-500 dark:text-slate-400">
        {ts('step', { current: 2, total: 5 })}
      </p>
      <div className="mt-2 h-1.5 w-full max-w-xs overflow-hidden rounded-full bg-slate-200 dark:bg-slate-700">
        <div className="h-full w-[40%] rounded-full bg-amber-500 transition-all" />
      </div>

      <h1 className="mt-8 text-center text-2xl font-bold text-slate-900 dark:text-white">
        {t('title')}
      </h1>
      <p className="mt-2 text-center text-sm text-slate-500 dark:text-slate-400">
        {t('subtitle')}
      </p>

      <form onSubmit={handleSubmit} className="mt-8 w-full space-y-4">
        <div>
          <label className="mb-1 block text-sm font-medium text-slate-700 dark:text-slate-300">
            {t('name')} *
          </label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="input"
            required
          />
        </div>

        <div>
          <label className="mb-1 block text-sm font-medium text-slate-700 dark:text-slate-300">
            {t('dob')} *
          </label>
          <input
            type="date"
            value={dob}
            onChange={(e) => setDob(e.target.value)}
            className="input"
            required
          />
        </div>

        <div>
          <label className="mb-1 block text-sm font-medium text-slate-700 dark:text-slate-300">
            {t('phone')} *
          </label>
          <input
            type="tel"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            placeholder="+91 98765 43210"
            className="input"
            required
          />
        </div>

        <div>
          <label className="mb-1 block text-sm font-medium text-slate-700 dark:text-slate-300">
            {t('school')}
          </label>
          <input
            type="text"
            value={school}
            onChange={(e) => setSchool(e.target.value)}
            className="input"
          />
        </div>

        <div>
          <label className="mb-1 block text-sm font-medium text-slate-700 dark:text-slate-300">
            {t('aim')}
          </label>
          <input
            type="text"
            value={aim}
            onChange={(e) => setAim(e.target.value)}
            placeholder={t('aimPlaceholder')}
            className="input"
          />
        </div>

        <button
          type="submit"
          disabled={saving}
          className="btn-primary mt-6 w-full"
        >
          {saving ? tc('loading') : tc('next')}
        </button>
      </form>
    </div>
  );
}
