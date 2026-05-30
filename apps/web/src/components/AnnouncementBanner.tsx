'use client';
import { useEffect, useState } from 'react';
import { useAuth } from '~/lib/auth-context';
import { getFirebaseAuthClient } from '~/lib/firebase';
import { AnnouncementPopup } from './AnnouncementPopup';

interface Announcement {
  id: string;
  title: string;
  body: string;
  type: 'banner' | 'modal' | 'email' | 'all';
  date?: string;
}

const API = process.env['NEXT_PUBLIC_API_URL'] ?? 'https://api.nexigrate.com';

/**
 * Announcement renderer — single auth-aware fetch, two surfaces.
 *
 * PR-34a unification:
 *   Pre-PR-34a there were two roots — this banner (auth-aware, banner-only)
 *   AND `<AnnouncementWrapper />` (no auth, modal-only). The wrapper fired
 *   /v1/announcements without a Firebase token, returning 401 on every page
 *   load and a wasted fetch. We folded the popup logic into this component
 *   so we keep the auth-aware fetch + dismissal-key state in one place.
 *
 *   Routing rules (server-set `type` field):
 *     - 'banner'           → banner UI at fixed top-0
 *     - 'modal'            → AnnouncementPopup (centred dialog with countdown)
 *     - 'all'              → both surfaces
 *     - 'email' / unknown  → not rendered client-side
 *
 *   Dismissal key is `dismissedAnnouncements` (camelCase plural) — kept as
 *   the canonical storage key used by both surfaces. The legacy
 *   `'dismissed-announcements'` key (kebab-singular) was retired here too
 *   so a single dismiss propagates across banner + popup.
 *
 *   When the banner is visible we render an in-flow spacer of the same
 *   height immediately after the fixed div so page content naturally
 *   pushes down — no measured CSS variable required.
 */
export function AnnouncementBanner() {
  const { user } = useAuth();
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());

  useEffect(() => {
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
          setAnnouncements(data.announcements);
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

  // Filter into banner vs modal surfaces. 'all' → goes to both.
  const bannerAnnouncements = announcements.filter(a =>
    !dismissed.has(a.id) && (a.type === 'banner' || a.type === 'all'),
  );
  const modalAnnouncements = announcements.filter(a =>
    !dismissed.has(a.id) && (a.type === 'modal' || a.type === 'all'),
  );

  const visibleBanner = bannerAnnouncements[0];

  return (
    <>
      {visibleBanner && (
        <>
          {/* The actual fixed banner that sits above the page chrome. */}
          <div className="fixed top-0 left-0 right-0 z-[9999]">
            <div className="w-full bg-ember-500 text-paper-50">
              <div className="mx-auto max-w-5xl px-3 py-2 sm:px-4 sm:py-2.5 flex items-center justify-between gap-2">
                {/* Content: title always visible, body on sm+ */}
                <div className="flex-1 min-w-0">
                  <p className="text-xs sm:text-sm font-medium truncate sm:whitespace-normal">
                    <span className="font-bold">{visibleBanner.title}</span>
                    <span className="hidden sm:inline"> — {visibleBanner.body}</span>
                  </p>
                  {/* On mobile: show body below title */}
                  <p className="text-[11px] text-paper-50/80 truncate sm:hidden mt-0.5">{visibleBanner.body}</p>
                </div>
                {/* Dismiss button */}
                <button
                  onClick={() => handleDismiss(visibleBanner.id)}
                  className="h-6 w-6 rounded-full bg-paper-50/20 hover:bg-paper-50/40 flex items-center justify-center text-paper-50 text-xs transition-colors flex-shrink-0"
                  aria-label="Dismiss"
                >
                  ✕
                </button>
              </div>
            </div>
          </div>
          {/*
           * In-flow spacer that mirrors the banner height so the page below
           * doesn't scroll under the fixed banner. Two-line on mobile (~52px),
           * single-line on sm+ (~44px). Hidden visually but reserves space.
           */}
          <div aria-hidden className="h-[52px] sm:h-[44px]" />
        </>
      )}
      {modalAnnouncements.length > 0 && (
        <AnnouncementPopup
          announcements={modalAnnouncements}
          onDismiss={handleDismiss}
        />
      )}
    </>
  );
}
