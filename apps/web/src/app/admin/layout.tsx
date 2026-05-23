'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useState, type ReactNode } from 'react';
import { Logo } from '~/components/Logo';
import { useAuth } from '~/lib/auth-context';
import { api, type AdminMeResponse } from '~/lib/api';

/**
 * /admin layout
 *
 * One source of truth for the admin gate. Wraps every page under /admin/*
 * (except /admin/login, which has its own gate logic).
 *
 * Behaviour:
 *   - If Firebase user is null              -> redirect to /admin/login
 *   - If /v1/admin/auth/me returns no role  -> redirect to /admin/login
 *                                              (with auto signOut to stop a
 *                                              student session leaking in)
 *   - If role is present                    -> render children with a
 *                                              persistent header showing
 *                                              the email + role + nav
 */
export default function AdminLayout({ children }: { children: ReactNode }) {
  const { user, loading, signOut } = useAuth();
  const router = useRouter();
  const pathname = usePathname() ?? '';

  // /admin/login renders standalone (not inside the gated layout chrome).
  const isLoginPage = pathname.startsWith('/admin/login');

  const [me, setMe] = useState<AdminMeResponse | null>(null);
  const [check, setCheck] = useState<'unknown' | 'ok' | 'denied'>('unknown');

  useEffect(() => {
    if (isLoginPage) {
      setCheck('ok'); // bypass the gate on the login page itself
      return;
    }
    if (loading) return;
    if (!user) {
      router.replace('/admin/login');
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const res = await api.admin.auth.me();
        if (cancelled) return;
        if (!res.role) {
          // Firebase user is signed in but has no admin role -- bounce them
          // back to login. We don't auto-signOut because a student might be
          // signed in on the same browser; logging them out of /signin too
          // would be surprising.
          setCheck('denied');
          router.replace('/admin/login');
          return;
        }
        setMe(res);
        setCheck('ok');
      } catch {
        if (!cancelled) {
          setCheck('denied');
          router.replace('/admin/login');
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [user, loading, router, isLoginPage]);

  // /admin/login: render bare children, no chrome.
  if (isLoginPage) return <>{children}</>;

  // Loading or redirecting.
  if (loading || check !== 'ok' || !me) {
    return (
      <main className="flex min-h-[60vh] items-center justify-center px-6">
        <span className="inline-flex items-center gap-2 text-sm text-muted-500">
          <span className="spinner" aria-hidden="true" />
          Loading admin panel...
        </span>
      </main>
    );
  }

  return (
    <div className="min-h-screen">
      <header className="border-b border-ink-900/10 bg-paper-50/80 backdrop-blur">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-4 px-6 py-4">
          <div className="flex items-center gap-6">
            <Logo />
            <nav className="hidden items-center gap-4 sm:flex">
              <NavLink href="/admin/mcq-drafts" current={pathname.startsWith('/admin/mcq-drafts')}>
                MCQ drafts
              </NavLink>
              {me.role === 'super_admin' ? (
                <NavLink href="/admin/team" current={pathname.startsWith('/admin/team')}>
                  Team
                </NavLink>
              ) : null}
            </nav>
          </div>
          <div className="flex items-center gap-3">
            <span className="hidden text-right text-xs text-muted-500 sm:block">
              <span className="block">{me.email}</span>
              <span className="font-medium text-ink-800">{prettyRole(me.role)}</span>
            </span>
            <button
              type="button"
              onClick={() => router.push('/dashboard')}
              className="btn-ghost-sm hidden sm:inline-flex"
              title="Open the student-facing dashboard"
            >
              Student view
            </button>
            <button
              type="button"
              onClick={() => signOut().then(() => router.replace('/admin/login'))}
              className="btn-ghost-sm"
            >
              Sign out
            </button>
          </div>
        </div>

        {/* Mobile nav */}
        <nav className="flex items-center gap-2 overflow-x-auto px-6 pb-3 sm:hidden">
          <NavLink href="/admin/mcq-drafts" current={pathname.startsWith('/admin/mcq-drafts')}>
            MCQ drafts
          </NavLink>
          {me.role === 'super_admin' ? (
            <NavLink href="/admin/team" current={pathname.startsWith('/admin/team')}>
              Team
            </NavLink>
          ) : null}
        </nav>
      </header>

      {children}
    </div>
  );
}

function NavLink({
  href,
  current,
  children,
}: {
  href: string;
  current: boolean;
  children: ReactNode;
}) {
  return (
    <Link
      href={href}
      className={
        'rounded-full px-3 py-1 text-sm font-medium ' +
        (current
          ? 'bg-ink-900 text-paper-100'
          : 'text-ink-800 hover:bg-paper-200')
      }
    >
      {children}
    </Link>
  );
}

function prettyRole(role: string | null): string {
  switch (role) {
    case 'super_admin':
      return 'Super admin';
    case 'admin':
      return 'Admin';
    case 'content_admin':
      return 'Content admin';
    case 'support_admin':
      return 'Support admin';
    default:
      return '';
  }
}
