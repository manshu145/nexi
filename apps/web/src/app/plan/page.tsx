'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '~/lib/auth-context';
import { useUser } from '~/lib/userStore';
import { api, type DailyPlan, type DailyPlanItem } from '~/lib/api';
import { Logo } from '~/components/Logo';
import { AILoader } from '~/components/ui/AILoader';

const KIND_META: Record<DailyPlanItem['kind'], { label: string; icon: string; cta: string }> = {
  revise: { label: 'Revise', icon: '🔁', cta: 'Flashcards' },
  fix: { label: 'Strengthen', icon: '🛠️', cta: 'Open chapter' },
  learn: { label: 'Learn', icon: '📘', cta: 'Start chapter' },
};

export default function PlanPage() {
  const { user, loading } = useAuth();
  const { user: me } = useUser();
  const router = useRouter();
  const [plan, setPlan] = useState<DailyPlan | null>(null);
  const [loadingPlan, setLoadingPlan] = useState(true);

  useEffect(() => { if (!loading && !user) router.replace('/signin'); }, [user, loading, router]);

  useEffect(() => {
    if (!user || !me) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await api.getDailyPlan(me.targetExam ?? 'jee-main');
        if (!cancelled) setPlan(res);
      } catch { /* ignore */ }
      finally { if (!cancelled) setLoadingPlan(false); }
    })();
    return () => { cancelled = true; };
  }, [user, me]);

  if (loading || loadingPlan) {
    return <main className="min-h-dvh bg-paper-100"><AILoader context="chat" /></main>;
  }

  const open = (item: DailyPlanItem) => {
    if (item.kind === 'revise') router.push(`/study/${item.subject}/${item.chapter}/flashcards`);
    else router.push(`/study/${item.subject}/${item.chapter}`);
  };

  const items = plan?.items ?? [];

  return (
    <main className="min-h-dvh bg-paper-100 px-4 py-6">
      <div className="mx-auto max-w-2xl">
        <header className="flex items-center justify-between gap-3">
          <button onClick={() => router.push('/dashboard')} className="btn-ghost-sm" aria-label="Back to dashboard">← Dashboard</button>
          <Logo height={28} />
        </header>

        <div className="mt-6">
          <h1 className="font-serif text-2xl font-bold text-ink-900">Today&apos;s Study Plan</h1>
          <p className="mt-1 text-sm text-muted-500">
            {items.length > 0
              ? `${items.length} focused tasks · about ${plan?.estMinutes ?? 0} min. Built from your revisions, weak areas and syllabus.`
              : 'A personalized plan from your progress, weak areas and revisions.'}
          </p>
        </div>

        {items.length === 0 ? (
          <div className="paper-card mt-8 p-8 text-center">
            <span aria-hidden className="text-4xl">🗺️</span>
            <h2 className="mt-3 font-serif text-lg font-semibold text-ink-900">Nothing scheduled yet</h2>
            <p className="mt-2 text-sm text-muted-500">Start studying a few chapters and we&apos;ll build your daily plan from your progress.</p>
            <button onClick={() => router.push('/study')} className="btn-primary mt-5">Go to Study</button>
          </div>
        ) : (
          <ol className="mt-6 space-y-3">
            {items.map((item, i) => {
              const meta = KIND_META[item.kind];
              return (
                <li key={`${item.subject}/${item.chapter}/${i}`} className="paper-card p-4">
                  <div className="flex items-start gap-3">
                    <span aria-hidden className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-ember-500/10 text-xl">{meta.icon}</span>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="rounded-full bg-paper-200 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-muted-500">{meta.label}</span>
                        <span className="text-[11px] text-muted-400">{item.minutes} min</span>
                      </div>
                      <p className="mt-1 truncate font-medium text-ink-900">{item.chapterName}</p>
                      <p className="truncate text-xs text-muted-500">{item.subjectName} · {item.reason}</p>
                    </div>
                  </div>
                  <button onClick={() => open(item)} className="btn-ghost mt-3 w-full text-sm">{meta.cta} →</button>
                </li>
              );
            })}
          </ol>
        )}

        {(plan?.dueCount ?? 0) > 0 && (
          <button onClick={() => router.push('/revise')} className="btn-ghost mt-4 w-full text-sm">
            🔁 You have {plan?.dueCount} chapter(s) due for revision — open Revise →
          </button>
        )}
      </div>
    </main>
  );
}
