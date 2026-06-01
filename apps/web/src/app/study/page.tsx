'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '~/lib/auth-context';
import { useUser } from '~/lib/userStore';
import { api, type SyllabusTree, type StudyProgress } from '~/lib/api';
import { Logo } from '~/components/Logo';
import { Skeleton, ListSkeleton } from '~/components/Skeleton';
import { AILoader } from '~/components/ui/AILoader';

export default function StudyPage() {
  const { user, loading } = useAuth();
  // PR-32: pull the user from the shared store. Both the syllabus
  // bootstrap AND the post-generate-chapters refresh used to call
  // api.me() just to read targetExam — replaced with a single store read.
  const { user: me, loading: meLoading } = useUser();
  const router = useRouter();
  const [syllabus, setSyllabus] = useState<SyllabusTree | null>(null);
  const [progress, setProgress] = useState<StudyProgress | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [pageLoading, setPageLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lang, setLang] = useState<'en' | 'hi'>('en');
  const [generating, setGenerating] = useState<string | null>(null);
  const [genSuccess, setGenSuccess] = useState<string | null>(null);
  const currentPlan = me?.plan ?? 'free';

  useEffect(() => { if (!loading && !user) router.replace('/signin'); }, [user, loading, router]);

  useEffect(() => {
    if (!user || !me) return;
    // Detect language
    const m = document.cookie.match(/nexigrate-language=(en|hi)/);
    const detected = m ? m[1] as 'en' | 'hi' : (localStorage.getItem('nexigrate-language') as 'en' | 'hi') || 'en';
    setLang(detected);
    (async () => {
      try {
        const exam = me.targetExam;
        if (!exam) { router.replace('/onboarding/language'); return; }
        const [syllRes, progRes] = await Promise.all([
          api.getSyllabus(exam),
          api.getStudyProgress(exam),
        ]);
        setSyllabus(syllRes.syllabus);
        setProgress(progRes.progress);
        // Auto-expand first subject
        if (syllRes.syllabus.subjects.length > 0) {
          setExpanded(syllRes.syllabus.subjects[0]!.slug);
        }
      } catch (e) { setError(e instanceof Error ? e.message : 'Failed to load syllabus'); }
      finally { setPageLoading(false); }
    })();
  }, [user, me, router]);

  if (loading || !user || meLoading || pageLoading) return (
    <main className="mx-auto flex min-h-dvh max-w-2xl flex-col items-center justify-center px-5">
      <AILoader context="chapter" />
    </main>
  );

  if (error) return (
    <main className="mx-auto flex min-h-dvh max-w-lg flex-col items-center justify-center px-5">
      <div className="banner banner-error">{error}</div>
      <button onClick={() => router.back()} className="btn-ghost mt-4">← Back</button>
    </main>
  );

  if (!syllabus) return (
    <main className="mx-auto flex min-h-dvh max-w-lg flex-col items-center justify-center px-5">
      <div className="banner banner-error">Unable to load syllabus. Please try again later.</div>
      <button onClick={() => router.push('/dashboard')} className="btn-ghost mt-4">← Back to Dashboard</button>
    </main>
  );

  const completedSet = new Set(progress?.completedChapters ?? []);
  const scores = progress?.chapterScores ?? {};

  // Find "continue where you left off"
  let continueChapter: { subject: string; chapter: string; name: string } | null = null;
  if (progress?.currentChapter) {
    const [subSlug, chSlug] = progress.currentChapter.split('/');
    const sub = syllabus.subjects.find(s => s.slug === subSlug);
    const ch = sub?.chapters.find(c => c.slug === chSlug);
    if (sub && ch) continueChapter = { subject: sub.slug, chapter: ch.slug, name: lang === 'hi' && ch.nameHi ? ch.nameHi : ch.name };
  }

  return (
    <main className="mx-auto flex min-h-dvh max-w-2xl flex-col px-5 pt-6 pb-28">
      <header className="flex items-center justify-between">
        <Logo height={36} />
        <button onClick={() => router.push('/dashboard')} className="btn-ghost-sm">← Dashboard</button>
      </header>

      <section className="mt-6">
        <h1 className="font-serif text-2xl font-bold text-ink-900">{syllabus.examName}</h1>
        <p className="mt-1 text-sm text-muted-500">
          {progress ? `${progress.overallPercent}% complete · ${progress.completedChapters.length} chapters done` : 'Start your preparation'}
        </p>
        {/* Overall progress bar */}
        <div className="mt-3 h-2.5 w-full overflow-hidden rounded-full bg-paper-300">
          <div className="h-full rounded-full bg-ember-500 transition-all duration-500 ease-out" style={{ width: `${progress?.overallPercent ?? 0}%` }} />
        </div>
      </section>

      {/* Free plan upgrade banner */}
      {currentPlan === 'free' && (
        <button
          onClick={() => router.push('/upgrade')}
          className="mt-4 w-full rounded-lg border border-gold-500/40 bg-gold-500/5 px-4 py-3 text-left transition-colors hover:bg-gold-500/10"
        >
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-ink-900">⭐ Free Plan — 2 chapters free per subject</p>
              <p className="mt-0.5 text-xs text-muted-500">Upgrade to Scholar for unlimited access</p>
            </div>
            <span className="text-xs font-semibold text-ember-500">Upgrade →</span>
          </div>
        </button>
      )}

      {/* Continue card */}
      {continueChapter && (
        <button
          onClick={() => router.push(`/study/${continueChapter!.subject}/${continueChapter!.chapter}`)}
          className="paper-card card-selectable mt-6 flex items-center gap-4 p-4 text-left group"
        >
          <span className="inline-flex h-11 w-11 items-center justify-center rounded-xl bg-ember-500/10 text-xl flex-shrink-0">▶️</span>
          <div className="flex-1 min-w-0">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-ember-500">Continue reading</p>
            <p className="mt-0.5 font-serif font-medium text-ink-900 truncate">{continueChapter.name}</p>
          </div>
          <svg width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24" className="text-muted-400 group-hover:text-ember-500 group-hover:translate-x-0.5 transition-all flex-shrink-0"><path d="M9 18l6-6-6-6"/></svg>
        </button>
      )}

      {/* Subject accordion */}
      <section className="mt-8 space-y-3">
        {syllabus.subjects.map((subject) => {
          const isExpanded = expanded === subject.slug;
          const subjectCompleted = subject.chapters.filter(ch => completedSet.has(`${subject.slug}/${ch.slug}`)).length;
          const subjectPct = Math.round((subjectCompleted / subject.chapters.length) * 100);

          return (
            <div key={subject.slug} className="paper-card overflow-hidden">
              {/* Subject header */}
              <button
                onClick={() => setExpanded(isExpanded ? null : subject.slug)}
                className="flex w-full items-center gap-3 p-4 text-left transition-colors hover:bg-paper-200 active:bg-paper-300"
              >
                <span className="text-xl flex-shrink-0">{subject.icon}</span>
                <div className="flex-1 min-w-0">
                <h3 className="font-serif font-semibold text-ink-900 truncate">{lang === 'hi' && subject.nameHi ? subject.nameHi : subject.name}</h3>
                  <div className="mt-1.5 flex items-center gap-2">
                    <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-paper-300">
                      <div className="h-full rounded-full bg-gold-500 transition-all duration-500 ease-out" style={{ width: `${subjectPct}%` }} />
                    </div>
                    <span className="text-xs text-muted-500 font-medium flex-shrink-0">{subjectCompleted}/{subject.chapters.length}</span>
                  </div>
                </div>
                <svg className={`h-5 w-5 text-muted-400 transition-transform duration-200 flex-shrink-0 ${isExpanded ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" /></svg>
              </button>

              {/* Chapters list */}
              {isExpanded && (
                <div className="border-t border-line px-3 pb-3 pt-2 space-y-1 animate-expandIn">
                  {subject.chapters.map((ch, idx) => {
                    const chKey = `${subject.slug}/${ch.slug}`;
                    const isCompleted = completedSet.has(chKey);
                    const score = scores[chKey];
                    // Unlock logic: first 2 chapters always unlocked, rest need previous completed
                    const prevKey = idx > 0 ? `${subject.slug}/${subject.chapters[idx - 1]!.slug}` : null;
                    const isUnlocked = idx < 2 || completedSet.has(prevKey!);
                    // Free plan: lock chapters beyond the first 2 per subject unless already completed
                    const isPlanLocked = currentPlan === 'free' && idx >= 2 && !isCompleted;

                    return (
                      <button
                        key={ch.slug}
                        onClick={() => {
                          if (isPlanLocked) { router.push('/upgrade'); return; }
                          if (isUnlocked) router.push(`/study/${subject.slug}/${ch.slug}`);
                        }}
                        disabled={!isUnlocked && !isPlanLocked}
                        className={`flex w-full items-center gap-3 rounded-xl px-3 py-3 text-left transition-all duration-150 ${
                          isPlanLocked ? 'hover:bg-paper-200 cursor-pointer' : isUnlocked ? 'hover:bg-paper-200 cursor-pointer active:scale-[0.98]' : 'opacity-40 cursor-not-allowed'
                        }`}
                      >
                        {/* Status icon */}
                        <span className={`flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full text-xs font-bold transition-colors ${
                          isCompleted ? 'bg-gold-500 text-paper-50' : (isUnlocked && !isPlanLocked) ? 'bg-paper-300 text-ink-800 border border-line' : 'bg-paper-200 text-muted-400'
                        }`}>
                          {isCompleted ? (
                            <svg width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24"><polyline points="20 6 9 17 4 12"/></svg>
                          ) : (isPlanLocked || !isUnlocked) ? (
                            <svg width="12" height="12" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0110 0v4"/></svg>
                          ) : ch.order}
                        </span>
                        <div className="flex-1 min-w-0">
                          <p className={`text-sm font-medium truncate ${isCompleted ? 'text-ink-900' : isUnlocked && !isPlanLocked ? 'text-ink-800' : 'text-muted-500'}`}>{lang === 'hi' && ch.nameHi ? ch.nameHi : ch.name}</p>
                          <p className="text-[11px] text-muted-400 mt-0.5">{ch.estimatedMinutes} min</p>
                        </div>
                        {score !== undefined && (
                          <span className={`pill text-xs ${score >= 80 ? 'pill-success' : 'pill-warn'}`}>{score}%</span>
                        )}
                        {isUnlocked && !isCompleted && !isPlanLocked && (
                          <svg width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24" className="text-muted-400 flex-shrink-0"><path d="M9 18l6-6-6-6"/></svg>
                        )}
                      </button>
                    );
                  })}

                  {/* Generate More Chapters Button */}
                  {(() => {
                    const allCompleted = subjectCompleted >= subject.chapters.length;
                    const allPassed = subject.chapters.every(ch => {
                      const s = scores[`${subject.slug}/${ch.slug}`];
                      return s !== undefined && s >= 80;
                    });

                    // Always show "Load More Chapters" for pro users or locked for free
                    if (subject.chapters.length > 0) {
                      if (currentPlan === 'free') {
                        return (
                          <button
                            onClick={() => router.push('/upgrade')}
                            className="mt-3 w-full rounded-lg border border-gold-500/50 bg-gold-500/5 py-3 text-center text-sm font-medium text-gold-600 dark:text-gold-500 transition-colors hover:bg-gold-500/10"
                          >
                            🔒 Load More Chapters — Upgrade to Pro
                          </button>
                        );
                      }

                      if (!allCompleted) {
                        return (
                          <p className="mt-3 text-center text-xs text-muted-400">
                            Complete all chapters to generate advanced content ✨
                          </p>
                        );
                      }

                      if (!allPassed) {
                        return (
                          <button disabled className="mt-3 w-full rounded-lg bg-paper-200 py-3 text-center text-sm font-medium text-muted-500 cursor-not-allowed">
                            🔒 Generate More Chapters — Pass all chapters first (80%+)
                          </button>
                        );
                      }

                      return (
                        <button
                          onClick={async () => {
                            setGenerating(subject.slug);
                            setGenSuccess(null);
                            try {
                              const res = await api.generateChapters
                                ? api.generateChapters(syllabus!.exam, subject.slug)
                                : (await (await import('~/lib/api')).authedFetch('/v1/study/generate-chapters', {
                                    method: 'POST',
                                    body: JSON.stringify({ examSlug: syllabus!.exam, subjectSlug: subject.slug }),
                                  })).json() as { newChapters: any[]; message: string };
                              setGenSuccess((res as any).message ?? 'New chapters generated!');
                              // Refresh syllabus
                              const exam = me?.targetExam;
                              if (exam) {
                                const syllRes = await api.getSyllabus(exam);
                                setSyllabus(syllRes.syllabus);
                              }
                            } catch { setGenSuccess('Failed to generate. Try again.'); }
                            finally { setGenerating(null); }
                          }}
                          disabled={generating === subject.slug}
                          className="mt-3 w-full rounded-lg bg-gold-500 py-3 text-center text-sm font-semibold text-paper-50 transition-colors hover:bg-gold-600 disabled:opacity-60"
                        >
                          {generating === subject.slug ? '✨ Generating...' : '✨ Generate More Chapters'}
                        </button>
                      );
                    }
                    return null;
                  })()}
                  {genSuccess && generating === null && (
                    <p className="mt-2 text-center text-xs text-gold-500">{genSuccess}</p>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </section>
    </main>
  );
}
