'use client';
import { useEffect, useState, useCallback } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { useAuth } from '~/lib/auth-context';
import { useUser } from '~/lib/userStore';
import { api } from '~/lib/api';
import { Logo } from '~/components/Logo';
import { AILoader } from '~/components/ui/AILoader';

type Card = { front: string; back: string };

function getLang(): 'en' | 'hi' {
  if (typeof localStorage !== 'undefined') {
    const s = localStorage.getItem('nexigrate-language');
    if (s === 'hi' || s === 'en') return s;
  }
  return 'en';
}

function prettify(slug: string): string {
  return slug.replace(/-/g, ' ').replace(/\b\w/g, (m) => m.toUpperCase());
}

export default function FlashcardsPage() {
  const { user, loading } = useAuth();
  const { user: me } = useUser();
  const router = useRouter();
  const params = useParams();
  const subject = params.subject as string;
  const chapter = params.chapter as string;

  const [cards, setCards] = useState<Card[]>([]);
  const [phase, setPhase] = useState<'loading' | 'study' | 'done' | 'error'>('loading');
  const [error, setError] = useState<string | null>(null);
  const [idx, setIdx] = useState(0);
  const [flipped, setFlipped] = useState(false);
  const [known, setKnown] = useState<Set<number>>(new Set());

  useEffect(() => { if (!loading && !user) router.replace('/signin'); }, [user, loading, router]);

  useEffect(() => {
    if (!user || !me) return;
    let cancelled = false;
    (async () => {
      try {
        const exam = me.targetExam ?? 'jee-main';
        const res = await api.getChapterFlashcards(exam, subject, chapter, getLang());
        if (cancelled) return;
        if (!res.cards?.length) {
          setError(res.error || 'No flashcards available for this chapter yet.');
          setPhase('error');
          return;
        }
        setCards(res.cards);
        setPhase('study');
      } catch (e) {
        if (cancelled) return;
        setError(e instanceof Error ? e.message : 'Could not load flashcards.');
        setPhase('error');
      }
    })();
    return () => { cancelled = true; };
  }, [user, me, subject, chapter]);

  const next = useCallback((markKnown?: boolean) => {
    setKnown((prev) => {
      if (markKnown === undefined) return prev;
      const n = new Set(prev);
      if (markKnown) n.add(idx); else n.delete(idx);
      return n;
    });
    setFlipped(false);
    if (idx + 1 >= cards.length) { setPhase('done'); return; }
    setTimeout(() => setIdx((i) => i + 1), 120);
  }, [idx, cards.length]);

  const prev = useCallback(() => {
    if (idx === 0) return;
    setFlipped(false);
    setTimeout(() => setIdx((i) => i - 1), 120);
  }, [idx]);

  const restart = () => { setIdx(0); setFlipped(false); setKnown(new Set()); setPhase('study'); };

  // Keyboard: space/enter flip, arrows navigate.
  useEffect(() => {
    if (phase !== 'study') return;
    const h = (e: KeyboardEvent) => {
      if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); setFlipped((f) => !f); }
      else if (e.key === 'ArrowRight') next();
      else if (e.key === 'ArrowLeft') prev();
    };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [phase, next, prev]);

  if (loading || phase === 'loading') {
    return <main className="min-h-dvh bg-paper-100"><AILoader context="chat" /></main>;
  }

  const chapterName = prettify(chapter);

  if (phase === 'error') {
    return (
      <main className="min-h-dvh bg-paper-100 px-4 py-6">
        <div className="mx-auto max-w-md">
          <div className="paper-card mt-10 p-6 text-center">
            <span aria-hidden className="text-3xl">🃏</span>
            <h1 className="mt-3 font-serif text-lg font-semibold text-ink-900">Flashcards unavailable</h1>
            <p className="mt-2 text-sm text-muted-500">{error}</p>
            <button onClick={() => router.push(`/study/${subject}/${chapter}`)} className="btn-primary mt-5 w-full">Back to chapter</button>
          </div>
        </div>
      </main>
    );
  }

  if (phase === 'done') {
    const knownCount = known.size;
    const pct = cards.length ? Math.round((knownCount / cards.length) * 100) : 0;
    return (
      <main className="min-h-dvh bg-paper-100 px-4 py-6">
        <div className="mx-auto max-w-md">
          <div className="paper-card mt-10 p-6 text-center">
            <span aria-hidden className="text-4xl">🎉</span>
            <h1 className="mt-3 font-serif text-xl font-bold text-ink-900">Revision complete!</h1>
            <p className="mt-2 text-sm text-muted-500">{chapterName}</p>
            <div className="mt-5 rounded-xl border border-line bg-paper-50 p-4">
              <p className="font-serif text-3xl font-bold text-ember-600">{knownCount}/{cards.length}</p>
              <p className="mt-1 text-xs text-muted-500">marked as known ({pct}%)</p>
            </div>
            <div className="mt-5 space-y-2">
              <button onClick={restart} className="btn-primary w-full">Revise again</button>
              <button onClick={() => router.push(`/study/${subject}/${chapter}/quiz`)} className="btn-ghost w-full">Take the quiz →</button>
              <button onClick={() => router.push(`/study/${subject}/${chapter}`)} className="w-full rounded-lg px-4 py-2 text-sm text-muted-500 hover:bg-paper-100">Back to chapter</button>
            </div>
          </div>
        </div>
      </main>
    );
  }

  // phase === 'study'
  const card = cards[idx]!;
  const progressPct = Math.round(((idx) / cards.length) * 100);

  return (
    <main className="flex min-h-dvh flex-col bg-paper-100">
      {/* Header */}
      <header className="flex items-center justify-between gap-3 border-b border-line bg-paper-50 px-4 py-3">
        <button onClick={() => router.push(`/study/${subject}/${chapter}`)} className="btn-ghost-sm" aria-label="Back to chapter">←</button>
        <div className="min-w-0 text-center">
          <p className="truncate text-sm font-semibold text-ink-900">{chapterName}</p>
          <p className="text-[11px] text-muted-500">Flashcards · {idx + 1} of {cards.length}</p>
        </div>
        <Logo height={28} />
      </header>

      {/* Progress */}
      <div className="h-1 w-full bg-paper-200">
        <div className="h-full bg-ember-500 transition-all" style={{ width: `${progressPct}%` }} />
      </div>

      {/* Card */}
      <div className="flex flex-1 flex-col items-center justify-center px-4 py-6">
        <button
          onClick={() => setFlipped((f) => !f)}
          className="group relative w-full max-w-xl"
          style={{ perspective: '1200px' }}
          aria-label="Flip card"
        >
          <div
            className="relative h-72 w-full transition-transform duration-500 sm:h-80"
            style={{ transformStyle: 'preserve-3d', transform: flipped ? 'rotateY(180deg)' : 'rotateY(0deg)' }}
          >
            {/* Front */}
            <div
              className="absolute inset-0 flex flex-col items-center justify-center rounded-2xl border border-line bg-paper-50 p-7 text-center shadow-sm"
              style={{ backfaceVisibility: 'hidden' }}
            >
              <span className="absolute left-4 top-3 text-[11px] font-semibold uppercase tracking-wider text-muted-400">Question</span>
              <p className="font-serif text-xl font-semibold leading-snug text-ink-900 sm:text-2xl">{card.front}</p>
              <span className="absolute bottom-3 text-[11px] text-muted-400">Tap to reveal answer</span>
            </div>
            {/* Back */}
            <div
              className="absolute inset-0 flex flex-col items-center justify-center rounded-2xl border border-ember-500/30 bg-ember-500/5 p-7 text-center shadow-sm"
              style={{ backfaceVisibility: 'hidden', transform: 'rotateY(180deg)' }}
            >
              <span className="absolute left-4 top-3 text-[11px] font-semibold uppercase tracking-wider text-ember-600">Answer</span>
              <p className="text-lg leading-relaxed text-ink-900 sm:text-xl">{card.back}</p>
            </div>
          </div>
        </button>

        {/* Controls */}
        <div className="mt-7 w-full max-w-xl">
          {!flipped ? (
            <div className="flex items-center justify-between gap-3">
              <button onClick={prev} disabled={idx === 0} className="btn-ghost disabled:opacity-40">← Prev</button>
              <button onClick={() => setFlipped(true)} className="btn-primary flex-1">Reveal answer</button>
              <button onClick={() => next()} className="btn-ghost">Skip →</button>
            </div>
          ) : (
            <div className="flex items-center gap-3">
              <button onClick={() => next(false)} className="btn-ghost flex-1">↺ Review again</button>
              <button onClick={() => next(true)} className="btn-primary flex-1">✓ Got it</button>
            </div>
          )}
        </div>
      </div>
    </main>
  );
}
