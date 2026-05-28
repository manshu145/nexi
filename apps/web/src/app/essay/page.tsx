'use client';
import { useEffect, useState, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '~/lib/auth-context';
import { api } from '~/lib/api';
import { Logo } from '~/components/Logo';
import { AILoader } from '~/components/ui/AILoader';

const API = process.env['NEXT_PUBLIC_API_URL'] ?? 'https://api.nexigrate.com';

function getUserLanguage(): 'en' | 'hi' {
  if (typeof document !== 'undefined') {
    const m = document.cookie.match(/nexigrate-language=(en|hi)/);
    if (m) return m[1] as 'en' | 'hi';
  }
  if (typeof localStorage !== 'undefined') {
    const s = localStorage.getItem('nexigrate-language');
    if (s === 'hi' || s === 'en') return s;
  }
  return 'en';
}

interface EssayQuestion {
  topic: string;
  wordLimit: number;
  timeMinutes: number;
  examContext: string;
  hints: string[];
}

interface EssayFeedback {
  overallScore: number;
  maxScore: number;
  breakdown: { axis: string; score: number; max: number; comment: string }[];
  strengths: string[];
  weaknesses: string[];
  improvements: string[];
  rewrittenParagraphs: { original: string; improved: string; reason: string }[];
}

export default function EssayPage() {
  const { user, loading } = useAuth();
  const router = useRouter();
  const [step, setStep] = useState<'generate' | 'write' | 'grading' | 'result'>('generate');
  const [question, setQuestion] = useState<EssayQuestion | null>(null);
  const [answer, setAnswer] = useState('');
  const [feedback, setFeedback] = useState<EssayFeedback | null>(null);
  const [generating, setGenerating] = useState(false);
  const [grading, setGrading] = useState(false);
  const [timeLeft, setTimeLeft] = useState(0);
  const [timerActive, setTimerActive] = useState(false);
  const [usageInfo, setUsageInfo] = useState<{ used: number; limit: number; plan: string } | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => { if (!loading && !user) router.replace('/signin'); }, [user, loading, router]);

  // Fetch usage info
  useEffect(() => {
    if (!user) return;
    (async () => {
      try {
        const meRes = await api.me();
        const plan = meRes.user.plan;
        const token = await user.getIdToken();
        const res = await fetch(`${API}/v1/essay/usage`, { headers: { Authorization: `Bearer ${token}` } });
        if (res.ok) {
          const data = await res.json() as { used: number; limit: number };
          setUsageInfo({ ...data, plan });
        } else {
          // Endpoint may not exist yet — use defaults
          setUsageInfo({ used: 0, limit: plan === 'free' ? 2 : 15, plan });
        }
      } catch {
        setUsageInfo({ used: 0, limit: 2, plan: 'free' });
      }
    })();
  }, [user]);

  // Timer
  useEffect(() => {
    if (timerActive && timeLeft > 0) {
      timerRef.current = setInterval(() => {
        setTimeLeft(t => {
          if (t <= 1) {
            setTimerActive(false);
            return 0;
          }
          return t - 1;
        });
      }, 1000);
      return () => { if (timerRef.current) clearInterval(timerRef.current); };
    }
  }, [timerActive, timeLeft]);

  const formatTime = (secs: number) => {
    const m = Math.floor(secs / 60);
    const s = secs % 60;
    return `${m}:${s.toString().padStart(2, '0')}`;
  };

  const wordCount = answer.trim().split(/\s+/).filter(Boolean).length;

  const handleGenerateQuestion = async () => {
    setGenerating(true);
    try {
      const token = await user!.getIdToken();
      const lang = getUserLanguage();
      const res = await fetch(`${API}/v1/essay/question`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ language: lang }),
      });
      if (!res.ok) {
        // Fallback: generate locally if endpoint doesn't exist
        const meRes = await api.me();
        const exam = meRes.user.targetExam ?? 'upsc-cse';
        setQuestion({
          topic: `Discuss the role of technology in transforming Indian agriculture. Highlight key government initiatives and their impact. (${exam.toUpperCase()} context)`,
          wordLimit: 250,
          timeMinutes: 20,
          examContext: exam,
          hints: ['Cover recent schemes like PM-KISAN', 'Mention AI/drone usage in farming', 'Include statistics if possible'],
        });
      } else {
        const data = await res.json() as { question: EssayQuestion };
        setQuestion(data.question);
      }
      setStep('write');
      setAnswer('');
      setFeedback(null);
    } catch {
      // Fallback question
      setQuestion({
        topic: 'Discuss the importance of digital literacy in rural India. What steps can the government take to bridge the digital divide?',
        wordLimit: 250,
        timeMinutes: 20,
        examContext: 'general',
        hints: ['Cover BharatNet project', 'Mention education access', 'Discuss challenges'],
      });
      setStep('write');
    } finally { setGenerating(false); }
  };

  const handleStartTimer = () => {
    if (question) {
      setTimeLeft(question.timeMinutes * 60);
      setTimerActive(true);
    }
  };

  const handleSubmitAnswer = async () => {
    if (!question || wordCount < 20) return;
    setStep('grading');
    setGrading(true);
    try {
      const token = await user!.getIdToken();
      const lang = getUserLanguage();
      const res = await fetch(`${API}/v1/essay/grade`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ topic: question.topic, answer, wordLimit: question.wordLimit, examContext: question.examContext, language: lang }),
      });
      if (!res.ok) {
        // Fallback: use chat API for grading
        const gradePrompt = `You are a strict UPSC/competitive exam answer evaluator. Grade this answer critically.

QUESTION: ${question.topic}
WORD LIMIT: ${question.wordLimit} words
STUDENT'S ANSWER (${wordCount} words):
${answer}

Evaluate on these axes (score each out of 10):
1. Content & Accuracy
2. Structure & Organization  
3. Language & Grammar
4. Relevance to Question
5. Examples & Evidence
6. Conclusion & Recommendations

Respond ONLY with valid JSON:
{"overallScore":35,"maxScore":60,"breakdown":[{"axis":"Content & Accuracy","score":7,"max":10,"comment":"Good coverage but missed..."}],"strengths":["..."],"weaknesses":["..."],"improvements":["..."],"rewrittenParagraphs":[{"original":"student's weak para","improved":"better version","reason":"why this is better"}]}`;

        const chatRes = await api.sendChat(gradePrompt, undefined);
        // Parse JSON from response
        const jsonMatch = chatRes.response.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          setFeedback(JSON.parse(jsonMatch[0]) as EssayFeedback);
        } else {
          setFeedback({
            overallScore: 30,
            maxScore: 60,
            breakdown: [{ axis: 'Overall', score: 5, max: 10, comment: 'Could not parse detailed feedback. Please try again.' }],
            strengths: ['Answer was submitted'],
            weaknesses: ['Grading service temporarily unavailable'],
            improvements: ['Try again for detailed feedback'],
            rewrittenParagraphs: [],
          });
        }
      } else {
        const data = await res.json() as { feedback: EssayFeedback };
        setFeedback(data.feedback);
      }
      setStep('result');
    } catch {
      setFeedback({
        overallScore: 0,
        maxScore: 60,
        breakdown: [],
        strengths: [],
        weaknesses: ['Grading failed — please try again'],
        improvements: [],
        rewrittenParagraphs: [],
      });
      setStep('result');
    } finally { setGrading(false); }
  };

  if (loading || !user) return <main className="flex min-h-dvh items-center justify-center"><AILoader context="general" /></main>;

  return (
    <main className="mx-auto flex min-h-dvh max-w-2xl flex-col px-5 pt-6 pb-28">
      <header className="flex items-center justify-between">
        <button onClick={() => router.push('/dashboard')} className="btn-ghost-sm">← Dashboard</button>
        <Logo height={36} />
      </header>

      <section className="mt-6">
        <h1 className="font-serif text-xl font-bold text-ink-900">{getUserLanguage() === 'hi' ? '✍️ अभ्यास सेट' : '✍️ Practice Set'}</h1>
        <p className="mt-1 text-sm text-muted-500">{getUserLanguage() === 'hi' ? 'उत्तर लिखें, AI से विस्तृत मूल्यांकन पाएं' : 'Write answers, get AI-graded feedback with detailed analysis'}</p>
        {usageInfo && (
          <p className="mt-2 text-xs text-muted-400">
            Usage: {usageInfo.used}/{usageInfo.limit} this {usageInfo.plan === 'free' ? 'week' : 'month'}
            {usageInfo.plan === 'free' && <span className="text-ember-500 ml-1">· <button onClick={() => router.push('/upgrade')} className="underline">Upgrade for more</button></span>}
          </p>
        )}
      </section>

      {/* Step 1: Generate Question */}
      {step === 'generate' && (
        <section className="mt-8 flex flex-col items-center text-center">
          <span className="text-5xl">✍️</span>
          <h2 className="mt-4 font-serif text-lg font-bold text-ink-900">Ready to Practice?</h2>
          <p className="mt-2 text-sm text-muted-500 max-w-sm">AI will generate a question based on your exam & syllabus. You write the answer, and 3 AI models will grade it like a real examiner.</p>
          <button
            onClick={handleGenerateQuestion}
            disabled={generating || !!(usageInfo && usageInfo.used >= usageInfo.limit)}
            className="btn-primary mt-6 px-8"
          >
            {generating ? 'Generating Question...' : usageInfo && usageInfo.used >= usageInfo.limit ? 'Limit Reached' : 'Generate Question'}
          </button>
          {usageInfo && usageInfo.used >= usageInfo.limit && (
            <p className="mt-3 text-xs text-red-500">You&apos;ve used all your attempts. {usageInfo.plan === 'free' ? 'Upgrade to get 15/month' : 'Resets next month'}.</p>
          )}
        </section>
      )}

      {/* Step 2: Write Answer */}
      {step === 'write' && question && (
        <section className="mt-6 space-y-4">
          {/* Question Card */}
          <div className="paper-card p-5">
            <div className="flex items-start justify-between gap-3">
              <div className="flex-1">
                <p className="text-xs font-semibold uppercase tracking-wider text-ember-500">Question</p>
                <p className="mt-2 text-sm font-medium text-ink-900 leading-relaxed">{question.topic}</p>
              </div>
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
              <span className="px-2 py-1 rounded-full bg-paper-200 text-[10px] font-medium text-ink-700">📝 {question.wordLimit} words</span>
              <span className="px-2 py-1 rounded-full bg-paper-200 text-[10px] font-medium text-ink-700">⏱️ {question.timeMinutes} min</span>
            </div>
            {question.hints.length > 0 && (
              <div className="mt-3 border-t border-line pt-3">
                <p className="text-[10px] font-semibold text-muted-500 uppercase">Hints</p>
                <ul className="mt-1 space-y-0.5">
                  {question.hints.map((h, i) => <li key={i} className="text-xs text-muted-500">• {h}</li>)}
                </ul>
              </div>
            )}
          </div>

          {/* Timer */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              {!timerActive && timeLeft === 0 && (
                <button onClick={handleStartTimer} className="btn-ghost-sm text-xs">⏱️ Start Timer</button>
              )}
              {(timerActive || timeLeft > 0) && (
                <span className={`text-sm font-mono font-bold ${timeLeft < 60 ? 'text-red-500 animate-pulse' : timeLeft < 180 ? 'text-amber-600' : 'text-ink-900'}`}>
                  ⏱️ {formatTime(timeLeft)}
                </span>
              )}
            </div>
            <span className={`text-xs font-medium ${wordCount > question.wordLimit ? 'text-red-500' : 'text-muted-500'}`}>
              {wordCount}/{question.wordLimit} words
            </span>
          </div>

          {/* Answer textarea */}
          <textarea
            ref={textareaRef}
            value={answer}
            onChange={e => setAnswer(e.target.value)}
            placeholder="Start writing your answer here..."
            className="input w-full min-h-[300px] resize-y text-sm leading-relaxed"
            autoFocus
          />

          {/* Submit */}
          <div className="flex gap-3">
            <button
              onClick={handleSubmitAnswer}
              disabled={wordCount < 20}
              className="btn-primary flex-1"
            >
              Submit for Grading
            </button>
            <button onClick={() => { setStep('generate'); setTimerActive(false); }} className="btn-ghost">Cancel</button>
          </div>
        </section>
      )}

      {/* Step 3: Grading */}
      {step === 'grading' && (
        <section className="mt-12 flex flex-col items-center">
          <AILoader context="assessment" />
          <p className="mt-4 text-sm text-muted-500">3 AI models are analyzing your answer...</p>
        </section>
      )}

      {/* Step 4: Results */}
      {step === 'result' && feedback && (
        <section className="mt-6 space-y-4">
          {/* Score Card */}
          <div className="paper-card p-5 text-center">
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-500">Your Score</p>
            <p className="mt-2 font-serif text-4xl font-bold text-ink-900">{feedback.overallScore}<span className="text-lg text-muted-400">/{feedback.maxScore}</span></p>
            <div className="mt-3 h-3 w-full overflow-hidden rounded-full bg-paper-300">
              <div className="h-full rounded-full bg-ember-500 transition-all" style={{ width: `${(feedback.overallScore / feedback.maxScore) * 100}%` }} />
            </div>
            <p className="mt-2 text-xs text-muted-500">{feedback.overallScore >= feedback.maxScore * 0.7 ? 'Excellent work!' : feedback.overallScore >= feedback.maxScore * 0.5 ? 'Good effort. Room for improvement.' : 'Keep practicing. Read the feedback below.'}</p>
          </div>

          {/* Axis Breakdown */}
          {feedback.breakdown.length > 0 && (
            <div className="paper-card p-5">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-500">Detailed Scoring</h3>
              <div className="mt-3 space-y-3">
                {feedback.breakdown.map((b, i) => (
                  <div key={i}>
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-medium text-ink-800">{b.axis}</span>
                      <span className="text-xs font-bold text-ink-900">{b.score}/{b.max}</span>
                    </div>
                    <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-paper-300">
                      <div className="h-full rounded-full bg-gold-500" style={{ width: `${(b.score / b.max) * 100}%` }} />
                    </div>
                    <p className="mt-1 text-[11px] text-muted-500">{b.comment}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Strengths */}
          {feedback.strengths.length > 0 && (
            <div className="paper-card p-5">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-amber-500">✓ Strengths</h3>
              <ul className="mt-2 space-y-1.5">
                {feedback.strengths.map((s, i) => <li key={i} className="text-xs text-ink-800 flex items-start gap-2"><span className="text-amber-500 mt-0.5">•</span>{s}</li>)}
              </ul>
            </div>
          )}

          {/* Weaknesses */}
          {feedback.weaknesses.length > 0 && (
            <div className="paper-card p-5">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-red-500">✗ Areas to Improve</h3>
              <ul className="mt-2 space-y-1.5">
                {feedback.weaknesses.map((w, i) => <li key={i} className="text-xs text-ink-800 flex items-start gap-2"><span className="text-red-500 mt-0.5">•</span>{w}</li>)}
              </ul>
            </div>
          )}

          {/* How to improve */}
          {feedback.improvements.length > 0 && (
            <div className="paper-card p-5">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-amber-600">💡 How to Improve</h3>
              <ul className="mt-2 space-y-1.5">
                {feedback.improvements.map((imp, i) => <li key={i} className="text-xs text-ink-800 flex items-start gap-2"><span className="text-amber-500 mt-0.5">{i + 1}.</span>{imp}</li>)}
              </ul>
            </div>
          )}

          {/* Rewritten paragraphs */}
          {feedback.rewrittenParagraphs.length > 0 && (
            <div className="paper-card p-5">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-500">📝 Better Versions</h3>
              <div className="mt-3 space-y-4">
                {feedback.rewrittenParagraphs.map((rp, i) => (
                  <div key={i} className="space-y-2">
                    <div className="rounded-lg bg-red-50 dark:bg-red-950/20 p-3">
                      <p className="text-[10px] font-semibold text-red-500 uppercase mb-1">Your version</p>
                      <p className="text-xs text-ink-700">{rp.original}</p>
                    </div>
                    <div className="rounded-lg bg-amber-50 dark:bg-amber-950/20 p-3">
                      <p className="text-[10px] font-semibold text-amber-500 uppercase mb-1">Improved version</p>
                      <p className="text-xs text-ink-700">{rp.improved}</p>
                    </div>
                    <p className="text-[10px] text-muted-500 italic">💡 {rp.reason}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Try Again */}
          <div className="flex gap-3 pt-4">
            <button onClick={() => { setStep('generate'); setFeedback(null); setAnswer(''); }} className="btn-primary flex-1">Try Another Question</button>
            <button onClick={() => router.push('/dashboard')} className="btn-ghost flex-1">Back to Dashboard</button>
          </div>
        </section>
      )}
    </main>
  );
}
