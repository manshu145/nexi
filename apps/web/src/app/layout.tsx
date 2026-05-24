import type { Metadata, Viewport } from 'next';
import { AuthProvider } from '~/lib/auth-context';
import { ThemeProvider } from '~/lib/theme-context';
import { MobileNav } from '~/components/MobileNav';
import { ChatWidget } from '~/components/ChatWidget';
import './globals.css';

export const metadata: Metadata = {
  title: 'Nexigrate — Study smart. Verified facts. Zero distractions.',
  description: 'The free, distraction-free study OS for Indian students.',
  icons: {
    icon: [{ url: '/favicon.svg', type: 'image/svg+xml' }],
  },
};

export const viewport: Viewport = {
  themeColor: '#F5ECD7',
  width: 'device-width',
  initialScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body>
        <ThemeProvider>
          <AuthProvider>
            {children}
            <MobileNav />
            <ChatWidget />
          </AuthProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
