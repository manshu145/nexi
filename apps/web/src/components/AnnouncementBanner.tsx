'use client';
import { useEffect, useMemo, useState } from 'react';
import { useAuth } from '~/lib/auth-context';
import { useUser } from '~/lib/userStore';
import { getFirebaseAuthClient } from '~/lib/firebase';
import { AnnouncementPopup } from './AnnouncementPopup';

interface RawAnnouncement {
  id: string;
  title: string;
  body: string;
  /** PR-36: optional Hindi translations preferred when user.language === 'hi'. */
  titleHi?: string;
  bodyHi?: string;
  type: 'banner' | 'modal' | 'email' | 'all';
  date?: string;
}

interface RenderedAnnouncement {
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
 * PR-34a unified the two announcement systems (banner + popup). PR-36
 * adds Hindi-language preference: if the logged-in user's language is
 * 'hi' and the announcement has titleHi/bodyHi set, those are shown
 * instead of the English fields. Otherwise the English fields are
 * always the safe fallback so a half-translated set never blanks out.
 *
 * Routing rules (server-set `type` field):
 *     - 'banner'           → banner UI at fixed top-0
 *     - 'modal'            → AnnouncementPopup (centred dialog with countdown)
 *     - 'all'              → both surfaces
 *     - 'email' / unknown  → not rendered client-side
 *
 * Dismissal key is `dismissedAnnouncements` (camelCase plural) — single
 * source of truth across banner + popup.
 */
export function AnnouncementBanner() {
  const { user } = useAuth();
  const { user: me } = useUser();
  const [announcements, setAnnouncements] = useState<RawAnnouncement[]>([]);
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
          const data = await res.json() as { announcements: RawAnnouncement[] };
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

  // PR-36: language-aware rendering. Resolve display title/body once
  // upfront so each surface (banner, popup) sees the same shape.
  const isHindi = me?.language === 'hi';
  const rendered: RenderedAnnouncement[] = useMemo(
    () =>
      announcements.map(a => ({
        id: a.id,
        type: a.type,
        date: a.date,
        // Prefer the Hindi version IFF user language = hi AND the field
        // is present. If only one of titleHi/bodyHi is filled, the missing
        // one falls back to its English counterpart so we never render a
        // blank line.
        title: isHindi && a.titleHi ? a.titleHi : a.title,
        body: isHindi && a.bodyHi ? a.bodyHi : a.body,
      })),
    [announcements, isHindi],
  );

  // Filter into banner vs modal surfaces. 'all' → goes to both.
  const bannerAnnouncements = rendered.filter(a =>
    !dismissed.has(a.id) && (a.type === 'banner' || a.type === 'all'),
  );
  const modalAnnouncements = rendered.filter(a =>
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
                <div className="flex-1 min-w-0" lang={isHindi ? 'hi' : 'en'}>
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
          isHindi={isHindi}
        />
      )}
    </>
  );
}
