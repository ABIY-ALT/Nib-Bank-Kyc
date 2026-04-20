
'use client';

import { useState, useEffect } from 'react';
import { usePathname } from 'next/navigation';
import { UserProfile } from "@/lib/auth";
import { getWorkflowCounts } from '@/actions/submissions';
import { usePermissions } from './use-permissions';

const SIDEBAR_COUNTS_POLL_MS = 30000;

/**
 * Optimized Sidebar Hook.
 * Calls a specialized SQL-level count action to avoid fetching full data payloads.
 * Polls every 30s and pauses while the tab is hidden to reduce request churn.
 */
export function useSidebarCounts(user: UserProfile | null) {
  const { isSuperAdmin } = usePermissions();
  const pathname = usePathname();
  const [counts, setCounts] = useState({
    mySubmissions: 0,
    actionRequired: 0,
    reviewQueue: 0,
    resubmitted: 0,
    escalated: 0,
    exceptional: 0,
    branchNode: 0
  });

  useEffect(() => {
    if (!user) return;

    let isActive = true;
    let timeoutId: ReturnType<typeof setTimeout> | null = null;

    const scheduleNextPoll = () => {
      if (!isActive) return;
      timeoutId = setTimeout(fetchCounts, SIDEBAR_COUNTS_POLL_MS);
    };

    const fetchCounts = async () => {
      if (!isActive) return;

      if (typeof document !== 'undefined' && document.visibilityState !== 'visible') {
        scheduleNextPoll();
        return;
      }

      try {
        const res = await getWorkflowCounts({
          userId: user.id,
          branchName: user.branchName || undefined,
          branches: user.assignedBranches,
          isSuperAdmin
        });

        if (isActive) {
          setCounts(res);
        }
      } catch (error) {
      } finally {
        scheduleNextPoll();
      }
    };

    fetchCounts();

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        if (timeoutId) {
          clearTimeout(timeoutId);
        }
        fetchCounts();
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      isActive = false;
      if (timeoutId) {
        clearTimeout(timeoutId);
      }
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [user, isSuperAdmin, pathname]);

  return counts;
}
