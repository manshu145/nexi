'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

/**
 * /admin -> /admin/analytics
 *
 * Admin panel is observation-only. AI handles all content generation.
 * Admin monitors: analytics, users, AI scheduler, audit logs, support.
 */
export default function AdminRoot() {
  const router = useRouter();
  useEffect(() => {
    router.replace('/admin/analytics');
  }, [router]);
  return null;
}
