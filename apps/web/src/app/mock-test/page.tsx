'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Logo } from '~/components/Logo';
import { MobileNav } from '~/components/MobileNav';
import { api, type GeneratedMcq } from '~/lib/api';
import { getLang, t } from '~/lib/i18n';

export default function MockTestPage() {
  const router = useRouter();
  const lang = getLang();
  const [subject, setSubject] = useState('');
  const [loading, setLoading] = useState(false);
  const [mcqs, setMcqs] = useState<GeneratedMcq[] | null>(null);
  const [idx, setIdx] = useState(0);
  const [answers, setAnswers] = useState<Record<number, string>>({});
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function startTest() {
    setLoading(true);
    setError(null);
    try {
      const res = await api.generateMockTest(subject || undefined);
      setMcqs(res.mcqs);
      setIdx(0);
      setAnswers({});
      setDone(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed');
    } finally {
      setLoading(false);
    }
  }

  const score = mcqs
    ? Object.entries(answers).filter(([i, a]) => mcqs[Number(i)]?.correctOption === a).length
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

        {!mcqs && !done && (
          <section className="mt-8 text-center">
            <span className="text-4xl">📝</span>
            <h1 className="font-serif mt-4 text-2xl font-semibold text-ink-900">{t('dash.mocktest', lang)}</h1>
            <p className="mt-2 text-sm text-ink-800">
              {lang === 'hi' ? 'AI आपके स्तर के अनुसार 30 प्रश्न बनाएगा' : 'AI generates 30 questions at your level'}
            </p>
            <input
              type="text"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              placeholder={lang === 'hi' ? 'विषय (वैकल्पिक)' : 'Subject (optional)'}
              className="mt-4 w-full rounded-lg border border-line bg-paper-50 px-4 py-2.5 text-sm text-ink-900 placeholder:text-muted-400 focus:outline-none focus:ring-2 focus:ring-ember-600"
            />
            <button type="button" onClick={startTest} disabled={loading} className="btn-primary mt-5 w-full">
              {loading ? <><span className="spinner" /> {t('common.loading', lang)}</> : (lang === 'hi' ? 'टेस्ट शुरू करें' : 'Start Mock Test')}
            </button>
            {error && <p className="mt-3 text-sm text-ember-600">{error}</p>}
          </section>
        )}

        {mcqs && !done && (
          <section className="mt-6">
            <div className="flex items-center justify-between mb-4">
              <span className="pill">{idx + 1}/{mcqs.length}</span>
              <button type="button" onClick={() => setDone(true)} className="btn-ghost-sm text-ember-600">
                {lang === 'hi' ? 'समाप्त' : 'Finish'}
              </button>
            </div>

            <div className="paper-card p-4">
              <p className="text-xs font-semibold uppercase text-ember-600">{mcqs[idx]?.subject}</p>
              <p className="mt-2 font-serif text-base font-semibold text-ink-900">{mcqs[idx]?.question}</p>
              <div className="mt-4 space-y-2">
                {mcqs[idx]?.options.map((opt) => (
                  <button
                    key={opt.key}
                    type="button"
                    onClick={() => {
                      setAnswers((prev) => ({ ...prev, [idx]: opt.key }));
                      if (idx < mcqs.length - 1) setTimeout(() => setIdx(idx + 1), 300);
                    }}
                    className={`flex w-full items-start gap-2 rounded-lg border px-3 py-2.5 text-left text-sm transition ${
                      answers[idx] === opt.key ? 'border-ember-600 bg-paper-200' : 'border-line bg-paper-50 active:bg-paper-200'
                    }`}
                  >
                    <span className="font-semibold text-ember-600">{opt.key}.</span>
                    <span className="text-ink-900">{opt.text}</span>
                  </button>
                ))}
              </div>
            </div>

            <div className="mt-4 flex justify-between">
              <button type="button" onClick={() => setIdx(Math.max(0, idx - 1))} disabled={idx === 0} className="btn-ghost">
                {t('mcq.prev', lang)}
              </button>
              {idx === mcqs.length - 1 ? (
                <button type="button" onClick={() => setDone(true)} className="btn-primary">{t('mcq.submit', lang)}</button>
              ) : (
                <button type="button" onClick={() => setIdx(idx + 1)} className="btn-primary">{t('mcq.next', lang)}</button>
              )}
            </div>
          </section>
        )}

        {done && mcqs && (
          <section className="mt-8 paper-card p-6 text-center">
            <span className="text-4xl">{score >= 25 ? '🏆' : score >= 18 ? '⭐' : '💪'}</span>
            <h2 className="font-serif mt-3 text-2xl font-semibold text-ink-900">{score}/{mcqs.length}</h2>
            <p className="mt-2 text-sm text-muted-500">
              {score >= 25 ? (lang === 'hi' ? 'बहुत बढ़िया!' : 'Excellent!') : (lang === 'hi' ? 'अच्छा प्रयास!' : 'Good effort!')}
            </p>
            <button type="button" onClick={() => { setMcqs(null); setDone(false); }} className="btn-primary mt-5">
              {lang === 'hi' ? 'नया टेस्ट' : 'New Test'}
            </button>
          </section>
        )}
      </main>
      <MobileNav />
    </>
  );
}
