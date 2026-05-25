'use client';
import { usePathname, useRouter } from 'next/navigation';
import { useAuth } from '~/lib/auth-context';
import { useEffect, useState, type ReactNode } from 'react';

const NAV_ITEMS = [
  { label: 'Stats', href: '/admin', icon: '📊' },
  { label: 'Users', href: '/admin/users', icon: '👥' },
  { label: 'Logs', href: '/admin/logs', icon: '📋' },
];

export default function AdminLayout({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  useEffect(() => {
    if (!loading && !user) router.replace('/signin');
    if (!loading && user && user.email !== 'manshu.ibc24@gmail.com') router.replace('/dashboard');
  }, [user, loading, router]);

  if (loading || !user) return <main className="flex min-h-dvh items-center justify-center"><span className="spinner" /></main>;

  return (
    <div className="admin-layout">
      {/* Sidebar */}
      <aside className={`admin-sidebar ${sidebarOpen ? 'admin-sidebar-open' : ''}`}>
        <div className="flex items-center gap-2 px-4 py-4 border-b border-line">
          <span className="text-lg">⚙️</span>
          <span className="font-serif font-semibold text-ink-900 dark:text-paper-50">Admin</span>
        </div>
        <nav className="flex-1 px-3 py-3 space-y-1">
          {NAV_ITEMS.map((item) => (
            <button
              key={item.href}
              onClick={() => { router.push(item.href); setSidebarOpen(false); }}
              className={`admin-nav-link w-full text-left flex items-center gap-2 ${pathname === item.href ? 'admin-nav-active' : ''}`}
            >
              <span>{item.icon}</span> {item.label}
            </button>
          ))}
        </nav>
        <div className="px-3 py-3 border-t border-line">
          <button onClick={() => router.push('/dashboard')} className="admin-nav-link w-full text-left flex items-center gap-2">
            <span>←</span> Back to App
          </button>
        </div>
      </aside>

      {/* Overlay for mobile sidebar */}
      {sidebarOpen && (
        <div className="fixed inset-0 bg-black/30 z-40 lg:hidden" onClick={() => setSidebarOpen(false)} />
      )}

      {/* Topbar */}
      <header className="admin-topbar lg:pl-4">
        <button className="lg:hidden btn-ghost-sm" onClick={() => setSidebarOpen(!sidebarOpen)}>☰ Menu</button>
        <span className="text-sm font-medium text-ink-800 dark:text-paper-200">Nexigrate Admin</span>
        <span className="text-xs text-muted-500">{user.email}</span>
      </header>

      {/* Main */}
      <main className="admin-main mt-12">
        {children}
      </main>
    </div>
  );
}
