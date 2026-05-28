import type { Metadata, Viewport } from 'next';
import { NextIntlClientProvider } from 'next-intl';
import { getLocale, getMessages } from 'next-intl/server';
import { Providers } from '~/components/providers';
import { Toaster } from '~/components/toaster';
import { BottomNav } from '~/components/BottomNav';
import { AnnouncementWrapper } from '~/components/AnnouncementWrapper';
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
      <body>
        <NextIntlClientProvider messages={messages}>
          <Providers>
            <div className="pb-16 lg:pb-0">{children}</div>
            <BottomNav />
            <AnnouncementWrapper />
            <Toaster />
          </Providers>
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
