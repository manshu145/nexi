'use client';

/**
 * Live Sessions has been merged into the unified admin Dashboard (/admin)
 * as the "Realtime" block at the top. This page just redirects.
 */

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

export default function AdminSessionsRedirect() {
  const router = useRouter();
  useEffect(() => { router.replace('/admin'); }, [router]);
  return <div className="py-20 text-center text-sm text-muted-500">Live Sessions moved to the Dashboard — redirecting…</div>;
}
