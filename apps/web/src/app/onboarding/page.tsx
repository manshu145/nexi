'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { EXAMS, SUPPORTED_LANGUAGES, CLASS_LEVELS, BOARDS, type ExamSlug } from '@nexigrate/shared';
import { Logo } from '~/components/Logo';
import { ThemeToggle } from '~/components/ThemeToggle';
import { useAuth } from '~/lib/auth-context';
import { api } from '~/lib/api';

const LIVE_EXAMS = EXAMS.filter((e) => e.status === 'live');

const INDIAN_STATES = [
  'Andhra Pradesh', 'Arunachal Pradesh', 'Assam', 'Bihar', 'Chhattisgarh',
  'Delhi', 'Goa', 'Gujarat', 'Haryana', 'Himachal Pradesh', 'Jharkhand',
  'Karnataka', 'Kerala', 'Madhya Pradesh', 'Maharashtra', 'Manipur',
  'Meghalaya', 'Mizoram', 'Nagaland', 'Odisha', 'Punjab', 'Rajasthan',
  'Sikkim', 'Tamil Nadu', 'Telangana', 'Tripura', 'Uttar Pradesh',
  'Uttarakhand', 'West Bengal', 'Jammu & Kashmir', 'Ladakh',
];

export default function OnboardingPage() {
  const { user, loading } = useAuth();
  const router = useRouter();
  const [step, setStep] = useState(1);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Step 1: Language
  const [language, setLanguage] = useState('en');

  // Step 2: Personal info
  const [name, setName] = useState('');
  const [dateOfBirth, setDateOfBirth] = useState('');
  const [aim, setAim] = useState('');

  // Step 3: Education
  const [classLevel, setClassLevel] = useState('');
  const [board, setBoard] = useState('');
  const [schoolName, setSchoolName] = useState('');
  const [district, setDistrict] = useState('');
  const [state, setState] = useState('');

  // Step 4: Exam selection
  const [targetExam, setTargetExam] = useState<ExamSlug | null>(null);

  useEffect(() => {
    if (!loading && !user) router.replace('/signin');
  }, [user, loading, router]);

  useEffect(() => {
    if (user?.displayName && !name) setName(user.displayName);
  }, [user, name]);

  async function onSubmit() {
    if (!targetExam) return;
    try {
      setError(null);
      setSubmitting(true);
      await api.setOnboarding({
        name: name || user?.displayName || 'Student',
        targetExam,
        preferredLanguage: language,
        classLevel: classLevel || null,
        board: board || null,
        schoolName: schoolName || null,
        district: district || null,
        state: state || null,
        dateOfBirth: dateOfBirth || null,
        aim: aim || null,
        preparingExams: [],
        onboardingVersion: 2,
      });
      router.replace('/dashboard');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to save. Please try again.');
    } finally {
      setSubmitting(false);
    }
  }

  if (loading || !user) {
    return (
      <main className="flex min-h-[60vh] items-center justify-center px-6">
        <span className="inline-flex items-center gap-2 text-sm text-muted-500">
          <span className="spinner" aria-hidden="true" />
          Loading…
        </span>
      </main>
    );
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-3xl flex-col px-4 pt-8 pb-24 sm:px-6 sm:pb-16">
      <div className="flex items-center justify-between">
        <Logo />
        <ThemeToggle />
      </div>

      {/* Progress bar */}
      <div className="mt-8 flex items-center gap-2">
        {[1, 2, 3, 4].map((s) => (
          <div
            key={s}
            className={`h-1.5 flex-1 rounded-full transition-colors ${
              s <= step ? 'bg-ember-500' : 'bg-paper-300'
            }`}
          />
        ))}
      </div>
      <p className="pill mt-3 mb-6">Step {step} of 4</p>

      {error && <div className="banner banner-error mb-4">{error}</div>}

      {/* Step 1: Language */}
      {step === 1 && (
        <section>
          <h1 className="font-serif text-2xl font-semibold leading-tight text-ink-900 sm:text-3xl">
            Choose your preferred language
          </h1>
          <p className="mt-2 text-sm text-muted-500">
            Content will be shown in this language where available. You can change this later.
          </p>
          <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-3">
            {SUPPORTED_LANGUAGES.map((lang) => (
              <button
                key={lang.code}
                onClick={() => setLanguage(lang.code)}
                className={`paper-card card-selectable px-4 py-3 text-left ${
                  language === lang.code
                    ? 'card-selected'
                    : ''
                }`}
              >
                <span className="block text-sm font-medium text-ink-900">{lang.native}</span>
                <span className="block text-xs text-muted-500">{lang.label}</span>
              </button>
            ))}
          </div>
          <button className="btn-primary mt-8 w-full" onClick={() => setStep(2)}>
            Continue
          </button>
        </section>
      )}

      {/* Step 2: Personal */}
      {step === 2 && (
        <section>
          <h1 className="font-serif text-2xl font-semibold leading-tight text-ink-900 sm:text-3xl">
            Tell us about yourself
          </h1>
          <p className="mt-2 text-sm text-muted-500">
            This helps us personalize your study experience.
          </p>
          <div className="mt-6 space-y-4">
            <div>
              <label className="block text-sm font-medium text-ink-800 mb-1">Full name *</label>
              <input
                type="text"
                className="input"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Your full name"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-ink-800 mb-1">Date of birth</label>
              <input
                type="date"
                className="input"
                value={dateOfBirth}
                onChange={(e) => setDateOfBirth(e.target.value)}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-ink-800 mb-1">Your aim / career goal</label>
              <input
                type="text"
                className="input"
                value={aim}
                onChange={(e) => setAim(e.target.value)}
                placeholder="e.g. IAS Officer, Doctor, Engineer"
              />
            </div>
          </div>
          <div className="mt-8 flex gap-3">
            <button className="btn-ghost flex-1" onClick={() => setStep(1)}>Back</button>
            <button
              className="btn-primary flex-1"
              onClick={() => setStep(3)}
              disabled={!name.trim()}
            >
              Continue
            </button>
          </div>
        </section>
      )}

      {/* Step 3: Education */}
      {step === 3 && (
        <section>
          <h1 className="font-serif text-2xl font-semibold leading-tight text-ink-900 sm:text-3xl">
            Education details
          </h1>
          <div className="mt-6 space-y-4">
            <div>
              <label className="block text-sm font-medium text-ink-800 mb-1">Current class / level</label>
              <select
                className="input"
                value={classLevel}
                onChange={(e) => setClassLevel(e.target.value)}
              >
                <option value="">Select...</option>
                {CLASS_LEVELS.map((cl) => (
                  <option key={cl} value={cl}>
                    {cl.replace('-', ' ').replace(/\b\w/g, (c) => c.toUpperCase())}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-ink-800 mb-1">Board</label>
              <select
                className="input"
                value={board}
                onChange={(e) => setBoard(e.target.value)}
              >
                <option value="">Select...</option>
                {BOARDS.map((b) => (
                  <option key={b} value={b}>
                    {b.replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-ink-800 mb-1">School / College name</label>
              <input
                type="text"
                className="input"
                value={schoolName}
                onChange={(e) => setSchoolName(e.target.value)}
                placeholder="Optional"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-sm font-medium text-ink-800 mb-1">District</label>
                <input
                  type="text"
                  className="input"
                  value={district}
                  onChange={(e) => setDistrict(e.target.value)}
                  placeholder="Optional"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-ink-800 mb-1">State</label>
                <select
                  className="input"
                  value={state}
                  onChange={(e) => setState(e.target.value)}
                >
                  <option value="">Select...</option>
                  {INDIAN_STATES.map((s) => (
                    <option key={s} value={s}>{s}</option>
                  ))}
                </select>
              </div>
            </div>
          </div>
          <div className="mt-8 flex gap-3">
            <button className="btn-ghost flex-1" onClick={() => setStep(2)}>Back</button>
            <button className="btn-primary flex-1" onClick={() => setStep(4)}>
              Continue
            </button>
          </div>
        </section>
      )}

      {/* Step 4: Exam selection */}
      {step === 4 && (
        <section>
          <h1 className="font-serif text-2xl font-semibold leading-tight text-ink-900 sm:text-3xl">
            Which exam are you preparing for?
          </h1>
          <p className="mt-2 text-sm text-muted-500">
            Choose your primary exam. You can add more later.
          </p>
          <div className="mt-6 grid grid-cols-1 gap-2 sm:grid-cols-2">
            {LIVE_EXAMS.map((exam) => (
              <button
                key={exam.id}
                onClick={() => setTargetExam(exam.id)}
                className={`paper-card card-selectable px-4 py-3 text-left ${
                  targetExam === exam.id
                    ? 'card-selected'
                    : ''
                }`}
              >
                <span className="block text-sm font-medium text-ink-900">{exam.name}</span>
                <span className="block text-xs text-muted-500 capitalize">{exam.category}</span>
              </button>
            ))}
          </div>

          {/* Coming soon exams */}
          <div className="mt-6">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-500 mb-2">All Exams (Live)</p>
            <div className="flex flex-wrap gap-2">
              {EXAMS.filter(e => e.status === 'soon').map((exam) => (
                <button
                  key={exam.id}
                  onClick={() => setTargetExam(exam.id)}
                  className={`pill card-selectable ${
                    targetExam === exam.id
                      ? 'card-selected'
                      : ''
                  }`}
                >
                  {exam.name}
                </button>
              ))}
            </div>
          </div>

          <div className="mt-8 flex gap-3">
            <button className="btn-ghost flex-1" onClick={() => setStep(3)}>Back</button>
            <button
              className="btn-primary flex-1"
              onClick={onSubmit}
              disabled={!targetExam || submitting}
            >
              {submitting ? (
                <><span className="spinner" aria-hidden="true" /> Saving...</>
              ) : (
                'Start learning'
              )}
            </button>
          </div>
        </section>
      )}
    </main>
  );
}
