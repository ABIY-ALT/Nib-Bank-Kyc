'use client';

import { useState, useEffect, useMemo } from 'react';
import { UserProfile } from "@/lib/auth-mock";
import { getSubmissions } from '@/actions/submissions';
import { KYCStatus } from '@prisma/client';
import { usePermissions } from './use-permissions';

export function useSidebarCounts(user: UserProfile | null) {
  const { isSuperAdmin, hasPermission } = usePermissions();
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
        const isSpecialist = hasPermission('KYC_VIEW_QUEUE');
        const assignedBranches = user.assignedBranches || [];

        const filters: any = {};
        
        // If specialist but not admin, restrict counts to assigned branches
        if (isSpecialist && !isSuperAdmin && assignedBranches.length > 0) {
          filters.branches = assignedBranches;
        }

        const allSubmissions = await getSubmissions(filters);
        
        const my = allSubmissions.filter(s => s.createdById === user.id);
        const action = my.filter(s => s.status === KYCStatus.ACTION_REQUIRED);
        const queue = allSubmissions.filter(s => !s.isExceptional && [KYCStatus.SUBMITTED, KYCStatus.IN_REVIEW].includes(s.status as any));
        const escalated = allSubmissions.filter(s => s.status === KYCStatus.ESCALATED);
        const exceptional = allSubmissions.filter(s => s.isExceptional && s.status !== KYCStatus.APPROVED);

        setCounts({
          mySubmissions: my.length,
          actionRequired: action.length,
          reviewQueue: queue.length,
          resubmitted: queue.filter(s => s.isResubmitted).length,
          escalated: escalated.length,
          exceptional: exceptional.length,
          branchNode: allSubmissions.filter(s => s.branchName === user.branchName).length
        });
      } catch (error) {
        console.error("Failed to fetch sidebar counts:", error);
      }
    };

    fetchCounts();
    const interval = setInterval(fetchCounts, 30000);
    return () => clearInterval(interval);
  }, [user, isSuperAdmin, hasPermission]);

  return counts;
}
