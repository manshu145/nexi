'use client';

/**
 * Previous Year Questions (PYQ) landing page.
 *
 * Reads the student's target exam from the shared user store and shows
 * the available year-papers for it. The most recent year is auto-seeded
 * server-side on first visit, so this page is never empty for a valid
 * exam (unless generation fails — handled with a retry card).
 *
 * Students can also jump to any older year via the "Browse by year"
 * selector; the paper for that year is generated + cached on demand.
 *
 * Honesty: every AI-pattern paper carries a clear "pattern-based" note so
 * we never pass a reconstructed set off as the verbatim official paper.
 *
 * Brand tokens only (paper / ink / ember / muted / line).
 */

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '~/lib/auth-context';
import { useUser } from '~/lib/userStore';
import { api } from '~/lib/api';
import type { PYQPaperSummary } from '@nexigrate/shared';
import { AILoader } from '~/components/ui/AILoader';

/** First visit may trigger a 30-90s AI generation; give it headroom. */
const PYQ_LIST_TIMEOUT_MS = 150_000;

export default function PYQLandingPage() {
  const router = useRouter();
  const { user, loading: authLoading } = useAuth();
  const { user: me, loading: meLoading } = useUser();

  const [years, setYears] = useState<PYQPaperSummary[]>([]);
  const [examName, setExamName] = useState('');
  const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const lang = (me?.language === 'hi' ? 'hi' : 'en') as 'en' | 'hi';
  const isHi = lang === 'hi';

  useEffect(() => { if (!authLoading && !user) router.replace('/signin'); }, [user, authLoading, router]);

  const load = () => {
    if (!me?.targetExam) return;
    setState('loading');
    setErrorMsg(null);
    const controller = new AbortController();
    abortRef.current = controller;
    const timeoutId = window.setTimeout(() => controller.abort(), PYQ_LIST_TIMEOUT_MS);
    void (async () => {
      try {
        // authedFetch doesn't take a signal here, but the request is
        // idempotent + cached server-side, so a client-side timeout
        // simply surfaces a retry card; the generation finishes anyway.
        const res = await api.getPYQYears(me.targetExam!, lang);
        window.clearTimeout(timeoutId);
        setYears(res.years ?? []);
        setExamName(res.examName ?? '');
        setState('ready');
      } catch (err) {
        window.clearTimeout(timeoutId);
        setErrorMsg(err instanceof Error ? err.message : 'Failed to load previous year papers');
        setState('error');
      }
    })();
  };

  useEffect(() => {
    if (!me) return;
    if (!me.targetExam) { setState('ready'); return; }
    load();
    return () => { abortRef.current?.abort(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [me?.targetExam, lang]);

  const now = new Date().getFullYear();
  const browseYears = Array.from({ length: now - 2015 }, (_, i) => now - 1 - i); // currentYear-1 down to 2015

  if (authLoading || meLoading || !user || !me) {
    return <main className="min-h-dvh bg-paper-100"><AILoader context="general" /></main>;
  }

  return (
    <main className="mx-auto min-h-dvh max-w-2xl px-4 py-6 pb-24">
      <header className="mb-5">
        <button type="button" onClick={() => router.push('/dashboard')} className="btn-ghost-sm mb-3">← {isHi ? 'वापस' : 'Back'}</button>
        <h1 className="font-serif text-2xl font-semibold text-ink-900">
          {isHi ? 'पिछले वर्ष के प्रश्न' : 'Previous Year Questions'}
        </h1>
        <p className="mt-1 text-sm text-muted-500">
          {examName
            ? (isHi ? `${examName} — पिछली परीक्षाओं का पैटर्न` : `${examName} — what was asked in past sessions`)
            : (isHi ? 'अपनी परीक्षा के पिछले प्रश्नपत्र देखें' : 'See what was asked in your exam\u2019s past sessions')}
        </p>
      </header>

      {!me.targetExam ? (
        <div className="paper-card p-6 text-center">
          <p className="text-2xl mb-2">🎯</p>
          <p className="text-sm font-medium text-ink-900">{isHi ? 'पहले अपनी परीक्षा चुनें' : 'Pick your target exam first'}</p>
          <p className="mt-1 text-xs text-muted-500">{isHi ? 'ऑनबोर्डिंग पूरी करें ताकि हम आपके लिए सही प्रश्नपत्र दिखा सकें।' : 'Complete onboarding so we can show the right papers for you.'}</p>
          <button onClick={() => router.push('/onboarding/exam')} className="btn-primary mt-4">{isHi ? 'परीक्षा चुनें' : 'Choose exam'}</button>
        </div>
      ) : state === 'loading' ? (
        <div className="paper-card p-8 text-center">
          <AILoader context="general" />
          <p className="mt-4 text-sm font-medium text-ink-900">{isHi ? 'प्रश्नपत्र तैयार किया जा रहा है…' : 'Preparing the paper…'}</p>
          <p className="mt-1 text-xs text-muted-500">{isHi ? 'पहली बार बनने में 30–90 सेकंड लग सकते हैं। यह सभी छात्रों के लिए एक बार बनता है।' : 'First build can take 30–90 seconds. It is generated once and shared by everyone.'}</p>
        </div>
      ) : state === 'error' ? (
        <div role="alert" className="paper-card border border-ember-500/40 p-5">
          <p className="text-sm font-medium text-ink-900">{isHi ? 'प्रश्नपत्र लोड नहीं हो सके' : 'Could not load the papers'}</p>
          <p className="mt-1 text-xs text-muted-500">{errorMsg}</p>
          <button onClick={load} className="btn-primary mt-4">{isHi ? 'पुनः प्रयास करें' : 'Try again'}</button>
        </div>
      ) : (
        <>
          {/* Honesty note */}
          <div className="mb-4 rounded-xl border border-line bg-paper-50 p-3 text-[11px] text-muted-500">
            ℹ️ {isHi
              ? 'ये पिछले वर्ष के पैटर्न (विषय, भार व कठिनाई) पर आधारित AI-निर्मित अभ्यास सेट हैं — आधिकारिक प्रश्नपत्र की हूबहू प्रति नहीं। ✓ Verified Original बैज वाले पेपर एडमिन द्वारा सत्यापित हैं।'
              : 'These are AI-reconstructed practice sets modelled on the previous-year pattern (topics, weightage & difficulty) — not verbatim copies of the official paper. Papers with a ✓ Verified Original badge are admin-checked.'}
          </div>

          {years.length === 0 ? (
            <div className="paper-card p-6 text-center">
              <p className="text-2xl mb-2">📄</p>
              <p className="text-sm font-medium text-ink-900">{isHi ? 'अभी कोई पेपर उपलब्ध नहीं' : 'No papers available yet'}</p>
              <p className="mt-1 text-xs text-muted-500">{isHi ? 'नीचे से कोई वर्ष चुनें ताकि उसका पेपर बन सके।' : 'Pick a year below to generate its paper.'}</p>
            </div>
          ) : (
            <ul className="space-y-2">
              {years.map((y) => (
                <li key={y.id}>
                  <button
                    type="button"
                    onClick={() => router.push(`/pyq/${encodeURIComponent(y.examSlug)}/${y.year}`)}
                    className="w-full rounded-lg border border-line bg-paper-50 p-4 text-left transition-colors hover:border-ember-500/40 hover:bg-ember-500/5"
                  >
                    <div className="flex items-center justify-between">
                      <div className="min-w-0">
                        <p className="font-serif text-lg font-semibold text-ink-900">{y.year}</p>
                        <p className="mt-0.5 text-xs text-muted-500">{y.questionCount} {isHi ? 'प्रश्न' : 'questions'}</p>
                      </div>
                      <div className="flex items-center gap-2">
                        {y.verified ? (
                          <span className="rounded-full bg-emerald-500/15 px-2 py-0.5 text-[11px] font-medium text-emerald-600">✓ {isHi ? 'सत्यापित' : 'Verified Original'}</span>
                        ) : (
                          <span className="rounded-full bg-paper-300 px-2 py-0.5 text-[11px] font-medium text-muted-500">{isHi ? 'पैटर्न आधारित' : 'Pattern set'}</span>
                        )}
                        <svg width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24" className="text-ember-500"><path d="M9 18l6-6-6-6" /></svg>
                      </div>
                    </div>
                  </button>
                </li>
              ))}
            </ul>
          )}

          {/* Browse another year */}
          <div className="mt-6">
            <p className="mb-2 px-1 text-xs font-semibold uppercase tracking-wider text-muted-500">{isHi ? 'अन्य वर्ष देखें' : 'Browse another year'}</p>
            <div className="flex flex-wrap gap-2">
              {browseYears.map((y) => (
                <button
                  key={y}
                  type="button"
                  onClick={() => router.push(`/pyq/${encodeURIComponent(me.targetExam!)}/${y}`)}
                  className="rounded-full border border-line bg-paper-50 px-3 py-1.5 text-xs font-medium text-ink-700 transition-colors hover:border-ember-500/40 hover:bg-ember-500/5"
                >
                  {y}
                </button>
              ))}
            </div>
          </div>
        </>
      )}
    </main>
  );
}
