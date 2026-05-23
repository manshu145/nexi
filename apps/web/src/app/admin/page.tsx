'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

/**
 * /admin -> /admin/mcq-drafts
 *
 * The admin panel currently has two top-level sections (MCQ drafts and
 * Team). The default landing is the MCQ workspace because that's the
 * day-to-day focus; super_admin can switch to /admin/team via the nav.
 */
export default function AdminRoot() {
  const router = useRouter();
  useEffect(() => {
    router.replace('/admin/mcq-drafts');
  }, [router]);
  return null;
}
