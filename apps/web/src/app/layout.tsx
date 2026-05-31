import type { Metadata, Viewport } from 'next';
import Script from 'next/script';
import { NextIntlClientProvider } from 'next-intl';
import { getLocale, getMessages } from 'next-intl/server';
import { Providers } from '~/components/providers';
import { Toaster } from '~/components/toaster';
import { BottomNav } from '~/components/BottomNav';
import './globals.css';

export const dynamic = 'force-dynamic';

export const viewport: Viewport = {
  themeColor: '#F59E0B',
};

export const metadata: Metadata = {
  title: 'Nexigrate — AI-Powered Exam Prep',
  description: 'AI-powered exam preparation platform for Indian students.',
  manifest: '/manifest.json',
  appleWebApp: { capable: true, statusBarStyle: 'default', title: 'Nexigrate' },
  icons: {
    icon: [
      { url: '/brand/nexigrate-favicon.svg', type: 'image/svg+xml' },
      { url: '/favicon.svg', sizes: '32x32' },
    ],
    apple: '/icon-192.png',
    shortcut: '/brand/nexigrate-favicon.svg',
  },
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const locale = await getLocale();
  const messages = await getMessages();
  return (
    <html lang={locale} suppressHydrationWarning>
      <head>
        {/* Google Analytics */}
        <Script src="https://www.googletagmanager.com/gtag/js?id=G-HZEF3PG0QY" strategy="afterInteractive" />
        <Script id="gtag-init" strategy="afterInteractive">
          {`window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments);}gtag('js',new Date());gtag('config','G-HZEF3PG0QY');`}
        </Script>
      </head>
      <body>
        <NextIntlClientProvider messages={messages}>
          <Providers>
            {/*
             * PR-34a: pb is the BottomNav (h-14 ≈ 3.5rem) plus the iOS
             * home-indicator safe area (~34px on notched iPhones). Without
             * the env() addition, the bottom 34px of every page sits
             * directly under the nav's safe-area inset and is unreachable.
             * lg: drops the padding because the nav itself only renders on
             * mobile (lg:hidden inside BottomNav).
             */}
            <div className="pb-[calc(theme(spacing.16)+env(safe-area-inset-bottom))] lg:pb-0">{children}</div>
            <BottomNav />
            <Toaster />
          </Providers>
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
