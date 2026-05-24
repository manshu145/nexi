'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { EXAMS, type ExamSlug } from '@nexigrate/shared';
import { Logo } from '~/components/Logo';
import { useAuth } from '~/lib/auth-context';
import { api, type AdaptiveResponse, type AssessmentResult } from '~/lib/api';
import { setLang, t, type Lang } from '~/lib/i18n';

type Step = 'language' | 'exam' | 'test' | 'result';

export default function OnboardingPage() {
  const { user, loading } = useAuth();
  const router = useRouter();
  const [step, setStep] = useState<Step>('language');
  const [lang, setLangState] = useState<Lang>('en');
  const [selectedExam, setSelectedExam] = useState<ExamSlug | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Adaptive test state
  const [adaptive, setAdaptive] = useState<AdaptiveResponse | null>(null);
  const [testAnswers, setTestAnswers] = useState<Record<number, string | null>>({});
  const [result, setResult] = useState<AssessmentResult | null>(null);

  useEffect(() => {
    if (!loading && !user) router.replace('/signin');
  }, [user, loading, router]);

  async function onSelectLanguage(l: Lang) {
    setLangState(l);
    setLang(l);
    await api.setLanguage(l).catch(() => {});
    setStep('exam');
  }

  async function onSelectExam() {
    if (!selectedExam) return;
    setSubmitting(true);
    setError(null);
    try {
      await api.setOnboarding(selectedExam);
      // Start adaptive test
      const res = await api.startAdaptiveTest(selectedExam);
      setAdaptive(res);
      setTestAnswers({});
      setStep('test');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'failed');
    } finally {
      setSubmitting(false);
    }
  }

  async function onSubmitRound() {
    if (!adaptive) return;
    setSubmitting(true);
    setError(null);
    try {
      const answers = adaptive.questions.map((_, i) => ({
        questionIndex: i,
        chosen: testAnswers[i] ?? null,
      }));
      const res = await api.submitAdaptiveRound(adaptive.sessionId, answers);
      if ((res as { complete?: boolean }).complete) {
        setResult((res as { result: AssessmentResult }).result);
        setStep('result');
      } else {
        setAdaptive(res as AdaptiveResponse);
        setTestAnswers({});
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'failed');
    } finally {
      setSubmitting(false);
    }
  }

  if (loading || !user) {
    return (
      <main className="flex min-h-screen items-center justify-center px-4">
        <span className="spinner" />
      </main>
    );
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-lg flex-col px-4 pt-8 pb-16 sm:px-6">
      <Logo />

      {/* Progress indicator */}
      <div className="mt-6 flex gap-1">
        {(['language', 'exam', 'test', 'result'] as Step[]).map((s, i) => (
          <div
            key={s}
            className={`h-1 flex-1 rounded-full transition-colors ${
              (['language', 'exam', 'test', 'result'] as Step[]).indexOf(step) >= i
                ? 'bg-ember-600'
                : 'bg-paper-300'
            }`}
          />
        ))}
      </div>

      {/* Step 1: Language */}
      {step === 'language' && (
        <section className="mt-8">
          <h1 className="font-serif text-2xl font-semibold text-ink-900 sm:text-3xl">
            {t('onboard.lang.title', lang)}
          </h1>
          <p className="mt-2 text-sm text-ink-800">{t('onboard.lang.sub', lang)}</p>
          <div className="mt-6 grid grid-cols-2 gap-3">
            <button
              type="button"
              onClick={() => onSelectLanguage('en')}
              className="paper-card flex flex-col items-center gap-2 p-6 transition hover:-translate-y-0.5 active:translate-y-0"
            >
              <span className="text-3xl">🇬🇧</span>
              <span className="font-serif text-lg font-semibold text-ink-900">English</span>
            </button>
            <button
              type="button"
              onClick={() => onSelectLanguage('hi')}
              className="paper-card flex flex-col items-center gap-2 p-6 transition hover:-translate-y-0.5 active:translate-y-0"
            >
              <span className="text-3xl">🇮🇳</span>
              <span className="font-serif text-lg font-semibold text-ink-900">हिन्दी</span>
            </button>
          </div>
        </section>
      )}

      {/* Step 2: Exam selection */}
      {step === 'exam' && (
        <section className="mt-8">
          <h1 className="font-serif text-2xl font-semibold text-ink-900 sm:text-3xl">
            {t('onboard.exam.title', lang)}
          </h1>
          <p className="mt-2 text-sm text-ink-800">{t('onboard.exam.sub', lang)}</p>
          <div className="mt-5 grid gap-2 sm:grid-cols-2">
            {EXAMS.map((exam) => (
              <button
                key={exam.id}
                type="button"
                onClick={() => setSelectedExam(exam.id)}
                className={`paper-card px-4 py-3 text-left transition active:scale-[0.98] ${
                  selectedExam === exam.id
                    ? 'ring-2 ring-ember-600 ring-offset-2 ring-offset-paper-100'
                    : 'hover:-translate-y-0.5'
                }`}
              >
                <span className="font-serif text-sm font-semibold text-ink-900">{exam.name}</span>
              </button>
            ))}
          </div>
          {error && <p className="mt-4 text-sm text-ember-600">{error}</p>}
          <button
            type="button"
            onClick={onSelectExam}
            disabled={!selectedExam || submitting}
            className="btn-primary mt-6 w-full"
          >
            {submitting ? t('common.loading', lang) : t('onboard.start_test', lang)}
          </button>
        </section>
      )}

      {/* Step 3: Adaptive Test */}
      {step === 'test' && adaptive && (
        <section className="mt-8">
          <div className="flex items-center justify-between">
            <h1 className="font-serif text-xl font-semibold text-ink-900">
              {t('onboard.test.title', lang)}
            </h1>
            <span className="pill">
              {t('mcq.question', lang)} {adaptive.round}/{adaptive.totalRounds}
            </span>
          </div>
          <p className="mt-2 text-sm text-ink-800">{t('onboard.test.sub', lang)}</p>

          <div className="mt-5 space-y-4">
            {adaptive.questions.map((q, qi) => (
              <div key={qi} className="paper-card p-4">
                <p className="text-xs font-semibold uppercase text-muted-500">{q.subject}</p>
                <p className="mt-1 font-serif text-sm font-semibold text-ink-900 sm:text-base">{q.question}</p>
                <div className="mt-3 space-y-2">
                  {q.options.map((opt) => (
                    <button
                      key={opt.key}
                      type="button"
                      onClick={() => setTestAnswers((prev) => ({ ...prev, [qi]: opt.key }))}
                      className={`flex w-full items-start gap-2 rounded-lg border px-3 py-2 text-left text-sm transition ${
                        testAnswers[qi] === opt.key
                          ? 'border-ember-600 bg-paper-200'
                          : 'border-line bg-paper-50 hover:border-ember-500'
                      }`}
                    >
                      <span className="font-semibold text-ember-600">{opt.key}.</span>
                      <span className="text-ink-900">{opt.text}</span>
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>

          {error && <p className="mt-4 text-sm text-ember-600">{error}</p>}
          <button
            type="button"
            onClick={onSubmitRound}
            disabled={submitting}
            className="btn-primary mt-6 w-full"
          >
            {submitting ? t('common.loading', lang) : adaptive.round < adaptive.totalRounds ? t('mcq.next', lang) : t('mcq.submit', lang)}
          </button>
        </section>
      )}

      {/* Step 4: Result */}
      {step === 'result' && result && (
        <section className="mt-8 text-center">
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-paper-200">
            <span className="text-3xl">
              {result.skillLevel === 'advanced' ? '🏆' : result.skillLevel === 'intermediate' ? '⭐' : '🌱'}
            </span>
          </div>
          <h1 className="font-serif mt-4 text-2xl font-semibold text-ink-900">
            {t('onboard.result.title', lang)}
          </h1>
          <p className="mt-2 text-ink-800">
            {lang === 'hi' ? 'आपका स्तर' : 'Your level'}:{' '}
            <span className="font-semibold capitalize text-ember-600">{result.skillLevel}</span>
          </p>
          <p className="mt-1 text-sm text-muted-500">
            {result.score}/{result.totalQuestions} {lang === 'hi' ? 'सही' : 'correct'}
          </p>

          {result.weakSubjects.length > 0 && (
            <div className="mt-4 paper-card p-4 text-left">
              <p className="text-xs font-semibold uppercase text-muted-500">
                {lang === 'hi' ? 'फोकस क्षेत्र' : 'Focus Areas'}
              </p>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {result.weakSubjects.map((s) => (
                  <span key={s} className="pill">{s}</span>
                ))}
              </div>
            </div>
          )}

          {result.studyPlan.length > 0 && (
            <div className="mt-4 paper-card p-4 text-left">
              <p className="text-xs font-semibold uppercase text-muted-500">
                {lang === 'hi' ? 'अध्ययन प्लान' : 'Study Plan'}
              </p>
              <ul className="mt-2 space-y-1.5 text-sm text-ink-800">
                {result.studyPlan.map((s, i) => (
                  <li key={i} className="flex gap-2">
                    <span className="text-ember-600">•</span> {s}
                  </li>
                ))}
              </ul>
            </div>
          )}

          <button
            type="button"
            onClick={() => router.replace('/dashboard')}
            className="btn-primary mt-8 w-full"
          >
            {t('onboard.go_dashboard', lang)}
          </button>
        </section>
      )}
    </main>
  );
}
