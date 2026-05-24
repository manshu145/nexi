'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Logo } from '~/components/Logo';
import { MobileNav } from '~/components/MobileNav';
import { api, type GeneratedMcq } from '~/lib/api';
import { getLang, t } from '~/lib/i18n';

export default function TodayPage() {
  const router = useRouter();
  const lang = getLang();
  const [loading, setLoading] = useState(false);
  const [quizMcqs, setQuizMcqs] = useState<GeneratedMcq[] | null>(null);
  const [quizIdx, setQuizIdx] = useState(0);
  const [quizAnswers, setQuizAnswers] = useState<Record<number, string>>({});
  const [quizDone, setQuizDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function startQuiz() {
    setLoading(true);
    setError(null);
    try {
      const res = await api.generateMcqs('current-affairs', 20);
      setQuizMcqs(res.mcqs);
      setQuizIdx(0);
      setQuizAnswers({});
      setQuizDone(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed');
    } finally {
      setLoading(false);
    }
  }

  function finishQuiz() {
    setQuizDone(true);
  }

  const score = quizMcqs
    ? Object.entries(quizAnswers).filter(([i, a]) => quizMcqs[Number(i)]?.correctOption === a).length
    : 0;

  return (
    <>
      <main className="mx-auto flex min-h-screen max-w-lg flex-col px-4 pt-6 pb-24 sm:max-w-2xl sm:px-6">
        <header className="flex items-center justify-between">
          <Logo />
          <button type="button" onClick={() => router.push('/dashboard')} className="btn-ghost-sm">
            {t('common.back', lang)}
          </button>
        </header>

        <section className="mt-6">
          <h1 className="font-serif text-2xl font-semibold text-ink-900">{t('ca.title', lang)}</h1>
          <p className="mt-1 text-sm text-muted-500">
            {lang === 'hi' ? 'AI द्वारा तैयार - 30 स्रोतों से' : 'AI-curated from 30+ sources'}
          </p>
        </section>

        {/* Quiz section */}
        {!quizMcqs && !quizDone && (
          <section className="mt-6 paper-card p-5 text-center">
            <span className="text-3xl">📝</span>
            <h2 className="font-serif mt-3 text-lg font-semibold text-ink-900">
              {lang === 'hi' ? 'आज का करंट अफेयर्स क्विज़' : "Today's CA Quiz"}
            </h2>
            <p className="mt-2 text-sm text-ink-800">
              {lang === 'hi' ? '20 प्रश्न • सबसे तेज़ उत्तरदाता कल दिखाया जाएगा' : '20 questions • Fastest scorer featured tomorrow'}
            </p>
            <button type="button" onClick={startQuiz} disabled={loading} className="btn-primary mt-5">
              {loading ? <span className="spinner" /> : t('ca.quiz', lang)}
            </button>
            {error && <p className="mt-3 text-sm text-ember-600">{error}</p>}
          </section>
        )}

        {/* Quiz player */}
        {quizMcqs && !quizDone && (
          <section className="mt-6">
            <div className="flex items-center justify-between mb-4">
              <span className="pill">{quizIdx + 1}/{quizMcqs.length}</span>
              <button type="button" onClick={finishQuiz} className="btn-ghost-sm text-ember-600">
                {lang === 'hi' ? 'समाप्त करें' : 'Finish'}
              </button>
            </div>

            <div className="paper-card p-4">
              <p className="text-xs font-semibold uppercase text-ember-600">{quizMcqs[quizIdx]?.subject}</p>
              <p className="mt-2 font-serif text-base font-semibold text-ink-900">{quizMcqs[quizIdx]?.question}</p>
              <div className="mt-4 space-y-2">
                {quizMcqs[quizIdx]?.options.map((opt) => (
                  <button
                    key={opt.key}
                    type="button"
                    onClick={() => {
                      setQuizAnswers((prev) => ({ ...prev, [quizIdx]: opt.key }));
                      if (quizIdx < quizMcqs.length - 1) {
                        setTimeout(() => setQuizIdx(quizIdx + 1), 300);
                      }
                    }}
                    className={`flex w-full items-start gap-2 rounded-lg border px-3 py-2.5 text-left text-sm transition ${
                      quizAnswers[quizIdx] === opt.key
                        ? 'border-ember-600 bg-paper-200'
                        : 'border-line bg-paper-50 active:bg-paper-200'
                    }`}
                  >
                    <span className="font-semibold text-ember-600">{opt.key}.</span>
                    <span className="text-ink-900">{opt.text}</span>
                  </button>
                ))}
              </div>
            </div>

            <div className="mt-4 flex justify-between">
              <button
                type="button"
                onClick={() => setQuizIdx(Math.max(0, quizIdx - 1))}
                disabled={quizIdx === 0}
                className="btn-ghost"
              >
                {t('mcq.prev', lang)}
              </button>
              {quizIdx === quizMcqs.length - 1 ? (
                <button type="button" onClick={finishQuiz} className="btn-primary">
                  {t('mcq.submit', lang)}
                </button>
              ) : (
                <button type="button" onClick={() => setQuizIdx(quizIdx + 1)} className="btn-primary">
                  {t('mcq.next', lang)}
                </button>
              )}
            </div>
          </section>
        )}

        {/* Quiz result */}
        {quizDone && quizMcqs && (
          <section className="mt-6 paper-card p-5 text-center">
            <span className="text-4xl">{score >= 15 ? '🏆' : score >= 10 ? '⭐' : '💪'}</span>
            <h2 className="font-serif mt-3 text-xl font-semibold text-ink-900">
              {score}/{quizMcqs.length}
            </h2>
            <p className="mt-2 text-sm text-muted-500">
              {score >= 15
                ? (lang === 'hi' ? 'शानदार! आप कल के विजेता हो सकते हैं!' : 'Excellent! You could be tomorrow\'s winner!')
                : (lang === 'hi' ? 'अच्छा प्रयास! कल फिर कोशिश करें' : 'Good try! Come back tomorrow')}
            </p>
            <button type="button" onClick={() => { setQuizMcqs(null); setQuizDone(false); }} className="btn-primary mt-5">
              {t('common.back', lang)}
            </button>
          </section>
        )}
      </main>
      <MobileNav />
    </>
  );
}
