'use client';
import { ThemeProvider } from 'next-themes';
import { type ReactNode } from 'react';
import { AuthProvider } from '~/lib/auth-context';
import { UserProvider } from '~/lib/userStore';
import { SessionPing } from './SessionPing';
import { AnnouncementBanner } from './AnnouncementBanner';
import { DynamicFavicon } from './DynamicFavicon';
import { AnalyticsTracker } from './AnalyticsTracker';
import { PushPrompt } from './PushPrompt';

/**
 * App-wide providers. Theme handling is system-based per founder lock §4.3
 * ("system based rkhna hai"): `enableSystem` lets next-themes honour the
 * OS-level prefers-color-scheme, while `defaultTheme="system"` makes that
 * the initial value for fresh visitors. Users can still override via the
 * profile toggle, which writes to next-themes' localStorage and pins
 * either 'light' or 'dark' until they switch back to 'system'.
 *
 * UserProvider (PR-32) sits inside AuthProvider so it can react to
 * onAuthStateChanged events. Single source of truth for the /v1/users/me
 * payload — every authenticated page now reads from useUser() instead
 * of fanning out to its own api.me() roundtrip on each navigation.
 * That eliminates the 4-5 sec navigation pain.
 *
 * PR-34a: removed the legacy `<ToastProvider>` shell. Toasts are now
 * exclusively driven by sonner's `<Toaster />` (mounted in the root
 * layout). The legacy toast root had no consumers and was double-mounting
 * the toast surface alongside sonner.
 */
export function Providers({ children }: { children: ReactNode }) {
  return (
    <ThemeProvider attribute="class" defaultTheme="system" enableSystem>
      <AuthProvider>
        <UserProvider>
          <SessionPing />
          <AnalyticsTracker />
          <AnnouncementBanner />
          <DynamicFavicon />
          <PushPrompt />
          {children}
        </UserProvider>
      </AuthProvider>
    </ThemeProvider>
  );
}
