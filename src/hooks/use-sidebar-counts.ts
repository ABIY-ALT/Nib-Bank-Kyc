'use client';

import { useState, useEffect } from 'react';
import { UserProfile } from "@/lib/auth";
import { getWorkflowCounts } from '@/actions/submissions';
import { usePermissions } from './use-permissions';

/**
 * Optimized Sidebar Hook.
 * Calls a specialized SQL-level count action to avoid fetching full data payloads.
 */
export function useSidebarCounts(user: UserProfile | null) {
  const { isSuperAdmin } = usePermissions();
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

    const fetchCounts = async () => {
      try {
        const res = await getWorkflowCounts({
          userId: user.id,
          branchName: user.branchName || undefined,
          branches: user.assignedBranches,
          isSuperAdmin
        });
        
        setCounts(res);
      } catch (error) {
        console.error("Failed to fetch sidebar counts:", error);
      }
    };

    fetchCounts();
    const interval = setInterval(fetchCounts, 60000);
    return () => clearInterval(interval);
  }, [user, isSuperAdmin]);

  return counts;
}
