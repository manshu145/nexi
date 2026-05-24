'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { EXAMS, SUPPORTED_LANGUAGES, CLASS_LEVELS, BOARDS, type ExamSlug } from '@nexigrate/shared';
import { Logo } from '~/components/Logo';
import { ThemeToggle } from '~/components/ThemeToggle';
import { useAuth } from '~/lib/auth-context';
import { api } from '~/lib/api';
import { setLanguage } from '~/lib/i18n';

const LIVE_EXAMS = EXAMS.filter((e) => e.status === 'live');

const INDIAN_STATES = [
  'Andhra Pradesh', 'Arunachal Pradesh', 'Assam', 'Bihar', 'Chhattisgarh',
  'Delhi', 'Goa', 'Gujarat', 'Haryana', 'Himachal Pradesh', 'Jharkhand',
  'Karnataka', 'Kerala', 'Madhya Pradesh', 'Maharashtra', 'Manipur',
  'Meghalaya', 'Mizoram', 'Nagaland', 'Odisha', 'Punjab', 'Rajasthan',
  'Sikkim', 'Tamil Nadu', 'Telangana', 'Tripura', 'Uttar Pradesh',
  'Uttarakhand', 'West Bengal', 'Jammu & Kashmir', 'Ladakh',
];

interface AssessmentMcq {
  question: string;
  options: { key: string; text: string }[];
  correctOption: string;
  explanation: string;
  subject: string;
  difficulty: string;
}

export default function OnboardingPage() {
  const { user, loading } = useAuth();
  const router = useRouter();
  const [step, setStep] = useState(1);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Step 1: Language
  const [language, setLang] = useState('en');
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
  // Step 5: AI Assessment
  const [assessmentMcqs, setAssessmentMcqs] = useState<AssessmentMcq[]>([]);
  const [assessmentAnswers, setAssessmentAnswers] = useState<(string | null)[]>([]);
  const [currentAssessmentQ, setCurrentAssessmentQ] = useState(0);
  const [assessmentLoading, setAssessmentLoading] = useState(false);
  const [assessmentSubmitting, setAssessmentSubmitting] = useState(false);

  useEffect(() => {
    if (!loading && !user) router.replace('/signin');
  }, [user, loading, router]);

  useEffect(() => {
    if (user?.displayName && !name) setName(user.displayName);
  }, [user, name]);

  // Bilingual helper - switches text based on selected language
  const txt = (en: string, hi: string) => language === 'hi' ? hi : en;

  async function startAssessment() {
    if (!targetExam) return;
    try {
      setAssessmentLoading(true);
      setError(null);
      setStep(5);
      const res = await api.ai.generateAssessment(targetExam, 15, language as 'en' | 'hi');
      if (res.mcqs && res.mcqs.length > 0) {
        setAssessmentMcqs(res.mcqs);
        setAssessmentAnswers(new Array(res.mcqs.length).fill(null));
      } else {
        // No questions returned — skip assessment gracefully
        setError('AI service is warming up. You can skip and start studying now.');
      }
    } catch (e) {
      // API not available — let user skip assessment
      setError('AI assessment is temporarily unavailable. You can skip and start studying — your level will be set to intermediate.');
    } finally {
      setAssessmentLoading(false);
    }
  }

  function selectAssessmentAnswer(key: string) {
    const newAnswers = [...assessmentAnswers];
    newAnswers[currentAssessmentQ] = key;
    setAssessmentAnswers(newAnswers);
  }

  async function submitAssessment() {
    if (!targetExam) return;
    try {
      setAssessmentSubmitting(true);
      setError(null);
      await api.ai.submitAssessment(targetExam, assessmentMcqs, assessmentAnswers);
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
      setLanguage(language);
      router.replace('/study');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to save. Please try again.');
    } finally {
      setAssessmentSubmitting(false);
    }
  }

  async function skipAssessment() {
    try {
      setSubmitting(true);
      setError(null);
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
      setLanguage(language);
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
        {[1, 2, 3, 4, 5].map((s) => (
          <div key={s} className={`h-1.5 flex-1 rounded-full transition-colors ${s <= step ? 'bg-ember-500' : 'bg-paper-300'}`} />
        ))}
      </div>
      <p className="pill mt-3 mb-6">Step {step} of 5</p>
      {error && <div className="banner banner-error mb-4">{error}</div>}

      {/* Step 1: Language */}
      {step === 1 && (
        <section>
          <h1 className="font-serif text-2xl font-semibold leading-tight text-ink-900 sm:text-3xl">Choose your preferred language</h1>
          <p className="mt-2 text-sm text-muted-500">Content will be shown in this language where available.</p>
          <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-3">
            {SUPPORTED_LANGUAGES.map((lang) => (
              <button key={lang.code} onClick={() => { setLang(lang.code); setLanguage(lang.code); }} className={`paper-card card-selectable px-4 py-3 text-left ${language === lang.code ? 'card-selected' : ''}`}>
                <span className="block text-sm font-medium text-ink-900">{lang.native}</span>
                <span className="block text-xs text-muted-500">{lang.label}</span>
              </button>
            ))}
          </div>
          <button className="btn-primary mt-8 w-full" onClick={() => setStep(2)}>Continue</button>
        </section>
      )}

      {/* Step 2: Personal */}
      {step === 2 && (
        <section>
          <h1 className="font-serif text-2xl font-semibold leading-tight text-ink-900 sm:text-3xl">{txt('Tell us about yourself', 'अपने बारे में बताएं')}</h1>
          <p className="mt-2 text-sm text-muted-500">{txt('This helps us personalize your study experience.', 'इससे हम आपकी पढ़ाई को बेहतर बना सकेंगे।')}</p>
          <div className="mt-6 space-y-4">
            <div><label className="block text-sm font-medium text-ink-800 mb-1">{txt('Full name *', 'पूरा नाम *')}</label><input type="text" className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="Your full name" /></div>
            <div><label className="block text-sm font-medium text-ink-800 mb-1">{txt('Date of birth', 'जन्म तिथि')}</label><input type="date" className="input" value={dateOfBirth} onChange={(e) => setDateOfBirth(e.target.value)} /></div>
            <div><label className="block text-sm font-medium text-ink-800 mb-1">{txt('Your aim / career goal', 'आपका लक्ष्य')}</label><input type="text" className="input" value={aim} onChange={(e) => setAim(e.target.value)} placeholder="e.g. IAS Officer, Doctor, Engineer" /></div>
          </div>
          <div className="mt-8 flex gap-3">
            <button className="btn-ghost flex-1" onClick={() => setStep(1)}>Back</button>
            <button className="btn-primary flex-1" onClick={() => setStep(3)} disabled={!name.trim()}>Continue</button>
          </div>
        </section>
      )}

      {/* Step 3: Education */}
      {step === 3 && (
        <section>
          <h1 className="font-serif text-2xl font-semibold leading-tight text-ink-900 sm:text-3xl">{txt('Education details', 'शिक्षा विवरण')}</h1>
          <div className="mt-6 space-y-4">
            <div><label className="block text-sm font-medium text-ink-800 mb-1">{txt('Current class / level', 'कक्षा / स्तर')}</label><select className="input" value={classLevel} onChange={(e) => setClassLevel(e.target.value)}><option value="">Select...</option>{CLASS_LEVELS.map((cl) => (<option key={cl} value={cl}>{cl.replace('-', ' ').replace(/\b\w/g, (c) => c.toUpperCase())}</option>))}</select></div>
            <div><label className="block text-sm font-medium text-ink-800 mb-1">Board</label><select className="input" value={board} onChange={(e) => setBoard(e.target.value)}><option value="">Select...</option>{BOARDS.map((b) => (<option key={b} value={b}>{b.replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())}</option>))}</select></div>
            <div><label className="block text-sm font-medium text-ink-800 mb-1">School / College name</label><input type="text" className="input" value={schoolName} onChange={(e) => setSchoolName(e.target.value)} placeholder="Optional" /></div>
            <div className="grid grid-cols-2 gap-3">
              <div><label className="block text-sm font-medium text-ink-800 mb-1">District</label><input type="text" className="input" value={district} onChange={(e) => setDistrict(e.target.value)} placeholder="Optional" /></div>
              <div><label className="block text-sm font-medium text-ink-800 mb-1">State</label><select className="input" value={state} onChange={(e) => setState(e.target.value)}><option value="">Select...</option>{INDIAN_STATES.map((s) => (<option key={s} value={s}>{s}</option>))}</select></div>
            </div>
          </div>
          <div className="mt-8 flex gap-3">
            <button className="btn-ghost flex-1" onClick={() => setStep(2)}>Back</button>
            <button className="btn-primary flex-1" onClick={() => setStep(4)}>Continue</button>
          </div>
        </section>
      )}

      {/* Step 4: Exam selection */}
      {step === 4 && (
        <section>
          <h1 className="font-serif text-2xl font-semibold leading-tight text-ink-900 sm:text-3xl">{txt('Which exam are you preparing for?', 'आप किस परीक्षा की तैयारी कर रहे हैं?')}</h1>
          <p className="mt-2 text-sm text-muted-500">{txt('Choose your primary exam. You can add more later.', 'अपनी मुख्य परीक्षा चुनें। बाद में बदल सकते हैं।')}</p>
          <div className="mt-6 grid grid-cols-1 gap-2 sm:grid-cols-2">
            {LIVE_EXAMS.map((exam) => (
              <button key={exam.id} onClick={() => setTargetExam(exam.id)} className={`paper-card card-selectable px-4 py-3 text-left ${targetExam === exam.id ? 'card-selected' : ''}`}>
                <span className="block text-sm font-medium text-ink-900">{exam.name}</span>
                <span className="block text-xs text-muted-500 capitalize">{exam.category}</span>
              </button>
            ))}
          </div>
          <div className="mt-8 flex gap-3">
            <button className="btn-ghost flex-1" onClick={() => setStep(3)}>Back</button>
            <button className="btn-primary flex-1" onClick={startAssessment} disabled={!targetExam}>Next: AI Assessment</button>
          </div>
        </section>
      )}

      {/* Step 5: AI Assessment */}
      {step === 5 && (
        <section>
          <h1 className="font-serif text-2xl font-semibold leading-tight text-ink-900 sm:text-3xl">{txt('AI Assessment', 'AI मूल्यांकन')}</h1>
          <p className="mt-2 text-sm text-muted-500">{txt('Answer these 15 questions so we can personalize your study plan.', 'ये 15 सवालों के जवाब दें ताकि हम आपकी पढ़ाई का प्लान बना सकें।')}</p>
          {assessmentLoading ? (
            <div className="mt-8 text-center py-12"><span className="spinner" aria-hidden="true" /><p className="mt-3 text-sm text-muted-500">{txt('Generating assessment questions with AI...', 'AI से प्रश्न तैयार हो रहे हैं...')}</p></div>
          ) : assessmentMcqs.length > 0 ? (
            <div className="mt-6">
              <div className="flex items-center justify-between text-xs text-muted-500 mb-4">
                <span>Question {currentAssessmentQ + 1} of {assessmentMcqs.length}</span>
                <span>{assessmentAnswers.filter((a) => a !== null).length} answered</span>
              </div>
              <div className="paper-card p-5">
                <p className="text-xs text-muted-500 mb-2">{assessmentMcqs[currentAssessmentQ]?.subject} &middot; {assessmentMcqs[currentAssessmentQ]?.difficulty}</p>
                <p className="text-sm font-medium text-ink-900">{assessmentMcqs[currentAssessmentQ]?.question}</p>
                <div className="mt-4 space-y-2">
                  {assessmentMcqs[currentAssessmentQ]?.options.map((opt) => (
                    <button key={opt.key} onClick={() => selectAssessmentAnswer(opt.key)} className={`w-full rounded-lg border px-4 py-3 text-left text-sm transition-colors ${assessmentAnswers[currentAssessmentQ] === opt.key ? 'border-ember-500 bg-ember-50' : 'border-paper-300 hover:border-ember-300'}`}>
                      <span className="font-medium">{opt.key}.</span> {opt.text}
                    </button>
                  ))}
                </div>
              </div>
              <div className="mt-4 flex items-center justify-between">
                <button onClick={() => setCurrentAssessmentQ((q) => Math.max(0, q - 1))} disabled={currentAssessmentQ === 0} className="btn-ghost px-3 py-1.5 text-sm disabled:opacity-40">&larr; Prev</button>
                <div className="flex gap-1">{assessmentMcqs.map((_, i) => (<button key={i} onClick={() => setCurrentAssessmentQ(i)} className={`h-2.5 w-2.5 rounded-full ${i === currentAssessmentQ ? 'bg-ember-500' : assessmentAnswers[i] !== null ? 'bg-ember-300' : 'bg-paper-300'}`} />))}</div>
                <button onClick={() => setCurrentAssessmentQ((q) => Math.min(assessmentMcqs.length - 1, q + 1))} disabled={currentAssessmentQ === assessmentMcqs.length - 1} className="btn-ghost px-3 py-1.5 text-sm disabled:opacity-40">Next &rarr;</button>
              </div>
              <div className="mt-8 flex gap-3">
                <button className="btn-ghost flex-1" onClick={skipAssessment} disabled={submitting}>{submitting ? 'Saving...' : 'Skip Assessment'}</button>
                <button className="btn-primary flex-1" onClick={submitAssessment} disabled={assessmentSubmitting}>{assessmentSubmitting ? 'Analyzing...' : `Submit (${assessmentAnswers.filter((a) => a !== null).length}/${assessmentMcqs.length})`}</button>
              </div>
            </div>
          ) : (
            <div className="mt-8 text-center"><p className="text-sm text-ink-800 font-medium">Assessment not available right now</p><p className="mt-2 text-sm text-muted-500">Don't worry! You can start studying immediately. Your level will be set to intermediate.</p><button className="btn-primary mt-6 w-full" onClick={skipAssessment} disabled={submitting}>{submitting ? 'Saving...' : 'Start Studying →'}</button><button className="btn-ghost mt-3 w-full" onClick={startAssessment}>Retry Assessment</button></div>
          )}
        </section>
      )}
    </main>
  );
}
