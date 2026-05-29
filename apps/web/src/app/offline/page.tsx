'use client';
import { useEffect, useState } from 'react';
import { Logo } from '~/components/Logo';
import { getClientLocale, type AppLocale } from '~/lib/locale';

const COPY: Record<AppLocale, {
  title: string;
  subtitle: string;
  goToDashboard: string;
  retry: string;
}> = {
  en: {
    title: "You're offline",
    subtitle: 'Some content may not be available without an internet connection. Please check your network and try again.',
    goToDashboard: 'Go to Dashboard',
    retry: 'Retry Connection',
  },
  hi: {
    title: 'आप ऑफ़लाइन हैं',
    subtitle: 'इंटरनेट कनेक्शन के बिना कुछ सामग्री उपलब्ध नहीं हो सकती। कृपया अपना नेटवर्क जाँचें और पुनः प्रयास करें।',
    goToDashboard: 'डैशबोर्ड पर जाएं',
    retry: 'कनेक्शन पुनः प्रयास करें',
  },
};

export default function OfflinePage() {
  const [locale, setLocale] = useState<AppLocale>('en');
  useEffect(() => {
    setLocale(getClientLocale());
  }, []);

  const c = COPY[locale];

  return (
    <main className="flex min-h-dvh flex-col items-center justify-center px-6 text-center" lang={locale}>
      <Logo height={36} />
      <div className="mt-8">
        <span className="text-5xl">📡</span>
      </div>
      <h1 className="mt-6 font-serif text-2xl font-bold text-ink-900">{c.title}</h1>
      <p className="mt-3 text-sm text-muted-500 max-w-xs">{c.subtitle}</p>
      {/*
        Use window.location.href instead of next/navigation's router.push
        here: this page is served by the service worker as the fallback
        when the network is down, which means the Next.js client router
        cannot fetch route data. router.push() would silently no-op or
        spin forever. A plain href triggers the browser-native navigation,
        which the service worker can satisfy from cache for any /dashboard
        slate the user has already visited. (Lock §4.6 fix.)
      */}
      <button
        onClick={() => { window.location.href = '/dashboard'; }}
        className="btn-primary mt-8"
      >
        {c.goToDashboard}
      </button>
      <button
        onClick={() => window.location.reload()}
        className="btn-ghost mt-3 text-sm"
      >
        {c.retry}
      </button>
    </main>
  );
}
