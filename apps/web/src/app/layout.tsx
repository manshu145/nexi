import type { Metadata, Viewport } from 'next';
import { AuthProvider } from '~/lib/auth-context';
import './globals.css';

export const metadata: Metadata = {
  title: 'Nexigrate — AI-powered personalized study platform',
  description: 'The AI study platform for Indian students. Personalized MCQs, chapters, mock tests — all generated in real-time for your level.',
  icons: {
    icon: [{ url: '/favicon.svg', type: 'image/svg+xml' }],
  },
};

export const viewport: Viewport = {
  themeColor: '#F5ECD7',
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: 'cover',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <AuthProvider>{children}</AuthProvider>
      </body>
    </html>
  );
}
