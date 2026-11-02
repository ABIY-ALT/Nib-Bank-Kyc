'use client';

import { useState, useEffect } from 'react';
import { UserProfile } from "@/lib/auth";
import { getWorkflowCounts } from '@/actions/submissions';
import { usePermissions } from './use-permissions';

const SIDEBAR_COUNTS_POLL_MS = 2 * 60 * 1000;
const SIDEBAR_COUNTS_FOCUS_MIN_MS = 60 * 1000;

/**
 * Optimized Sidebar Hook.
 * Calls a specialized SQL-level count action to avoid fetching full data payloads.
 * Polls every 2 minutes and refreshes when the tab becomes visible again, at most
 * once a minute, so switching between applications does not re-run the counts.
 */
export function useSidebarCounts(user: UserProfile | null) {
  const userId = user?.id;

  const [counts, setCounts] = useState({
    mySubmissions: 0,
    actionRequired: 0,
    reviewQueue: 0,
    resubmitted: 0,
    escalated: 0,
    exceptional: 0,
    unseenCases: 0,
    branchNode: 0
  });

  useEffect(() => {
    if (!userId) return;

    let isActive = true;
    let timeoutId: ReturnType<typeof setTimeout> | null = null;
    let lastFetchedAt = 0;

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

      lastFetchedAt = Date.now();

      try {
        // SECURITY: No client-side privilege params — server derives all from session
        const res = await getWorkflowCounts();

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
      if (document.visibilityState === 'visible' && Date.now() - lastFetchedAt >= SIDEBAR_COUNTS_FOCUS_MIN_MS) {
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
  }, [userId]);

  return counts;
}
