'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';
import { api, type GeneratedMCQ } from '~/lib/api';

type Phase = 'intro' | 'quiz' | 'submitting';

export default function AssessmentPage() {
  const t = useTranslations('onboarding.assessment');
  const ts = useTranslations('onboarding');
  const tc = useTranslations('common');
  const router = useRouter();
  const [phase, setPhase] = useState<Phase>('intro');
  const [questions, setQuestions] = useState<GeneratedMCQ[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [answers, setAnswers] = useState<Map<string, string | null>>(new Map());
  const [timer, setTimer] = useState(30);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const currentQuestion = questions[currentIndex];

  const startAssessment = async () => {
    setLoading(true); setError(null);
    try {
      const language = (typeof window !== 'undefined' ? localStorage.getItem('nexigrate-language') as 'en' | 'hi' : null) || 'en';
      const meRes = await api.me();
      const examSlug = meRes.user.targetExam ?? 'jee-main';
      const result = await api.getAssessmentQuestions(examSlug, language);
      setQuestions(result.questions); setPhase('quiz'); setTimer(30);
    } catch (err) { setError(err instanceof Error ? err.message : 'Failed to load questions'); toast.error('Failed to load questions'); }
    finally { setLoading(false); }
  };

  const submitAssessment = useCallback(async () => {
    setPhase('submitting');
    try {
      const answerArray = questions.map((q) => ({ questionId: q.id, chosen: answers.get(q.id) ?? null }));
      const result = await api.submitAssessment(questions, answerArray);
      sessionStorage.setItem('nexigrate-assessment-result', JSON.stringify(result));
      router.push('/onboarding/complete');
    } catch (err) { toast.error(err instanceof Error ? err.message : 'Failed to submit'); setPhase('quiz'); }
  }, [questions, answers, router]);

  const handleNext = useCallback(() => {
    if (timerRef.current) clearInterval(timerRef.current);
    if (currentIndex >= questions.length - 1) submitAssessment();
    else { setCurrentIndex((prev) => prev + 1); setTimer(30); }
  }, [currentIndex, questions.length, submitAssessment]);

  useEffect(() => {
    if (phase !== 'quiz') return;
    timerRef.current = setInterval(() => {
      setTimer((prev) => { if (prev <= 1) { handleNext(); return 30; } return prev - 1; });
    }, 1000);
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [phase, currentIndex, handleNext]);

  const handleAnswer = (key: string) => { if (!currentQuestion) return; setAnswers(new Map(answers).set(currentQuestion.id, key)); };

  if (phase === 'intro') {
    return (
      <div className="flex flex-col items-center">
        <p className="text-xs font-medium text-slate-500 dark:text-slate-400">{ts('step', { current: 4, total: 5 })}</p>
        <div className="mt-2 h-1.5 w-full max-w-xs overflow-hidden rounded-full bg-slate-200 dark:bg-slate-700"><div className="h-full w-[80%] rounded-full bg-amber-500" /></div>
        <h1 className="mt-8 text-center text-2xl font-bold text-slate-900 dark:text-white">{t('title')}</h1>
        <p className="mt-2 text-center text-sm text-slate-500 dark:text-slate-400">{t('subtitle')}</p>
        <div className="card mt-8 w-full"><p className="text-sm text-slate-700 dark:text-slate-300 leading-relaxed">{t('description')}</p></div>
        <button type="button" onClick={startAssessment} disabled={loading} className="btn-primary mt-6 w-full">{loading ? tc('loading') : t('startButton')}</button>
        {error && <p className="mt-4 text-sm text-red-600 dark:text-red-400">{error}</p>}
      </div>
    );
  }

  if (phase === 'submitting') {
    return (
      <div className="flex min-h-[40vh] flex-col items-center justify-center">
        <div className="h-10 w-10 animate-spin rounded-full border-4 border-slate-200 border-t-amber-500" />
        <p className="mt-4 text-sm text-slate-500 dark:text-slate-400">{t('submitting')}</p>
      </div>
    );
  }

  if (!currentQuestion) return null;
  const selectedAnswer = answers.get(currentQuestion.id);

  return (
    <div className="flex flex-col items-center">
      <p className="text-xs font-medium text-slate-500 dark:text-slate-400">{ts('step', { current: 4, total: 5 })}</p>
      <div className="mt-2 h-1.5 w-full max-w-xs overflow-hidden rounded-full bg-slate-200 dark:bg-slate-700"><div className="h-full w-[80%] rounded-full bg-amber-500" /></div>
      <div className="mt-6 flex w-full items-center justify-between">
        <p className="text-sm font-medium text-slate-600 dark:text-slate-300">{t('question', { current: currentIndex + 1, total: questions.length })}</p>
        <span className={`rounded-full px-3 py-1 text-xs font-bold ${timer <= 10 ? 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400' : 'bg-slate-100 text-slate-700 dark:bg-slate-700 dark:text-slate-300'}`}>{t('timeLeft', { seconds: timer })}</span>
      </div>
      <div className="mt-3 flex w-full gap-1">
        {questions.map((_, idx) => <div key={idx} className={`h-1 flex-1 rounded-full ${idx < currentIndex ? 'bg-amber-500' : idx === currentIndex ? 'bg-amber-300' : 'bg-slate-200 dark:bg-slate-700'}`} />)}
      </div>
      <div className="card mt-6 w-full">
        <p className="text-base font-medium leading-relaxed text-slate-900 dark:text-white">{currentQuestion.question}</p>
        <div className="mt-4 space-y-2">
          {currentQuestion.options.map((opt) => (
            <button key={opt.key} type="button" onClick={() => handleAnswer(opt.key)}
              className={`w-full rounded-lg border px-4 py-3 text-left text-sm transition-all ${selectedAnswer === opt.key ? 'border-amber-500 bg-amber-50 text-amber-800 dark:bg-amber-500/10 dark:text-amber-300' : 'border-slate-200 text-slate-700 hover:border-slate-300 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-700/50'}`}>
              <span className="mr-2 font-bold">{opt.key}.</span>{opt.text}
            </button>
          ))}
        </div>
      </div>
      <button type="button" onClick={handleNext} className="btn-primary mt-4 w-full">{currentIndex >= questions.length - 1 ? 'Submit' : tc('next')}</button>
    </div>
  );
}
