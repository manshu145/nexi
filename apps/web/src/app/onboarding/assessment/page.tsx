'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';
import { useUser } from '~/lib/userStore';
import { api, type GeneratedMCQ } from '~/lib/api';
import { AILoader } from '~/components/ui/AILoader';

type Phase = 'intro' | 'quiz' | 'stage-transition' | 'submitting' | 'error';
type Stage = 1 | 2 | 3;

interface StageData {
  questions: GeneratedMCQ[];
  answers: Map<string, string | null>;
}

const STAGE_LABELS: Record<Stage, { en: string; hi: string }> = {
  1: { en: 'Core Knowledge', hi: 'मूल ज्ञान' },
  2: { en: 'Difficulty Calibration', hi: 'कठिनाई जांच' },
  3: { en: 'Weak Area Deep Dive', hi: 'कमजोर क्षेत्र गहन परीक्षण' },
};

const STAGE_INTROS: Record<Stage, { en: string; hi: string }> = {
  1: { en: 'Let\'s start with questions across core subjects to understand your current level.', hi: 'आइए आपके वर्तमान स्तर को समझने के लिए मूल विषयों के प्रश्नों से शुरू करते हैं।' },
  2: { en: 'Based on your answers, here are more targeted questions to precisely determine your level...', hi: 'आपके उत्तरों के आधार पर, आपके स्तर को सटीक रूप से निर्धारित करने के लिए और प्रश्न...' },
  3: { en: 'Let\'s explore your weak areas more deeply to personalize your learning...', hi: 'आइए आपकी पढ़ाई को व्यक्तिगत बनाने के लिए कमजोर क्षेत्रों को गहराई से समझते हैं...' },
};

const TOTAL_QUESTIONS = 23; // 10 + 8 + 5

export default function AssessmentPage() {
  const t = useTranslations('onboarding.assessment');
  const ts = useTranslations('onboarding');
  const tc = useTranslations('common');
  const router = useRouter();
  // PR-32: read the exam slug from the shared user store. The page used
  // to fire api.me() three separate times (once per stage) — replaced
  // with a single source of truth that's already in memory.
  const { user: me } = useUser();
  const [phase, setPhase] = useState<Phase>('intro');
  const [currentStage, setCurrentStage] = useState<Stage>(1);
  const [stageData, setStageData] = useState<Record<Stage, StageData>>({
    1: { questions: [], answers: new Map() },
    2: { questions: [], answers: new Map() },
    3: { questions: [], answers: new Map() },
  });
  const [idx, setIdx] = useState(0);
  const [timer, setTimer] = useState(45);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const lang = useRef<'en' | 'hi'>('en');
  // PR-34b (audit #66): 90-second client-side ceiling on the stage
  // generation calls. Same pattern PR-32 used for mock-tests:
  //   - AbortController scoped per stage call
  //   - window.setTimeout fires .abort() after 90 s
  //   - on abort the error phase shows a "took longer than 90 s" copy
  //     with a Retry button that re-fires the same load.
  // We track the current controller in a ref so an unmount mid-call
  // cleans up correctly (page navigation must NOT leave a fetch hanging).
  const abortRef = useRef<AbortController | null>(null);
  // Remembers which load to re-fire from the error-phase Retry button.
  // null = retry intro (start), 1/2/3 = retry that stage's load.
  const lastFailedRef = useRef<null | 'start' | 2 | 3>(null);

  // Get language on mount
  useEffect(() => {
    if (typeof document !== 'undefined') {
      const m = document.cookie.match(/nexigrate-language=(en|hi)/);
      if (m) { lang.current = m[1] as 'en' | 'hi'; return; }
    }
    if (typeof window !== 'undefined') {
      const s = localStorage.getItem('nexigrate-language');
      if (s === 'hi' || s === 'en') lang.current = s;
    }
  }, []);

  const currentQuestions = stageData[currentStage].questions;
  const currentAnswers = stageData[currentStage].answers;
  const currentQuestion = currentQuestions[idx];

  // Calculate global progress (across all stages)
  const questionsAnsweredBefore = (currentStage === 1 ? 0 : currentStage === 2 ? 10 : 18);
  const globalProgress = questionsAnsweredBefore + idx;
  const progressPct = Math.round((globalProgress / TOTAL_QUESTIONS) * 100);

  /**
   * Spin up an AbortController + 90s timeout pair for one stage call.
   * Returns the signal to thread into the api method and a `done()`
   * cleanup closure to call from finally so we don't leak the timer.
   */
  function makeStageTimeout(): { signal: AbortSignal; done: () => void } {
    abortRef.current?.abort(); // cancel any in-flight stage if reload re-triggers
    const controller = new AbortController();
    abortRef.current = controller;
    const timeoutId = window.setTimeout(() => controller.abort(), 90_000);
    return {
      signal: controller.signal,
      done: () => { window.clearTimeout(timeoutId); if (abortRef.current === controller) abortRef.current = null; },
    };
  }

  /** Cleanup any in-flight stage call on unmount so page-navigation
   *  doesn't leave a fetch dangling. */
  useEffect(() => () => { abortRef.current?.abort(); }, []);

  const startAssessment = async () => {
    setLoading(true); setError(null); setPhase('intro');
    lastFailedRef.current = 'start';
    const { signal, done } = makeStageTimeout();
    try {
      const exam = me?.targetExam ?? 'jee-main';
      const res = await api.getStage1Questions(exam, lang.current, { signal });
      done();
      if (!res.questions || res.questions.length === 0) {
        throw new Error('No questions received from AI. Service may be busy.');
      }
      setStageData(prev => ({ ...prev, 1: { questions: res.questions, answers: new Map() } }));
      setCurrentStage(1);
      setIdx(0);
      setTimer(45);
      setPhase('quiz');
      lastFailedRef.current = null;
    } catch (err) {
      done();
      const aborted = err instanceof DOMException && err.name === 'AbortError';
      const msg = aborted
        ? 'Generation took longer than 90 seconds. Tap Retry to try again.'
        : (err instanceof Error ? err.message : 'Failed to generate questions');
      setError(msg);
      setPhase('error');
      toast.error(msg);
    } finally { setLoading(false); }
  };

  const loadStage2 = async () => {
    setPhase('stage-transition');
    lastFailedRef.current = 2;
    const { signal, done } = makeStageTimeout();
    try {
      const exam = me?.targetExam ?? 'jee-main';
      const stage1Results = {
        questions: stageData[1].questions,
        answers: Array.from(stageData[1].answers.entries()).map(([qId, chosen]) => ({ questionId: qId, chosen })),
      };
      const res = await api.getStage2Questions(exam, lang.current, stage1Results, { signal });
      done();
      if (!res.questions || res.questions.length === 0) throw new Error('No Stage 2 questions received.');
      setStageData(prev => ({ ...prev, 2: { questions: res.questions, answers: new Map() } }));
      setCurrentStage(2);
      setIdx(0);
      setTimer(45);
      setPhase('quiz');
      lastFailedRef.current = null;
    } catch (err) {
      done();
      const aborted = err instanceof DOMException && err.name === 'AbortError';
      const msg = aborted
        ? 'Generation took longer than 90 seconds. Tap Retry to try again.'
        : (err instanceof Error ? err.message : 'Failed to generate Stage 2 questions');
      setError(msg);
      setPhase('error');
      toast.error(msg);
    }
  };

  const loadStage3 = async () => {
    setPhase('stage-transition');
    lastFailedRef.current = 3;
    const { signal, done } = makeStageTimeout();
    try {
      const exam = me?.targetExam ?? 'jee-main';
      const stage1Results = {
        questions: stageData[1].questions,
        answers: Array.from(stageData[1].answers.entries()).map(([qId, chosen]) => ({ questionId: qId, chosen })),
      };
      const stage2Results = {
        questions: stageData[2].questions,
        answers: Array.from(stageData[2].answers.entries()).map(([qId, chosen]) => ({ questionId: qId, chosen })),
      };
      const res = await api.getStage3Questions(exam, lang.current, stage1Results, stage2Results, { signal });
      done();
      if (!res.questions || res.questions.length === 0) throw new Error('No Stage 3 questions received.');
      setStageData(prev => ({ ...prev, 3: { questions: res.questions, answers: new Map() } }));
      setCurrentStage(3);
      setIdx(0);
      setTimer(45);
      setPhase('quiz');
      lastFailedRef.current = null;
    } catch (err) {
      done();
      const aborted = err instanceof DOMException && err.name === 'AbortError';
      const msg = aborted
        ? 'Generation took longer than 90 seconds. Tap Retry to try again.'
        : (err instanceof Error ? err.message : 'Failed to generate Stage 3 questions');
      setError(msg);
      setPhase('error');
      toast.error(msg);
    }
  };

  /** Re-fire whichever load just failed so the Retry button does the
   *  right thing without forcing the user back to the intro screen. */
  const handleRetry = () => {
    const stage = lastFailedRef.current;
    if (stage === 2) { void loadStage2(); return; }
    if (stage === 3) { void loadStage3(); return; }
    void startAssessment();
  };

  const submitAssessment = useCallback(async () => {
    setPhase('submitting');
    try {
      const toResults = (sd: StageData) => ({
        questions: sd.questions,
        answers: Array.from(sd.answers.entries()).map(([qId, chosen]) => ({ questionId: qId, chosen })),
      });
      const result = await api.submitMultiStageAssessment(
        toResults(stageData[1]),
        toResults(stageData[2]),
        toResults(stageData[3]),
      );
      sessionStorage.setItem('nexigrate-assessment-result', JSON.stringify(result));
      router.push('/onboarding/complete');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Submit failed');
      setPhase('quiz');
    }
  }, [stageData, router]);

  const handleNext = useCallback(() => {
    if (timerRef.current) clearInterval(timerRef.current);

    const isLastInStage = idx >= currentQuestions.length - 1;

    if (isLastInStage) {
      // Move to next stage or submit
      if (currentStage === 1) loadStage2();
      else if (currentStage === 2) loadStage3();
      else submitAssessment();
    } else {
      setIdx((i) => i + 1);
      setTimer(45);
    }
  }, [idx, currentQuestions.length, currentStage, submitAssessment]);

  // Timer effect
  useEffect(() => {
    if (phase !== 'quiz') return;
    timerRef.current = setInterval(() => {
      setTimer((p) => {
        if (p <= 1) { handleNext(); return 45; }
        return p - 1;
      });
    }, 1000);
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [phase, idx, currentStage, handleNext]);

  const selectAnswer = (key: string) => {
    setStageData(prev => {
      const stage = prev[currentStage];
      const newAnswers = new Map(stage.answers);
      newAnswers.set(currentQuestions[idx]!.id, key);
      return { ...prev, [currentStage]: { ...stage, answers: newAnswers } };
    });
  };

  // INTRO phase
  if (phase === 'intro') return (
    <div className="flex flex-col items-center">
      <div className="pill">{ts('step', { current: 4, total: 5 })}</div>
      <div className="mt-4 flex w-full max-w-xs gap-1">{[1, 2, 3, 4, 5].map(s => <div key={s} className={`h-1.5 flex-1 rounded-full ${s <= 4 ? 'bg-ember-500' : 'bg-paper-300'}`} />)}</div>
      <h1 className="font-serif mt-8 text-center text-2xl font-semibold text-ink-900">{t('title')}</h1>
      <p className="mt-2 text-center text-sm text-muted-500">{t('subtitle')}</p>
      <div className="paper-card mt-8 w-full p-5">
        <p className="text-sm text-ink-800 leading-relaxed">{t('description')}</p>
        <div className="mt-4 space-y-2">
          <div className="flex items-center gap-2 text-xs text-muted-500">
            <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-amber-100 text-amber-700 text-[10px] font-bold">1</span>
            <span>Core Knowledge — 10 questions across all subjects</span>
          </div>
          <div className="flex items-center gap-2 text-xs text-muted-500">
            <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-amber-100 text-amber-700 text-[10px] font-bold">2</span>
            <span>Difficulty Calibration — 8 targeted questions</span>
          </div>
          <div className="flex items-center gap-2 text-xs text-muted-500">
            <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-amber-100 text-amber-700 text-[10px] font-bold">3</span>
            <span>Weak Area Deep Dive — 5 personalization questions</span>
          </div>
        </div>
      </div>
      <button type="button" onClick={startAssessment} disabled={loading} className="btn-primary mt-6 w-full">
        {loading ? tc('loading') : t('startButton')}
      </button>
    </div>
  );

  // ERROR phase
  if (phase === 'error') return (
    <div className="flex flex-col items-center">
      <div className="pill">{ts('step', { current: 4, total: 5 })}</div>
      <div className="mt-4 flex w-full max-w-xs gap-1">{[1, 2, 3, 4, 5].map(s => <div key={s} className={`h-1.5 flex-1 rounded-full ${s <= 4 ? 'bg-ember-500' : 'bg-paper-300'}`} />)}</div>
      <div className="mt-12 text-center">
        <span className="text-4xl">⚠️</span>
        <h2 className="font-serif mt-4 text-xl font-semibold text-ink-900">Assessment could not be generated</h2>
        <div className="banner banner-error mt-4">{error}</div>
        <p className="mt-3 text-xs text-muted-500">AI service may be busy. Try again in a moment.</p>
      </div>
      <div className="mt-8 flex w-full flex-col gap-3">
        <button type="button" onClick={handleRetry} className="btn-primary w-full">Retry Assessment</button>
      </div>
    </div>
  );

  // STAGE TRANSITION phase — loading next stage
  if (phase === 'stage-transition') return (
    <div className="flex min-h-[40vh] flex-col items-center justify-center">
      <AILoader context="assessment" />
      <p className="mt-4 text-sm font-medium text-ink-800">Calculating next questions...</p>
      <p className="mt-2 text-xs text-muted-500">
        {currentStage === 1
          ? 'Analyzing your core knowledge to calibrate difficulty...'
          : 'Identifying weak areas for deeper assessment...'}
      </p>
      {/* Progress bar */}
      <div className="mt-6 w-full max-w-xs">
        <div className="h-2 w-full overflow-hidden rounded-full bg-paper-200">
          <div className="h-full rounded-full bg-amber-500 transition-all duration-500" style={{ width: `${progressPct}%` }} />
        </div>
        <p className="mt-1 text-center text-[10px] text-muted-400">{globalProgress}/{TOTAL_QUESTIONS} questions completed</p>
      </div>
    </div>
  );

  // SUBMITTING phase
  if (phase === 'submitting') return (
    <div className="flex min-h-[40vh] flex-col items-center justify-center">
      <AILoader context="assessment" />
      <p className="mt-4 text-sm text-muted-500">{t('submitting')}</p>
      <p className="mt-2 text-xs text-muted-400">Personalizing your learning experience...</p>
    </div>
  );

  // QUIZ phase
  if (!currentQuestion) return null;
  const sel = currentAnswers.get(currentQuestion.id);
  const stageLabel = STAGE_LABELS[currentStage];
  const questionInStage = idx + 1;
  const totalInStage = currentQuestions.length;

  return (
    <div className="flex flex-col items-center">
      {/* Onboarding progress */}
      <div className="pill">{ts('step', { current: 4, total: 5 })}</div>
      <div className="mt-4 flex w-full max-w-xs gap-1">{[1, 2, 3, 4, 5].map(s => <div key={s} className={`h-1.5 flex-1 rounded-full ${s <= 4 ? 'bg-ember-500' : 'bg-paper-300'}`} />)}</div>

      {/* Stage indicator */}
      <div className="mt-4 flex w-full items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-amber-500 text-xs font-bold text-stone-900">{currentStage}</span>
          <span className="text-xs font-medium text-ink-800">Stage {currentStage} of 3 — {lang.current === 'hi' ? stageLabel.hi : stageLabel.en}</span>
        </div>
        <span className={`pill ${timer <= 10 ? 'pill-warn' : ''}`}>{t('timeLeft', { seconds: timer })}</span>
      </div>

      {/* Global progress bar */}
      <div className="mt-3 w-full">
        <div className="h-2 w-full overflow-hidden rounded-full bg-paper-200">
          <div className="h-full rounded-full bg-amber-500 transition-all duration-300" style={{ width: `${progressPct}%` }} />
        </div>
        <div className="mt-1 flex justify-between text-[10px] text-muted-400">
          <span>Question {questionInStage}/{totalInStage} in this stage</span>
          <span>{globalProgress + 1}/{TOTAL_QUESTIONS} overall</span>
        </div>
      </div>

      {/* Stage dots (question indicators within stage) */}
      <div className="mt-3 flex w-full gap-1">{currentQuestions.map((_, i) => <div key={i} className={`h-2.5 w-2.5 rounded-full ${i < idx ? 'bg-amber-500' : i === idx ? 'bg-amber-500' : currentAnswers.get(currentQuestions[i]?.id ?? '') ? 'bg-amber-500/40' : 'bg-paper-300'}`} />)}</div>

      {/* Question card */}
      <div className="paper-card mt-5 w-full p-5">
        {currentQuestion.subject && (
          <span className="mb-2 inline-block rounded-full bg-amber-50 px-2 py-0.5 text-[10px] font-medium text-amber-700">
            {currentQuestion.subject}{currentQuestion.topic ? ` • ${currentQuestion.topic}` : ''}
          </span>
        )}
        <p className="text-sm font-medium leading-relaxed text-ink-900">{currentQuestion.question}</p>
        <div className="mt-4 space-y-2">
          {currentQuestion.options.map((opt) => (
            <button key={opt.key} type="button" onClick={() => selectAnswer(opt.key)}
              className={`paper-card card-selectable w-full px-4 py-3 text-left text-sm ${sel === opt.key ? 'card-selected' : ''}`}>
              <span className="font-medium">{opt.key}.</span> {opt.text}
            </button>
          ))}
        </div>
      </div>

      {/* Next button */}
      <button type="button" onClick={handleNext} className="btn-primary mt-4 w-full">
        {idx >= currentQuestions.length - 1
          ? currentStage === 3 ? 'Submit Assessment' : `Next Stage →`
          : tc('next')}
      </button>
    </div>
  );
}
