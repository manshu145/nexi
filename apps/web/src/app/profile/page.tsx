'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { EXAMS, SUPPORTED_LANGUAGES, CLASS_LEVELS, BOARDS } from '@nexigrate/shared';
import { Logo } from '~/components/Logo';
import { ThemeToggle } from '~/components/ThemeToggle';
import { useAuth } from '~/lib/auth-context';
import { api, type MeResponse } from '~/lib/api';

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
  const { user, loading, signOut } = useAuth();
  const router = useRouter();
  const [me, setMe] = useState<MeResponse['user'] | null>(null);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  // Editable fields
  const [name, setName] = useState('');
  const [dateOfBirth, setDateOfBirth] = useState('');
  const [aim, setAim] = useState('');
  const [classLevel, setClassLevel] = useState('');
  const [board, setBoard] = useState('');
  const [schoolName, setSchoolName] = useState('');
  const [district, setDistrict] = useState('');
  const [state, setState] = useState('');
  const [targetExam, setTargetExam] = useState('');

  useEffect(() => {
    if (!loading && !user) router.replace('/signin');
  }, [user, loading, router]);

  useEffect(() => {
    if (!user) return;
    void loadProfile();
  }, [user]);

  async function loadProfile() {
    try {
      const res = await api.me();
      setMe(res.user);
      setName(res.user.name || '');
      setTargetExam(res.user.targetExam || '');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load profile');
    }
  }

  async function onSave() {
    setSaving(true);
    setError(null);
    setSuccess(false);
    try {
      await api.setOnboarding({
        name: name || me?.name || 'Student',
        targetExam: targetExam || me?.targetExam,
        classLevel: classLevel || null,
        board: board || null,
        schoolName: schoolName || null,
        district: district || null,
        state: state || null,
        dateOfBirth: dateOfBirth || null,
        aim: aim || null,
        onboardingVersion: 2,
      });
      setSuccess(true);
      setEditing(false);
      await loadProfile();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to save');
    } finally {
      setSaving(false);
    }
  }

  if (loading || !user) {
    return (
      <main className="flex min-h-[60vh] items-center justify-center px-6">
        <span className="spinner" />
      </main>
    );
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-3xl flex-col px-4 pt-6 pb-24 sm:px-6 sm:pb-16">
      <div className="flex items-center justify-between">
        <Logo />
        <div className="flex items-center gap-3">
          <ThemeToggle />
          <button onClick={() => router.push('/dashboard')} className="btn-ghost-sm">Dashboard</button>
        </div>
      </div>

      <section className="mt-8">
        <div className="flex items-center justify-between">
          <h1 className="font-serif text-2xl font-semibold text-ink-900">Profile</h1>
          {!editing && (
            <button onClick={() => setEditing(true)} className="btn-ghost-sm">
              Edit
            </button>
          )}
        </div>

        {error && <div className="banner banner-error mt-4">{error}</div>}
        {success && <div className="banner banner-success mt-4">Profile updated successfully!</div>}

        {/* Profile info */}
        <div className="mt-6 paper-card p-6 space-y-5">
          {/* Avatar + basic info */}
          <div className="flex items-center gap-4">
            <div className="flex h-14 w-14 items-center justify-center rounded-full bg-ember-500 text-paper-50 text-lg font-bold">
              {(me?.name || user.displayName || 'S')[0]?.toUpperCase()}
            </div>
            <div>
              <p className="text-lg font-semibold text-ink-900">{me?.name || user.displayName}</p>
              <p className="text-sm text-muted-500">{me?.email || user.email}</p>
            </div>
          </div>

          <hr className="border-line" />

          {editing ? (
            <div className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <label className="block text-sm font-medium text-ink-800 mb-1">Full Name</label>
                  <input type="text" className="input" value={name} onChange={(e) => setName(e.target.value)} />
                </div>
                <div>
                  <label className="block text-sm font-medium text-ink-800 mb-1">Date of Birth</label>
                  <input type="date" className="input" value={dateOfBirth} onChange={(e) => setDateOfBirth(e.target.value)} />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-ink-800 mb-1">Aim / Career Goal</label>
                <input type="text" className="input" value={aim} onChange={(e) => setAim(e.target.value)} placeholder="e.g. IAS Officer, Doctor" />
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <label className="block text-sm font-medium text-ink-800 mb-1">Class Level</label>
                  <select className="input" value={classLevel} onChange={(e) => setClassLevel(e.target.value)}>
                    <option value="">Select...</option>
                    {CLASS_LEVELS.map((cl) => <option key={cl} value={cl}>{cl}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-ink-800 mb-1">Board</label>
                  <select className="input" value={board} onChange={(e) => setBoard(e.target.value)}>
                    <option value="">Select...</option>
                    {BOARDS.map((b) => <option key={b} value={b}>{b}</option>)}
                  </select>
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-ink-800 mb-1">School / College</label>
                <input type="text" className="input" value={schoolName} onChange={(e) => setSchoolName(e.target.value)} />
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <label className="block text-sm font-medium text-ink-800 mb-1">District</label>
                  <input type="text" className="input" value={district} onChange={(e) => setDistrict(e.target.value)} />
                </div>
                <div>
                  <label className="block text-sm font-medium text-ink-800 mb-1">State</label>
                  <select className="input" value={state} onChange={(e) => setState(e.target.value)}>
                    <option value="">Select...</option>
                    {INDIAN_STATES.map((s) => <option key={s} value={s}>{s}</option>)}
                  </select>
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-ink-800 mb-1">Target Exam</label>
                <select className="input" value={targetExam} onChange={(e) => setTargetExam(e.target.value)}>
                  <option value="">Select...</option>
                  {LIVE_EXAMS.map((ex) => <option key={ex.id} value={ex.id}>{ex.name}</option>)}
                </select>
              </div>

              <div className="flex gap-3 pt-2">
                <button onClick={() => setEditing(false)} className="btn-ghost flex-1">Cancel</button>
                <button onClick={onSave} disabled={saving} className="btn-primary flex-1">
                  {saving ? <><span className="spinner" /> Saving...</> : 'Save changes'}
                </button>
              </div>
            </div>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2">
              <InfoField label="Target Exam" value={EXAMS.find(e => e.id === me?.targetExam)?.name || me?.targetExam || '—'} />
              <InfoField label="Streak" value={`${me?.currentStreak || 0} days (best: ${me?.bestStreak || 0})`} />
              <InfoField label="Phone" value={user.phoneNumber || '—'} />
              <InfoField label="Mobile" value={user.phoneNumber || user.email || '—'} />
            </div>
          )}
        </div>

        {/* Danger zone */}
        <div className="mt-8 paper-card p-6">
          <h3 className="text-sm font-semibold text-ink-900">Account</h3>
          <div className="mt-3 flex gap-3">
            <button onClick={signOut} className="btn-ghost-sm text-ember-600">
              Sign out
            </button>
          </div>
        </div>
      </section>
    </main>
  );
}

function InfoField({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs text-muted-500">{label}</p>
      <p className="text-sm font-medium text-ink-900 mt-0.5">{value}</p>
    </div>
  );
}
