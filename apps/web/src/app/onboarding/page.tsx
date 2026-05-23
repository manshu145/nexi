'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  COMMON_SUBJECTS,
  EXAM_BY_SLUG,
  LIVE_EXAMS,
  SOON_EXAMS,
  type ExamSlug,
  type OnboardingRequest,
} from '@nexigrate/shared';
import { Logo } from '~/components/Logo';
import { useAuth } from '~/lib/auth-context';
import { api } from '~/lib/api';

/**
 * Three-step onboarding wizard.
 *
 * Step 1   Target exam               (REQUIRED)
 * Step 2   Academic profile          (class + board REQUIRED, school/state optional)
 * Step 3   Goals + personalization   (exam date, study hours, weak subjects,
 *                                    DOB; parent contact REQUIRED if minor)
 *
 * State lives only in this component. Submit happens once at the end of
 * step 3, so partial fills are never persisted. The dashboard already
 * redirects users with no `targetExam` back here, which means anyone who
 * abandons the survey simply lands here again on next sign-in.
 */
export default function OnboardingPage() {
  const { user, loading } = useAuth();
  const router = useRouter();

  // step state
  const [step, setStep] = useState<1 | 2 | 3>(1);

  // step 1
  const [targetExam, setTargetExam] = useState<ExamSlug | null>(null);

  // step 2
  type ClassLevel = NonNullable<OnboardingRequest['classLevel']>;
  type Board = NonNullable<OnboardingRequest['board']>;
  const [classLevel, setClassLevel] = useState<ClassLevel | ''>('');
  const [board, setBoard] = useState<Board | ''>('');
  const [schoolName, setSchoolName] = useState('');
  const [district, setDistrict] = useState('');
  const [stateName, setStateName] = useState('');

  // step 3
  const [dateOfBirth, setDateOfBirth] = useState('');
  const [examDate, setExamDate] = useState('');
  const [studyHoursPerDay, setStudyHoursPerDay] = useState<string>('');
  const [weakSubjects, setWeakSubjects] = useState<string[]>([]);
  const [otherWeakSubject, setOtherWeakSubject] = useState('');
  const [parentEmail, setParentEmail] = useState('');
  const [parentPhone, setParentPhone] = useState('');

  // submit state
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!loading && !user) router.replace('/signin');
  }, [user, loading, router]);

  // Derived: is the student a minor based on the DOB they entered?
  const isMinor = useMemo(() => isMinorFromDob(dateOfBirth), [dateOfBirth]);

  // Step gating
  const step1Valid = targetExam !== null;
  const step2Valid = classLevel !== '' && board !== '';

  function toggleWeakSubject(subject: string) {
    setWeakSubjects((prev) =>
      prev.includes(subject) ? prev.filter((s) => s !== subject) : [...prev, subject],
    );
  }

  async function onSubmit() {
    if (!step1Valid || !step2Valid) {
      setError('Please complete steps 1 and 2 first.');
      return;
    }
    if (isMinor && !parentEmail.trim() && !parentPhone.trim()) {
      setError('A parent email or phone is required for users under 18.');
      return;
    }
    setError(null);
    setSubmitting(true);
    try {
      const allWeak = [...weakSubjects];
      const otherTrim = otherWeakSubject.trim();
      if (otherTrim && !allWeak.includes(otherTrim)) allWeak.push(otherTrim);

      const payload: OnboardingRequest = {
        targetExam: targetExam!,
        classLevel: (classLevel || null) as OnboardingRequest['classLevel'],
        board: (board || null) as OnboardingRequest['board'],
        schoolName: schoolName.trim() || null,
        district: district.trim() || null,
        state: stateName.trim() || null,
        dateOfBirth: dateOfBirth || null,
        examDate: examDate || null,
        studyHoursPerDay: studyHoursPerDay === '' ? null : Number(studyHoursPerDay),
        weakSubjects: allWeak.slice(0, 8),
        phone: null, // collected separately later (Phase 2.3 verification)
        parentEmail: isMinor ? normaliseEmail(parentEmail) : null,
        parentPhone: isMinor ? normalisePhone(parentPhone) : null,
        referralCode: null,
      };
      await api.setOnboarding(payload);
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

      <section className="mt-10">
        <p className="pill mb-5">Step {step} of 3</p>

        {step === 1 ? (
          <Step1
            targetExam={targetExam}
            onPick={setTargetExam}
          />
        ) : null}

        {step === 2 ? (
          <Step2
            targetExam={targetExam}
            classLevel={classLevel}
            board={board}
            schoolName={schoolName}
            district={district}
            stateName={stateName}
            setClassLevel={setClassLevel}
            setBoard={setBoard}
            setSchoolName={setSchoolName}
            setDistrict={setDistrict}
            setStateName={setStateName}
          />
        ) : null}

        {step === 3 ? (
          <Step3
            dateOfBirth={dateOfBirth}
            examDate={examDate}
            studyHoursPerDay={studyHoursPerDay}
            weakSubjects={weakSubjects}
            otherWeakSubject={otherWeakSubject}
            parentEmail={parentEmail}
            parentPhone={parentPhone}
            isMinor={isMinor}
            setDateOfBirth={setDateOfBirth}
            setExamDate={setExamDate}
            setStudyHoursPerDay={setStudyHoursPerDay}
            toggleWeakSubject={toggleWeakSubject}
            setOtherWeakSubject={setOtherWeakSubject}
            setParentEmail={setParentEmail}
            setParentPhone={setParentPhone}
          />
        ) : null}

        {error ? (
          <div className="banner banner-error mt-6" role="alert">
            <span>{error}</span>
          </div>
        ) : null}

        <nav className="mt-9 flex flex-wrap items-center justify-between gap-3">
          {step > 1 ? (
            <button
              type="button"
              onClick={() => {
                setError(null);
                setStep((s) => (s === 1 ? 1 : ((s - 1) as 1 | 2 | 3)));
              }}
              className="btn-ghost"
              disabled={submitting}
            >
              Back
            </button>
          ) : (
            <span />
          )}

          {step < 3 ? (
            <button
              type="button"
              onClick={() => {
                setError(null);
                if (step === 1 && !step1Valid) {
                  setError('Please pick a target exam to continue.');
                  return;
                }
                if (step === 2 && !step2Valid) {
                  setError('Class and board are required.');
                  return;
                }
                setStep((s) => (s === 3 ? 3 : ((s + 1) as 1 | 2 | 3)));
              }}
              disabled={
                submitting ||
                (step === 1 && !step1Valid) ||
                (step === 2 && !step2Valid)
              }
              className="btn-primary"
            >
              Continue
            </button>
          ) : (
            <button
              type="button"
              onClick={onSubmit}
              disabled={submitting || !step1Valid || !step2Valid}
              className="btn-primary"
            >
              {submitting ? (
                <>
                  <span className="spinner" aria-hidden="true" />
                  Saving…
                </>
              ) : (
                'Finish setup'
              )}
            </button>
          )}
        </nav>
      </section>
    </main>
  );
}

// ============================================================================
// Step 1 -- target exam
// ============================================================================

function Step1({
  targetExam,
  onPick,
}: {
  targetExam: ExamSlug | null;
  onPick: (slug: ExamSlug) => void;
}) {
  return (
    <>
      <h1 className="font-serif text-3xl font-semibold leading-tight text-ink-900 sm:text-4xl">
        Which exam are you preparing for?
      </h1>
      <p className="mt-3 max-w-lg text-ink-800">
        We tailor the daily MCQ, syllabus map, and current affairs to your
        target exam. You can change this later from your dashboard.
      </p>

      <div className="mt-7">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-ember-600">
          Available now
        </p>
        <div className="mt-3 grid gap-2 sm:grid-cols-2">
          {LIVE_EXAMS.map((exam) => (
            <button
              key={exam.id}
              type="button"
              onClick={() => onPick(exam.id)}
              className={`paper-card px-4 py-3 text-left transition hover:-translate-y-0.5 ${
                targetExam === exam.id
                  ? 'ring-2 ring-ember-600 ring-offset-2 ring-offset-paper-100'
                  : ''
              }`}
            >
              <span className="font-serif text-base font-semibold text-ink-900">
                {exam.name}
              </span>
            </button>
          ))}
        </div>
      </div>

      <div className="mt-6">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-500">
          Coming soon
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          {SOON_EXAMS.map((exam) => (
            <span
              key={exam.id}
              className="pill"
              style={{ borderStyle: 'dashed', color: 'var(--color-muted-500)' }}
            >
              {exam.name}
            </span>
          ))}
        </div>
      </div>
    </>
  );
}

// ============================================================================
// Step 2 -- academic profile
// ============================================================================

const CLASS_LEVELS: { id: NonNullable<OnboardingRequest['classLevel']>; label: string }[] = [
  { id: 'class-8', label: 'Class 8' },
  { id: 'class-9', label: 'Class 9' },
  { id: 'class-10', label: 'Class 10' },
  { id: 'class-11', label: 'Class 11' },
  { id: 'class-12', label: 'Class 12' },
  { id: 'graduation', label: 'Undergrad / Graduation' },
  { id: 'post-graduation', label: 'Post-graduation' },
];

const BOARDS: { id: NonNullable<OnboardingRequest['board']>; label: string }[] = [
  { id: 'cbse', label: 'CBSE' },
  { id: 'icse', label: 'ICSE / ISC' },
  { id: 'state', label: 'State board' },
  { id: 'other', label: 'Other / not applicable' },
];

function Step2({
  targetExam,
  classLevel,
  board,
  schoolName,
  district,
  stateName,
  setClassLevel,
  setBoard,
  setSchoolName,
  setDistrict,
  setStateName,
}: {
  targetExam: ExamSlug | null;
  classLevel: NonNullable<OnboardingRequest['classLevel']> | '';
  board: NonNullable<OnboardingRequest['board']> | '';
  schoolName: string;
  district: string;
  stateName: string;
  setClassLevel: (v: NonNullable<OnboardingRequest['classLevel']> | '') => void;
  setBoard: (v: NonNullable<OnboardingRequest['board']> | '') => void;
  setSchoolName: (v: string) => void;
  setDistrict: (v: string) => void;
  setStateName: (v: string) => void;
}) {
  const examName = targetExam ? EXAM_BY_SLUG.get(targetExam)?.name : null;
  return (
    <>
      <h1 className="font-serif text-3xl font-semibold leading-tight text-ink-900 sm:text-4xl">
        Tell us about your school
      </h1>
      <p className="mt-3 text-ink-800">
        Helps us calibrate questions to your level
        {examName ? ` while you prep for ${examName}` : ''}.
      </p>

      <div className="mt-7 grid gap-4">
        <label className="block text-sm">
          <span className="block font-medium text-ink-900">Class level *</span>
          <select
            value={classLevel}
            onChange={(e) =>
              setClassLevel(
                e.target.value as NonNullable<OnboardingRequest['classLevel']> | '',
              )
            }
            className="input mt-1 w-full"
          >
            <option value="">Choose your class</option>
            {CLASS_LEVELS.map((c) => (
              <option key={c.id} value={c.id}>
                {c.label}
              </option>
            ))}
          </select>
        </label>

        <label className="block text-sm">
          <span className="block font-medium text-ink-900">Board *</span>
          <select
            value={board}
            onChange={(e) =>
              setBoard(e.target.value as NonNullable<OnboardingRequest['board']> | '')
            }
            className="input mt-1 w-full"
          >
            <option value="">Choose your board</option>
            {BOARDS.map((b) => (
              <option key={b.id} value={b.id}>
                {b.label}
              </option>
            ))}
          </select>
        </label>

        <label className="block text-sm">
          <span className="block font-medium text-ink-900">
            School name <span className="font-normal text-muted-500">(optional)</span>
          </span>
          <input
            value={schoolName}
            onChange={(e) => setSchoolName(e.target.value)}
            placeholder="DPS R.K. Puram, Allen Coaching, ..."
            className="input mt-1 w-full"
            maxLength={200}
          />
        </label>

        <div className="grid gap-4 sm:grid-cols-2">
          <label className="block text-sm">
            <span className="block font-medium text-ink-900">
              District <span className="font-normal text-muted-500">(optional)</span>
            </span>
            <input
              value={district}
              onChange={(e) => setDistrict(e.target.value)}
              placeholder="Pune"
              className="input mt-1 w-full"
              maxLength={100}
            />
          </label>

          <label className="block text-sm">
            <span className="block font-medium text-ink-900">
              State <span className="font-normal text-muted-500">(optional)</span>
            </span>
            <input
              value={stateName}
              onChange={(e) => setStateName(e.target.value)}
              placeholder="Maharashtra"
              className="input mt-1 w-full"
              maxLength={100}
            />
          </label>
        </div>
      </div>
    </>
  );
}

// ============================================================================
// Step 3 -- goals + personalization (+ minor consent)
// ============================================================================

function Step3({
  dateOfBirth,
  examDate,
  studyHoursPerDay,
  weakSubjects,
  otherWeakSubject,
  parentEmail,
  parentPhone,
  isMinor,
  setDateOfBirth,
  setExamDate,
  setStudyHoursPerDay,
  toggleWeakSubject,
  setOtherWeakSubject,
  setParentEmail,
  setParentPhone,
}: {
  dateOfBirth: string;
  examDate: string;
  studyHoursPerDay: string;
  weakSubjects: string[];
  otherWeakSubject: string;
  parentEmail: string;
  parentPhone: string;
  isMinor: boolean;
  setDateOfBirth: (v: string) => void;
  setExamDate: (v: string) => void;
  setStudyHoursPerDay: (v: string) => void;
  toggleWeakSubject: (subject: string) => void;
  setOtherWeakSubject: (v: string) => void;
  setParentEmail: (v: string) => void;
  setParentPhone: (v: string) => void;
}) {
  return (
    <>
      <h1 className="font-serif text-3xl font-semibold leading-tight text-ink-900 sm:text-4xl">
        Your goals
      </h1>
      <p className="mt-3 text-ink-800">
        We use these to personalise your daily plan. Skip what you don’t know
        — you can update later from settings.
      </p>

      <div className="mt-7 grid gap-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="block text-sm">
            <span className="block font-medium text-ink-900">
              Date of birth{' '}
              <span className="font-normal text-muted-500">(optional)</span>
            </span>
            <input
              type="date"
              value={dateOfBirth}
              onChange={(e) => setDateOfBirth(e.target.value)}
              max={todayIso()}
              className="input mt-1 w-full"
            />
            <span className="mt-1 block text-xs text-muted-500">
              Helps us offer parental consent if you’re under 18.
            </span>
          </label>

          <label className="block text-sm">
            <span className="block font-medium text-ink-900">
              Target exam date{' '}
              <span className="font-normal text-muted-500">(optional)</span>
            </span>
            <input
              type="date"
              value={examDate}
              onChange={(e) => setExamDate(e.target.value)}
              min={todayIso()}
              className="input mt-1 w-full"
            />
            <span className="mt-1 block text-xs text-muted-500">
              We’ll show a countdown on your dashboard.
            </span>
          </label>
        </div>

        <label className="block text-sm">
          <span className="block font-medium text-ink-900">
            Study hours per day{' '}
            <span className="font-normal text-muted-500">(optional)</span>
          </span>
          <input
            type="number"
            min={0}
            max={16}
            inputMode="numeric"
            value={studyHoursPerDay}
            onChange={(e) =>
              setStudyHoursPerDay(e.target.value.replace(/[^\d]/g, '').slice(0, 2))
            }
            placeholder="e.g. 4"
            className="input mt-1 w-full sm:w-40"
          />
        </label>

        <fieldset>
          <legend className="block text-sm font-medium text-ink-900">
            Subjects you want the most help with{' '}
            <span className="font-normal text-muted-500">(pick up to 8)</span>
          </legend>
          <div className="mt-3 flex flex-wrap gap-2">
            {COMMON_SUBJECTS.map((s) => {
              const active = weakSubjects.includes(s);
              const disabled = !active && weakSubjects.length >= 8;
              return (
                <button
                  key={s}
                  type="button"
                  onClick={() => toggleWeakSubject(s)}
                  disabled={disabled}
                  className={
                    active
                      ? 'rounded-full bg-ink-900 px-3.5 py-1.5 text-sm font-medium text-paper-100'
                      : 'rounded-full border border-line bg-paper-50 px-3.5 py-1.5 text-sm font-medium text-ink-800 hover:bg-paper-200 disabled:opacity-40 disabled:hover:bg-paper-50'
                  }
                  aria-pressed={active}
                >
                  {s}
                </button>
              );
            })}
          </div>
          <label className="mt-3 block text-sm">
            <span className="block font-medium text-ink-900">
              Other (one subject){' '}
              <span className="font-normal text-muted-500">
                (added to the list on submit)
              </span>
            </span>
            <input
              value={otherWeakSubject}
              onChange={(e) => setOtherWeakSubject(e.target.value)}
              placeholder="e.g. Sanskrit, Marathi"
              maxLength={40}
              className="input mt-1 w-full"
            />
          </label>
        </fieldset>

        {isMinor ? (
          <fieldset className="paper-card mt-2 p-5">
            <legend className="px-2 text-xs font-semibold uppercase tracking-[0.18em] text-ember-600">
              Parental consent (you’re under 18)
            </legend>
            <p className="text-sm text-ink-800">
              Indian law requires verifiable consent from a parent or guardian
              for users under 18. We’ll only contact them about consent
              — never about marketing.
            </p>
            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              <label className="block text-sm">
                <span className="block font-medium text-ink-900">Parent email</span>
                <input
                  type="email"
                  value={parentEmail}
                  onChange={(e) => setParentEmail(e.target.value)}
                  placeholder="parent@example.com"
                  className="input mt-1 w-full"
                  maxLength={254}
                  autoComplete="off"
                />
              </label>
              <label className="block text-sm">
                <span className="block font-medium text-ink-900">Parent phone (+91)</span>
                <input
                  type="tel"
                  value={parentPhone}
                  onChange={(e) =>
                    setParentPhone(e.target.value.replace(/[^\d]/g, '').slice(0, 10))
                  }
                  placeholder="98765 43210"
                  className="input mt-1 w-full"
                  inputMode="numeric"
                  autoComplete="off"
                />
              </label>
            </div>
            <p className="mt-2 text-xs text-muted-500">
              At least one of email or phone is required.
            </p>
          </fieldset>
        ) : null}
      </div>
    </>
  );
}

// ============================================================================
// Helpers
// ============================================================================

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

function isMinorFromDob(dob: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dob)) return false;
  const [y, m, d] = dob.split('-').map(Number);
  if (!y || !m || !d) return false;
  const eighteenth = new Date(Date.UTC(y + 18, m - 1, d));
  return Date.now() < eighteenth.getTime();
}

function normaliseEmail(raw: string): string | null {
  const t = raw.trim().toLowerCase();
  if (!t) return null;
  // Bare validation -- backend Zod will reject anything malformed.
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(t)) return null;
  return t;
}

function normalisePhone(raw: string): string | null {
  const digits = raw.replace(/\D/g, '');
  if (digits.length === 10 && /^[6-9]/.test(digits)) return `+91${digits}`;
  if (digits.length === 12 && digits.startsWith('91') && /^[6-9]/.test(digits.slice(2))) {
    return `+${digits}`;
  }
  return null;
}
