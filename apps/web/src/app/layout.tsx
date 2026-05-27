import type { Metadata, Viewport } from 'next';
import { NextIntlClientProvider } from 'next-intl';
import { getLocale, getMessages } from 'next-intl/server';
import { Providers } from '~/components/providers';
import { Toaster } from '~/components/toaster';
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
    apple: '/icon-192.png',
  },
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const locale = await getLocale();
  const messages = await getMessages();
  return (
    <html lang={locale} suppressHydrationWarning>
      <body>
        <NextIntlClientProvider messages={messages}>
          <Providers>{children}<Toaster /></Providers>
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
