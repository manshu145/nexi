'use client';
import { usePathname, useRouter } from 'next/navigation';
import { useAuth } from '~/lib/auth-context';
import { useEffect, useState, type ReactNode } from 'react';
import { AILoader } from '~/components/ui/AILoader';

const NAV_ITEMS = [
  { label: 'Stats', href: '/admin', icon: '📊' },
  { label: 'Users', href: '/admin/users', icon: '👥' },
  { label: 'Live Sessions', href: '/admin/sessions', icon: '🟢' },
  { label: 'Plans', href: '/admin/plans', icon: '💳' },
  { label: 'Revenue', href: '/admin/revenue', icon: '💰' },
  { label: 'AI & Logs', href: '/admin/logs', icon: '🤖' },
  { label: 'SEO & Branding', href: '/admin/seo', icon: '🔍' },
  { label: 'Announcements', href: '/admin/announcements', icon: '📢' },
  { label: 'Email', href: '/admin/email', icon: '📧' },
  { label: 'WhatsApp', href: '/admin/whatsapp', icon: '💬' },
  { label: 'Support', href: '/admin/support', icon: '🎫' },
];

const ADMIN_EMAILS = ['manshu.ibc24@gmail.com', 'manshusinha777@gmail.com'];

export default function AdminLayout({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  // Allow /admin/login to render without auth
  const isLoginPage = pathname === '/admin/login';

  useEffect(() => {
    if (isLoginPage) return; // Don't redirect on login page
    if (!loading && !user) router.replace('/admin/login');
    if (!loading && user && !ADMIN_EMAILS.includes(user.email ?? '')) router.replace('/dashboard');
  }, [user, loading, router, isLoginPage]);

  // Login page renders independently — no auth/layout wrapper needed
  if (isLoginPage) return <>{children}</>;

  if (loading || !user) return <main className="flex min-h-dvh items-center justify-center"><AILoader context="general" /></main>;

  return (
    <div className="admin-layout">
      {/* Sidebar */}
      <aside className={`admin-sidebar max-w-[80vw] ${sidebarOpen ? 'admin-sidebar-open' : ''}`}>
        <div className="flex items-center gap-2 px-4 py-4 border-b border-line">
          <span className="text-lg">⚙️</span>
          <span className="font-serif font-semibold text-gold-500">Admin</span>
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
        <div className="fixed inset-0 bg-black/50 z-40 lg:hidden" onClick={() => setSidebarOpen(false)} />
      )}

      {/* Topbar */}
      <header className="admin-topbar lg:pl-4">
        <button className="lg:hidden text-muted-500 hover:text-ink-900 text-sm font-medium" onClick={() => setSidebarOpen(!sidebarOpen)}>☰ Menu</button>
        <span className="text-sm font-medium text-ink-800">Nexigrate Admin</span>
        <span className="text-xs text-muted-400">{user.email}</span>
      </header>

      {/* Main */}
      <main className="admin-main mt-12">
        {children}
      </main>
    </div>
  );
}
