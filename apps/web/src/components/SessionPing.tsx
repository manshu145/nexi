'use client';
import { useEffect, useRef } from 'react';
import { useAuth } from '~/lib/auth-context';
import { api } from '~/lib/api';

/**
 * Session tracking component - sends heartbeat pings to backend
 * to track active users (Fix #3 / #11 from audit)
 */
export function SessionPing() {
  const { user } = useAuth();
  const sessionStarted = useRef(false);
  const pingInterval = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (!user) return;

    // Start session on mount
    if (!sessionStarted.current) {
      sessionStarted.current = true;
      api.startSession().catch(() => {});
    }

    // Ping every 2 minutes
    pingInterval.current = setInterval(() => {
      api.pingSession().catch(() => {});
    }, 2 * 60 * 1000);

    // End session on unmount / tab close
    const handleUnload = () => {
      api.endSession().catch(() => {});
    };
    window.addEventListener('beforeunload', handleUnload);

    return () => {
      if (pingInterval.current) clearInterval(pingInterval.current);
      window.removeEventListener('beforeunload', handleUnload);
      api.endSession().catch(() => {});
    };
  }, [user]);

  return null;
}
