'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { EXAMS, CLASS_LEVELS, BOARDS, type ExamSlug } from '@nexigrate/shared';
import { Logo } from '~/components/Logo';
import { useAuth } from '~/lib/auth-context';
import { api, type MeResponse } from '~/lib/api';
import { useTranslation } from '~/lib/useTranslation';

const LIVE_EXAMS = EXAMS.filter((e) => e.status === 'live');
const INDIAN_STATES = [
  'Andhra Pradesh', 'Arunachal Pradesh', 'Assam', 'Bihar', 'Chhattisgarh',
  'Delhi', 'Goa', 'Gujarat', 'Haryana', 'Himachal Pradesh', 'Jharkhand',
  'Karnataka', 'Kerala', 'Madhya Pradesh', 'Maharashtra', 'Manipur',
  'Meghalaya', 'Mizoram', 'Nagaland', 'Odisha', 'Punjab', 'Rajasthan',
  'Sikkim', 'Tamil Nadu', 'Telangana', 'Tripura', 'Uttar Pradesh',
  'Uttarakhand', 'West Bengal', 'Jammu & Kashmir', 'Ladakh',
];

export default function ProfilePage() {
  const { user, loading } = useAuth();
  const router = useRouter();
  const { t, lang } = useTranslation();
  const [me, setMe] = useState<MeResponse['user'] | null>(null);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Editable fields
  const [name, setName] = useState('');
  const [aim, setAim] = useState('');
  const [classLevel, setClassLevel] = useState('');
  const [board, setBoard] = useState('');
  const [schoolName, setSchoolName] = useState('');
  const [district, setDistrict] = useState('');
  const [state, setState] = useState('');
  const [targetExam, setTargetExam] = useState<ExamSlug | string>('');

  useEffect(() => {
    if (!loading && !user) router.replace('/signin');
  }, [user, loading, router]);

  useEffect(() => {
    if (!user) return;
    (async () => {
      try {
        const res = await api.me();
        setMe(res.user);
        // Pre-fill fields
        setName(res.user.name ?? '');
        setTargetExam(res.user.targetExam ?? '');
      } catch (e) {
        setError('Failed to load profile');
      }
    })();
  }, [user]);

  async function handleSave() {
    setSaving(true);
    setError(null);
    setSuccess(false);
    try {
      await api.setOnboarding({
        name: name || me?.name || 'Student',
        targetExam: targetExam || me?.targetExam || null,
        classLevel: classLevel || null,
        board: board || null,
        schoolName: schoolName || null,
        district: district || null,
        state: state || null,
        aim: aim || null,
        onboardingVersion: 2,
      });
      setSuccess(true);
      setEditing(false);
      // Reload profile
      const res = await api.me();
      setMe(res.user);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to save');
    } finally {
      setSaving(false);
    }
  }

  if (loading || !user || !me) {
    return (
      <main className="flex min-h-dvh items-center justify-center bg-paper-100">
        <span className="spinner" />
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-lg px-5 pt-6 pb-28 min-h-dvh">
      <header className="flex items-center justify-between mb-6">
        <Logo />
        <Link href="/dashboard" className="text-sm text-ember-600 hover:underline font-medium">
          {t('nexi.dashboard', 'Dashboard')}
        </Link>
      </header>

      <h1 className="font-serif text-2xl font-bold text-ink-900">
        {lang === 'hi' ? 'प्रोफ़ाइल' : 'Profile'}
      </h1>

      {success && (
        <div className="mt-4 rounded-lg border border-green-200 bg-green-50 p-3 text-sm text-green-800">
          {lang === 'hi' ? 'प्रोफ़ाइल सहेजा गया!' : 'Profile saved!'}
        </div>
      )}
      {error && <div className="banner banner-error mt-4">{error}</div>}

      {/* Profile view */}
      {!editing ? (
        <section className="mt-6 space-y-4">
          <div className="paper-card p-5">
            <div className="flex items-center gap-4">
              <div className="h-14 w-14 rounded-full bg-gradient-to-br from-ember-500 to-gold-500 flex items-center justify-center text-white font-bold text-xl">
                {(me.name ?? 'S').charAt(0).toUpperCase()}
              </div>
              <div>
                <p className="font-serif text-lg font-semibold text-ink-900">{me.name ?? 'Student'}</p>
                <p className="text-sm text-muted-500">{me.email}</p>
              </div>
            </div>
          </div>

          <div className="paper-card p-5 space-y-3">
            <ProfileRow label={lang === 'hi' ? 'परीक्षा' : 'Target Exam'} value={me.targetExam ? EXAMS.find(e => e.id === me.targetExam)?.name ?? me.targetExam : '—'} />
            <ProfileRow label={lang === 'hi' ? 'स्ट्रीक' : 'Current Streak'} value={`${me.currentStreak ?? 0} days`} />
            <ProfileRow label={lang === 'hi' ? 'बेस्ट स्ट्रीक' : 'Best Streak'} value={`${me.bestStreak ?? 0} days`} />
            <ProfileRow label={lang === 'hi' ? 'सत्यापित' : 'Verified'} value={me.isVerified ? 'Yes' : 'No'} />
          </div>

          <button onClick={() => setEditing(true)} className="btn-primary w-full">
            {lang === 'hi' ? 'प्रोफ़ाइल संपादित करें' : 'Edit Profile'}
          </button>
        </section>
      ) : (
        <section className="mt-6 space-y-4">
          <div className="paper-card p-5 space-y-4">
            <div>
              <label className="block text-sm font-medium text-ink-800 mb-1">{lang === 'hi' ? 'नाम' : 'Name'}</label>
              <input type="text" className="input" value={name} onChange={e => setName(e.target.value)} />
            </div>
            <div>
              <label className="block text-sm font-medium text-ink-800 mb-1">{lang === 'hi' ? 'लक्ष्य' : 'Career Aim'}</label>
              <input type="text" className="input" value={aim} onChange={e => setAim(e.target.value)} placeholder="e.g. IAS Officer" />
            </div>
            <div>
              <label className="block text-sm font-medium text-ink-800 mb-1">{lang === 'hi' ? 'परीक्षा' : 'Target Exam'}</label>
              <select className="input" value={targetExam} onChange={e => setTargetExam(e.target.value)}>
                <option value="">Select...</option>
                {LIVE_EXAMS.map(ex => <option key={ex.id} value={ex.id}>{ex.name}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-ink-800 mb-1">{lang === 'hi' ? 'कक्षा' : 'Class'}</label>
              <select className="input" value={classLevel} onChange={e => setClassLevel(e.target.value)}>
                <option value="">Select...</option>
                {CLASS_LEVELS.map(cl => <option key={cl} value={cl}>{cl.replace('-', ' ')}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-ink-800 mb-1">{lang === 'hi' ? 'बोर्ड' : 'Board'}</label>
              <select className="input" value={board} onChange={e => setBoard(e.target.value)}>
                <option value="">Select...</option>
                {BOARDS.map(b => <option key={b} value={b}>{b.replace(/-/g, ' ')}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-ink-800 mb-1">{lang === 'hi' ? 'स्कूल' : 'School'}</label>
              <input type="text" className="input" value={schoolName} onChange={e => setSchoolName(e.target.value)} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-sm font-medium text-ink-800 mb-1">{lang === 'hi' ? 'जिला' : 'District'}</label>
                <input type="text" className="input" value={district} onChange={e => setDistrict(e.target.value)} />
              </div>
              <div>
                <label className="block text-sm font-medium text-ink-800 mb-1">{lang === 'hi' ? 'राज्य' : 'State'}</label>
                <select className="input" value={state} onChange={e => setState(e.target.value)}>
                  <option value="">Select...</option>
                  {INDIAN_STATES.map(s => <option key={s} value={s}>{s}</option>)}
                </select>
              </div>
            </div>
          </div>

          <div className="flex gap-3">
            <button onClick={() => setEditing(false)} className="btn-ghost flex-1">
              {t('cancel', 'Cancel')}
            </button>
            <button onClick={handleSave} disabled={saving} className="btn-primary flex-1">
              {saving ? (lang === 'hi' ? 'सहेजा जा रहा...' : 'Saving...') : t('save', 'Save')}
            </button>
          </div>
        </section>
      )}
    </main>
  );
}

function ProfileRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between border-b border-paper-200 pb-2.5 last:border-0 last:pb-0">
      <span className="text-sm text-muted-500">{label}</span>
      <span className="text-sm font-medium text-ink-900">{value}</span>
    </div>
  );
}
