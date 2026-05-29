'use client';
import { ThemeProvider } from 'next-themes';
import { type ReactNode } from 'react';
import { AuthProvider } from '~/lib/auth-context';
import { ToastProvider } from './Toast';
import { SessionPing } from './SessionPing';
import { AnnouncementBanner } from './AnnouncementBanner';
import { DynamicFavicon } from './DynamicFavicon';

/**
 * App-wide providers. Theme handling is system-based per founder lock §4.3
 * ("system based rkhna hai"): `enableSystem` lets next-themes honour the
 * OS-level prefers-color-scheme, while `defaultTheme="system"` makes that
 * the initial value for fresh visitors. Users can still override via the
 * profile toggle, which writes to next-themes' localStorage and pins
 * either 'light' or 'dark' until they switch back to 'system'.
 */
export function Providers({ children }: { children: ReactNode }) {
  return (
    <ThemeProvider attribute="class" defaultTheme="system" enableSystem>
      <AuthProvider>
        <ToastProvider>
          <SessionPing />
          <AnnouncementBanner />
          <DynamicFavicon />
          {children}
        </ToastProvider>
      </AuthProvider>
    </ThemeProvider>
  );
}
