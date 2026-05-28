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
  { label: 'API Config', href: '/admin/api-config', icon: '🔑' },
  { label: 'News Feeds', href: '/admin/feeds', icon: '📡' },
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

  const isLoginPage = pathname === '/admin/login';

  useEffect(() => {
    if (isLoginPage) return;
    if (!loading && !user) router.replace('/admin/login');
    if (!loading && user && !ADMIN_EMAILS.includes(user.email ?? '')) router.replace('/dashboard');
  }, [user, loading, router, isLoginPage]);

  if (isLoginPage) return <>{children}</>;

  if (loading || !user) return (
    <main className="flex min-h-dvh items-center justify-center" style={{ background: '#1C1917' }}>
      <AILoader context="general" />
    </main>
  );

  const isActive = (href: string) => {
    if (href === '/admin') return pathname === '/admin';
    return pathname.startsWith(href);
  };

  return (
    <div className="min-h-dvh admin-dark-theme" style={{ background: '#1C1917', color: '#F5F5F4' }}>
      {/* Sidebar */}
      <aside className={`fixed inset-y-0 left-0 z-50 flex w-56 flex-col transition-transform lg:translate-x-0 ${sidebarOpen ? 'translate-x-0' : '-translate-x-full'}`} style={{ background: '#292524', borderRight: '1px solid #44403C' }}>
        <div className="flex items-center gap-2 px-4 py-4" style={{ borderBottom: '1px solid #44403C' }}>
          <span className="text-lg">⚙️</span>
          <span className="font-serif font-semibold" style={{ color: '#F59E0B' }}>Admin</span>
        </div>
        <nav className="flex-1 overflow-y-auto px-3 py-3 space-y-1">
          {NAV_ITEMS.map((item) => (
            <button
              key={item.href}
              onClick={() => { router.push(item.href); setSidebarOpen(false); }}
              className="w-full text-left flex items-center gap-2 px-3 py-2 rounded-lg text-sm transition-colors"
              style={{
                color: isActive(item.href) ? '#F59E0B' : '#A8A29E',
                background: isActive(item.href) ? 'rgba(245,158,11,0.1)' : 'transparent',
                borderRight: isActive(item.href) ? '2px solid #F59E0B' : 'none',
                fontWeight: isActive(item.href) ? 500 : 400,
              }}
            >
              <span>{item.icon}</span> {item.label}
            </button>
          ))}
        </nav>
        <div className="px-3 py-3" style={{ borderTop: '1px solid #44403C' }}>
          <button onClick={() => router.push('/dashboard')} className="w-full text-left flex items-center gap-2 px-3 py-2 rounded-lg text-sm transition-colors" style={{ color: '#A8A29E' }}>
            <span>←</span> Back to App
          </button>
        </div>
      </aside>

      {/* Overlay for mobile sidebar */}
      {sidebarOpen && (
        <div className="fixed inset-0 bg-black/50 z-40 lg:hidden" onClick={() => setSidebarOpen(false)} />
      )}

      {/* Topbar */}
      <header className="fixed top-0 right-0 left-0 lg:left-56 z-30 flex items-center justify-between px-4 py-3" style={{ background: '#292524', borderBottom: '1px solid #44403C' }}>
        <button className="lg:hidden text-sm font-medium" style={{ color: '#A8A29E' }} onClick={() => setSidebarOpen(!sidebarOpen)}>☰ Menu</button>
        <span className="text-sm font-medium" style={{ color: '#D6D3D1' }}>Nexigrate Admin</span>
        <span className="text-xs" style={{ color: '#78716C' }}>{user.email}</span>
      </header>

      {/* Main */}
      <main className="lg:ml-56 pt-14 p-4 lg:p-6 min-h-dvh">
        {children}
      </main>
    </div>
  );
}
