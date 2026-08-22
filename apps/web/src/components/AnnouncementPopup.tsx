'use client';
import { useEffect, useState, useCallback } from 'react';

interface Announcement {
  id: string;
  title: string;
  body: string;
  date?: string;
  /**
   * Admin-configurable popup timing. Both optional — announcements
   * created before this shipped (or banner-type) fall back to the old
   * hardcoded defaults (10s visible, 2s delay) so nothing regresses.
   */
  durationSeconds?: number;
  showDelaySeconds?: number;
}

/**
 * Modal-style announcement popup.
 *
 * PR-34a:
 *   - The dismissal storage key was unified to `dismissedAnnouncements`
 *     (camelCase plural) so a dismiss here propagates to the banner UI
 *     and vice-versa. The previous `'dismissed-announcements'`
 *     (kebab-singular) key was retired.
 *   - Dismissal is now driven by `onDismiss` from the parent so the parent
 *     (AnnouncementBanner) can also recompute its banner-only filter and
 *     keep the two views in sync without a re-fetch.
 *   - z-[110] keeps the popup above the BottomNav (z-[100]) per the new
 *     modal-stacking convention.
 */
export function AnnouncementPopup({
  announcements,
  onDismiss,
  isHindi = false,
}: {
  announcements: Announcement[];
  onDismiss: (id: string) => void;
  isHindi?: boolean;
}) {
  const [visible, setVisible] = useState(false);
  const [current, setCurrent] = useState<Announcement | null>(null);
  const [countdown, setCountdown] = useState(10);

  // Resolve the active announcement's configured timing, falling back to
  // the legacy 10s-visible / 2s-delay defaults. Clamped defensively so a
  // bad/stale value can't divide-by-zero the progress bar or hang the
  // modal (the API also clamps, this is belt-and-suspenders).
  const durationSecs = Math.min(120, Math.max(3, current?.durationSeconds ?? 10));

  // PR-44: stabilize effect dependency. Previously `[announcements]` caused
  // re-fires on every parent re-render (new array ref). Using the first
  // announcement's ID as the dep ensures the timer only resets when the
  // actual content changes — not on every useUser() tick.
  const firstId = announcements[0]?.id ?? '';

  useEffect(() => {
    if (!announcements.length) {
      setCurrent(null);
      setVisible(false);
      return;
    }
    // First entry is the next-to-show; the parent already filters out
    // dismissed announcements before passing them in.
    const active = announcements[0]!;
    setCurrent(active);
    // Reset countdown to the admin-configured visible duration (or the
    // 10s default) each time a new announcement arrives.
    const duration = Math.min(120, Math.max(3, active.durationSeconds ?? 10));
    const delayMs = Math.min(30, Math.max(0, active.showDelaySeconds ?? 2)) * 1000;
    setCountdown(duration);
    // Show after the admin-configured delay (default 2s).
    const timer = setTimeout(() => setVisible(true), delayMs);
    return () => clearTimeout(timer);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [firstId]);

  const handleClose = useCallback(() => {
    setVisible(false);
    if (current) onDismiss(current.id);
  }, [current, onDismiss]);

  useEffect(() => {
    if (!visible) return;
    const interval = setInterval(() => {
      setCountdown(prev => {
        if (prev <= 1) { handleClose(); return 0; }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(interval);
  }, [visible, handleClose]);

  if (!visible || !current) return null;

  return (
    <div className="fixed inset-0 z-[110] flex items-center justify-center px-4" onClick={handleClose}>
      <div className="absolute inset-0 bg-ink-950/60 backdrop-blur-sm" />
      <div className="relative w-full max-w-[380px] rounded-2xl border border-ember-500/50 bg-paper-50 p-6 shadow-2xl" onClick={e => e.stopPropagation()} lang={isHindi ? 'hi' : 'en'}>
        {/* Close button */}
        <button onClick={handleClose} className="absolute right-3 top-3 flex h-7 w-7 items-center justify-center rounded-full text-muted-500 hover:bg-paper-200 hover:text-ink-900 transition-colors">✕</button>

        {/* Content */}
        <h3 className="font-serif text-lg font-bold text-ink-900 pr-6">{current.title}</h3>
        {current.date && <p className="mt-1 text-xs text-muted-500">{current.date}</p>}
        <p className="mt-3 text-sm leading-relaxed text-ink-800">{current.body}</p>

        {/* Countdown */}
        <div className="mt-5">
          <p className="text-[10px] text-muted-500 mb-1">
            {isHindi ? `${countdown} सेकंड में बंद होगा...` : `Closing in ${countdown} seconds...`}
          </p>
          <div className="h-1 w-full overflow-hidden rounded-full bg-paper-300">
            <div className="h-full rounded-full bg-ember-500 transition-all duration-1000 ease-linear" style={{ width: `${(countdown / durationSecs) * 100}%` }} />
          </div>
        </div>
      </div>
    </div>
  );
}
