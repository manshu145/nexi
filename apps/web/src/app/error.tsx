'use client';
import { useEffect } from 'react';
import { api } from '~/lib/api';

export default function ErrorPage({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    // Best-effort report to the public /v1/logs/error endpoint.
    // No Authorization header is sent -- this route is intentionally
    // public so a React render crash that broke the auth client can still
    // phone home. The helper itself never throws.
    void api.reportClientError({
      message: error.message,
      stack: error.stack,
      route: typeof window !== 'undefined' ? window.location.pathname : undefined,
      digest: error.digest,
    });
  }, [error]);

  return (
    <main className="flex min-h-dvh flex-col items-center justify-center px-5 text-center">
      <span className="text-6xl">⚠️</span>
      <h1 className="font-serif mt-6 text-2xl font-bold text-ink-900">Something went wrong</h1>
      <p className="mt-3 text-sm text-muted-500 max-w-md">
        An unexpected error occurred. Our team has been notified.
      </p>
      <p className="mt-2 text-xs text-muted-400 max-w-sm truncate">{error.message}</p>
      <div className="mt-6 flex gap-3">
        <button onClick={reset} className="btn-primary">Try Again</button>
        <button onClick={() => window.location.href = '/dashboard'} className="btn-ghost">Go to Dashboard</button>
      </div>
    </main>
  );
}
