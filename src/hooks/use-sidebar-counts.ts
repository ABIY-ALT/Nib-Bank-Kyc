'use client';

import { useState, useEffect } from 'react';
import { UserProfile } from "@/lib/auth-mock";
import { getSubmissions } from '@/actions/submissions';
import { SubmissionStatus } from '@prisma/client';

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
      // In a real pure SQL app, we might use a single aggregated query or API
      // Here we fetch and filter for the institutional dashboard experience
      const allSubmissions = await getSubmissions();
      
      const my = allSubmissions.filter(s => s.submittedById === user.id);
      const action = my.filter(s => s.status === SubmissionStatus.AMENDED);
      const queue = allSubmissions.filter(s => !s.isExceptional && [SubmissionStatus.PENDING, SubmissionStatus.IN_REVIEW].includes(s.status));
      const escalated = allSubmissions.filter(s => s.status === SubmissionStatus.ESCALATED);
      const exceptional = allSubmissions.filter(s => s.isExceptional && s.status !== SubmissionStatus.APPROVED);

      setCounts({
        mySubmissions: my.length,
        actionRequired: action.length,
        reviewQueue: queue.length,
        resubmitted: queue.filter(s => s.isResubmitted).length,
        escalated: escalated.length,
        exceptional: exceptional.length,
        branchNode: allSubmissions.filter(s => s.branchName === user.branchName).length
      });
    };

    fetchCounts();
    const interval = setInterval(fetchCounts, 30000); // Periodic polling since Firestore real-time is removed
    return () => clearInterval(interval);
  }, [user]);

  return counts;
}
