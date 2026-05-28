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
    if (isLoginPage) return;
    if (!loading && !user) router.replace('/admin/login');
    if (!loading && user && !ADMIN_EMAILS.includes(user.email ?? '')) router.replace('/dashboard');
  }, [user, loading, router, isLoginPage]);

  if (isLoginPage) return <>{children}</>;

  if (loading || !user) return <main className="flex min-h-dvh items-center justify-center bg-stone-950"><AILoader context="general" /></main>;

  return (
    <div className="min-h-dvh bg-stone-950 text-stone-100">
      {/* Sidebar */}
      <aside className={`fixed inset-y-0 left-0 z-50 flex w-56 flex-col bg-stone-900 border-r border-stone-800 transition-transform lg:translate-x-0 ${sidebarOpen ? 'translate-x-0' : '-translate-x-full'}`}>
        <div className="flex items-center gap-2 px-4 py-4 border-b border-stone-800">
          <span className="text-lg">⚙️</span>
          <span className="font-serif font-semibold text-amber-400">Admin</span>
        </div>
        <nav className="flex-1 overflow-y-auto px-3 py-3 space-y-1">
          {NAV_ITEMS.map((item) => (
            <button
              key={item.href}
              onClick={() => { router.push(item.href); setSidebarOpen(false); }}
              className={`w-full text-left flex items-center gap-2 px-3 py-2 rounded-lg text-sm transition-colors ${
                pathname === item.href
                  ? 'text-amber-400 bg-amber-500/10 border-r-2 border-amber-500 font-medium'
                  : 'text-stone-400 hover:text-stone-100 hover:bg-stone-800'
              }`}
            >
              <span>{item.icon}</span> {item.label}
            </button>
          ))}
        </nav>
        <div className="px-3 py-3 border-t border-stone-800">
          <button onClick={() => router.push('/dashboard')} className="w-full text-left flex items-center gap-2 px-3 py-2 rounded-lg text-sm text-stone-400 hover:text-stone-100 hover:bg-stone-800 transition-colors">
            <span>←</span> Back to App
          </button>
        </div>
      </aside>

      {/* Overlay for mobile sidebar */}
      {sidebarOpen && (
        <div className="fixed inset-0 bg-black/50 z-40 lg:hidden" onClick={() => setSidebarOpen(false)} />
      )}

      {/* Topbar */}
      <header className="fixed top-0 right-0 left-0 lg:left-56 z-30 flex items-center justify-between px-4 py-3 bg-stone-900 border-b border-stone-800">
        <button className="lg:hidden text-stone-400 hover:text-stone-100 text-sm font-medium" onClick={() => setSidebarOpen(!sidebarOpen)}>☰ Menu</button>
        <span className="text-sm font-medium text-stone-300">Nexigrate Admin</span>
        <span className="text-xs text-stone-500">{user.email}</span>
      </header>

      {/* Main */}
      <main className="lg:ml-56 pt-14 p-4 lg:p-6 min-h-dvh">
        {children}
      </main>
    </div>
  );
}
