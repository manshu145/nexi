'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';
import { api, type GeneratedMCQ } from '~/lib/api';
import { AILoader } from '~/components/ui/AILoader';

type Phase = 'intro' | 'quiz' | 'submitting' | 'error';

export default function AssessmentPage() {
  const t = useTranslations('onboarding.assessment');
  const ts = useTranslations('onboarding');
  const tc = useTranslations('common');
  const router = useRouter();
  const [phase, setPhase] = useState<Phase>('intro');
  const [questions, setQuestions] = useState<GeneratedMCQ[]>([]);
  const [idx, setIdx] = useState(0);
  const [answers, setAnswers] = useState<Map<string, string | null>>(new Map());
  const [timer, setTimer] = useState(30);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const startAssessment = async () => {
    setLoading(true); setError(null); setPhase('intro');
    try {
      const lang = (() => {
        if (typeof document !== 'undefined') { const m = document.cookie.match(/nexigrate-language=(en|hi)/); if (m) return m[1] as 'en' | 'hi'; }
        if (typeof window !== 'undefined') { const s = localStorage.getItem('nexigrate-language'); if (s === 'hi' || s === 'en') return s; }
        return 'en' as const;
      })();
      const meRes = await api.me();
      const exam = meRes.user.targetExam ?? 'jee-main';
      const res = await api.getAssessmentQuestions(exam, lang);
      if (!res.questions || res.questions.length === 0) {
        throw new Error('No questions received from AI. Service may be busy.');
      }
      setQuestions(res.questions); setPhase('quiz'); setTimer(30);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to generate questions';
      setError(msg);
      setPhase('error');
      toast.error(msg);
    } finally { setLoading(false); }
  };

  const submitAssessment = useCallback(async () => {
    setPhase('submitting');
    try {
      const arr = questions.map((q) => ({ questionId: q.id, chosen: answers.get(q.id) ?? null }));
      const result = await api.submitAssessment(questions, arr);
      sessionStorage.setItem('nexigrate-assessment-result', JSON.stringify(result));
      router.push('/onboarding/complete');
    } catch (err) { toast.error(err instanceof Error ? err.message : 'Submit failed'); setPhase('quiz'); }
  }, [questions, answers, router]);

  const handleNext = useCallback(() => {
    if (timerRef.current) clearInterval(timerRef.current);
    if (idx >= questions.length - 1) submitAssessment();
    else { setIdx((i) => i + 1); setTimer(30); }
  }, [idx, questions.length, submitAssessment]);

  useEffect(() => {
    if (phase !== 'quiz') return;
    timerRef.current = setInterval(() => { setTimer((p) => { if (p <= 1) { handleNext(); return 30; } return p - 1; }); }, 1000);
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [phase, idx, handleNext]);

  // INTRO phase
  if (phase === 'intro') return (
    <div className="flex flex-col items-center">
      <div className="pill">{ts('step', { current: 4, total: 5 })}</div>
      <div className="mt-4 flex w-full max-w-xs gap-1">{[1,2,3,4,5].map(s => <div key={s} className={`h-1.5 flex-1 rounded-full ${s <= 4 ? 'bg-ember-500' : 'bg-paper-300'}`} />)}</div>
      <h1 className="font-serif mt-8 text-center text-2xl font-semibold text-ink-900 dark:text-paper-50">{t('title')}</h1>
      <p className="mt-2 text-center text-sm text-muted-500">{t('subtitle')}</p>
      <div className="paper-card mt-8 w-full p-5"><p className="text-sm text-ink-800 leading-relaxed">{t('description')}</p></div>
      <button type="button" onClick={startAssessment} disabled={loading} className="btn-primary mt-6 w-full">
        {loading ? tc('loading') : t('startButton')}
      </button>
    </div>
  );

  // ERROR phase — AI service unavailable
  if (phase === 'error') return (
    <div className="flex flex-col items-center">
      <div className="pill">{ts('step', { current: 4, total: 5 })}</div>
      <div className="mt-4 flex w-full max-w-xs gap-1">{[1,2,3,4,5].map(s => <div key={s} className={`h-1.5 flex-1 rounded-full ${s <= 4 ? 'bg-ember-500' : 'bg-paper-300'}`} />)}</div>
      <div className="mt-12 text-center">
        <span className="text-4xl">⚠️</span>
        <h2 className="font-serif mt-4 text-xl font-semibold text-ink-900 dark:text-paper-50">Assessment could not be generated</h2>
        <div className="banner banner-error mt-4">{error}</div>
        <p className="mt-3 text-xs text-muted-500">AI service may be busy. Try again in a moment.</p>
      </div>
      <div className="mt-8 flex w-full flex-col gap-3">
        <button type="button" onClick={startAssessment} className="btn-primary w-full">Retry Assessment</button>
      </div>
    </div>
  );

  // SUBMITTING phase
  if (phase === 'submitting') return (
    <div className="flex min-h-[40vh] flex-col items-center justify-center">
      <AILoader context="assessment" /><p className="mt-4 text-sm text-muted-500">{t('submitting')}</p>
    </div>
  );

  // QUIZ phase
  const q = questions[idx]; if (!q) return null;
  const sel = answers.get(q.id);

  return (
    <div className="flex flex-col items-center">
      <div className="pill">{ts('step', { current: 4, total: 5 })}</div>
      <div className="mt-4 flex w-full max-w-xs gap-1">{[1,2,3,4,5].map(s => <div key={s} className={`h-1.5 flex-1 rounded-full ${s <= 4 ? 'bg-ember-500' : 'bg-paper-300'}`} />)}</div>
      <div className="mt-6 flex w-full items-center justify-between">
        <p className="text-sm font-medium text-ink-800 dark:text-paper-200">{t('question', { current: idx+1, total: questions.length })}</p>
        <span className={`pill ${timer <= 10 ? 'pill-warn' : ''}`}>{t('timeLeft', { seconds: timer })}</span>
      </div>
      <div className="mt-3 flex w-full gap-1">{questions.map((_, i) => <div key={i} className={`h-2.5 w-2.5 rounded-full ${i < idx ? 'bg-ember-500' : i === idx ? 'bg-ember-500' : answers.get(questions[i]?.id ?? '') ? 'bg-ember-500/40' : 'bg-paper-300'}`} />)}</div>
      <div className="paper-card mt-6 w-full p-5">
        <p className="text-sm font-medium leading-relaxed text-ink-900 dark:text-paper-50">{q.question}</p>
        <div className="mt-4 space-y-2">
          {q.options.map((opt) => (
            <button key={opt.key} type="button" onClick={() => setAnswers(new Map(answers).set(q.id, opt.key))}
              className={`paper-card card-selectable w-full px-4 py-3 text-left text-sm ${sel === opt.key ? 'card-selected' : ''}`}>
              <span className="font-medium">{opt.key}.</span> {opt.text}
            </button>
          ))}
        </div>
      </div>
      <button type="button" onClick={handleNext} className="btn-primary mt-4 w-full">{idx >= questions.length - 1 ? 'Submit' : tc('next')}</button>
    </div>
  );
}
