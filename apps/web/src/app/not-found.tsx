'use client';
import { useEffect, useState } from 'react';
import { getClientLocale, type AppLocale } from '~/lib/locale';

const COPY: Record<AppLocale, {
  title: string;
  subtitle: string;
  back: string;
}> = {
  en: {
    title: 'Page Not Found',
    subtitle: "The page you're looking for doesn't exist.",
    back: '← Back to Dashboard',
  },
  hi: {
    title: 'पृष्ठ नहीं मिला',
    subtitle: 'आप जो पृष्ठ खोज रहे हैं वह मौजूद नहीं है।',
    back: '← डैशबोर्ड पर वापस जाएं',
  },
};

export default function NotFound() {
  // not-found.tsx is rendered in many routing edge cases where the locale
  // provider is not yet mounted. Detect from the cookie the same way our
  // other boundary pages do; defaults to English on SSR / cookie-less
  // first paint and switches to Hindi after hydration when applicable.
  const [locale, setLocale] = useState<AppLocale>('en');
  useEffect(() => {
    setLocale(getClientLocale());
  }, []);

  const c = COPY[locale];

  return (
    <main className="flex min-h-dvh flex-col items-center justify-center px-5 text-center" lang={locale}>
      <span className="text-6xl">📚</span>
      <h1 className="font-serif mt-6 text-3xl font-bold text-ink-900">{c.title}</h1>
      <p className="mt-3 text-muted-500">{c.subtitle}</p>
      {/* Plain anchor: Next.js router may not have a context for this
          orphaned route, so a hard navigation is the only safe option. */}
      <a href="/dashboard" className="btn-primary mt-6">{c.back}</a>
    </main>
  );
}
