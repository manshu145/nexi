'use client';
import { ThemeProvider } from 'next-themes';
import { type ReactNode } from 'react';
import { AuthProvider } from '~/lib/auth-context';
import { ToastProvider } from './Toast';
import { SessionPing } from './SessionPing';

export function Providers({ children }: { children: ReactNode }) {
  return (
    <ThemeProvider attribute="class" defaultTheme="light" enableSystem={false}>
      <AuthProvider>
        <ToastProvider>
          <SessionPing />
          {children}
        </ToastProvider>
      </AuthProvider>
    </ThemeProvider>
  );
}
