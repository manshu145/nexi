'use client';
import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '~/lib/auth-context';

export default function HomePage() {
  const { user, loading } = useAuth();
  const router = useRouter();
  useEffect(() => { if (loading) return; if (user) router.replace('/dashboard'); else router.replace('/signin'); }, [user, loading, router]);
  return <main className="flex min-h-screen items-center justify-center"><div className="h-8 w-8 animate-spin rounded-full border-4 border-paper-300 border-t-ember-500" /></main>;
}
