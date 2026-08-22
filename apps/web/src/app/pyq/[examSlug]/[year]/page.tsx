'use client';

/**
 * PYQ paper view — practice + review.
 *
 * Loads a single (exam, year, language) paper (generated + cached on
 * demand server-side) and lets the student either:
 *   • Practice: tap an option, instantly see correct/incorrect + the
 *     explanation, and watch a running score.
 *   • Review: flip "Show all answers" to reveal every correct option +
 *     explanation at once for fast revision.
 *
 * Brand tokens only (paper / ink / ember / muted / line / emerald).
 */

import { useEffect, useRef, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useAuth } from '~/lib/auth-context';
import { useUser } from '~/lib/userStore';
import { api } from '~/lib/api';
import type { PYQPaper } from '@nexigrate/shared';
import { AILoader } from '~/components/ui/AILoader';

type Choice = 'A' | 'B' | 'C' | 'D';

export default function PYQPaperPage() {
  const router = useRouter();
  const params = useParams();
  const { user, loading: authLoading } = useAuth();
  const { user: me, loading: meLoading } = useUser();

  const examSlug = String(params['examSlug'] ?? '');
  const year = Number(params['year']);
  const lang = (me?.language === 'hi' ? 'hi' : 'en') as 'en' | 'hi';
  const isHi = lang === 'hi';

  const [paper, setPaper] = useState<PYQPaper | null>(null);
  const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [answers, setAnswers] = useState<Record<string, Choice>>({});
  const [revealAll, setRevealAll] = useState(false);
  const loadedFor = useRef<string>('');

  useEffect(() => { if (!authLoading && !user) router.replace('/signin'); }, [user, authLoading, router]);

  const load = () => {
    setState('loading');
    setErrorMsg(null);
    void (async () => {
      try {
        const res = await api.getPYQPaper(examSlug, year, lang);
        setPaper(res.paper);
        setAnswers({});
        setRevealAll(false);
        setState('ready');
      } catch (err) {
        setErrorMsg(err instanceof Error ? err.message : 'Failed to load the paper');
        setState('error');
      }
    })();
  };

  useEffect(() => {
    if (!me) return;
    const key = `${examSlug}_${year}_${lang}`;
    if (loadedFor.current === key) return;
    loadedFor.current = key;
    if (!examSlug || !Number.isFinite(year)) { setState('error'); setErrorMsg('Invalid paper'); return; }
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [me, examSlug, year, lang]);

  if (authLoading || meLoading || !user || !me) {
    return <main className="min-h-dvh bg-paper-100"><AILoader context="general" /></main>;
  }

  if (state === 'loading') {
    return (
      <main className="mx-auto min-h-dvh max-w-2xl px-4 py-6">
        <div className="paper-card p-8 text-center">
          <AILoader context="general" />
          <p className="mt-4 text-sm font-medium text-ink-900">{isHi ? 'प्रश्नपत्र तैयार किया जा रहा है…' : 'Preparing the paper…'}</p>
          <p className="mt-1 text-xs text-muted-500">{isHi ? 'पहली बार बनने में 30–90 सेकंड लग सकते हैं।' : 'First build can take 30–90 seconds.'}</p>
        </div>
      </main>
    );
  }

  if (state === 'error' || !paper) {
    return (
      <main className="mx-auto min-h-dvh max-w-2xl px-4 py-6">
        <button type="button" onClick={() => router.push('/pyq')} className="btn-ghost-sm mb-3">← {isHi ? 'वापस' : 'Back'}</button>
        <div role="alert" className="paper-card border border-ember-500/40 p-5">
          <p className="text-sm font-medium text-ink-900">{isHi ? 'प्रश्नपत्र लोड नहीं हो सका' : 'Could not load the paper'}</p>
          <p className="mt-1 text-xs text-muted-500">{errorMsg}</p>
          <button onClick={load} className="btn-primary mt-4">{isHi ? 'पुनः प्रयास करें' : 'Try again'}</button>
        </div>
      </main>
    );
  }

  const total = paper.questions.length;
  const answered = Object.keys(answers).length;
  const correctCount = paper.questions.reduce((acc, q) => acc + (answers[q.id] === q.correctOption ? 1 : 0), 0);

  return (
    <main className="mx-auto min-h-dvh max-w-2xl px-4 py-6 pb-24">
      <header className="mb-4">
        <button type="button" onClick={() => router.push('/pyq')} className="btn-ghost-sm mb-3">← {isHi ? 'वापस' : 'Back'}</button>
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h1 className="font-serif text-xl font-semibold text-ink-900">{paper.examName} · {paper.year}</h1>
            <p className="mt-0.5 text-xs text-muted-500">{total} {isHi ? 'प्रश्न' : 'questions'}</p>
          </div>
          {paper.verified ? (
            <span className="flex-shrink-0 rounded-full bg-emerald-500/15 px-2 py-1 text-[11px] font-medium text-emerald-600">✓ {isHi ? 'सत्यापित' : 'Verified Original'}</span>
          ) : (
            <span className="flex-shrink-0 rounded-full bg-paper-300 px-2 py-1 text-[11px] font-medium text-muted-500">{isHi ? 'पैटर्न आधारित' : 'Pattern set'}</span>
          )}
        </div>
        {paper.note && (
          <p className="mt-3 rounded-xl border border-line bg-paper-50 p-3 text-[11px] text-muted-500">ℹ️ {paper.note}</p>
        )}
      </header>

      {/* Controls + score */}
      <div className="sticky top-0 z-10 -mx-4 mb-4 flex items-center justify-between gap-2 border-b border-line bg-paper-100/95 px-4 py-2 backdrop-blur">
        <p className="text-xs text-muted-500">
          {isHi ? 'हल किए' : 'Answered'} <span className="font-semibold text-ink-900">{answered}/{total}</span>
          {answered > 0 && <span className="ml-2">· {isHi ? 'सही' : 'Correct'} <span className="font-semibold text-emerald-600">{correctCount}</span></span>}
        </p>
        <button
          type="button"
          onClick={() => setRevealAll(v => !v)}
          className="rounded-full border border-line bg-paper-50 px-3 py-1.5 text-xs font-medium text-ink-700 hover:bg-ember-500/5"
        >
          {revealAll ? (isHi ? 'उत्तर छिपाएँ' : 'Hide answers') : (isHi ? 'सभी उत्तर दिखाएँ' : 'Show all answers')}
        </button>
      </div>

      <ol className="space-y-4">
        {paper.questions.map((q, idx) => {
          const chosen = answers[q.id];
          const reveal = revealAll || chosen !== undefined;
          return (
            <li key={q.id} className="paper-card p-4">
              <div className="flex gap-2">
                <span className="font-serif text-sm font-bold text-ember-500">{idx + 1}.</span>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-ink-900">{q.question}</p>
                  {(q.subject || q.topic) && (
                    <p className="mt-1 text-[10px] uppercase tracking-wide text-muted-400">{[q.subject, q.topic].filter(Boolean).join(' · ')}</p>
                  )}

                  <div className="mt-3 space-y-2">
                    {q.options.map((opt) => {
                      const isCorrect = opt.key === q.correctOption;
                      const isChosen = chosen === opt.key;
                      let cls = 'border-line bg-paper-50 text-ink-800 hover:border-ember-500/40';
                      if (reveal && isCorrect) cls = 'border-emerald-500/50 bg-emerald-500/10 text-emerald-700';
                      else if (reveal && isChosen && !isCorrect) cls = 'border-ember-500/50 bg-ember-500/10 text-ember-700';
                      return (
                        <button
                          key={opt.key}
                          type="button"
                          disabled={chosen !== undefined}
                          onClick={() => setAnswers(prev => ({ ...prev, [q.id]: opt.key }))}
                          className={`flex w-full items-start gap-2 rounded-lg border px-3 py-2 text-left text-sm transition-colors disabled:cursor-default ${cls}`}
                        >
                          <span className="font-semibold">{opt.key}.</span>
                          <span className="min-w-0 flex-1">{opt.text}</span>
                          {reveal && isCorrect && <span className="flex-shrink-0">✓</span>}
                          {reveal && isChosen && !isCorrect && <span className="flex-shrink-0">✗</span>}
                        </button>
                      );
                    })}
                  </div>

                  {reveal && q.explanation && (
                    <div className="mt-3 rounded-lg bg-paper-200 p-3">
                      <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-500">{isHi ? 'व्याख्या' : 'Explanation'}</p>
                      <p className="mt-1 text-xs text-ink-700">{q.explanation}</p>
                    </div>
                  )}
                </div>
              </div>
            </li>
          );
        })}
      </ol>

      <div className="mt-6 text-center">
        <button type="button" onClick={() => router.push('/pyq')} className="btn-ghost">{isHi ? 'अन्य वर्ष देखें' : 'Browse other years'}</button>
      </div>
    </main>
  );
}
