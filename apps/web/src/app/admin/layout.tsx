'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useState, type ReactNode } from 'react';
import { Logo } from '~/components/Logo';
import { ThemeToggle } from '~/components/ThemeToggle';
import { useAuth } from '~/lib/auth-context';
import { api, type AdminMeResponse } from '~/lib/api';

const NAV_GROUPS = [
  {
    label: 'Content',
    items: [
      { href: '/admin/mcq-drafts', label: 'MCQ Drafts' },
      { href: '/admin/chapters', label: 'Chapters' },
      { href: '/admin/nexipedia', label: 'Nexipedia' },
      { href: '/admin/current-affairs', label: 'Current Affairs' },
      { href: '/admin/long-answers', label: 'Long-form' },
      { href: '/admin/scheduler', label: 'Scheduler' },
    ],
  },
  {
    label: 'Management',
    items: [
      { href: '/admin/users', label: 'Users' },
      { href: '/admin/analytics', label: 'Analytics' },
      { href: '/admin/audit', label: 'Audit Log' },
      { href: '/admin/tickets', label: 'Tickets' },
    ],
  },
  {
    label: 'Communications',
    items: [
      { href: '/admin/announcements', label: 'Announcements' },
      { href: '/admin/broadcasts', label: 'Broadcasts' },
    ],
  },
];

export default function AdminLayout({ children }: { children: ReactNode }) {
  const { user, loading, signOut } = useAuth();
  const router = useRouter();
  const pathname = usePathname() ?? '';
  const isLoginPage = pathname.startsWith('/admin/login');

  const [me, setMe] = useState<AdminMeResponse | null>(null);
  const [check, setCheck] = useState<'unknown' | 'ok' | 'denied'>('unknown');
  const [sidebarOpen, setSidebarOpen] = useState(false);

  useEffect(() => {
    if (isLoginPage) { setCheck('ok'); return; }
    if (loading) return;
    if (!user) { router.replace('/admin/login'); return; }
    let cancelled = false;
    (async () => {
      try {
        const res = await api.admin.auth.me();
        if (cancelled) return;
        if (!res.role) { setCheck('denied'); router.replace('/admin/login'); return; }
        setMe(res);
        setCheck('ok');
      } catch {
        if (!cancelled) { setCheck('denied'); router.replace('/admin/login'); }
      }
    })();
    return () => { cancelled = true; };
  }, [user, loading, router, isLoginPage]);

  // Close sidebar on route change
  useEffect(() => { setSidebarOpen(false); }, [pathname]);

  if (isLoginPage) return <>{children}</>;

  if (loading || check !== 'ok' || !me) {
    return (
      <main className="flex min-h-[60vh] items-center justify-center px-6">
        <span className="inline-flex items-center gap-2 text-sm text-muted-500">
          <span className="spinner" aria-hidden="true" /> Loading admin panel...
        </span>
      </main>
    );
  }

  return (
    <div className="admin-layout">
      {/* Mobile header */}
      <header className="admin-topbar">
        <div className="flex items-center gap-3">
          <button
            onClick={() => setSidebarOpen(!sidebarOpen)}
            className="lg:hidden p-2 -ml-2 rounded text-ink-800 hover:bg-paper-200"
            aria-label="Toggle menu"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M4 6h16M4 12h16M4 18h16" />
            </svg>
          </button>
          <Logo />
        </div>
        <div className="flex items-center gap-2">
          <ThemeToggle />
          <button
            type="button"
            onClick={() => router.push('/dashboard')}
            className="btn-ghost-sm hidden sm:inline-flex"
          >Student view</button>
          <button
            type="button"
            onClick={() => signOut().then(() => router.replace('/admin/login'))}
            className="btn-ghost-sm"
          >Sign out</button>
        </div>
      </header>

      {/* Sidebar overlay (mobile) */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-40 bg-ink-950/40 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside className={`admin-sidebar ${sidebarOpen ? 'admin-sidebar-open' : ''}`}>
        <div className="p-4 border-b border-line">
          <p className="text-xs text-muted-500 truncate">{me.email}</p>
          <p className="text-sm font-medium text-ink-900">{prettyRole(me.role)}</p>
        </div>
        <nav className="flex-1 overflow-y-auto p-3">
          {NAV_GROUPS.map((group) => (
            <div key={group.label} className="mb-4">
              <p className="px-3 mb-1 text-[10px] font-semibold uppercase tracking-[0.15em] text-muted-400">
                {group.label}
              </p>
              {group.items.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`admin-nav-link ${pathname.startsWith(item.href) ? 'admin-nav-active' : ''}`}
                >
                  {item.label}
                </Link>
              ))}
            </div>
          ))}
          {me.role === 'super_admin' && (
            <div className="mb-4">
              <p className="px-3 mb-1 text-[10px] font-semibold uppercase tracking-[0.15em] text-muted-400">
                System
              </p>
              <Link
                href="/admin/team"
                className={`admin-nav-link ${pathname.startsWith('/admin/team') ? 'admin-nav-active' : ''}`}
              >Team</Link>
            </div>
          )}
        </nav>
      </aside>

      {/* Main content */}
      <main className="admin-main">
        {children}
      </main>
    </div>
  );
}

function prettyRole(role: string | null): string {
  switch (role) {
    case 'super_admin': return 'Super Admin';
    case 'admin': return 'Admin';
    case 'content_admin': return 'Content Admin';
    case 'support_admin': return 'Support Admin';
    default: return '';
  }
}
