'use client';

import { useState, useEffect, useCallback } from 'react';
import { registerPushToken } from '~/lib/pushClient';

/**
 * PR-43: Notification bell — requests push permission on first tap,
 * shows a subtle dot when permission is granted. Lightweight — no
 * inbox/dropdown (that's a follow-up).
 *
 * PR-54: Shows a clear tooltip message when VAPID key is not configured
 * in admin panel, so the admin knows what to do instead of silent failure.
 */
export function NotificationBell() {
  const [permission, setPermission] = useState<NotificationPermission | 'unsupported'>('default');
  const [registering, setRegistering] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (typeof window === 'undefined' || !('Notification' in window)) {
      setPermission('unsupported');
      return;
    }
    setPermission(Notification.permission);
  }, []);

  // Auto-dismiss error after 6 seconds
  useEffect(() => {
    if (!error) return;
    const t = setTimeout(() => setError(null), 6000);
    return () => clearTimeout(t);
  }, [error]);

  const handleClick = useCallback(async () => {
    if (permission === 'granted') return; // already registered
    if (permission === 'unsupported') return;
    setError(null);
    setRegistering(true);
    const result = await registerPushToken();
    if (result === true) {
      setPermission('granted');
    } else if (result === 'no_vapid_key') {
      setError('Push not configured yet. Go to Admin \u2192 Service Keys \u2192 FCM and paste your VAPID key.');
    } else if (result === 'permission_denied') {
      setPermission('denied');
      setError('Notification permission denied. Enable in browser settings.');
    } else {
      setError('Could not enable notifications. Try again later.');
    }
    setRegistering(false);
  }, [permission]);

  if (permission === 'unsupported') return null;

  return (
    <div className="relative">
      <button
        onClick={handleClick}
        className="relative btn-ghost-sm"
        aria-label={permission === 'granted' ? 'Notifications enabled' : 'Enable notifications'}
        title={permission === 'granted' ? 'Notifications enabled' : 'Tap to enable push notifications'}
      >
        <svg width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24" className="text-ink-700">
          <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9M13.73 21a2 2 0 0 1-3.46 0" />
        </svg>
        {permission === 'granted' && (
          <span className="absolute top-1 right-1 h-2 w-2 rounded-full bg-ember-500" />
        )}
        {registering && (
          <span className="absolute inset-0 flex items-center justify-center">
            <span className="h-3 w-3 rounded-full border-2 border-ember-500 border-t-transparent animate-spin" />
          </span>
        )}
      </button>
      {error && (
        <div className="absolute right-0 top-full mt-2 z-50 w-72 rounded-lg bg-amber-50 border border-amber-200 p-3 text-xs text-amber-800 shadow-lg">
          <p>{error}</p>
        </div>
      )}
    </div>
  );
}
