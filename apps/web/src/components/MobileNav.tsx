'use client';

import { usePathname, useRouter } from 'next/navigation';
import { useTranslation } from '~/lib/useTranslation';

const HIDDEN_PATHS = ['/signin', '/onboarding', '/study/chapter', '/study/mock-test', '/study/final-test'];

export function MobileNav() {
  const pathname = usePathname();
  const router = useRouter();
  const { t } = useTranslation();

  // Hide on certain pages
  if (HIDDEN_PATHS.some(p => pathname.startsWith(p))) return null;

  const tabs = [
    { key: 'home', path: '/dashboard', icon: HomeIcon, label: t('nav.home', 'Home') },
    { key: 'study', path: '/study', icon: BookIcon, label: t('nav.study', 'Study') },
    { key: 'affairs', path: '/current-affairs', icon: NewsIcon, label: t('nav.affairs', 'Affairs') },
    { key: 'ai', path: '/nexi', icon: AiIcon, label: t('nav.ai', 'AI') },
  ];

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 border-t border-paper-200 bg-paper-100/90 backdrop-blur-xl safe-bottom md:hidden">
      <div className="mx-auto flex max-w-lg items-center justify-around px-2 py-2">
        {tabs.map(tab => {
          const isActive = pathname === tab.path || (tab.path !== '/dashboard' && pathname.startsWith(tab.path));
          return (
            <button
              key={tab.key}
              onClick={() => router.push(tab.path)}
              className={`flex flex-col items-center gap-0.5 rounded-lg px-3 py-1.5 transition-all duration-200 ${
                isActive
                  ? 'text-ember-600'
                  : 'text-muted-500 hover:text-ink-800'
              }`}
            >
              <tab.icon active={isActive} />
              <span className={`text-[10px] font-medium ${isActive ? 'text-ember-600' : 'text-muted-500'}`}>
                {tab.label}
              </span>
            </button>
          );
        })}
      </div>
    </nav>
  );
}

// ═══ Icons ═══════════════════════════════════════════════════════════════════

function HomeIcon({ active }: { active: boolean }) {
  return (
    <svg className="h-5 w-5" fill={active ? 'currentColor' : 'none'} viewBox="0 0 24 24" stroke="currentColor" strokeWidth={active ? 0 : 1.8}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
    </svg>
  );
}

function BookIcon({ active }: { active: boolean }) {
  return (
    <svg className="h-5 w-5" fill={active ? 'currentColor' : 'none'} viewBox="0 0 24 24" stroke="currentColor" strokeWidth={active ? 0 : 1.8}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
    </svg>
  );
}

function NewsIcon({ active }: { active: boolean }) {
  return (
    <svg className="h-5 w-5" fill={active ? 'currentColor' : 'none'} viewBox="0 0 24 24" stroke="currentColor" strokeWidth={active ? 0 : 1.8}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M19 20H5a2 2 0 01-2-2V6a2 2 0 012-2h10a2 2 0 012 2v1m2 13a2 2 0 01-2-2V7m2 13a2 2 0 002-2V9a2 2 0 00-2-2h-2m-4-3H9M7 16h6M7 8h6v4H7V8z" />
    </svg>
  );
}

function AiIcon({ active }: { active: boolean }) {
  return (
    <svg className="h-5 w-5" fill={active ? 'currentColor' : 'none'} viewBox="0 0 24 24" stroke="currentColor" strokeWidth={active ? 0 : 1.8}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
    </svg>
  );
}
