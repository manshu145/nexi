'use client';

/**
 * NotificationSetting — profile card to enable / view push notification status.
 *
 * Gives users an explicit place to turn notifications on (and clear guidance
 * when the browser has blocked them). Mirrors the registerPushToken() flow
 * used by the bell and the soft-ask prompt.
 */

import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { registerPushToken, getLastPushError } from '~/lib/pushClient';

type Perm = NotificationPermission | 'unsupported';

export function NotificationSetting() {
  const [perm, setPerm] = useState<Perm>('default');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined' || !('Notification' in window)) setPerm('unsupported');
    else setPerm(Notification.permission);
  }, []);

  const enable = async () => {
    setBusy(true);
    const ok = await registerPushToken();
    setBusy(false);
    if (ok) { setPerm('granted'); toast.success('Notifications enabled! 🔔'); return; }
    if (typeof window !== 'undefined' && 'Notification' in window && Notification.permission === 'denied') {
      setPerm('denied');
      toast.error('Notifications are blocked. Enable them in your browser/site settings.');
      return;
    }
    const reason = getLastPushError();
    toast.error(reason ? `Could not enable: ${reason}` : 'Could not enable notifications.');
  };

  return (
    <section className="mt-6">
      <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-500">Notifications</h2>
      <div className="mt-3 paper-card p-4">
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="text-sm font-medium text-ink-900">Push Notifications</p>
            <p className="text-xs text-muted-500">
              Daily current affairs, streak reminders, exam alerts & doubt replies
            </p>
          </div>
          {perm === 'granted' ? (
            <span className="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-ember-500/15 px-3 py-1.5 text-xs font-semibold text-ember-600">
              <span className="h-1.5 w-1.5 rounded-full bg-ember-500" /> Enabled
            </span>
          ) : perm === 'unsupported' ? (
            <span className="shrink-0 text-xs text-muted-400">Not supported</span>
          ) : (
            <button onClick={enable} disabled={busy} className="btn-primary shrink-0 text-sm">
              {busy ? 'Enabling…' : 'Enable'}
            </button>
          )}
        </div>
        {perm === 'denied' && (
          <p className="mt-3 rounded-lg bg-paper-100 px-3 py-2 text-xs text-muted-500">
            Notifications are blocked for this site. To turn them on, open your browser&apos;s
            site settings (tap the lock icon near the address bar) and allow notifications, then
            reload. On iPhone, install the app to your Home Screen first.
          </p>
        )}
      </div>
    </section>
  );
}
