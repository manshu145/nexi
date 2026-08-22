'use client';

/**
 * NotificationSetting — profile card to enable / view push notification status.
 *
 * Gives users an explicit place to turn notifications on (and clear guidance
 * when the browser has blocked them). Mirrors the registerPushToken() flow
 * used by the bell and the soft-ask prompt.
 */

import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';
import { registerPushToken, getLastPushError } from '~/lib/pushClient';

type Perm = NotificationPermission | 'unsupported';

export function NotificationSetting() {
  const t = useTranslations('notify');
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
    if (ok) { setPerm('granted'); toast.success(t('enabledToast')); return; }
    if (typeof window !== 'undefined' && 'Notification' in window && Notification.permission === 'denied') {
      setPerm('denied');
      toast.error(t('blockedToast'));
      return;
    }
    const reason = getLastPushError();
    toast.error(reason ? t('couldNotEnableReason', { reason }) : t('couldNotEnable'));
  };

  return (
    <section className="mt-6">
      <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-500">{t('heading')}</h2>
      <div className="mt-3 paper-card p-4">
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="text-sm font-medium text-ink-900">{t('pushTitle')}</p>
            <p className="text-xs text-muted-500">
              {t('pushDesc')}
            </p>
          </div>
          {perm === 'granted' ? (
            <span className="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-ember-500/15 px-3 py-1.5 text-xs font-semibold text-ember-600">
              <span className="h-1.5 w-1.5 rounded-full bg-ember-500" /> {t('enabled')}
            </span>
          ) : perm === 'unsupported' ? (
            <span className="shrink-0 text-xs text-muted-400">{t('notSupported')}</span>
          ) : (
            <button onClick={enable} disabled={busy} className="btn-primary shrink-0 text-sm">
              {busy ? t('enabling') : t('enable')}
            </button>
          )}
        </div>
        {perm === 'denied' && (
          <p className="mt-3 rounded-lg bg-paper-100 px-3 py-2 text-xs text-muted-500">
            {t('blockedMsg')}
          </p>
        )}
      </div>
    </section>
  );
}
