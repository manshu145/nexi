'use client';
import { useEffect, useState } from 'react';
import { api } from '~/lib/api';
import { getClientLocale, type AppLocale } from '~/lib/locale';

const COPY: Record<AppLocale, {
  title: string;
  subtitle: string;
  tryAgain: string;
  goToDashboard: string;
}> = {
  en: {
    title: 'Something went wrong',
    subtitle: 'An unexpected error occurred. Our team has been notified.',
    tryAgain: 'Try Again',
    goToDashboard: 'Go to Dashboard',
  },
  hi: {
    title: 'कुछ गलत हो गया',
    subtitle: 'एक अनपेक्षित त्रुटि हुई। हमारी टीम को सूचित कर दिया गया है।',
    tryAgain: 'पुनः प्रयास करें',
    goToDashboard: 'डैशबोर्ड पर जाएं',
  },
};

export default function ErrorPage({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  // Locale detection runs in an effect so the boundary remains SSR-safe;
  // we render English-default until the cookie is read on the client. This
  // is a deliberate single-render flicker for Hindi users on a dynamic
  // route, but the boundary itself is uncommon in normal usage.
  const [locale, setLocale] = useState<AppLocale>('en');
  useEffect(() => {
    setLocale(getClientLocale());
  }, []);

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

  const c = COPY[locale];

  return (
    <main className="flex min-h-dvh flex-col items-center justify-center px-5 text-center" lang={locale}>
      <span className="text-6xl">⚠️</span>
      <h1 className="font-serif mt-6 text-2xl font-bold text-ink-900">{c.title}</h1>
      <p className="mt-3 text-sm text-muted-500 max-w-md">{c.subtitle}</p>
      <p className="mt-2 text-xs text-muted-400 max-w-sm truncate">{error.message}</p>
      <div className="mt-6 flex gap-3">
        <button onClick={reset} className="btn-primary">{c.tryAgain}</button>
        {/* Use window.location instead of router.push: this boundary is
            rendered when the React tree has already crashed, so the Next.js
            client router may be in an inconsistent state. A full navigation
            is the safe option. */}
        <button
          onClick={() => { window.location.href = '/dashboard'; }}
          className="btn-ghost"
        >
          {c.goToDashboard}
        </button>
      </div>
    </main>
  );
}
