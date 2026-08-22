'use client';

/**
 * Global upgrade prompt.
 *
 * Founder rule: "agar koi bhi feature me plan me limit aata hai aur user
 * dobara use karne ki koshish karta hai to proper upgrade ka option aana hi
 * chahiye." Rather than wiring an upgrade modal into every page, the API
 * client (`authedFetch`) emits a `nexigrate:upgrade-required` event whenever a
 * response carries `{ upgrade: true }` (any plan limit or credit exhaustion).
 * This single listener — mounted once in the app providers — turns that into a
 * shared modal with an Upgrade CTA, so the prompt appears everywhere
 * consistently. Pages can also call `emitUpgradeRequired(...)` directly for
 * limits returned in a 200 body (e.g. AI chat / image generation).
 */

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';

interface UpgradeDetail {
  message: string;
  feature?: string;
  error?: string;
}

export function UpgradeGate() {
  const router = useRouter();
  const [detail, setDetail] = useState<UpgradeDetail | null>(null);

  useEffect(() => {
    const handler = (e: Event) => {
      const d = (e as CustomEvent<UpgradeDetail>).detail;
      if (d && typeof d.message === 'string') setDetail(d);
    };
    window.addEventListener('nexigrate:upgrade-required', handler as EventListener);
    return () => window.removeEventListener('nexigrate:upgrade-required', handler as EventListener);
  }, []);

  if (!detail) return null;

  const isCredits = detail.error === 'insufficient_credits';
  const close = () => setDetail(null);

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-ink-950/60 p-4 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      onClick={close}
    >
      <div className="paper-card w-full max-w-sm p-6 text-center shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-ember-500/15 text-ember-500">
          <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 2 4 6v6c0 5 3.4 8.5 8 10 4.6-1.5 8-5 8-10V6l-8-4Z" />
            <path d="m9 12 2 2 4-4" />
          </svg>
        </div>

        <h2 className="mt-4 font-serif text-lg font-bold text-ink-900">
          {isCredits ? 'Out of credits' : 'Upgrade to continue'}
        </h2>
        <p className="mt-2 text-sm text-muted-500">{detail.message}</p>

        <div className="mt-5 space-y-2.5">
          <button
            onClick={() => { close(); router.push('/upgrade'); }}
            className="btn-primary w-full"
          >
            Upgrade Plan
          </button>
          {isCredits && (
            <button
              onClick={() => { close(); router.push('/profile#credits'); }}
              className="btn-ghost w-full text-sm"
            >
              Earn credits
            </button>
          )}
          <button onClick={close} className="btn-ghost w-full text-sm text-muted-500">
            Not now
          </button>
        </div>
      </div>
    </div>
  );
}
