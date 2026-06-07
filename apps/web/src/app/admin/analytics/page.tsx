'use client';

/**
 * Analytics has been merged into the unified admin Dashboard (/admin),
 * which now shows realtime sessions, KPIs, trends, funnel and breakdowns
 * in one Google-Analytics-style surface. This page just redirects.
 */

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

export default function AdminAnalyticsRedirect() {
  const router = useRouter();
  useEffect(() => { router.replace('/admin'); }, [router]);
  return <div className="py-20 text-center text-sm text-muted-500">Analytics moved to the Dashboard — redirecting…</div>;
}
