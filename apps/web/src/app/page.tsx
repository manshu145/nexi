'use client';
import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '~/lib/auth-context';
import { AILoader } from '~/components/ui/AILoader';

export default function HomePage() {
  const { user, loading } = useAuth();
  const router = useRouter();
  useEffect(() => { if (loading) return; if (user) router.replace('/dashboard'); else router.replace('/signin'); }, [user, loading, router]);
  return <main className="flex min-h-screen items-center justify-center"><AILoader context="general" /></main>;
}
