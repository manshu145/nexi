import type { Metadata } from 'next';
import { NextIntlClientProvider } from 'next-intl';
import { getLocale, getMessages } from 'next-intl/server';
import { Providers } from '~/components/providers';
import { Toaster } from '~/components/toaster';
import './globals.css';

export const metadata: Metadata = { title: 'Nexigrate — AI-Powered Exam Prep', description: 'AI-powered exam preparation platform for Indian students.' };

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const locale = await getLocale();
  const messages = await getMessages();
  return (
    <html lang={locale} suppressHydrationWarning>
      <body className="min-h-screen bg-[var(--background)] text-[var(--foreground)] antialiased">
        <NextIntlClientProvider messages={messages}>
          <Providers>{children}<Toaster /></Providers>
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
