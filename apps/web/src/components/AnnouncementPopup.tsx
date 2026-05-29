'use client';
import { useEffect, useState } from 'react';

interface Announcement {
  id: string;
  title: string;
  body: string;
  date?: string;
}

export function AnnouncementPopup({ announcements }: { announcements: Announcement[] }) {
  const [visible, setVisible] = useState(false);
  const [current, setCurrent] = useState<Announcement | null>(null);
  const [countdown, setCountdown] = useState(10);

  useEffect(() => {
    if (!announcements.length) return;
    // Find first undismissed announcement
    const dismissed = JSON.parse(localStorage.getItem('dismissed-announcements') ?? '[]') as string[];
    const active = announcements.find(a => !dismissed.includes(a.id));
    if (!active) return;
    setCurrent(active);
    // Show after 2s delay
    const timer = setTimeout(() => setVisible(true), 2000);
    return () => clearTimeout(timer);
  }, [announcements]);

  useEffect(() => {
    if (!visible) return;
    const interval = setInterval(() => {
      setCountdown(prev => {
        if (prev <= 1) { handleClose(); return 0; }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(interval);
  }, [visible]);

  const handleClose = () => {
    setVisible(false);
    if (current) {
      const dismissed = JSON.parse(localStorage.getItem('dismissed-announcements') ?? '[]') as string[];
      dismissed.push(current.id);
      localStorage.setItem('dismissed-announcements', JSON.stringify(dismissed));
    }
  };

  if (!visible || !current) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center px-4" onClick={handleClose}>
      <div className="absolute inset-0 bg-ink-950/60 backdrop-blur-sm" />
      <div className="relative w-full max-w-[380px] rounded-2xl border border-ember-500/50 bg-paper-50 p-6 shadow-2xl" onClick={e => e.stopPropagation()}>
        {/* Close button */}
        <button onClick={handleClose} className="absolute right-3 top-3 flex h-7 w-7 items-center justify-center rounded-full text-muted-500 hover:bg-paper-200 hover:text-ink-900 transition-colors">✕</button>

        {/* Content */}
        <h3 className="font-serif text-lg font-bold text-ink-900 pr-6">{current.title}</h3>
        {current.date && <p className="mt-1 text-xs text-muted-500">{current.date}</p>}
        <p className="mt-3 text-sm leading-relaxed text-ink-800">{current.body}</p>

        {/* Countdown */}
        <div className="mt-5">
          <p className="text-[10px] text-muted-500 mb-1">Closing in {countdown} seconds...</p>
          <div className="h-1 w-full overflow-hidden rounded-full bg-paper-300">
            <div className="h-full rounded-full bg-ember-500 transition-all duration-1000 ease-linear" style={{ width: `${(countdown / 10) * 100}%` }} />
          </div>
        </div>
      </div>
    </div>
  );
}
