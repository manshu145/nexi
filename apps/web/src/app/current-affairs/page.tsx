'use client';
import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '~/lib/auth-context';
import { Logo } from '~/components/Logo';

export default function CurrentAffairsPage() {
  const { user, loading } = useAuth();
  const router = useRouter();
  useEffect(() => { if (!loading && !user) router.replace('/signin'); }, [user, loading, router]);
  if (loading || !user) return <main className="flex min-h-dvh items-center justify-center"><span className="spinner" /></main>;

  return (
    <main className="mx-auto flex min-h-dvh max-w-lg flex-col px-5 pt-6 pb-28">
      <header className="flex items-center justify-between">
        <Logo />
        <button onClick={() => router.back()} className="btn-ghost-sm">← Back</button>
      </header>
      <section className="mt-8 text-center">
        <span className="text-4xl">📰</span>
        <h1 className="font-serif mt-4 text-2xl font-semibold text-ink-900">Current Affairs</h1>
        <p className="mt-2 text-sm text-muted-500">Daily news digest with AI-summarized articles and quiz will appear here.</p>
        <p className="mt-4 text-xs text-muted-400">Coming in Phase 3</p>
      </section>
    </main>
  );
}
