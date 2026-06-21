'use client';
import { useEffect, useState, useRef, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useAuth } from '~/lib/auth-context';
import { api, type GeneratedMCQ } from '~/lib/api';
import { Logo } from '~/components/Logo';
import { AILoader } from '~/components/ui/AILoader';
import { getClientLocale } from '~/lib/locale';
import { track } from '~/lib/analytics';
import { toast } from 'sonner';
import { buildQuizResultImage, buildQuizReviewPdf, buildReviewText, downloadBlob, shareViaWhatsApp, shareViaTelegram } from '~/lib/quizShare';

type Phase = 'rules' | 'loading' | 'quiz' | 'submitting' | 'result';

export default function CurrentAffairsQuizPage() {
  const t = useTranslations('caQuiz');
  const { user, loading } = useAuth();
  const router = useRouter();
  const [phase, setPhase] = useState<Phase>('rules');
  const [questions, setQuestions] = useState<GeneratedMCQ[]>([]);
  const [idx, setIdx] = useState(0);
  const [answers, setAnswers] = useState<number[]>([]);
  const [timeLeft, setTimeLeft] = useState(600); // 10 minutes = 600 seconds
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{ score: number; correct: number; total: number; rank: number; timeTaken: number } | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const startTimeRef = useRef<number>(0);
  const quizIdRef = useRef<string | undefined>(undefined);

  useEffect(() => { if (!loading && !user) router.replace('/signin'); }, [user, loading, router]);

  const startQuiz = async () => {
    setPhase('loading');
    try {
      const lang = getClientLocale();
      const res = await api.getCurrentAffairsQuiz(lang);
      if (!res.questions || res.questions.length === 0) {
        setError(t('errNoQuiz'));
        setPhase('rules');
        return;
      }
      quizIdRef.current = res.quizId;
      setQuestions(res.questions);
      setAnswers(new Array(res.questions.length).fill(-1));
      setPhase('quiz');
      startTimeRef.current = Date.now();
      setTimeLeft(600);
    } catch (e) {
      const msg = e instanceof Error ? e.message : t('errLoad');
      setError(msg.includes('fetch') ? t('errGenerating') : msg.includes('404') ? t('errNotRun') : msg);
      setPhase('rules');
    }
  };

  // Use ref to always have latest answers (avoids stale closure bug)
  const answersRef = useRef<number[]>([]);
  answersRef.current = answers;

  // ── Share / save helpers (result + review "samiksha") ─────────────────────
  const lang = getClientLocale() as 'en' | 'hi';
  const shareUrl = typeof window !== 'undefined' ? `${window.location.origin}/current-affairs/quiz` : 'https://app.nexigrate.com/current-affairs/quiz';
  const resultText = useCallback(() => {
    if (!result) return '';
    return lang === 'hi'
      ? `मैंने आज का करेंट अफेयर्स क्विज़ दिया — ${result.correct}/${result.total} सही (${result.score}%)! तुम भी आज़माओ 👉 ${shareUrl}`
      : `I scored ${result.correct}/${result.total} (${result.score}%) on today's Current Affairs quiz on Nexigrate! Beat me 👉 ${shareUrl}`;
  }, [result, lang, shareUrl]);

  const shareResult = useCallback(async () => {
    if (!result) return;
    const text = resultText();
    try {
      const file = await buildQuizResultImage({ score: result.score, correct: result.correct, total: result.total, rank: result.rank, url: shareUrl, lang });
      if (file && typeof navigator.canShare === 'function' && navigator.canShare({ files: [file] })) {
        await navigator.share({ files: [file], text, title: 'Quiz result' });
        return;
      }
    } catch { /* image/share unsupported or cancelled → fall through */ }
    if (navigator.share) { try { await navigator.share({ text, url: shareUrl }); return; } catch { /* cancelled */ } }
    try { await navigator.clipboard.writeText(text); toast.success(lang === 'hi' ? 'कॉपी हो गया' : 'Copied to clipboard'); } catch { /* ignore */ }
  }, [result, resultText, shareUrl, lang]);

  const saveReviewPdf = useCallback(() => {
    if (!questions.length) return;
    try {
      const blob = buildQuizReviewPdf({ questions, answers: answersRef.current, score: result?.score ?? 0, correct: result?.correct ?? 0, total: result?.total ?? questions.length, url: shareUrl, lang });
      downloadBlob(blob, 'nexigrate-quiz-review.pdf');
      toast.success(lang === 'hi' ? 'PDF डाउनलोड हो गया' : 'Review PDF downloaded');
    } catch { toast.error(lang === 'hi' ? 'PDF नहीं बन पाया' : 'Could not build the PDF'); }
  }, [questions, result, shareUrl, lang]);

  const shareReview = useCallback(async () => {
    if (!questions.length) return;
    const text = buildReviewText({ questions, answers: answersRef.current, score: result?.score ?? 0, correct: result?.correct ?? 0, total: result?.total ?? questions.length, url: shareUrl, lang });
    if (navigator.share) { try { await navigator.share({ text, title: lang === 'hi' ? 'क्विज़ समीक्षा' : 'Quiz review' }); return; } catch { /* cancelled → fall through */ } }
    try { await navigator.clipboard.writeText(text); toast.success(lang === 'hi' ? 'समीक्षा कॉपी हो गई' : 'Review copied to clipboard'); } catch { /* ignore */ }
  }, [questions, result, shareUrl, lang]);

  const submitQuiz = useCallback(async () => {
    if (timerRef.current) clearInterval(timerRef.current);
    setPhase('submitting');
    const timeTaken = Math.max(1, Math.round((Date.now() - startTimeRef.current) / 1000));
    try {
      const res = await api.submitCurrentAffairsQuiz(answersRef.current, timeTaken, quizIdRef.current);
      track('ca_quiz_attempt');
      setResult(res);
      setPhase('result');
    } catch (e) {
      setError(e instanceof Error ? e.message : t('errSubmit'));
      setPhase('quiz');
    }
  }, [t]);

  // Global timer
  useEffect(() => {
    if (phase !== 'quiz') return;
    timerRef.current = setInterval(() => {
      setTimeLeft(prev => {
        if (prev <= 1) { submitQuiz(); return 0; }
        return prev - 1;
      });
    }, 1000);
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [phase, submitQuiz]);

  if (loading || !user) return <main className="flex min-h-dvh items-center justify-center"><AILoader context="quiz" /></main>;

  // RULES screen
  if (phase === 'rules') return (
    <main className="mx-auto flex min-h-dvh max-w-lg flex-col items-center justify-center px-5 py-12">
      <span className="text-5xl">📝</span>
      <h1 className="font-serif mt-6 text-2xl font-bold text-ink-900">{t('title')}</h1>
      <div className="paper-card mt-6 w-full p-5 space-y-3">
        <div className="flex items-center gap-3"><span className="text-lg">📋</span><p className="text-sm text-ink-800">{t('rule20q')}</p></div>
        <div className="flex items-center gap-3"><span className="text-lg">⏱️</span><p className="text-sm text-ink-800">{t('rule10min')}</p></div>
        <div className="flex items-center gap-3"><span className="text-lg">🚫</span><p className="text-sm text-ink-800">{t('ruleNoBack')}</p></div>
        <div className="flex items-center gap-3"><span className="text-lg">🏆</span><p className="text-sm text-ink-800">{t('ruleCompete')}</p></div>
      </div>
      {error && <div className="banner banner-error mt-4 w-full">{error}</div>}
      <button onClick={startQuiz} className="btn-primary mt-6 w-full">{t('startQuiz')}</button>
      <button onClick={() => router.push('/current-affairs/quiz/archive')} className="btn-ghost mt-3 w-full">{t('viewArchive')}</button>
      <button onClick={() => router.back()} className="btn-ghost mt-3 w-full">{t('back')}</button>
    </main>
  );

  // LOADING
  if (phase === 'loading') return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-3">
      <AILoader context="quiz" />
      <p className="text-sm text-muted-500">{t('loadingQuiz')}</p>
    </main>
  );

  // SUBMITTING
  if (phase === 'submitting') return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-3">
      <AILoader context="quiz" />
      <p className="text-sm text-muted-500">{t('calculating')}</p>
    </main>
  );

  // RESULT
  if (phase === 'result' && result) return (
    <main className="mx-auto flex min-h-dvh max-w-lg flex-col items-center justify-center px-5 py-12">
      <div className="flex h-20 w-20 items-center justify-center rounded-full bg-paper-200 border-2 border-gold-500">
        <span className="text-3xl">{result.score >= 70 ? '🎉' : result.score >= 40 ? '👍' : '📖'}</span>
      </div>
      <h1 className="font-serif mt-6 text-2xl font-bold text-ink-900">{t('quizComplete')}</h1>
      <p className="mt-3 text-lg text-ink-800">
        {t('scoreLine', { score: result.score, correct: result.correct, total: result.total })}
      </p>
      <p className="mt-1 text-sm text-muted-500">
        {t('timeRank', { time: `${Math.floor(result.timeTaken / 60)}:${String(result.timeTaken % 60).padStart(2, '0')}`, rank: result.rank })}
      </p>

      {/* Share result */}
      <div className="mt-6 w-full">
        <p className="mb-2 text-center text-xs font-medium text-muted-500">{lang === 'hi' ? 'अपना रिज़ल्ट शेयर करें' : 'Share your result'}</p>
        <div className="flex items-center justify-center gap-2">
          <button onClick={shareResult} className="flex-1 rounded-xl bg-ink-900 px-3 py-2.5 text-sm font-semibold text-paper-50 transition active:scale-95">{lang === 'hi' ? 'शेयर (इमेज)' : 'Share (image)'}</button>
          <button onClick={() => shareViaWhatsApp(resultText())} aria-label="WhatsApp" className="rounded-xl bg-[#25D366] px-3.5 py-2.5 text-sm font-bold text-white transition active:scale-95">WA</button>
          <button onClick={() => shareViaTelegram(resultText(), shareUrl)} aria-label="Telegram" className="rounded-xl bg-[#229ED9] px-3.5 py-2.5 text-sm font-bold text-white transition active:scale-95">TG</button>
        </div>
      </div>

      <div className="mt-4 flex w-full flex-col gap-3">
        <button onClick={() => router.push('/current-affairs/quiz/leaderboard')} className="btn-primary w-full">{t('viewLeaderboard')}</button>
        <button onClick={() => router.push('/current-affairs')} className="btn-ghost w-full">{t('backToCA')}</button>
        <button onClick={() => router.push('/dashboard')} className="btn-ghost w-full">{t('dashboard')}</button>
      </div>

      {/* Answer review */}
      <section className="mt-10 w-full">
        <div className="flex items-center justify-between gap-2">
          <h2 className="font-serif text-lg font-semibold text-ink-900">{t('review')}</h2>
          <div className="flex items-center gap-2">
            <button onClick={saveReviewPdf} className="rounded-lg border border-line bg-paper-50 px-3 py-1.5 text-xs font-medium text-ink-800 transition active:scale-95">{lang === 'hi' ? 'PDF सेव करें' : 'Save PDF'}</button>
            <button onClick={shareReview} className="rounded-lg border border-line bg-paper-50 px-3 py-1.5 text-xs font-medium text-ink-800 transition active:scale-95">{lang === 'hi' ? 'शेयर' : 'Share'}</button>
          </div>
        </div>
        <div className="mt-4 space-y-3">
          {questions.map((q, i) => {
            const userAns = answers[i];
            const ansKeys = ['A', 'B', 'C', 'D'];
            const isCorrect = ansKeys[userAns ?? -1] === q.correctOption;
            return (
              <div key={q.id} className="paper-card p-4">
                <div className="flex items-start gap-2">
                  <span className={`flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full text-xs font-bold ${isCorrect ? 'bg-gold-500 text-paper-50' : 'bg-ember-500 text-paper-50'}`}>
                    {isCorrect ? '✓' : '✗'}
                  </span>
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-ink-900">{q.question}</p>
                    <p className="mt-1 text-xs text-muted-500">
                      {t('yourAnswer', { answer: userAns != null && userAns >= 0 ? ansKeys[userAns]! : t('skipped') })} · {t('correctAnswer', { answer: q.correctOption })}
                    </p>
                    <p className="mt-1 text-xs text-ink-700">{q.explanation}</p>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </section>
    </main>
  );

  // QUIZ phase — guard against empty questions array (no quiz generated)
  const q = questions[idx];
  if (!q) return (
    <main className="mx-auto flex min-h-dvh max-w-lg flex-col items-center justify-center px-5 py-12">
      <span className="text-4xl">📭</span>
      <h2 className="font-serif mt-4 text-xl font-bold text-ink-900">{t('noQuizTitle')}</h2>
      <p className="mt-2 text-sm text-muted-500 text-center">{t('noQuizDesc')}</p>
      <button onClick={() => { setPhase('rules'); setError(null); }} className="btn-primary mt-6 w-full">{t('tryAgain')}</button>
      <button onClick={() => router.push('/current-affairs')} className="btn-ghost mt-2 w-full">{t('backToNews')}</button>
    </main>
  );
  const mins = Math.floor(timeLeft / 60);
  const secs = timeLeft % 60;

  return (
    <main className="mx-auto flex min-h-dvh max-w-lg flex-col px-5 pt-6 pb-16">
      <header className="flex items-center justify-between">
        <Logo height={36} />
        <span className={`pill font-mono ${timeLeft <= 60 ? 'pill-warn' : ''}`}>
          {mins}:{String(secs).padStart(2, '0')}
        </span>
      </header>

      {/* Progress */}
      <div className="mt-4 flex items-center justify-between">
        <p className="text-sm font-medium text-ink-800">{t('question', { n: idx + 1, total: questions.length })}</p>
        <p className="text-xs text-muted-500">{t('answeredCount', { n: answers.filter(a => a >= 0).length })}</p>
      </div>
      <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-paper-300">
        <div className="h-full rounded-full bg-ember-500 transition-all" style={{ width: `${((idx + 1) / questions.length) * 100}%` }} />
      </div>

      {/* Question dots */}
      <div className="mt-3 flex flex-wrap gap-1">
        {questions.map((_, i) => (
          <div key={i} className={`h-2 w-2 rounded-full ${i === idx ? 'bg-ember-500' : answers[i] != null && answers[i]! >= 0 ? 'bg-gold-500' : 'bg-paper-300'}`} />
        ))}
      </div>

      {/* Question card */}
      <div className="paper-card mt-5 p-5">
        <p className="text-xs text-muted-500 mb-2">{q.topic ?? t('currentAffairs')} · {q.difficulty}</p>
        <p className="font-serif text-base font-medium leading-relaxed text-ink-900">{q.question}</p>
        <div className="mt-4 space-y-2">
          {q.options.map((opt, optIdx) => (
            <button
              key={opt.key}
              onClick={() => {
                const newAnswers = [...answers];
                newAnswers[idx] = optIdx;
                setAnswers(newAnswers);
              }}
              className={`paper-card card-selectable w-full px-4 py-3 text-left text-sm ${answers[idx] === optIdx ? 'card-selected' : ''}`}
            >
              <span className="font-bold">{opt.key}.</span> {opt.text}
            </button>
          ))}
        </div>
      </div>

      {/* Navigation — no back button */}
      <div className="mt-4">
        {idx >= questions.length - 1 ? (
          <button onClick={submitQuiz} className="btn-primary w-full">{t('submitQuiz')}</button>
        ) : (
          <button onClick={() => setIdx(i => i + 1)} className="btn-primary w-full">{t('next')}</button>
        )}
      </div>
    </main>
  );
}
