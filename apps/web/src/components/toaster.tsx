'use client';
import { Toaster as SonnerToaster } from 'sonner';
/**
 * Sonner toaster shell. Brand tokens (paper / ink / line) auto-handle
 * light + dark via CSS variables, so no `dark:` classes are needed --
 * a clean light/dark theme switch on the OS or via the profile toggle
 * propagates here without a re-render.
 */
export function Toaster() { return <SonnerToaster position="top-right" toastOptions={{ className: 'bg-paper-50 text-ink-900 border border-line' }} />; }
