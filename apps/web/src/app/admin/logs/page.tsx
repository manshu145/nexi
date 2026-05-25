'use client';
import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '~/lib/auth-context';

export default function AdminLogsPage() {
  const { user, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!loading && !user) router.replace('/signin');
    if (!loading && user && user.email !== 'manshu.ibc24@gmail.com') router.replace('/dashboard');
  }, [user, loading, router]);

  if (loading || !user) return <div className="flex items-center justify-center py-20"><span className="spinner" /></div>;

  return (
    <div>
      <h1 className="font-serif text-2xl font-bold text-ink-900 dark:text-paper-50">Logs</h1>
      <p className="mt-1 text-sm text-muted-500">System activity logs</p>

      <div className="mt-6 paper-card p-8 text-center">
        <span className="text-4xl">📋</span>
        <p className="mt-3 text-sm text-muted-500">Logs will appear here once the logging system is connected.</p>
      </div>
    </div>
  );
}
