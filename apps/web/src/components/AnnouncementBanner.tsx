'use client';
import { useEffect, useState } from 'react';
import { useAuth } from '~/lib/auth-context';
import { getFirebaseAuthClient } from '~/lib/firebase';

interface Announcement {
  id: string;
  title: string;
  body: string;
  type: 'banner' | 'modal' | 'email' | 'all';
}

const API = process.env['NEXT_PUBLIC_API_URL'] ?? 'https://api.nexigrate.com';

export function AnnouncementBanner() {
  const { user } = useAuth();
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());

  useEffect(() => {
    // Load dismissed IDs from localStorage
    try {
      const stored = localStorage.getItem('dismissedAnnouncements');
      if (stored) setDismissed(new Set(JSON.parse(stored)));
    } catch { /* silent */ }
  }, []);

  useEffect(() => {
    if (!user) return;
    (async () => {
      try {
        const auth = getFirebaseAuthClient();
        const token = await auth.currentUser?.getIdToken();
        if (!token) return;
        const res = await fetch(`${API}/v1/announcements`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (res.ok) {
          const data = await res.json() as { announcements: Announcement[] };
          setAnnouncements(data.announcements.filter(a => a.type === 'banner' || a.type === 'all'));
        }
      } catch { /* silent */ }
    })();
  }, [user]);

  const handleDismiss = (id: string) => {
    const next = new Set(dismissed);
    next.add(id);
    setDismissed(next);
    try {
      localStorage.setItem('dismissedAnnouncements', JSON.stringify([...next]));
    } catch { /* silent */ }
  };

  const visible = announcements.filter(a => !dismissed.has(a.id));
  if (visible.length === 0) return null;

  return (
    <div className="fixed top-0 left-0 right-0 z-[9999]">
      {visible.slice(0, 1).map(a => (
        <div key={a.id} className="w-full bg-gold-500 text-paper-50 py-2.5 px-4 flex items-center justify-center gap-3 text-sm">
          <span className="font-semibold">{a.title}</span>
          <span className="hidden sm:inline">— {a.body}</span>
          <button
            onClick={() => handleDismiss(a.id)}
            className="ml-3 h-5 w-5 rounded-full bg-paper-50/20 hover:bg-paper-50/30 flex items-center justify-center text-paper-50 text-xs transition-colors flex-shrink-0"
          >
            ✕
          </button>
        </div>
      ))}
    </div>
  );
}
