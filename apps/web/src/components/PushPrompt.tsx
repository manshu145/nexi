'use client';

/**
 * PushPrompt — proactive "enable notifications" soft-ask modal.
 *
 * The NotificationBell already has a tiny inline banner, but most users
 * never open it, so they never enable push. This component actively (but
 * politely) asks signed-in users to turn on notifications:
 *
 *   - Shows only for authenticated users whose browser permission is still
 *     'default' (never for granted / denied / unsupported).
 *   - Appears a few seconds after load (not jarring on first paint).
 *   - "Maybe later" sets a cooldown so we don't nag — re-asks after a few
 *     days, and gives up after a few dismissals.
 *   - "Enable" runs the same registerPushToken() flow as the bell.
 *
 * Mounted globally in Providers; it self-gates so it's a no-op on auth
 * pages / logged-out visitors.
 */

import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { registerPushToken, getLastPushError } from '~/lib/pushClient';
import { useUser } from '~/lib/userStore';

const DISMISS_KEY = 'nexi.pushPrompt.dismissedAt';
const COUNT_KEY = 'nexi.pushPrompt.dismissCount';
const COOLDOWN_DAYS = 3;
const MAX_DISMISSALS = 3;
const SHOW_DELAY_MS = 6000;

function shouldAsk(): boolean {
  if (typeof window === 'undefined' || !('Notification' in window)) return false;
  if (Notification.permission !== 'default') return false;
  const count = Number(localStorage.getItem(COUNT_KEY) ?? '0');
  if (count >= MAX_DISMISSALS) return false;
  const last = Number(localStorage.getItem(DISMISS_KEY) ?? '0');
  if (last && Date.now() - last < COOLDOWN_DAYS * 86_400_000) return false;
  return true;
}

export function PushPrompt() {
  const { user, loading } = useUser();
  const [visible, setVisible] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (loading || !user) return;
    if (!shouldAsk()) return;
    const t = window.setTimeout(() => {
      // Re-check at fire time (permission may have changed in another tab).
      if (shouldAsk()) setVisible(true);
    }, SHOW_DELAY_MS);
    return () => window.clearTimeout(t);
  }, [user, loading]);

  if (!visible) return null;

  const dismiss = () => {
    try {
      localStorage.setItem(DISMISS_KEY, String(Date.now()));
      const count = Number(localStorage.getItem(COUNT_KEY) ?? '0') + 1;
      localStorage.setItem(COUNT_KEY, String(count));
    } catch { /* ignore storage errors */ }
    setVisible(false);
  };

  const enable = async () => {
    setBusy(true);
    const ok = await registerPushToken();
    setBusy(false);
    if (ok) {
      toast.success('Notifications enabled! 🔔');
      try { localStorage.setItem(COUNT_KEY, String(MAX_DISMISSALS)); } catch { /* ignore */ }
      setVisible(false);
      return;
    }
    if (typeof window !== 'undefined' && 'Notification' in window && Notification.permission === 'denied') {
      toast.error('Notifications are blocked. Enable them in your browser/site settings.');
      setVisible(false);
      return;
    }
    const reason = getLastPushError();
    toast.error(reason ? `Could not enable: ${reason}` : 'Could not enable notifications.');
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-end justify-center p-4 sm:items-center">
      {/* Backdrop */}
      <button
        aria-label="Dismiss"
        onClick={dismiss}
        className="absolute inset-0 bg-ink-900/40 backdrop-blur-[1px] animate-in fade-in"
      />
      {/* Card */}
      <div className="relative w-full max-w-sm rounded-2xl border border-line bg-paper-50 p-5 shadow-2xl animate-in fade-in zoom-in-95 sm:p-6">
        <div className="flex justify-center">
          <div className="flex h-14 w-14 items-center justify-center rounded-full bg-ember-500/15 text-3xl">
            🔔
          </div>
        </div>
        <h2 className="mt-4 text-center font-serif text-lg font-semibold text-ink-900">
          Stay on track, never miss a beat
        </h2>
        <p className="mt-2 text-center text-sm text-muted-500">
          Turn on notifications for daily current affairs, streak reminders, exam date
          alerts and replies to your doubts.
        </p>
        <div className="mt-5 space-y-2">
          <button
            onClick={enable}
            disabled={busy}
            className="btn-primary w-full justify-center"
          >
            {busy ? 'Enabling…' : 'Enable notifications'}
          </button>
          <button
            onClick={dismiss}
            disabled={busy}
            className="w-full rounded-lg px-4 py-2 text-sm text-muted-500 hover:bg-paper-100"
          >
            Maybe later
          </button>
        </div>
      </div>
    </div>
  );
}
