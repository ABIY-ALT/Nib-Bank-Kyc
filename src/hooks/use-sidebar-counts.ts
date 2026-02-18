'use client';

import { useState, useEffect } from 'react';
import { UserProfile } from "@/lib/auth-mock";
import { getSubmissions } from '@/actions/submissions';
import { KYCStatus } from '@prisma/client';

export function useSidebarCounts(user: UserProfile | null) {
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
        const allSubmissions = await getSubmissions();
        
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
          branchNode: allSubmissions.filter(s => s.branch?.name === user.branchName).length
        });
      } catch (error) {
        console.error("Failed to fetch sidebar counts:", error);
      }
    };

    fetchCounts();
    const interval = setInterval(fetchCounts, 30000);
    return () => clearInterval(interval);
  }, [user]);

  return counts;
}
