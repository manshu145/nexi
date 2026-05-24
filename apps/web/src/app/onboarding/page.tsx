'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { EXAMS, type ExamSlug } from '@nexigrate/shared';
import { Logo } from '~/components/Logo';
import { useAuth } from '~/lib/auth-context';
import { api } from '~/lib/api';

/**
 * Full Onboarding Flow:
 * Step 1: Language (Hindi / English)
 * Step 2: Basic Info (Name, Class)
 * Step 3: Exam Selection
 * Step 4: AI Assessment (15 MCQs to determine skill level)
 */

type Language = 'en' | 'hi';

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
  const [language, setLanguage] = useState<Language>('en');
  const [name, setName] = useState('');
  const [studentClass, setStudentClass] = useState('');
  const [selectedExam, setSelectedExam] = useState<ExamSlug | null>(null);

  // Assessment state
  const [assessmentMcqs, setAssessmentMcqs] = useState<AssessmentMcq[]>([]);
  const [currentQ, setCurrentQ] = useState(0);
  const [answers, setAnswers] = useState<(string | null)[]>([]);
  const [assessLoading, setAssessLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!loading && !user) router.replace('/signin');
  }, [user, loading, router]);

  const t = (en: string, hi: string) => language === 'hi' ? hi : en;

  // Step 1 → Step 2
  function selectLanguage(lang: Language) {
    setLanguage(lang);
    setStep(2);
  }

  // Step 2 → Step 3
  function submitProfile() {
    if (!name.trim()) return;
    setStep(3);
  }

  // Step 3 → Step 4 (generate assessment)
  async function selectExam(exam: ExamSlug) {
    setSelectedExam(exam);
    setError(null);
    setAssessLoading(true);
    try {
      await api.setOnboarding(exam);
      const { mcqs } = await api.ai.generateAssessment(
        EXAMS.find(e => e.id === exam)?.name ?? exam,
        15,
        language,
      );
      setAssessmentMcqs(mcqs);
      setAnswers(new Array(mcqs.length).fill(null));
      setStep(4);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to generate assessment');
    } finally {
      setAssessLoading(false);
    }
  }

  // Submit assessment
  async function submitAssessment() {
    if (!selectedExam) return;
    setSubmitting(true);
    setError(null);
    try {
      await api.ai.submitAssessment(
        assessmentMcqs,
        answers,
        EXAMS.find(e => e.id === selectedExam)?.name ?? selectedExam,
        language,
      );
      router.replace('/dashboard');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to submit');
    } finally {
      setSubmitting(false);
    }
  }

  function pickAnswer(key: string) {
    const next = [...answers];
    next[currentQ] = key;
    setAnswers(next);
  }

  if (loading || !user) {
    return (
      <main className="onboarding-loading">
        <span className="spinner" /> Loading…
      </main>
    );
  }

  return (
    <main className="onboarding-page">
      <header className="onboarding-header">
        <Logo />
        <div className="step-indicator">
          {[1, 2, 3, 4].map(s => (
            <span key={s} className={`step-dot ${s === step ? 'active' : s < step ? 'done' : ''}`} />
          ))}
        </div>
      </header>

      {/* STEP 1: Language */}
      {step === 1 && (
        <section className="onboarding-step fade-in">
          <div className="step-badge">Step 1 of 4</div>
          <h1 className="onboarding-title">Choose your language</h1>
          <p className="onboarding-subtitle">अपनी भाषा चुनें — Select your preferred language</p>

          <div className="language-grid">
            <button
              type="button"
              className="language-card"
              onClick={() => selectLanguage('en')}
            >
              <span className="language-icon">🇬🇧</span>
              <span className="language-name">English</span>
              <span className="language-desc">All content in English</span>
            </button>
            <button
              type="button"
              className="language-card"
              onClick={() => selectLanguage('hi')}
            >
              <span className="language-icon">🇮🇳</span>
              <span className="language-name">हिंदी</span>
              <span className="language-desc">सारी सामग्री हिंदी में</span>
            </button>
          </div>
        </section>
      )}

      {/* STEP 2: Profile */}
      {step === 2 && (
        <section className="onboarding-step fade-in">
          <div className="step-badge">Step 2 of 4</div>
          <h1 className="onboarding-title">{t('Tell us about yourself', 'अपने बारे में बताएं')}</h1>
          <p className="onboarding-subtitle">{t('This helps us personalize your study plan', 'इससे हम आपकी पढ़ाई को बेहतर बना पाएंगे')}</p>

          <div className="form-group">
            <label className="form-label">{t('Your Name', 'आपका नाम')}</label>
            <input
              type="text"
              className="form-input"
              placeholder={t('Enter your name', 'अपना नाम लिखें')}
              value={name}
              onChange={(e) => setName(e.target.value)}
              autoFocus
            />
          </div>

          <div className="form-group">
            <label className="form-label">{t('Class / Year', 'कक्षा')}</label>
            <div className="class-grid">
              {['8', '9', '10', '11', '12', 'Dropper', 'Graduate'].map(cls => (
                <button
                  key={cls}
                  type="button"
                  className={`class-chip ${studentClass === cls ? 'selected' : ''}`}
                  onClick={() => setStudentClass(cls)}
                >
                  {cls === 'Dropper' ? t('Dropper', 'ड्रॉपर') :
                   cls === 'Graduate' ? t('Graduate', 'ग्रेजुएट') :
                   t(`Class ${cls}`, `कक्षा ${cls}`)}
                </button>
              ))}
            </div>
          </div>

          <button
            type="button"
            className="btn-primary onboarding-btn"
            onClick={submitProfile}
            disabled={!name.trim()}
          >
            {t('Continue', 'आगे बढ़ें')} →
          </button>
        </section>
      )}

      {/* STEP 3: Exam Selection */}
      {step === 3 && (
        <section className="onboarding-step fade-in">
          <div className="step-badge">Step 3 of 4</div>
          <h1 className="onboarding-title">{t('Which exam are you preparing for?', 'आप किस परीक्षा की तैयारी कर रहे हैं?')}</h1>
          <p className="onboarding-subtitle">{t('AI will create your personalized study plan', 'AI आपकी पढ़ाई का प्लान बनाएगा')}</p>

          {assessLoading && (
            <div className="assess-loading">
              <span className="spinner" />
              <p>{t('Generating your assessment...', 'आपका टेस्ट तैयार हो रहा है...')}</p>
            </div>
          )}

          {!assessLoading && (
            <div className="exam-grid">
              {EXAMS.map(exam => (
                <button
                  key={exam.id}
                  type="button"
                  className={`exam-card ${selectedExam === exam.id ? 'selected' : ''}`}
                  onClick={() => selectExam(exam.id)}
                  disabled={assessLoading}
                >
                  <span className="exam-name">{exam.name}</span>
                  <span className="exam-category">{exam.category}</span>
                </button>
              ))}
            </div>
          )}

          {error && <p className="error-msg">{error}</p>}
        </section>
      )}

      {/* STEP 4: AI Assessment */}
      {step === 4 && assessmentMcqs.length > 0 && (
        <section className="onboarding-step fade-in">
          <div className="step-badge">Step 4 of 4 — {t('Quick Assessment', 'त्वरित मूल्यांकन')}</div>
          <div className="assess-header">
            <h1 className="onboarding-title-sm">
              {t('Question', 'प्रश्न')} {currentQ + 1}/{assessmentMcqs.length}
            </h1>
            <div className="assess-progress">
              <div className="assess-progress-bar" style={{ width: `${((currentQ + 1) / assessmentMcqs.length) * 100}%` }} />
            </div>
          </div>

          <div className="assess-card">
            <p className="assess-subject">{assessmentMcqs[currentQ]?.subject} · {assessmentMcqs[currentQ]?.difficulty}</p>
            <h2 className="assess-question">{assessmentMcqs[currentQ]?.question}</h2>

            <div className="assess-options">
              {(assessmentMcqs[currentQ]?.options ?? []).map(opt => (
                <button
                  key={opt.key}
                  type="button"
                  className={`assess-option ${answers[currentQ] === opt.key ? 'selected' : ''}`}
                  onClick={() => pickAnswer(opt.key)}
                >
                  <span className="opt-key">{opt.key}</span>
                  <span className="opt-text">{opt.text}</span>
                </button>
              ))}
            </div>
          </div>

          <div className="assess-nav">
            {currentQ > 0 && (
              <button type="button" className="btn-ghost" onClick={() => setCurrentQ(currentQ - 1)}>
                ← {t('Previous', 'पिछला')}
              </button>
            )}
            <div className="assess-nav-spacer" />
            {currentQ < assessmentMcqs.length - 1 ? (
              <button type="button" className="btn-primary" onClick={() => setCurrentQ(currentQ + 1)}>
                {t('Next', 'अगला')} →
              </button>
            ) : (
              <button
                type="button"
                className="btn-primary"
                onClick={submitAssessment}
                disabled={submitting}
              >
                {submitting
                  ? t('Analyzing...', 'विश्लेषण हो रहा...')
                  : t('Submit & Start Learning', 'जमा करें और पढ़ाई शुरू करें')}
              </button>
            )}
          </div>

          {error && <p className="error-msg">{error}</p>}
        </section>
      )}
    </main>
  );
}
