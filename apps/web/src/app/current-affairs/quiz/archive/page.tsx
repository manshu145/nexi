'use client';

/**
 * Current Affairs quiz ARCHIVE (review-only).
 *
 * Founder requirement: reels / current-affairs content are wiped within ~24h,
 * but the daily quiz must survive. The backend now persists each day's full
 * Q&A in an isolated `quizArchive/{date}` collection (untouched by the content
 * cleanup). This page lists those past quizzes and lets the user revisit the
 * questions + correct answers + explanations as a self-check.
 *
 * This is REVIEW-ONLY: answering an archived quiz here never touches the live
 * daily leaderboard (that's only the current quiz at /current-affairs/quiz).
 */

import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations, useLocale } from 'next-intl';
import { toast } from 'sonner';
import { useAuth } from '~/lib/auth-context';
import { api, type GeneratedMCQ, type QuizArchiveSummary, type ArchivedQuizResponse } from '~/lib/api';
import { AILoader } from '~/components/ui/AILoader';
import { Logo } from '~/components/Logo';
import { getClientLocale } from '~/lib/locale';

const ANS_KEYS = ['A', 'B', 'C', 'D'] as const;

function fmtTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

export default function CurrentAffairsQuizArchivePage() {
  const t = useTranslations('caArchive');
  const locale = useLocale();
  const router = useRouter();
  const { user, loading: authLoading } = useAuth();

  const [list, setList] = useState<QuizArchiveSummary[]>([]);
  const [listLoading, setListLoading] = useState(true);
  const [selected, setSelected] = useState<ArchivedQuizResponse | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  // Local self-check state (never submitted): index -> chosen option index.
  const [picks, setPicks] = useState<Record<number, number>>({});

  useEffect(() => { if (!authLoading && !user) router.replace('/signin'); }, [authLoading, user, router]);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await api.getCurrentAffairsQuizArchive(30);
        if (!cancelled) setList(res.quizzes ?? []);
      } catch (e) {
        if (!cancelled) toast.error(e instanceof Error ? e.message : t('loadFailed'));
      } finally {
        if (!cancelled) setListLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [user, t]);

  const openQuiz = useCallback(async (date: string) => {
    setDetailLoading(true);
    setPicks({});
    try {
      const res = await api.getArchivedCurrentAffairsQuiz(date, getClientLocale());
      setSelected(res);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t('loadFailed'));
    } finally {
      setDetailLoading(false);
    }
  }, [t]);

  const fmtDate = (date: string) =>
    new Date(date).toLocaleDateString(locale === 'hi' ? 'hi-IN' : 'en-IN', { day: 'numeric', month: 'long', year: 'numeric' });

  if (authLoading || !user) {
    return <main className="flex min-h-dvh items-center justify-center"><AILoader context="general" /></main>;
  }

  // ── Review view ───────────────────────────────────────────────────────────
  if (selected) {
    return (
      <main className="mx-auto flex min-h-dvh max-w-2xl flex-col px-5 pt-6 pb-16">
        <header className="flex items-center justify-between">
          <button type="button" onClick={() => setSelected(null)} className="btn-ghost-sm">{t('backToList')}</button>
          <Logo height={36} />
        </header>

        <section className="mt-6">
          <h1 className="font-serif text-2xl font-bold text-ink-900">{fmtDate(selected.date)}</h1>
          <p className="mt-1 text-sm text-muted-500">{t('reviewSubtitle', { count: selected.questions.length })}</p>
        </section>

        {selected.winner && (
          <div className="paper-card mt-4 flex items-center gap-3 border-gold-500/40 bg-gold-500/10 p-4">
            <span className="text-2xl">🏆</span>
            <div className="min-w-0 flex-1">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-gold-600">{t('topScorer')}</p>
              <p className="font-serif mt-0.5 truncate text-base font-semibold text-ink-900">{selected.winner.userName || t('student')}</p>
              <p className="text-xs text-muted-500">{t('scoreTime', { score: selected.winner.score, time: fmtTime(selected.winner.timeTaken) })}</p>
            </div>
          </div>
        )}

        <p className="mt-4 text-xs text-muted-500">{t('selfCheckHint')}</p>

        <div className="mt-3 space-y-4">
          {selected.questions.map((q: GeneratedMCQ, i: number) => {
            const picked = picks[i];
            const revealed = picked != null;
            return (
              <div key={q.id ?? i} className="paper-card p-4">
                <p className="text-xs text-muted-500 mb-1">{t('questionN', { n: i + 1 })} · {q.topic ?? t('currentAffairs')} · {q.difficulty}</p>
                <p className="font-serif text-base font-medium leading-relaxed text-ink-900">{q.question}</p>
                <div className="mt-3 space-y-2">
                  {q.options.map((opt, optIdx) => {
                    const isCorrect = opt.key === q.correctOption;
                    const isPicked = picked === optIdx;
                    let cls = 'border-line bg-paper-50';
                    if (revealed && isCorrect) cls = 'border-gold-500/60 bg-gold-500/10';
                    else if (revealed && isPicked && !isCorrect) cls = 'border-ember-500/60 bg-ember-500/10';
                    return (
                      <button
                        key={opt.key}
                        type="button"
                        disabled={revealed}
                        onClick={() => setPicks(prev => ({ ...prev, [i]: optIdx }))}
                        className={`w-full rounded-lg border px-4 py-2.5 text-left text-sm transition-colors ${cls} ${revealed ? 'cursor-default' : 'hover:bg-paper-200'}`}
                      >
                        <span className="font-bold">{opt.key}.</span> {opt.text}
                        {revealed && isCorrect && <span className="ml-1.5 text-gold-600">✓</span>}
                        {revealed && isPicked && !isCorrect && <span className="ml-1.5 text-ember-600">✗</span>}
                      </button>
                    );
                  })}
                </div>
                {revealed && (
                  <div className="mt-3 rounded-lg bg-paper-200/60 p-3">
                    <p className="text-xs font-semibold text-ink-800">{t('correctLabel', { answer: q.correctOption })}</p>
                    {q.explanation && <p className="mt-1 text-xs text-ink-700 leading-relaxed">{q.explanation}</p>}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        <button type="button" onClick={() => setSelected(null)} className="btn-ghost mt-6 w-full">{t('backToList')}</button>
      </main>
    );
  }

  // ── List view ───────────────────────────────────────────────────────────
  return (
    <main className="mx-auto flex min-h-dvh max-w-2xl flex-col px-5 pt-6 pb-16">
      <header className="flex items-center justify-between">
        <button type="button" onClick={() => router.back()} className="btn-ghost-sm">{t('back')}</button>
        <Logo height={36} />
      </header>

      <section className="mt-6">
        <h1 className="font-serif text-2xl font-bold text-ink-900">{t('title')}</h1>
        <p className="mt-1 text-sm text-muted-500">{t('subtitle')}</p>
      </section>

      <section className="mt-6">
        {listLoading || detailLoading ? (
          <div className="flex justify-center py-12"><AILoader context="general" /></div>
        ) : list.length === 0 ? (
          <div className="paper-card p-8 text-center">
            <span className="text-3xl">🗂️</span>
            <p className="mt-3 text-sm text-muted-500">{t('empty')}</p>
            <button type="button" onClick={() => router.push('/current-affairs/quiz')} className="mt-4 text-sm font-medium text-ember-600 hover:underline">{t('takeToday')}</button>
          </div>
        ) : (
          <ul className="space-y-2">
            {list.map((quiz) => (
              <li key={quiz.date}>
                <button
                  type="button"
                  onClick={() => openQuiz(quiz.date)}
                  className="paper-card flex w-full items-center justify-between p-4 text-left transition-colors hover:bg-paper-200"
                >
                  <div className="min-w-0">
                    <p className="font-serif text-base font-semibold text-ink-900">{fmtDate(quiz.date)}</p>
                    <p className="text-xs text-muted-500">{t('questionsCount', { count: quiz.questionCount })}</p>
                  </div>
                  <span className="text-sm font-medium text-ember-600">{t('review')}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}
