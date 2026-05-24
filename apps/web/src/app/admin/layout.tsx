'use client';

import { useEffect, useState } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import Link from 'next/link';
import { useAuth } from '~/lib/auth-context';
import { api, type AdminMeResponse } from '~/lib/api';

const NAV_ITEMS = [
  { label: 'Analytics', path: '/admin/analytics', icon: '📊' },
  { label: 'Users', path: '/admin/users', icon: '👥' },
  { label: 'Audit Log', path: '/admin/audit', icon: '📋' },
  { label: 'Scheduler', path: '/admin/scheduler', icon: '⚙️' },
  { label: 'Tickets', path: '/admin/tickets', icon: '🎫' },
];

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const [adminMe, setAdminMe] = useState<AdminMeResponse | null>(null);
  const [authError, setAuthError] = useState(false);
  const [checking, setChecking] = useState(true);
  const [sidebarOpen, setSidebarOpen] = useState(false);

  useEffect(() => {
    if (!loading && !user) {
      router.replace('/signin');
      return;
    }
    if (!user) return;
    (async () => {
      try {
        const res = await api.admin.auth.me();
        if (!res.role) {
          setAuthError(true);
        } else {
          setAdminMe(res);
        }
      } catch {
        setAuthError(true);
      } finally {
        setChecking(false);
      }
    })();
  }, [user, loading, router]);

  if (loading || checking) {
    return (
      <div className="flex min-h-dvh items-center justify-center bg-paper-100">
        <span className="spinner" />
        <span className="ml-2 text-sm text-muted-500">Verifying admin access...</span>
      </div>
    );
  }

  if (authError || !adminMe) {
    return (
      <div className="flex min-h-dvh items-center justify-center bg-paper-100 px-6">
        <div className="paper-card max-w-sm p-8 text-center">
          <span className="text-3xl">🔒</span>
          <h1 className="mt-4 font-serif text-xl font-semibold text-ink-900">Admin Access Required</h1>
          <p className="mt-2 text-sm text-muted-500">You don&apos;t have admin privileges. Contact the super admin.</p>
          <Link href="/dashboard" className="btn-primary mt-6 inline-block">Go to Dashboard</Link>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-dvh bg-paper-50">
      {/* Sidebar - Desktop */}
      <aside className="hidden lg:flex lg:w-60 lg:flex-col lg:fixed lg:inset-y-0 border-r border-paper-200 bg-paper-100">
        <div className="flex h-14 items-center px-5 border-b border-paper-200">
          <Link href="/admin/analytics" className="font-serif text-lg font-bold text-ink-900">
            Nexigrate <span className="text-xs font-normal text-muted-500">Admin</span>
          </Link>
        </div>
        <nav className="flex-1 px-3 py-4 space-y-1">
          {NAV_ITEMS.map(item => (
            <Link
              key={item.path}
              href={item.path}
              className={`flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors ${
                pathname.startsWith(item.path)
                  ? 'bg-ember-50 text-ember-700 border border-ember-200'
                  : 'text-ink-700 hover:bg-paper-200'
              }`}
            >
              <span>{item.icon}</span>
              <span>{item.label}</span>
            </Link>
          ))}
        </nav>
        <div className="border-t border-paper-200 px-4 py-3">
          <p className="text-xs text-muted-500 truncate">{adminMe.email}</p>
          <p className="text-[10px] text-ember-600 font-semibold uppercase">{adminMe.role}</p>
        </div>
      </aside>

      {/* Mobile header */}
      <div className="lg:hidden fixed top-0 left-0 right-0 z-30 flex h-14 items-center justify-between border-b border-paper-200 bg-paper-100/90 backdrop-blur-md px-4">
        <button onClick={() => setSidebarOpen(!sidebarOpen)} className="text-ink-800">
          <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" />
          </svg>
        </button>
        <span className="font-serif text-sm font-bold text-ink-900">Admin</span>
        <span className="text-[10px] text-ember-600 font-bold uppercase">{adminMe.role}</span>
      </div>

      {/* Mobile sidebar overlay */}
      {sidebarOpen && (
        <div className="lg:hidden fixed inset-0 z-40">
          <div className="absolute inset-0 bg-ink-900/30" onClick={() => setSidebarOpen(false)} />
          <div className="absolute left-0 top-0 bottom-0 w-64 bg-paper-100 border-r border-paper-200 shadow-xl">
            <div className="flex h-14 items-center px-5 border-b border-paper-200">
              <span className="font-serif text-lg font-bold text-ink-900">Admin</span>
            </div>
            <nav className="px-3 py-4 space-y-1">
              {NAV_ITEMS.map(item => (
                <Link
                  key={item.path}
                  href={item.path}
                  onClick={() => setSidebarOpen(false)}
                  className={`flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors ${
                    pathname.startsWith(item.path)
                      ? 'bg-ember-50 text-ember-700'
                      : 'text-ink-700 hover:bg-paper-200'
                  }`}
                >
                  <span>{item.icon}</span>
                  <span>{item.label}</span>
                </Link>
              ))}
            </nav>
            <div className="absolute bottom-0 left-0 right-0 border-t border-paper-200 px-4 py-3">
              <p className="text-xs text-muted-500 truncate">{adminMe.email}</p>
              <Link href="/dashboard" className="text-xs text-ember-600 hover:underline">← Student View</Link>
            </div>
          </div>
        </div>
      )}

      {/* Main content */}
      <main className="flex-1 lg:ml-60 pt-14 lg:pt-0">
        <div className="p-4 sm:p-6 lg:p-8">
          {children}
        </div>
      </main>
    </div>
  );
}
