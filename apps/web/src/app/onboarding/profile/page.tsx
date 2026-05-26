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
    if (!name.trim() || !dob || !phone.trim()) { toast.error('Please fill required fields'); return; }
    setSaving(true);
    try { await api.saveOnboarding({ name: name.trim(), dob, phone: phone.trim(), school: school.trim() || undefined, aim: aim.trim() || undefined }); router.push('/onboarding/exam'); }
    catch (err) { toast.error(err instanceof Error ? err.message : 'Failed to save'); setSaving(false); }
  };

  return (
    <div className="flex flex-col items-center">
      <div className="pill">{ts('step', { current: 2, total: 5 })}</div>
      <div className="mt-4 flex w-full max-w-xs gap-1">{[1,2,3,4,5].map(s => <div key={s} className={`h-1.5 flex-1 rounded-full ${s <= 2 ? 'bg-ember-500' : 'bg-paper-300'}`} />)}</div>
      <h1 className="font-serif mt-8 text-center text-2xl font-semibold text-ink-900 dark:text-paper-50">{t('title')}</h1>
      <p className="mt-2 text-center text-sm text-muted-500">{t('subtitle')}</p>
      <form onSubmit={handleSubmit} className="mt-8 w-full space-y-4">
        <div><label className="mb-1 block text-sm font-medium text-ink-800 dark:text-paper-200">{t('name')} *</label><input type="text" value={name} onChange={(e) => setName(e.target.value)} className="input" required /></div>
        <div><label className="mb-1 block text-sm font-medium text-ink-800 dark:text-paper-200">{t('dob')} *</label><input type="date" value={dob} onChange={(e) => setDob(e.target.value)} className="input" required /></div>
        <div><label className="mb-1 block text-sm font-medium text-ink-800 dark:text-paper-200">{t('phone')} *</label><input type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+91 98765 43210" className="input" required /></div>
        <div><label className="mb-1 block text-sm font-medium text-ink-800 dark:text-paper-200">{t('school')}</label><input type="text" value={school} onChange={(e) => setSchool(e.target.value)} className="input" /></div>
        <div><label className="mb-1 block text-sm font-medium text-ink-800 dark:text-paper-200">{t('aim')}</label><input type="text" value={aim} onChange={(e) => setAim(e.target.value)} placeholder={t('aimPlaceholder')} className="input" /></div>
        <div className="flex gap-3 pt-2"><button type="button" onClick={() => router.back()} className="btn-ghost flex-1">{tc('back')}</button><button type="submit" disabled={saving} className="btn-primary flex-1">{saving ? tc('loading') : tc('next')}</button></div>
      </form>
    </div>
  );
}
