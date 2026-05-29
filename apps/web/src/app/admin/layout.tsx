'use client';
import { usePathname, useRouter } from 'next/navigation';
import { useAuth } from '~/lib/auth-context';
import { useEffect, useState, type ReactNode } from 'react';
import { AILoader } from '~/components/ui/AILoader';
import { Toaster } from '~/components/toaster';

/**
 * Admin shell.
 *
 * Lock §4.8 ("pura ka pura UI UX changee kr de jo sabse best rahega
 * manage krne ke liyee platfrom ko. bs brand colors use krna our
 * responsive rkhna") -- this file used to ship 12 inline `style={{}}`
 * blocks of raw stone/amber hex, which made the admin a third visual
 * theme on top of marketing + the student app. That's all gone. Every
 * surface now uses the same `paper` / `ink` / `ember` / `gold` / `line`
 * tokens that drive marketing and the student app, so the admin lives
 * in the same brand language and inherits system-based light/dark for
 * free (PR-10 enabled `enableSystem` + the html.dark CSS-variable
 * overrides handle the swap).
 *
 * Responsive (lock §4.4 -- Phone / Tab / Laptop):
 *   - <  lg (~1024px)  : sidebar is a slide-in drawer behind a
 *                        translucent backdrop; toggled by the ☰ Menu
 *                        button in the topbar; auto-closes on nav so a
 *                        thumb tap doesn't leave it covering the page.
 *   - >= lg            : sidebar is persistent and content offsets
 *                        56-units (`lg:ml-56`).
 *
 * Touch targets in the nav are 44px tall (>= WCAG 2.5.5) and the active
 * pill uses `bg-ember-500/10` + a 2px ember left-edge so the current
 * page is unambiguous on both phone and laptop without screaming colour.
 */
const NAV_ITEMS = [
  { label: 'Stats', href: '/admin', icon: '📊' },
  { label: 'Users', href: '/admin/users', icon: '👥' },
  { label: 'Live Sessions', href: '/admin/sessions', icon: '🟢' },
  { label: 'Plans', href: '/admin/plans', icon: '💳' },
  { label: 'Credit Rewards', href: '/admin/credit-rewards', icon: '💎' },
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

// Founder lock §3.6 keeps these as the single hardcoded admin allowlist
// for now ("abhi koi team nhi hai sirf mai hu") -- a future PR-N will
// move this to a Firestore-backed roles collection so additional admins
// can be invited from the admin UI. The same list mirrors in
// /admin/login/page.tsx and apps/api/src/env.ts SUPER_ADMIN_EMAIL.
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

  // Auto-close the drawer on route change (mobile UX): tapping a nav
  // item should hand the user the new page, not leave the sidebar
  // covering it.
  useEffect(() => {
    setSidebarOpen(false);
  }, [pathname]);

  if (isLoginPage) return <>{children}</>;

  if (loading || !user) return (
    <main className="flex min-h-dvh items-center justify-center bg-paper-100">
      <AILoader context="general" />
    </main>
  );

  const isActive = (href: string) => {
    if (href === '/admin') return pathname === '/admin';
    return pathname.startsWith(href);
  };

  return (
    <div className="min-h-dvh bg-paper-100">
      {/* Sidebar — drawer on phone/tablet, persistent on laptop. */}
      <aside
        className={`fixed inset-y-0 left-0 z-50 flex w-60 flex-col border-r border-line bg-paper-50 transition-transform lg:translate-x-0 ${sidebarOpen ? 'translate-x-0' : '-translate-x-full'}`}
        aria-label="Admin navigation"
      >
        {/* Brand row */}
        <div className="flex items-center gap-2 border-b border-line px-4 py-4">
          <img src="/brand/nexigrate-favicon.svg" alt="Nexigrate" width={28} height={28} />
          <span className="font-serif font-semibold text-ink-900">Admin</span>
          <span className="ml-auto rounded-full bg-ember-500/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-ember-600">live</span>
        </div>

        {/* Nav */}
        <nav className="flex-1 space-y-0.5 overflow-y-auto px-3 py-3">
          {NAV_ITEMS.map((item) => {
            const active = isActive(item.href);
            return (
              <button
                key={item.href}
                onClick={() => router.push(item.href)}
                className={
                  // 44px minimum touch target via py-2.5 + leading-snug.
                  // Active pill uses an ember-left bar + tinted ember
                  // background; inactive rows are muted-500 over paper-50
                  // and pick up the line-token hover.
                  `flex w-full items-center gap-2 rounded-lg border-l-2 px-3 py-2.5 text-sm transition-colors ${
                    active
                      ? 'border-ember-500 bg-ember-500/10 font-medium text-ember-600'
                      : 'border-transparent text-muted-500 hover:bg-paper-200 hover:text-ink-800'
                  }`
                }
              >
                <span className="text-base leading-none">{item.icon}</span>
                <span>{item.label}</span>
              </button>
            );
          })}
        </nav>

        {/* Foot */}
        <div className="border-t border-line px-3 py-3">
          <button
            onClick={() => router.push('/dashboard')}
            className="flex w-full items-center gap-2 rounded-lg px-3 py-2.5 text-sm text-muted-500 transition-colors hover:bg-paper-200 hover:text-ink-800"
          >
            <span>←</span> Back to App
          </button>
        </div>
      </aside>

      {/* Backdrop for the drawer on small screens. */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-40 bg-ink-950/40 backdrop-blur-[2px] lg:hidden"
          onClick={() => setSidebarOpen(false)}
          aria-hidden="true"
        />
      )}

      {/* Topbar — sticky on every breakpoint so admin context (email
          chip + menu toggle) is always reachable while a long table
          scrolls underneath. */}
      <header className="fixed left-0 right-0 top-0 z-30 flex items-center justify-between border-b border-line bg-paper-50/95 px-4 py-3 backdrop-blur lg:left-60">
        <button
          className="text-sm font-medium text-muted-500 hover:text-ink-900 lg:hidden"
          onClick={() => setSidebarOpen((prev) => !prev)}
          aria-label="Toggle navigation"
          aria-expanded={sidebarOpen}
        >
          ☰ Menu
        </button>
        <span className="text-sm font-semibold text-ink-900">Nexigrate Admin</span>
        {/* Email pill -- truncates on phones so a long Gmail doesn't
            push the menu button off-screen. */}
        <span className="max-w-[40vw] truncate text-xs text-muted-500" title={user.email ?? ''}>
          {user.email}
        </span>
      </header>

      {/* Main content */}
      <main className="min-h-dvh px-4 pb-8 pt-16 lg:ml-60 lg:px-6 lg:pt-20">
        {children}
      </main>

      {/* Sonner toaster — every admin action that used to call alert()
          now calls toast.success/toast.error and shows up here. */}
      <Toaster />
    </div>
  );
}
