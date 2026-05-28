'use client';
import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '~/lib/auth-context';
import { Logo } from '~/components/Logo';
import { AILoader } from '~/components/ui/AILoader';

export default function OnboardingLayout({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  const router = useRouter();
  useEffect(() => { if (!loading && !user) router.replace('/signin'); }, [user, loading, router]);
  if (loading || !user) return <main className="flex min-h-screen items-center justify-center"><AILoader context="general" /></main>;
  return (
    <main className="mx-auto flex min-h-screen max-w-lg flex-col px-4 pt-8 pb-16 sm:px-6">
      <header className="mb-8 text-center"><Logo height={48} className="mx-auto" /></header>
      {children}
    </main>
  );
}
