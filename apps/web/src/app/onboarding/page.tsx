'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { EXAMS, type ExamSlug } from '@nexigrate/shared';
import { Logo } from '~/components/Logo';
import { useAuth } from '~/lib/auth-context';
import { api } from '~/lib/api';

/**
 * Multi-step onboarding (Phase B).
 *
 * Steps:
 *   1. Language preference (hi / en / hinglish)
 *   2. Personal details (name, surname, DOB)
 *   3. Education (class, board, school, district, state)
 *   4. Exam + aim (target exam, additional exams, career aim)
 *
 * Force re-onboarding: if user.onboardingVersion < 2, dashboard redirects here.
 */

const CURRENT_ONBOARDING_VERSION = 2;

const LANGUAGES = [
  { id: 'hi', name: 'हिन्दी', desc: 'Hindi' },
  { id: 'en', name: 'English', desc: 'English' },
  { id: 'hinglish', name: 'Hinglish', desc: 'हिंदी + English mixed' },
] as const;

const CLASS_LEVELS = [
  'class-5', 'class-6', 'class-7', 'class-8', 'class-9', 'class-10',
  'class-11', 'class-12', 'graduation', 'post-graduation', 'other',
] as const;

const BOARDS = [
  { id: 'cbse', name: 'CBSE' },
  { id: 'icse', name: 'ICSE / ISC' },
  { id: 'up-board', name: 'UP Board' },
  { id: 'mp-board', name: 'MP Board' },
  { id: 'bihar-board', name: 'Bihar Board' },
  { id: 'rajasthan-board', name: 'Rajasthan Board (RBSE)' },
  { id: 'cgbse', name: 'Chhattisgarh Board (CGBSE)' },
  { id: 'jkbose', name: 'J&K Board (JKBOSE)' },
  { id: 'uttarakhand-board', name: 'Uttarakhand Board' },
  { id: 'jharkhand-board', name: 'Jharkhand Board (JAC)' },
  { id: 'hbse', name: 'Haryana Board (HBSE)' },
  { id: 'pseb', name: 'Punjab Board (PSEB)' },
  { id: 'other', name: 'Other' },
] as const;

const INDIAN_STATES = [
  'Andhra Pradesh', 'Arunachal Pradesh', 'Assam', 'Bihar', 'Chhattisgarh',
  'Delhi', 'Goa', 'Gujarat', 'Haryana', 'Himachal Pradesh', 'Jharkhand',
  'Karnataka', 'Kerala', 'Madhya Pradesh', 'Maharashtra', 'Manipur',
  'Meghalaya', 'Mizoram', 'Nagaland', 'Odisha', 'Punjab', 'Rajasthan',
  'Sikkim', 'Tamil Nadu', 'Telangana', 'Tripura', 'Uttar Pradesh',
  'Uttarakhand', 'West Bengal', 'Jammu & Kashmir', 'Ladakh',
  'Chandigarh', 'Puducherry',
] as const;

// All exams — now all available for selection (no "coming soon" gate)
const ALL_EXAMS = EXAMS;

export default function OnboardingPage() {
  const { user, loading } = useAuth();
  const router = useRouter();
  const [step, setStep] = useState(1);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Form state
  const [language, setLanguage] = useState<string>('hinglish');
  const [surname, setSurname] = useState('');
  const [dob, setDob] = useState('');
  const [classLevel, setClassLevel] = useState('');
  const [board, setBoard] = useState('');
  const [schoolName, setSchoolName] = useState('');
  const [district, setDistrict] = useState('');
  const [state, setState] = useState('');
  const [targetExam, setTargetExam] = useState<ExamSlug | null>(null);
  const [additionalExams, setAdditionalExams] = useState<ExamSlug[]>([]);
  const [aim, setAim] = useState('');

  useEffect(() => {
    if (!loading && !user) router.replace('/signin');
  }, [user, loading, router]);

  const totalSteps = 4;

  async function onSubmit() {
    if (!targetExam) return;
    try {
      setError(null);
      setSubmitting(true);
      await api.setOnboarding(targetExam);
      // The setOnboarding call now accepts the expanded body via the
      // endpoint. But since the existing api.setOnboarding only sends
      // targetExam, let's make a direct call with all fields:
      const auth = await import('~/lib/firebase').then((m) => m.getFirebaseAuthClient());
      const token = await auth.currentUser?.getIdToken();
      if (token) {
        const baseUrl = process.env['NEXT_PUBLIC_API_BASE_URL'] ?? 'http://localhost:9090';
        await fetch(`${baseUrl}/v1/users/me/onboarding`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            targetExam,
            preferredLanguage: language,
            surname: surname || undefined,
            dateOfBirth: dob || undefined,
            classLevel: classLevel || undefined,
            board: board || undefined,
            schoolName: schoolName || undefined,
            district: district || undefined,
            state: state || undefined,
            aim: aim || undefined,
            preparingExams: additionalExams.length > 0 ? additionalExams : undefined,
          }),
        });
      }
      router.replace('/dashboard');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'failed to save');
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
    <main className="mx-auto flex min-h-screen max-w-2xl flex-col px-6 pt-10 pb-16">
      <Logo />

      {/* Progress indicator */}
      <div className="mt-8 flex items-center gap-2">
        {Array.from({ length: totalSteps }, (_, i) => (
          <div
            key={i}
            className={`h-1.5 flex-1 rounded-full transition-colors ${
              i < step ? 'bg-ember-500' : 'bg-paper-300'
            }`}
          />
        ))}
      </div>
      <p className="mt-2 text-xs text-muted-500">Step {step} of {totalSteps}</p>

      {/* Step 1: Language */}
      {step === 1 && (
        <section className="mt-8">
          <h1 className="font-serif text-3xl font-semibold leading-tight text-ink-900 sm:text-4xl">
            Choose your language
          </h1>
          <p className="mt-3 text-ink-800">
            Content will be shown in your preferred language.
          </p>
          <div className="mt-6 grid gap-3 sm:grid-cols-3">
            {LANGUAGES.map((lang) => (
              <button
                key={lang.id}
                type="button"
                onClick={() => setLanguage(lang.id)}
                className={`paper-card px-5 py-4 text-left transition hover:-translate-y-0.5 ${
                  language === lang.id
                    ? 'ring-2 ring-ember-600 ring-offset-2 ring-offset-paper-100'
                    : ''
                }`}
              >
                <span className="font-serif text-xl font-semibold text-ink-900">
                  {lang.name}
                </span>
                <span className="mt-1 block text-sm text-muted-500">{lang.desc}</span>
              </button>
            ))}
          </div>
          <button
            type="button"
            onClick={() => setStep(2)}
            className="btn-primary mt-8"
          >
            Continue
          </button>
        </section>
      )}

      {/* Step 2: Personal details */}
      {step === 2 && (
        <section className="mt-8">
          <h1 className="font-serif text-3xl font-semibold leading-tight text-ink-900 sm:text-4xl">
            Tell us about yourself
          </h1>
          <p className="mt-3 text-ink-800">
            This helps us personalize your study experience.
          </p>
          <div className="mt-6 space-y-4">
            <div>
              <label className="text-sm font-medium text-ink-800">Display name</label>
              <input
                type="text"
                value={user.displayName ?? ''}
                disabled
                className="input mt-1"
                placeholder="From your Google/phone login"
              />
            </div>
            <div>
              <label className="text-sm font-medium text-ink-800">Surname / Last name</label>
              <input
                type="text"
                value={surname}
                onChange={(e) => setSurname(e.target.value)}
                className="input mt-1"
                placeholder="e.g. Sharma, Singh, Patel"
              />
            </div>
            <div>
              <label className="text-sm font-medium text-ink-800">Date of birth</label>
              <input
                type="date"
                value={dob}
                onChange={(e) => setDob(e.target.value)}
                className="input mt-1"
              />
            </div>
          </div>
          <div className="mt-8 flex gap-3">
            <button type="button" onClick={() => setStep(1)} className="btn-ghost">
              Back
            </button>
            <button type="button" onClick={() => setStep(3)} className="btn-primary">
              Continue
            </button>
          </div>
        </section>
      )}

      {/* Step 3: Education */}
      {step === 3 && (
        <section className="mt-8">
          <h1 className="font-serif text-3xl font-semibold leading-tight text-ink-900 sm:text-4xl">
            Your education
          </h1>
          <p className="mt-3 text-ink-800">
            We use this to match syllabus and study material.
          </p>
          <div className="mt-6 space-y-4">
            <div>
              <label className="text-sm font-medium text-ink-800">Current class / level</label>
              <select
                value={classLevel}
                onChange={(e) => setClassLevel(e.target.value)}
                className="input mt-1"
              >
                <option value="">Select</option>
                {CLASS_LEVELS.map((c) => (
                  <option key={c} value={c}>
                    {c.replace('class-', 'Class ').replace('graduation', 'Graduation').replace('post-graduation', 'Post Graduation').replace('other', 'Other')}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-sm font-medium text-ink-800">Board</label>
              <select
                value={board}
                onChange={(e) => setBoard(e.target.value)}
                className="input mt-1"
              >
                <option value="">Select</option>
                {BOARDS.map((b) => (
                  <option key={b.id} value={b.id}>{b.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-sm font-medium text-ink-800">School / College name</label>
              <input
                type="text"
                value={schoolName}
                onChange={(e) => setSchoolName(e.target.value)}
                className="input mt-1"
                placeholder="e.g. Kendriya Vidyalaya, DPS"
              />
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label className="text-sm font-medium text-ink-800">District</label>
                <input
                  type="text"
                  value={district}
                  onChange={(e) => setDistrict(e.target.value)}
                  className="input mt-1"
                  placeholder="e.g. Lucknow, Patna"
                />
              </div>
              <div>
                <label className="text-sm font-medium text-ink-800">State</label>
                <select
                  value={state}
                  onChange={(e) => setState(e.target.value)}
                  className="input mt-1"
                >
                  <option value="">Select</option>
                  {INDIAN_STATES.map((s) => (
                    <option key={s} value={s}>{s}</option>
                  ))}
                </select>
              </div>
            </div>
          </div>
          <div className="mt-8 flex gap-3">
            <button type="button" onClick={() => setStep(2)} className="btn-ghost">
              Back
            </button>
            <button type="button" onClick={() => setStep(4)} className="btn-primary">
              Continue
            </button>
          </div>
        </section>
      )}

      {/* Step 4: Exam + Aim */}
      {step === 4 && (
        <section className="mt-8">
          <h1 className="font-serif text-3xl font-semibold leading-tight text-ink-900 sm:text-4xl">
            What are you preparing for?
          </h1>
          <p className="mt-3 text-ink-800">
            Pick your primary target exam. You can add more below.
          </p>

          <div className="mt-6">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-ember-600">
              Primary exam
            </p>
            <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {ALL_EXAMS.map((exam) => (
                <button
                  key={exam.id}
                  type="button"
                  onClick={() => setTargetExam(exam.id)}
                  className={`paper-card px-4 py-3 text-left transition hover:-translate-y-0.5 ${
                    targetExam === exam.id
                      ? 'ring-2 ring-ember-600 ring-offset-2 ring-offset-paper-100'
                      : ''
                  }`}
                >
                  <span className="font-serif text-sm font-semibold text-ink-900">
                    {exam.name}
                  </span>
                  <span className="mt-0.5 block text-[11px] text-muted-500">
                    {exam.category.replace('-', ' ')}
                  </span>
                </button>
              ))}
            </div>
          </div>

          <div className="mt-6">
            <label className="text-sm font-medium text-ink-800">
              Career aim / goal (optional)
            </label>
            <input
              type="text"
              value={aim}
              onChange={(e) => setAim(e.target.value)}
              className="input mt-1"
              placeholder="e.g. IAS officer, Doctor, Engineer, Teacher"
            />
          </div>

          {error ? (
            <p className="mt-4 text-sm text-ember-600" role="alert">
              {error}
            </p>
          ) : null}

          <div className="mt-8 flex gap-3">
            <button type="button" onClick={() => setStep(3)} className="btn-ghost">
              Back
            </button>
            <button
              type="button"
              onClick={onSubmit}
              disabled={!targetExam || submitting}
              className="btn-primary"
            >
              {submitting ? 'Saving…' : 'Start studying'}
            </button>
          </div>
        </section>
      )}
    </main>
  );
}
