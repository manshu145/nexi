'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '~/lib/auth-context';
import { api, type SyllabusTree, type StudyProgress } from '~/lib/api';
import { Logo } from '~/components/Logo';

export default function StudyPage() {
  const { user, loading } = useAuth();
  const router = useRouter();
  const [syllabus, setSyllabus] = useState<SyllabusTree | null>(null);
  const [progress, setProgress] = useState<StudyProgress | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [pageLoading, setPageLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lang, setLang] = useState<'en' | 'hi'>('en');

  useEffect(() => { if (!loading && !user) router.replace('/signin'); }, [user, loading, router]);

  useEffect(() => {
    if (!user) return;
    // Detect language
    const m = document.cookie.match(/nexigrate-language=(en|hi)/);
    const detected = m ? m[1] as 'en' | 'hi' : (localStorage.getItem('nexigrate-language') as 'en' | 'hi') || 'en';
    setLang(detected);
    (async () => {
      try {
        const meRes = await api.me();
        const exam = meRes.user.targetExam;
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
  }, [user, router]);

  if (loading || !user || pageLoading) return (
    <main className="flex min-h-dvh items-center justify-center"><span className="spinner" /></main>
  );

  if (error) return (
    <main className="mx-auto flex min-h-dvh max-w-lg flex-col items-center justify-center px-5">
      <div className="banner banner-error">{error}</div>
      <button onClick={() => router.back()} className="btn-ghost mt-4">← Back</button>
    </main>
  );

  if (!syllabus) return null;

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
        <Logo />
        <button onClick={() => router.push('/dashboard')} className="btn-ghost-sm">← Dashboard</button>
      </header>

      <section className="mt-6">
        <h1 className="font-serif text-2xl font-bold text-ink-900">{syllabus.examName}</h1>
        <p className="mt-1 text-sm text-muted-500">
          {progress ? `${progress.overallPercent}% complete · ${progress.completedChapters.length} chapters done` : 'Start your preparation'}
        </p>
        {/* Overall progress bar */}
        <div className="mt-3 h-2 w-full overflow-hidden rounded-full bg-paper-300">
          <div className="h-full rounded-full bg-ember-500 transition-all" style={{ width: `${progress?.overallPercent ?? 0}%` }} />
        </div>
      </section>

      {/* Continue card */}
      {continueChapter && (
        <button
          onClick={() => router.push(`/study/${continueChapter!.subject}/${continueChapter!.chapter}`)}
          className="paper-card card-selectable mt-6 flex items-center gap-3 p-4 text-left"
        >
          <span className="text-2xl">▶️</span>
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-ember-500">Continue where you left off</p>
            <p className="mt-0.5 font-serif font-medium text-ink-900">{continueChapter.name}</p>
          </div>
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
                className="flex w-full items-center gap-3 p-4 text-left transition-colors hover:bg-paper-200"
              >
                <span className="text-xl">{subject.icon}</span>
                <div className="flex-1">
                <h3 className="font-serif font-semibold text-ink-900">{lang === 'hi' && subject.nameHi ? subject.nameHi : subject.name}</h3>
                  <div className="mt-1 flex items-center gap-2">
                    <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-paper-300">
                      <div className="h-full rounded-full bg-gold-500 transition-all" style={{ width: `${subjectPct}%` }} />
                    </div>
                    <span className="text-xs text-muted-500">{subjectCompleted}/{subject.chapters.length}</span>
                  </div>
                </div>
                <svg className={`h-4 w-4 text-muted-500 transition-transform ${isExpanded ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" /></svg>
              </button>

              {/* Chapters list */}
              {isExpanded && (
                <div className="border-t border-line px-4 pb-3 pt-2">
                  {subject.chapters.map((ch, idx) => {
                    const chKey = `${subject.slug}/${ch.slug}`;
                    const isCompleted = completedSet.has(chKey);
                    const score = scores[chKey];
                    // Unlock logic: first chapter always unlocked, rest need previous completed
                    const prevKey = idx > 0 ? `${subject.slug}/${subject.chapters[idx - 1]!.slug}` : null;
                    const isUnlocked = idx === 0 || completedSet.has(prevKey!);

                    return (
                      <button
                        key={ch.slug}
                        onClick={() => isUnlocked && router.push(`/study/${subject.slug}/${ch.slug}`)}
                        disabled={!isUnlocked}
                        className={`flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left transition-colors ${
                          isUnlocked ? 'hover:bg-paper-200 cursor-pointer' : 'opacity-50 cursor-not-allowed'
                        }`}
                      >
                        {/* Status icon */}
                        <span className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full text-xs font-bold"
                          style={{ backgroundColor: isCompleted ? 'var(--color-gold-500)' : isUnlocked ? 'var(--color-paper-300)' : 'var(--color-paper-200)', color: isCompleted ? 'var(--color-paper-50)' : 'var(--color-ink-800)' }}>
                          {isCompleted ? '✓' : !isUnlocked ? '🔒' : ch.order}
                        </span>
                        <div className="flex-1 min-w-0">
                          <p className={`text-sm font-medium truncate ${isCompleted ? 'text-ink-900' : isUnlocked ? 'text-ink-800' : 'text-muted-500'}`}>{lang === 'hi' && ch.nameHi ? ch.nameHi : ch.name}</p>
                          <p className="text-xs text-muted-400">{ch.estimatedMinutes} min</p>
                        </div>
                        {score !== undefined && (
                          <span className={`pill text-xs ${score >= 80 ? 'pill-success' : 'pill-warn'}`}>{score}%</span>
                        )}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </section>
    </main>
  );
}
