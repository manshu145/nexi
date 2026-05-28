'use client';
import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';
import { api } from '~/lib/api';
import { useAuth } from '~/lib/auth-context';

type Gender = 'male' | 'female' | 'prefer-not-to-say';

export default function ProfilePage() {
  const t = useTranslations('onboarding.profile');
  const ts = useTranslations('onboarding');
  const tc = useTranslations('common');
  const router = useRouter();
  const { user } = useAuth();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [dob, setDob] = useState('');
  const [gender, setGender] = useState<Gender | ''>('');
  const [school, setSchool] = useState('');
  const [aim, setAim] = useState('');
  const [saving, setSaving] = useState(false);

  // Determine if user signed up via phone (no email from Firebase)
  const isPhoneUser = user?.providerData?.[0]?.providerId === 'phone';
  const hasEmail = !!user?.email;

  // Pre-fill email if user already has one from Google signup
  useEffect(() => {
    if (user?.email) setEmail(user.email);
    if (user?.displayName && !name) setName(user.displayName);
  }, [user]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !dob) { toast.error('Please fill required fields'); return; }
    if (isPhoneUser && !hasEmail && !email.trim()) { toast.error('Email is required'); return; }
    if (email.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) { toast.error('Please enter a valid email'); return; }
    setSaving(true);
    try {
      const data: Record<string, unknown> = {
        name: name.trim(),
        dob,
        school: school.trim() || undefined,
        aim: aim.trim() || undefined,
        gender: gender || undefined,
      };
      // Include email for phone users who don't have one
      if (isPhoneUser && !hasEmail && email.trim()) {
        data.email = email.trim();
      }
      await api.saveOnboarding(data);
      router.push('/onboarding/exam');
    }
    catch (err) { toast.error(err instanceof Error ? err.message : 'Failed to save'); setSaving(false); }
  };

  const genderOptions: { value: Gender; label: string }[] = [
    { value: 'male', label: 'Male' },
    { value: 'female', label: 'Female' },
    { value: 'prefer-not-to-say', label: 'Prefer not to say' },
  ];

  return (
    <div className="flex flex-col items-center">
      <div className="pill">{ts('step', { current: 2, total: 5 })}</div>
      <div className="mt-4 flex w-full max-w-xs gap-1">{[1,2,3,4,5].map(s => <div key={s} className={`h-1.5 flex-1 rounded-full ${s <= 2 ? 'bg-ember-500' : 'bg-paper-300'}`} />)}</div>
      <h1 className="font-serif mt-8 text-center text-2xl font-semibold text-ink-900">{t('title')}</h1>
      <p className="mt-2 text-center text-sm text-muted-500">{t('subtitle')}</p>
      <form onSubmit={handleSubmit} className="mt-8 w-full space-y-4">
        <div><label className="mb-1 block text-sm font-medium text-ink-800">{t('name')} *</label><input type="text" value={name} onChange={(e) => setName(e.target.value)} className="input" required /></div>
        {/* Email field — required for phone signup users */}
        {isPhoneUser && !hasEmail && (
          <div>
            <label className="mb-1 block text-sm font-medium text-ink-800">Email *</label>
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} className="input" required placeholder="your@email.com" />
            <p className="mt-1 text-xs text-muted-500">Required for account recovery & notifications</p>
          </div>
        )}
        <div><label className="mb-1 block text-sm font-medium text-ink-800">{t('dob')} *</label><input type="date" value={dob} onChange={(e) => setDob(e.target.value)} className="input" required /></div>
        <div>
          <label className="mb-2 block text-sm font-medium text-ink-800">Gender</label>
          <div className="flex gap-2">
            {genderOptions.map((opt) => (
              <button
                key={opt.value}
                type="button"
                onClick={() => setGender(opt.value)}
                className={`flex-1 rounded-full px-3 py-2 text-xs font-semibold transition-colors ${
                  gender === opt.value
                    ? 'bg-amber-500 text-stone-900'
                    : 'bg-stone-800 text-stone-50'
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>
        <div><label className="mb-1 block text-sm font-medium text-ink-800">{t('school')}</label><input type="text" value={school} onChange={(e) => setSchool(e.target.value)} className="input" /></div>
        <div><label className="mb-1 block text-sm font-medium text-ink-800">{t('aim')}</label><input type="text" value={aim} onChange={(e) => setAim(e.target.value)} placeholder={t('aimPlaceholder')} className="input" /></div>
        <div className="flex gap-3 pt-2"><button type="button" onClick={() => router.back()} className="btn-ghost flex-1">{tc('back')}</button><button type="submit" disabled={saving} className="btn-primary flex-1">{saving ? tc('loading') : tc('next')}</button></div>
      </form>
    </div>
  );
}
