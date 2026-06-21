'use client';

/**
 * Auto Weak-Topic Drilling — intro screen.
 *
 * Shows the topics/subjects the student is weakest at (from their past mock
 * tests) and a one-tap "Start drill" that generates a short, focused practice
 * set. The drill itself is a short mock-test attempt, so once started we hand
 * off to the existing /mock-tests/[id] taking + result flow.
 */

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '~/lib/auth-context';
import { api } from '~/lib/api';
import { Logo } from '~/components/Logo';
import { AILoader } from '~/components/ui/AILoader';
import { getClientLocale } from '~/lib/locale';
import { track } from '~/lib/analytics';

type Weak = { name: string; accuracy: number; total: number };

export default function WeakTopicDrillPage() {
  const router = useRouter();
  const { user, loading } = useAuth();
  const hi = getClientLocale() === 'hi';

  const [pageLoading, setPageLoading] = useState(true);
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hasData, setHasData] = useState(false);
  const [topics, setTopics] = useState<Weak[]>([]);
  const [subjects, setSubjects] = useState<Weak[]>([]);

  useEffect(() => { if (!loading && !user) router.replace('/signin'); }, [loading, user, router]);

  useEffect(() => {
    if (loading || !user) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await api.getDrillWeakAreas();
        if (cancelled) return;
        setHasData(res.hasData);
        setTopics(res.weakTopics ?? []);
        setSubjects(res.weakSubjects ?? []);
      } catch {
        if (!cancelled) setHasData(false);
      } finally {
        if (!cancelled) setPageLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [loading, user]);

  const start = async () => {
    setStarting(true);
    setError(null);
    try {
      track('drill_start');
      const res = await api.startDrill();
      router.push(`/mock-tests/${res.attemptId}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : (hi ? 'ड्रिल शुरू नहीं हो पाई।' : 'Could not start the drill.'));
      setStarting(false);
    }
  };

  if (loading || !user || pageLoading) {
    return <main className="flex min-h-dvh items-center justify-center"><AILoader context="quiz" /></main>;
  }

  if (starting) {
    return (
      <main className="flex min-h-dvh flex-col items-center justify-center gap-3 px-6 text-center">
        <AILoader context="quiz" />
        <p className="text-sm text-muted-500">{hi ? 'तुम्हारे कमज़ोर टॉपिक्स पर अभ्यास सेट बन रहा है…' : 'Building a practice set on your weak topics…'}</p>
      </main>
    );
  }

  const weak = topics.length ? topics : subjects;
  const usingSubjects = topics.length === 0 && subjects.length > 0;

  return (
    <main className="mx-auto flex min-h-dvh max-w-lg flex-col px-5 pt-6 pb-16">
      <header className="flex items-center justify-between">
        <Logo height={34} />
        <button onClick={() => router.push('/dashboard')} className="btn-ghost-sm text-xs">{hi ? 'डैशबोर्ड' : 'Dashboard'}</button>
      </header>

      <div className="mt-8 flex flex-col items-center text-center">
        <span className="text-5xl">🎯</span>
        <h1 className="font-serif mt-4 text-2xl font-bold text-ink-900">{hi ? 'कमज़ोर टॉपिक ड्रिल' : 'Weak-Topic Drill'}</h1>
        <p className="mt-2 text-sm text-muted-500">
          {hi
            ? 'तुम्हारे पिछले मॉक टेस्ट से तुम्हारे कमज़ोर टॉपिक पहचान कर, उन्हीं पर एक छोटा फोकस्ड अभ्यास सेट बनाया जाता है।'
            : 'We spot the topics you score lowest on across your past mock tests, then build a short, focused practice set on exactly those.'}
        </p>
      </div>

      {!hasData ? (
        <div className="paper-card mt-8 p-5 text-center">
          <p className="text-sm text-ink-800">
            {hi
              ? 'अभी पर्याप्त डेटा नहीं है। पहले एक-दो मॉक टेस्ट दो — फिर ड्रिल तुम्हारे कमज़ोर टॉपिक पकड़ लेगी। तब तक, यह एक्ज़ाम-पैटर्न पर एक सामान्य अभ्यास सेट बनाएगी।'
              : 'Not enough data yet. Take a mock test or two and the drill will target your weak topics. For now it builds a general exam-pattern practice set.'}
          </p>
          <button onClick={() => router.push('/mock-tests')} className="btn-ghost mt-4 w-full">{hi ? 'मॉक टेस्ट पर जाएँ' : 'Go to Mock Tests'}</button>
        </div>
      ) : (
        <section className="mt-8">
          <h2 className="text-xs font-bold uppercase tracking-wider text-muted-500">
            {usingSubjects ? (hi ? 'कमज़ोर विषय' : 'Weak subjects') : (hi ? 'कमज़ोर टॉपिक' : 'Weak topics')}
          </h2>
          <div className="mt-3 space-y-2">
            {weak.slice(0, 6).map((w) => (
              <div key={w.name} className="paper-card p-3">
                <div className="flex items-center justify-between text-sm">
                  <span className="font-medium capitalize text-ink-900">{w.name.replace(/-/g, ' ')}</span>
                  <span className="text-muted-600">{w.accuracy}% <span className="text-muted-400">· {w.total} Q</span></span>
                </div>
                <div className="mt-2 h-1.5 rounded-full bg-paper-200">
                  <div className={`h-full rounded-full ${w.accuracy >= 60 ? 'bg-ember-500' : w.accuracy >= 40 ? 'bg-gold-500' : 'bg-red-500/70'}`} style={{ width: `${Math.max(4, w.accuracy)}%` }} />
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {error && <div className="banner banner-error mt-4">{error}</div>}

      <button onClick={start} className="btn-primary mt-6 w-full">{hi ? 'फोकस्ड ड्रिल शुरू करें' : 'Start focused drill'}</button>
      <p className="mt-3 text-center text-[11px] text-muted-400">{hi ? '~15 सवाल · नेगेटिव मार्किंग नहीं · मुफ़्त' : '~15 questions · no negative marking · free'}</p>
    </main>
  );
}
