'use client';
import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

/** Redirects to the merged AI & Logs page */
export default function AIDebugRedirect() {
  const router = useRouter();
  useEffect(() => { router.replace('/admin/logs'); }, [router]);
  return null;
}
