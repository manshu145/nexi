'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';
import { useUser } from '~/lib/userStore';
import { api, type GeneratedMCQ, type PersonalQuestion } from '~/lib/api';
import { AILoader } from '~/components/ui/AILoader';

/**
 * Redesigned onboarding assessment (25 questions, 3 stages):
 *   Stage 1 — 5 PERSONAL questions (friendly form, NOT scored). They tell
 *             the AI who the student is so chapters + study plan can be
 *             personalised.
 *   Stage 2 — 15 EXAM-specific MCQs (timed 45s each, scored).
 *   Stage 3 — 5 LOGICAL-REASONING MCQs (timed 60s each, scored).
 *
 * Resilience:
 *   - 90s AbortController ceiling on each AI generation call.
 *   - Progress is persisted to sessionStorage after every step so an
 *     accidental refresh / tab-close resumes instead of regenerating
 *     (and re-charging AI tokens for) questions already answered. (S9)
 */

type Phase = 'intro' | 'personal' | 'exam' | 'transition' | 'reasoning' | 'submitting' | 'error';

const EXAM_TIMER = 45;
const REASONING_TIMER = 60;
const TOTAL = 25; // 5 personal + 15 exam + 5 reasoning
const STORAGE_KEY = 'nexigrate-assessment-v2';

interface Snapshot {
  phase: Phase;
  personalAnswers: Record<string, string>;
  examQ: GeneratedMCQ[];
  examA: Record<string, string | null>;
  reasoningQ: GeneratedMCQ[];
  reasoningA: Record<string, string | null>;
  idx: number;
}

export default function AssessmentPage() {
  const t = useTranslations('onboarding.assessment');
  const ts = useTranslations('onboarding');
  const tc = useTranslations('common');
  const router = useRouter();
  const { user: me, mutate } = useUser();

  const [phase, setPhase] = useState<Phase>('intro');
  const [personalQuestions, setPersonalQuestions] = useState<PersonalQuestion[]>([]);
  const [personalAnswers, setPersonalAnswers] = useState<Record<string, string>>({});
  const [examQ, setExamQ] = useState<GeneratedMCQ[]>([]);
  const [examA, setExamA] = useState<Record<string, string | null>>({});
  const [reasoningQ, setReasoningQ] = useState<GeneratedMCQ[]>([]);
  const [reasoningA, setReasoningA] = useState<Record<string, string | null>>({});
  const [idx, setIdx] = useState(0);
  const [timer, setTimer] = useState(EXAM_TIMER);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const restoredRef = useRef(false);
  const lang = useRef<'en' | 'hi'>('en');
  const hi = lang.current === 'hi';

  // Language detection (cookie → localStorage).
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

  // ── sessionStorage persistence (S9) ──────────────────────────────────
  // Restore once on mount.
  useEffect(() => {
    if (restoredRef.current) return;
    restoredRef.current = true;
    try {
      const raw = sessionStorage.getItem(STORAGE_KEY);
      if (!raw) return;
      const s = JSON.parse(raw) as Snapshot;
      // Only resume mid-flow states that have real content.
      if (s.phase === 'exam' && s.examQ?.length) {
        setPersonalAnswers(s.personalAnswers ?? {});
        setExamQ(s.examQ); setExamA(s.examA ?? {});
        setIdx(s.idx ?? 0); setTimer(EXAM_TIMER); setPhase('exam');
      } else if (s.phase === 'reasoning' && s.reasoningQ?.length) {
        setPersonalAnswers(s.personalAnswers ?? {});
        setExamQ(s.examQ ?? []); setExamA(s.examA ?? {});
        setReasoningQ(s.reasoningQ); setReasoningA(s.reasoningA ?? {});
        setIdx(s.idx ?? 0); setTimer(REASONING_TIMER); setPhase('reasoning');
      } else if (s.phase === 'personal' && Object.keys(s.personalAnswers ?? {}).length) {
        setPersonalAnswers(s.personalAnswers);
      }
    } catch { /* ignore corrupt snapshot */ }
  }, []);

  // Persist snapshot whenever meaningful state changes mid-flow.
  useEffect(() => {
    if (phase === 'intro' || phase === 'submitting' || phase === 'error') return;
    const snap: Snapshot = { phase, personalAnswers, examQ, examA, reasoningQ, reasoningA, idx };
    try { sessionStorage.setItem(STORAGE_KEY, JSON.stringify(snap)); } catch { /* quota — ignore */ }
  }, [phase, personalAnswers, examQ, examA, reasoningQ, reasoningA, idx]);

  // Clean up in-flight generation on unmount.
  useEffect(() => () => { abortRef.current?.abort(); }, []);

  function makeTimeout(): { signal: AbortSignal; done: () => void } {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    const id = window.setTimeout(() => controller.abort(), 90_000);
    return { signal: controller.signal, done: () => { window.clearTimeout(id); if (abortRef.current === controller) abortRef.current = null; } };
  }

  function failWith(err: unknown, fallback: string) {
    const aborted = err instanceof DOMException && err.name === 'AbortError';
    const msg = aborted ? 'Generation took longer than 90 seconds. Tap Retry to try again.' : (err instanceof Error ? err.message : fallback);
    setError(msg); setPhase('error'); toast.error(msg);
  }

  // ── Stage loaders ────────────────────────────────────────────────────
  const startPersonal = async () => {
    setLoading(true); setError(null);
    try {
      const res = await api.getPersonalQuestions();
      setPersonalQuestions(res.questions);
      setPhase('personal');
    } catch (err) {
      failWith(err, 'Could not load the assessment.');
    } finally { setLoading(false); }
  };

  const loadExam = async () => {
    setPhase('transition');
    const { signal, done } = makeTimeout();
    try {
      const exam = me?.targetExam ?? 'jee-main';
      const res = await api.getExamAssessmentQuestions(exam, lang.current, { signal });
      done();
      if (!res.questions?.length) throw new Error('No exam questions received.');
      setExamQ(res.questions); setExamA({}); setIdx(0); setTimer(EXAM_TIMER); setPhase('exam');
    } catch (err) { done(); failWith(err, 'Failed to generate exam questions.'); }
  };

  const loadReasoning = async () => {
    setPhase('transition');
    const { signal, done } = makeTimeout();
    try {
      const res = await api.getReasoningAssessmentQuestions(lang.current, { signal });
      done();
      if (!res.questions?.length) throw new Error('No reasoning questions received.');
      setReasoningQ(res.questions); setReasoningA({}); setIdx(0); setTimer(REASONING_TIMER); setPhase('reasoning');
    } catch (err) { done(); failWith(err, 'Failed to generate reasoning questions.'); }
  };

  const handleRetry = () => {
    // Resume from the furthest-along stage we have content for.
    if (reasoningQ.length === 0 && examQ.length > 0 && Object.keys(examA).length >= examQ.length) { void loadReasoning(); return; }
    if (examQ.length === 0 && Object.keys(personalAnswers).length >= 5) { void loadExam(); return; }
    if (personalQuestions.length === 0) { void startPersonal(); return; }
    setPhase(examQ.length ? 'exam' : 'personal');
  };

  const submit = useCallback(async () => {
    setPhase('submitting');
    try {
      const examResults = { questions: examQ, answers: Object.entries(examA).map(([questionId, chosen]) => ({ questionId, chosen })) };
      const reasoningResults = { questions: reasoningQ, answers: Object.entries(reasoningA).map(([questionId, chosen]) => ({ questionId, chosen })) };
      const result = await api.submitAssessmentV2(personalAnswers, examResults, reasoningResults);
      // Propagate the freshly-computed level/score into the SHARED user
      // store immediately. Without this the store keeps serving the stale
      // login snapshot (onboardingLevel still null), and the dashboard
      // guard bounces the user straight back to /onboarding/assessment
      // after they finish the plan step (founder report). submitAssessmentV2
      // only returns the AssessmentResult, so we patch the two fields the
      // guard reads rather than waiting for a /me round-trip.
      mutate((prev) => (prev ? { ...prev, onboardingLevel: result.level, onboardingScore: result.score } : prev));
      sessionStorage.setItem('nexigrate-assessment-result', JSON.stringify(result));
      sessionStorage.removeItem(STORAGE_KEY);
      router.push('/onboarding/complete');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Submit failed');
      setPhase('reasoning');
    }
  }, [examQ, examA, reasoningQ, reasoningA, personalAnswers, router, mutate]);

  // ── Active quiz stage helpers ─────────────────────────────────────────
  const isExam = phase === 'exam';
  const questions = isExam ? examQ : reasoningQ;
  const answers = isExam ? examA : reasoningA;
  const setAnswers = isExam ? setExamA : setReasoningA;
  const currentQuestion = questions[idx];

  const answeredBefore = isExam ? 5 : 20; // personal(5) [+ exam(15)]
  const globalProgress = answeredBefore + idx;
  const progressPct = Math.round((globalProgress / TOTAL) * 100);

  const advance = useCallback(() => {
    if (timerRef.current) clearInterval(timerRef.current);
    const last = idx >= questions.length - 1;
    if (last) {
      if (isExam) void loadReasoning();
      else void submit();
    } else {
      setIdx((i) => i + 1);
      setTimer(isExam ? EXAM_TIMER : REASONING_TIMER);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [idx, questions.length, isExam, submit]);

  // Timer for quiz stages.
  useEffect(() => {
    if (phase !== 'exam' && phase !== 'reasoning') return;
    timerRef.current = setInterval(() => {
      setTimer((p) => { if (p <= 1) { advance(); return isExam ? EXAM_TIMER : REASONING_TIMER; } return p - 1; });
    }, 1000);
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [phase, idx, advance, isExam]);

  const selectAnswer = (key: string) => {
    if (!currentQuestion) return;
    setAnswers((prev) => ({ ...prev, [currentQuestion.id]: key }));
  };

  // ── Onboarding step header (shared) ───────────────────────────────────
  const StepHeader = () => (
    <>
      <div className="pill">{ts('step', { current: 4, total: 5 })}</div>
      <div className="mt-4 flex w-full max-w-xs gap-1">{[1, 2, 3, 4, 5].map(s => <div key={s} className={`h-1.5 flex-1 rounded-full ${s <= 4 ? 'bg-ember-500' : 'bg-paper-300'}`} />)}</div>
    </>
  );

  // ── INTRO ─────────────────────────────────────────────────────────────
  if (phase === 'intro') return (
    <div className="flex flex-col items-center">
      <StepHeader />
      <h1 className="font-serif mt-8 text-center text-2xl font-semibold text-ink-900">{t('title')}</h1>
      <p className="mt-2 text-center text-sm text-muted-500">{t('subtitle')}</p>
      <div className="paper-card mt-8 w-full p-5">
        <p className="text-sm text-ink-800 leading-relaxed">
          {hi ? 'यह 25-प्रश्नों का आकलन हमें आपको समझने में मदद करता है ताकि हम आपके लिए सही स्तर के चैप्टर बना सकें।' : 'This 25-question assessment helps us understand you so we can build chapters at the right level for you.'}
        </p>
        <div className="mt-4 space-y-2">
          {[
            hi ? '5 निजी सवाल — आपको जानने के लिए (स्कोर नहीं)' : '5 personal questions — to know you (not scored)',
            hi ? '15 परीक्षा सवाल — आपका स्तर जाँचने के लिए' : '15 exam questions — to gauge your level',
            hi ? '5 तर्कशक्ति सवाल — सीखने की क्षमता' : '5 reasoning questions — learning ability',
          ].map((txt, i) => (
            <div key={i} className="flex items-center gap-2 text-xs text-muted-500">
              <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-ember-500/10 text-[10px] font-bold text-ember-600">{i + 1}</span>
              <span>{txt}</span>
            </div>
          ))}
        </div>
      </div>
      <button type="button" onClick={startPersonal} disabled={loading} className="btn-primary mt-6 w-full">
        {loading ? tc('loading') : t('startButton')}
      </button>
    </div>
  );

  // ── ERROR ───────────────────────────────────────────────────────────────
  if (phase === 'error') return (
    <div className="flex flex-col items-center">
      <StepHeader />
      <div className="mt-12 text-center">
        <span className="text-4xl">⚠️</span>
        <h2 className="font-serif mt-4 text-xl font-semibold text-ink-900">{hi ? 'आकलन तैयार नहीं हो सका' : 'Assessment could not be generated'}</h2>
        <div className="banner banner-error mt-4">{error}</div>
        <p className="mt-3 text-xs text-muted-500">{hi ? 'AI सेवा व्यस्त हो सकती है। एक पल में दोबारा कोशिश करें।' : 'AI service may be busy. Try again in a moment.'}</p>
      </div>
      <button type="button" onClick={handleRetry} className="btn-primary mt-8 w-full">{hi ? 'पुनः प्रयास करें' : 'Retry'}</button>
    </div>
  );

  // ── PERSONAL (form, no timer) ─────────────────────────────────────────
  if (phase === 'personal') {
    const allAnswered = personalQuestions.length > 0 && personalQuestions.every(q => personalAnswers[q.field]);
    return (
      <div className="flex flex-col items-center">
        <StepHeader />
        <h1 className="font-serif mt-6 text-center text-xl font-semibold text-ink-900">{hi ? 'पहले, आपको थोड़ा जान लें' : 'First, help us know you'}</h1>
        <p className="mt-1 text-center text-xs text-muted-500">{hi ? 'इनका कोई सही/गलत जवाब नहीं है — ये आपकी पढ़ाई को आपके अनुसार बनाते हैं।' : 'No right or wrong answers — these tailor your learning to you.'}</p>
        <div className="mt-6 w-full space-y-4">
          {personalQuestions.map((q, qi) => (
            <div key={q.id} className="paper-card p-4">
              <p className="text-sm font-medium text-ink-900"><span className="text-muted-400">{qi + 1}.</span> {hi ? q.questionHi : q.question}</p>
              <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
                {q.options.map(opt => {
                  const chosen = personalAnswers[q.field] === opt.value;
                  return (
                    <button key={opt.value} type="button"
                      onClick={() => setPersonalAnswers(prev => ({ ...prev, [q.field]: opt.value }))}
                      className={`rounded-lg border px-3 py-2.5 text-left text-sm transition-colors ${chosen ? 'border-ember-500 bg-ember-500/10 text-ink-900' : 'border-line bg-paper-50 text-ink-800 hover:border-ember-500/40'}`}>
                      {hi ? opt.labelHi : opt.label}
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
        <button type="button" onClick={() => void loadExam()} disabled={!allAnswered} className="btn-primary mt-6 w-full disabled:opacity-50">
          {allAnswered ? (hi ? 'आगे बढ़ें →' : 'Continue →') : (hi ? 'सभी सवालों के जवाब दें' : 'Answer all questions')}
        </button>
      </div>
    );
  }

  // ── TRANSITION ────────────────────────────────────────────────────────
  if (phase === 'transition') return (
    <div className="flex min-h-[40vh] flex-col items-center justify-center">
      <AILoader context="assessment" />
      <p className="mt-4 text-sm font-medium text-ink-800">{hi ? 'अगले सवाल तैयार हो रहे हैं…' : 'Preparing your questions…'}</p>
      <div className="mt-6 w-full max-w-xs">
        <div className="h-2 w-full overflow-hidden rounded-full bg-paper-200">
          <div className="h-full rounded-full bg-ember-500 transition-all duration-500" style={{ width: `${progressPct}%` }} />
        </div>
      </div>
    </div>
  );

  // ── SUBMITTING ────────────────────────────────────────────────────────
  if (phase === 'submitting') return (
    <div className="flex min-h-[40vh] flex-col items-center justify-center">
      <AILoader context="assessment" />
      <p className="mt-4 text-sm text-muted-500">{t('submitting')}</p>
      <p className="mt-2 text-xs text-muted-400">{hi ? 'आपका अनुभव व्यक्तिगत बनाया जा रहा है…' : 'Personalizing your learning experience…'}</p>
    </div>
  );

  // ── QUIZ (exam / reasoning) ───────────────────────────────────────────
  if (!currentQuestion) return null;
  const sel = answers[currentQuestion.id];
  const sectionLabel = isExam ? (hi ? 'परीक्षा ज्ञान' : 'Exam Knowledge') : (hi ? 'तर्कशक्ति' : 'Logical Reasoning');
  const sectionNo = isExam ? 2 : 3;

  return (
    <div className="flex flex-col items-center">
      <StepHeader />
      <div className="mt-4 flex w-full items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-ember-500 text-xs font-bold text-paper-50">{sectionNo}</span>
          <span className="text-xs font-medium text-ink-800">{hi ? `भाग ${sectionNo}/3 — ` : `Stage ${sectionNo} of 3 — `}{sectionLabel}</span>
        </div>
        <span className={`pill ${timer <= 10 ? 'pill-warn' : ''}`}>{t('timeLeft', { seconds: timer })}</span>
      </div>

      <div className="mt-3 w-full">
        <div className="h-2 w-full overflow-hidden rounded-full bg-paper-200">
          <div className="h-full rounded-full bg-ember-500 transition-all duration-300" style={{ width: `${progressPct}%` }} />
        </div>
        <div className="mt-1 flex justify-between text-[10px] text-muted-400">
          <span>{hi ? `इस भाग में ${idx + 1}/${questions.length}` : `Question ${idx + 1}/${questions.length} in this stage`}</span>
          <span>{globalProgress + 1}/{TOTAL} {hi ? 'कुल' : 'overall'}</span>
        </div>
      </div>

      <div className="paper-card mt-5 w-full p-5">
        {currentQuestion.subject && (
          <span className="mb-2 inline-block rounded-full bg-ember-500/10 px-2 py-0.5 text-[10px] font-medium text-ember-600">
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

      <button type="button" onClick={advance} className="btn-primary mt-4 w-full">
        {idx >= questions.length - 1
          ? (isExam ? (hi ? 'अगला भाग →' : 'Next Stage →') : (hi ? 'आकलन जमा करें' : 'Submit Assessment'))
          : tc('next')}
      </button>
      {sel === undefined && (
        <p className="mt-2 text-center text-[11px] text-muted-400">{hi ? 'बिना उत्तर छोड़ सकते हैं — कोई नकारात्मक अंक नहीं' : 'You can skip — no negative marking here'}</p>
      )}
    </div>
  );
}
