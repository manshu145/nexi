'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '~/lib/auth-context';

/**
 * Root route. Routes signed-in users to the dashboard, signed-out to the
 * sign-in page. We do this client-side because Firebase Auth state lives in
 * the browser; a server-side check would require a session cookie which we
 * don't (yet) issue.
 */
export default function HomePage() {
  const { user, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (loading) return;
    router.replace(user ? '/dashboard' : '/signin');
  }, [user, loading, router]);

  return (
    <main className="flex min-h-[60vh] items-center justify-center px-6">
      <span className="inline-flex items-center gap-2 text-sm text-muted-500">
        <span className="spinner" aria-hidden="true" />
        Loading…
      </span>
    </main>
  );
}
