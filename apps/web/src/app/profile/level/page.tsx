'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '~/lib/auth-context';
import { api } from '~/lib/api';
import { Logo } from '~/components/Logo';
import { Skeleton } from '~/components/Skeleton';
import { AILoader } from '~/components/ui/AILoader';

interface SubjectBreakdown { subject: string; subjectName: string; completed: number; total: number; avgScore: number; }
interface ChapterInfo { subject: string; chapter: string; chapterName: string; score: number; }
interface AnalysisData { overallPercent: number; subjectBreakdown: SubjectBreakdown[]; weakChapters: ChapterInfo[]; strongChapters: ChapterInfo[]; }

export default function LevelPage() {
  const { user, loading } = useAuth();
  const router = useRouter();
  const [analysis, setAnalysis] = useState<AnalysisData | null>(null);
  const [userInfo, setUserInfo] = useState<any>(null);
  const [pageLoading, setPageLoading] = useState(true);

  useEffect(() => { if (!loading && !user) router.replace('/signin'); }, [user, loading, router]);

  useEffect(() => {
    if (!user) return;
    (async () => {
      try {
        const meRes = await api.me();
        setUserInfo(meRes.user);
        const exam = meRes.user.targetExam;
        if (!exam) { router.replace('/onboarding/language'); return; }
        const res = await fetch(`/api/v1/study/analysis/${exam}`, { headers: { Authorization: `Bearer ${await user.getIdToken()}` } });
        if (res.ok) setAnalysis(await res.json());
      } catch { /* ignore */ }
      finally { setPageLoading(false); }
    })();
  }, [user, router]);

  if (loading || !user || pageLoading) return (
    <main className="mx-auto flex min-h-dvh max-w-2xl flex-col px-5 pt-6 pb-28">
      <div className="space-y-4 mt-8">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-4 w-64" />
        <Skeleton className="h-32 w-full" />
        <Skeleton className="h-32 w-full" />
      </div>
    </main>
  );

  const levelLabel = userInfo?.onboardingLevel === 'advanced' ? 'Advanced' : userInfo?.onboardingLevel === 'intermediate' ? 'Intermediate' : 'Beginner';
  const levelColor = userInfo?.onboardingLevel === 'advanced' ? 'text-green-600' : userInfo?.onboardingLevel === 'intermediate' ? 'text-amber-600' : 'text-blue-600';

  return (
    <main className="mx-auto flex min-h-dvh max-w-2xl flex-col px-5 pt-6 pb-28">
      <header className="flex items-center justify-between">
        <Logo />
        <button onClick={() => router.back()} className="btn-ghost-sm">← Back</button>
      </header>

      <section className="mt-6">
        <h1 className="font-serif text-2xl font-bold text-ink-900 dark:text-paper-50">Your Learning Profile</h1>
      </section>

      {/* Assessment Result */}
      <div className="paper-card mt-6 p-5">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-500">Assessment Result</h2>
        <div className="mt-3 grid grid-cols-2 gap-4">
          <div>
            <p className="text-xs text-muted-400">Exam</p>
            <p className="text-sm font-medium text-ink-900 dark:text-paper-50">{userInfo?.targetExam?.replace(/-/g, ' ').replace(/\b\w/g, (c: string) => c.toUpperCase())}</p>
          </div>
          <div>
            <p className="text-xs text-muted-400">Score</p>
            <p className="text-sm font-medium text-ink-900 dark:text-paper-50">{userInfo?.onboardingScore ?? '—'}/15</p>
          </div>
          <div>
            <p className="text-xs text-muted-400">Level Assigned</p>
            <p className={`text-sm font-bold ${levelColor}`}>{levelLabel}</p>
          </div>
          <div>
            <p className="text-xs text-muted-400">Date</p>
            <p className="text-sm font-medium text-ink-900 dark:text-paper-50">{userInfo?.createdAt ? new Date(userInfo.createdAt).toLocaleDateString('en-IN') : '—'}</p>
          </div>
        </div>
      </div>

      {/* Exam Readiness */}
      {analysis && (
        <div className="paper-card mt-4 p-5">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-500">Exam Readiness</h2>
          <div className="mt-3 flex items-center gap-4">
            <div className="relative h-16 w-16">
              <svg className="h-16 w-16 -rotate-90" viewBox="0 0 36 36">
                <circle cx="18" cy="18" r="15.9" fill="none" stroke="var(--color-paper-300)" strokeWidth="3" />
                <circle cx="18" cy="18" r="15.9" fill="none" stroke="var(--color-ember-500)" strokeWidth="3" strokeDasharray={`${analysis.overallPercent} ${100 - analysis.overallPercent}`} strokeLinecap="round" />
              </svg>
              <span className="absolute inset-0 flex items-center justify-center text-sm font-bold text-ink-900 dark:text-paper-50">{analysis.overallPercent}%</span>
            </div>
            <p className="text-sm text-muted-500">Overall progress toward your exam goal</p>
          </div>
        </div>
      )}

      {/* Subject-wise Progress */}
      {analysis && analysis.subjectBreakdown.length > 0 && (
        <div className="paper-card mt-4 p-5">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-500">Current Progress</h2>
          <div className="mt-3 space-y-3">
            {analysis.subjectBreakdown.map((sub) => (
              <div key={sub.subject}>
                <div className="flex items-center justify-between">
                  <p className="text-sm font-medium text-ink-800 dark:text-paper-200">{sub.subjectName}</p>
                  <span className="text-xs text-muted-500">{sub.completed}/{sub.total} chapters · {sub.avgScore}% avg</span>
                </div>
                <div className="mt-1 h-2 w-full overflow-hidden rounded-full bg-paper-300">
                  <div className="h-full rounded-full bg-gold-500 transition-all" style={{ width: `${sub.total > 0 ? Math.round((sub.completed / sub.total) * 100) : 0}%` }} />
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Weak Areas */}
      {analysis && analysis.weakChapters.length > 0 && (
        <div className="paper-card mt-4 p-5">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-red-500">Topics to Focus On</h2>
          <ul className="mt-3 space-y-2">
            {analysis.weakChapters.slice(0, 5).map((ch) => (
              <li key={`${ch.subject}/${ch.chapter}`} className="flex items-center justify-between rounded-lg bg-red-50 px-3 py-2 dark:bg-red-950/20">
                <span className="text-sm text-ink-800 dark:text-paper-200">{ch.chapterName}</span>
                <span className="pill pill-warn text-xs">{ch.score}%</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Strong Areas */}
      {analysis && analysis.strongChapters.length > 0 && (
        <div className="paper-card mt-4 p-5">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-green-600">Strong Areas</h2>
          <ul className="mt-3 space-y-2">
            {analysis.strongChapters.slice(0, 5).map((ch) => (
              <li key={`${ch.subject}/${ch.chapter}`} className="flex items-center justify-between rounded-lg bg-green-50 px-3 py-2 dark:bg-green-950/20">
                <span className="text-sm text-ink-800 dark:text-paper-200">{ch.chapterName}</span>
                <span className="pill pill-success text-xs">{ch.score}%</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </main>
  );
}
