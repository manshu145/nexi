'use client';

import { usePathname, useRouter } from 'next/navigation';
import { getLang, t } from '~/lib/i18n';

const NAV_ITEMS = [
  { key: 'nav.home', path: '/dashboard', icon: '🏠' },
  { key: 'nav.practice', path: '/mcq', icon: '✍️' },
  { key: 'nav.library', path: '/library', icon: '📖' },
  { key: 'nav.today', path: '/today', icon: '📰' },
  { key: 'nav.progress', path: '/progress', icon: '📊' },
];

export function MobileNav() {
  const pathname = usePathname();
  const router = useRouter();
  const lang = getLang();

  // Hide on specific pages
  if (pathname.startsWith('/signin') || pathname.startsWith('/onboarding') || pathname.startsWith('/admin')) {
    return null;
  }

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 border-t border-line bg-paper-50/95 backdrop-blur-md safe-area-bottom sm:hidden">
      <div className="flex items-stretch justify-around px-1">
        {NAV_ITEMS.map((item) => {
          const active = pathname === item.path || pathname.startsWith(item.path + '/');
          return (
            <button
              key={item.key}
              type="button"
              onClick={() => router.push(item.path)}
              className={`flex flex-1 flex-col items-center gap-0.5 py-2.5 transition-colors ${
                active ? 'text-ember-600' : 'text-muted-500'
              }`}
            >
              <span className="text-lg">{item.icon}</span>
              <span className="text-[10px] font-medium">{t(item.key, lang)}</span>
            </button>
          );
        })}
      </div>
    </nav>
  );
}
