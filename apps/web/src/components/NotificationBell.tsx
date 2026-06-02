'use client';

import { useState, useEffect, useCallback } from 'react';
import { toast } from 'sonner';
import { registerPushToken, getLastPushError } from '~/lib/pushClient';

/**
 * PR-43: Notification bell — requests push permission on first tap,
 * shows a subtle dot when permission is granted. Lightweight — no
 * inbox/dropdown (that's a follow-up).
 */
export function NotificationBell() {
  const [permission, setPermission] = useState<NotificationPermission | 'unsupported'>('default');
  const [registering, setRegistering] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined' || !('Notification' in window)) {
      setPermission('unsupported');
      return;
    }
    setPermission(Notification.permission);
  }, []);

  const handleClick = useCallback(async () => {
    if (permission === 'granted') return; // already registered
    if (permission === 'unsupported') return;
    setRegistering(true);
    const success = await registerPushToken();
    if (success) {
      setPermission('granted');
      toast.success('Notifications enabled!');
    } else {
      // Surface the ACTUAL reason instead of always blaming the VAPID key.
      if (typeof window !== 'undefined' && 'Notification' in window && Notification.permission === 'denied') {
        setPermission('denied');
        toast.error('Notification permission denied. Enable it in browser settings.');
      } else {
        const reason = getLastPushError();
        toast.error(reason ? `Could not enable notifications: ${reason}` : 'Could not enable notifications. Please try again.');
      }
    }
    setRegistering(false);
  }, [permission]);

  if (permission === 'unsupported') return null;

  return (
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
  );
}
