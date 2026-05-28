'use client';
import { useEffect, useState } from 'react';
import { AnnouncementPopup } from './AnnouncementPopup';

interface Announcement {
  id: string;
  title: string;
  body: string;
  date?: string;
}

export function AnnouncementWrapper() {
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);

  useEffect(() => {
    // Fetch active announcements from API
    const API = process.env['NEXT_PUBLIC_API_URL'] ?? 'https://api.nexigrate.com';
    fetch(`${API}/v1/announcements`)
      .then(res => res.ok ? res.json() : null)
      .then((data: { announcements?: Announcement[] } | null) => {
        if (data?.announcements?.length) {
          setAnnouncements(data.announcements);
        }
      })
      .catch(() => { /* silent — announcements are non-critical */ });
  }, []);

  if (!announcements.length) return null;

  return <AnnouncementPopup announcements={announcements} />;
}
