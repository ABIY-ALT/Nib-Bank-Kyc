
'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

/**
 * Legacy page redirect. 
 * The force password change is now handled via modal in DashboardShell.
 */
export default function ForcePasswordChangePage() {
  const router = useRouter();

  useEffect(() => {
    router.replace('/');
  }, [router]);

  return null;
}
