'use client';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect } from 'react';

const NAV_ITEMS = [
  { label: 'Home', path: '/dashboard', icon: 'M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6' },
  { label: 'Study', path: '/study', icon: 'M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253' },
  { label: 'News', path: '/current-affairs', icon: 'M19 20H5a2 2 0 01-2-2V6a2 2 0 012-2h10a2 2 0 012 2v1m2 13a2 2 0 01-2-2V7m2 13a2 2 0 002-2V9a2 2 0 00-2-2h-2m-4-3H9M7 16h6M7 8h6v4H7V8z' },
  { label: 'Nexi AI', path: '/chat', icon: 'M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z' },
  { label: 'Profile', path: '/profile', icon: 'M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z' },
];

// PR-34a: hide the bottom nav on screens that own their own bottom-anchored
// chrome and would otherwise be visually clobbered by a fixed nav at z-[100].
//   - /chat: textarea + send button live at the bottom of `flex h-dvh`
//   - /study/<subject>/<chapter>(/quiz): the kindle-toolbar is the nav
//     surface for that screen. The /study subject list keeps the nav.
const HIDDEN_PATHS = ['/admin', '/onboarding', '/signin', '/verify-phone', '/chat'];

export function BottomNav() {
  const pathname = usePathname();
  const router = useRouter();

  // Perf: prefetch all 5 main routes on mount so tapping the nav navigates
  // instantly instead of waiting on an RSC round-trip (the "har baar 5-6 sec
  // loader" the founder reported). Next.js dedupes prefetches, so this is
  // cheap and only fetches the route's RSC payload once.
  useEffect(() => {
    NAV_ITEMS.forEach((item) => {
      try { router.prefetch(item.path); } catch { /* no-op */ }
    });
  }, [router]);

  // Hide on admin/onboarding/signin/chat
  if (HIDDEN_PATHS.some(p => pathname === p || pathname.startsWith(p + '/'))) return null;

  // Study chapter reader and its quiz manage their own bottom toolbar.
  // /study (subject list) keeps the nav; /study/<subject>/<chapter> and
  // /study/<subject>/<chapter>/quiz hide it. Path depth >= 4 segments
  // ('', 'study', subject, chapter[, ...]) catches both.
  if (pathname.startsWith('/study/') && pathname.split('/').length >= 4) return null;

  const isActive = (path: string) => {
    if (path === '/dashboard') return pathname === '/dashboard';
    return pathname.startsWith(path);
  };

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-[100] border-t border-line bg-paper-50 pb-[env(safe-area-inset-bottom)] lg:hidden">
      <div className="flex h-14 items-center justify-around px-2">
        {NAV_ITEMS.map((item) => {
          const active = isActive(item.path);
          return (
            <button
              key={item.path}
              onClick={() => router.push(item.path)}
              className={`flex flex-col items-center gap-0.5 rounded-lg px-3 py-1.5 transition-transform active:scale-90 ${active ? 'bg-ember-500/10' : ''}`}
            >
              <svg width="22" height="22" fill="none" stroke="currentColor" strokeWidth="1.8" viewBox="0 0 24 24" strokeLinecap="round" strokeLinejoin="round" className={active ? 'text-ember-500' : 'text-muted-500'}>
                <path d={item.icon} />
              </svg>
              <span className={`text-[10px] font-medium ${active ? 'text-ember-500' : 'text-muted-500'}`}>{item.label}</span>
            </button>
          );
        })}
      </div>
    </nav>
  );
}
