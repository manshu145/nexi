'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '~/lib/auth-context';
import { api } from '~/lib/api';
import { Logo } from '~/components/Logo';
import { AILoader } from '~/components/ui/AILoader';

interface SubjectBreakdown { subject: string; subjectName: string; completed: number; total: number; avgScore: number; }
interface ChapterInfo { subject: string; chapter: string; chapterName: string; score: number; }
interface AnalysisData { overallPercent: number; subjectBreakdown: SubjectBreakdown[]; weakChapters: ChapterInfo[]; strongChapters: ChapterInfo[]; }

const API = process.env['NEXT_PUBLIC_API_URL'] ?? 'https://api.nexigrate.com';

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
        const token = await user.getIdToken();
        const res = await fetch(`${API}/v1/study/analysis/${exam}`, { headers: { Authorization: `Bearer ${token}` } });
        if (res.ok) setAnalysis(await res.json());
      } catch { /* ignore */ }
      finally { setPageLoading(false); }
    })();
  }, [user, router]);

  if (loading || !user || pageLoading) return (
    <main className="mx-auto flex min-h-dvh max-w-2xl flex-col items-center justify-center px-5">
      <AILoader context="general" />
    </main>
  );

  const levelLabel = userInfo?.onboardingLevel === 'advanced' ? 'Advanced' : userInfo?.onboardingLevel === 'intermediate' ? 'Intermediate' : 'Beginner';
  const levelColor = userInfo?.onboardingLevel === 'advanced' ? 'text-green-600' : userInfo?.onboardingLevel === 'intermediate' ? 'text-amber-600' : 'text-blue-600';
  const totalChaptersDone = analysis?.subjectBreakdown.reduce((sum, s) => sum + s.completed, 0) ?? 0;
  const totalChapters = analysis?.subjectBreakdown.reduce((sum, s) => sum + s.total, 0) ?? 0;

  return (
    <main className="mx-auto flex min-h-dvh max-w-lg flex-col px-5 pt-6 pb-28">
      <header className="flex items-center justify-between">
        <button onClick={() => router.back()} className="btn-ghost-sm">← Back</button>
        <Logo />
      </header>

      <section className="mt-6">
        <h1 className="font-serif text-xl font-bold text-ink-900">Your Learning Profile</h1>
        <p className="mt-1 text-sm text-muted-500">Track your progress across all activities</p>
      </section>

      {/* Level & Assessment Card */}
      <div className="paper-card mt-6 p-5">
        <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-500">Assessment Result</h2>
        <div className="mt-3 space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs text-muted-400">Exam</span>
            <span className="text-sm font-medium text-ink-900 text-right truncate max-w-[60%]">{userInfo?.targetExam?.replace(/-/g, ' ').replace(/\b\w/g, (c: string) => c.toUpperCase())}</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-xs text-muted-400">Assessment Score</span>
            <span className="text-sm font-medium text-ink-900">{userInfo?.onboardingScore ?? '—'}/15</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-xs text-muted-400">Level</span>
            <span className={`text-sm font-bold ${levelColor}`}>{levelLabel}</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-xs text-muted-400">Member Since</span>
            <span className="text-sm font-medium text-ink-900">{userInfo?.createdAt ? new Date(userInfo.createdAt).toLocaleDateString('en-IN') : '—'}</span>
          </div>
        </div>
      </div>

      {/* Quick Stats */}
      <div className="mt-4 grid grid-cols-3 gap-3">
        <div className="paper-card p-3 text-center">
          <p className="text-xl font-bold text-ink-900">{totalChaptersDone}</p>
          <p className="text-[10px] text-muted-500 mt-0.5">Chapters Done</p>
        </div>
        <div className="paper-card p-3 text-center">
          <p className="text-xl font-bold text-ink-900">{userInfo?.currentStreak ?? 0}</p>
          <p className="text-[10px] text-muted-500 mt-0.5">Day Streak</p>
        </div>
        <div className="paper-card p-3 text-center">
          <p className="text-xl font-bold text-ink-900">{userInfo?.credits ?? 0}</p>
          <p className="text-[10px] text-muted-500 mt-0.5">Credits</p>
        </div>
      </div>

      {/* Exam Readiness */}
      {analysis && (
        <div className="paper-card mt-4 p-5">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-500">Exam Readiness</h2>
          <div className="mt-3 flex items-center gap-4">
            <div className="relative h-16 w-16 flex-shrink-0">
              <svg className="h-16 w-16 -rotate-90" viewBox="0 0 36 36">
                <circle cx="18" cy="18" r="15.9" fill="none" stroke="var(--color-paper-300)" strokeWidth="3" />
                <circle cx="18" cy="18" r="15.9" fill="none" stroke="var(--color-ember-500)" strokeWidth="3" strokeDasharray={`${analysis.overallPercent} ${100 - analysis.overallPercent}`} strokeLinecap="round" />
              </svg>
              <span className="absolute inset-0 flex items-center justify-center text-sm font-bold text-ink-900">{analysis.overallPercent}%</span>
            </div>
            <div>
              <p className="text-sm font-medium text-ink-900">{totalChaptersDone}/{totalChapters} chapters completed</p>
              <p className="text-xs text-muted-500 mt-0.5">Keep studying to improve your readiness</p>
            </div>
          </div>
        </div>
      )}

      {/* Subject-wise Progress */}
      {analysis && analysis.subjectBreakdown.length > 0 && (
        <div className="paper-card mt-4 p-5">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-500">Subject Progress</h2>
          <div className="mt-3 space-y-3">
            {analysis.subjectBreakdown.map((sub) => (
              <div key={sub.subject}>
                <div className="flex items-center justify-between">
                  <p className="text-sm font-medium text-ink-800 truncate max-w-[50%]">{sub.subjectName}</p>
                  <span className="text-[11px] text-muted-500">{sub.completed}/{sub.total} · {sub.avgScore}%</span>
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
          <h2 className="text-xs font-semibold uppercase tracking-wider text-red-500">Needs Improvement</h2>
          <ul className="mt-3 space-y-2">
            {analysis.weakChapters.slice(0, 5).map((ch) => (
              <li key={`${ch.subject}/${ch.chapter}`} className="flex items-center justify-between rounded-lg bg-red-50 dark:bg-red-950/20 px-3 py-2">
                <span className="text-xs text-ink-800 truncate max-w-[65%]">{ch.chapterName}</span>
                <span className="text-[10px] font-bold text-red-600">{ch.score}%</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Strong Areas */}
      {analysis && analysis.strongChapters.length > 0 && (
        <div className="paper-card mt-4 p-5">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-green-600">Strong Areas</h2>
          <ul className="mt-3 space-y-2">
            {analysis.strongChapters.slice(0, 5).map((ch) => (
              <li key={`${ch.subject}/${ch.chapter}`} className="flex items-center justify-between rounded-lg bg-green-50 dark:bg-green-950/20 px-3 py-2">
                <span className="text-xs text-ink-800 truncate max-w-[65%]">{ch.chapterName}</span>
                <span className="text-[10px] font-bold text-green-600">{ch.score}%</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Activity Summary */}
      <div className="paper-card mt-4 p-5">
        <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-500">Activity Summary</h2>
        <div className="mt-3 space-y-2.5">
          <div className="flex items-center justify-between border-b border-line pb-2">
            <div className="flex items-center gap-2">
              <span className="text-sm">📖</span>
              <span className="text-xs text-ink-800">Chapters Read</span>
            </div>
            <span className="text-sm font-bold text-ink-900">{totalChaptersDone}</span>
          </div>
          <div className="flex items-center justify-between border-b border-line pb-2">
            <div className="flex items-center gap-2">
              <span className="text-sm">🎯</span>
              <span className="text-xs text-ink-800">Chapter Quizzes Passed</span>
            </div>
            <span className="text-sm font-bold text-ink-900">{analysis?.strongChapters.length ?? 0}</span>
          </div>
          <div className="flex items-center justify-between border-b border-line pb-2">
            <div className="flex items-center gap-2">
              <span className="text-sm">📰</span>
              <span className="text-xs text-ink-800">Current Affairs Quizzes</span>
            </div>
            <span className="text-sm font-bold text-ink-900">—</span>
          </div>
          <div className="flex items-center justify-between border-b border-line pb-2">
            <div className="flex items-center gap-2">
              <span className="text-sm">🔥</span>
              <span className="text-xs text-ink-800">Best Streak</span>
            </div>
            <span className="text-sm font-bold text-ink-900">{userInfo?.bestStreak ?? 0} days</span>
          </div>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="text-sm">💎</span>
              <span className="text-xs text-ink-800">Total Credits Earned</span>
            </div>
            <span className="text-sm font-bold text-ink-900">{userInfo?.credits ?? 0}</span>
          </div>
        </div>
      </div>
    </main>
  );
}
