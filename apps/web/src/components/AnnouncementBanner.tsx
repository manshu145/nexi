'use client';
import { useEffect, useState } from 'react';
import { api } from '~/lib/api';

interface Announcement { id: string; title: string; body: string; }

export function AnnouncementBanner() {
  const [announcement, setAnnouncement] = useState<Announcement | null>(null);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch(`${process.env['NEXT_PUBLIC_API_URL'] ?? 'https://api.nexigrate.com'}/v1/users/announcements`, {
          headers: { Authorization: `Bearer ${await getToken()}` },
        });
        if (res.ok) {
          const data = (await res.json()) as { announcements: Announcement[] };
          const dismissed_ids = JSON.parse(localStorage.getItem('dismissed_announcements') ?? '[]') as string[];
          const active = data.announcements.find(a => !dismissed_ids.includes(a.id));
          if (active) setAnnouncement(active);
        }
      } catch { /* silently fail */ }
    })();
  }, []);

  const handleDismiss = () => {
    if (announcement) {
      const dismissed_ids = JSON.parse(localStorage.getItem('dismissed_announcements') ?? '[]') as string[];
      dismissed_ids.push(announcement.id);
      localStorage.setItem('dismissed_announcements', JSON.stringify(dismissed_ids));
    }
    setDismissed(true);
  };

  if (!announcement || dismissed) return null;

  return (
    <div className="bg-amber-500 text-ink-900 px-4 py-2 text-center text-sm font-medium flex items-center justify-center gap-3">
      <span>{announcement.title} — {announcement.body}</span>
      <button onClick={handleDismiss} className="ml-2 text-ink-900/60 hover:text-ink-900 font-bold">✕</button>
    </div>
  );
}

async function getToken(): Promise<string> {
  const { getFirebaseAuthClient } = await import('~/lib/firebase');
  const auth = getFirebaseAuthClient();
  return (await auth.currentUser?.getIdToken()) ?? '';
}
