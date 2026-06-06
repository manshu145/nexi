'use client';

import { useEffect } from 'react';
import { usePathname } from 'next/navigation';
import { useAuth } from '~/lib/auth-context';
import { useUser } from '~/lib/userStore';
import { track, flush, setAnalyticsEnabled, setAnalyticsContext } from '~/lib/analytics';

/**
 * Mounts once (in Providers). Enables tracking when authenticated, records a
 * page_view on every route change (path normalised to keep cardinality low),
 * and flushes the buffer when the tab is hidden.
 */
function normalizePath(pathname: string): string {
  // Collapse to the first two segments so dynamic ids (chapters, exams,
  // mock-test ids) don't explode the event keyspace.
  const parts = pathname.split('/').filter(Boolean);
  if (parts.length === 0) return '/';
  return '/' + parts.slice(0, 2).join('/');
}

export function AnalyticsTracker() {
  const { user } = useAuth();
  const { user: me } = useUser();
  const pathname = usePathname();

  useEffect(() => { setAnalyticsEnabled(!!user); }, [user]);

  // Keep ambient dimensions (exam, language) fresh for every event so the
  // admin can see exam-wise engagement and the English/Hindi split.
  useEffect(() => {
    setAnalyticsContext({ exam: me?.targetExam ?? null, lang: me?.language ?? null });
  }, [me?.targetExam, me?.language]);

  useEffect(() => {
    if (!user || !pathname) return;
    track('page_view', { path: normalizePath(pathname) });
  }, [user, pathname]);

  useEffect(() => {
    const onHide = () => { if (document.visibilityState === 'hidden') void flush(true); };
    document.addEventListener('visibilitychange', onHide);
    return () => document.removeEventListener('visibilitychange', onHide);
  }, []);

  return null;
}
