
'use client';

import { useState, useEffect } from 'react';
import { useFirestore } from "@/firebase";
import { collection, query, where, onSnapshot } from "firebase/firestore";
import { User } from "@/lib/auth-mock";

/**
 * Hook to fetch real-time counts for sidebar badges.
 * Optimized for consistency with page-level filters.
 */
export function useSidebarCounts(user: User) {
  const db = useFirestore();
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
    if (!db || !user?.name) {
      setCounts({
        mySubmissions: 0,
        actionRequired: 0,
        reviewQueue: 0,
        resubmitted: 0,
        escalated: 0,
        exceptional: 0,
        branchNode: 0
      });
      return;
    }

    const isAdmin = user.role === 'Admin';

    // 1. My Submissions & Action Required (Strictly personal)
    const qMy = query(
      collection(db, "submissions"), 
      where("submittedBy", "==", user.name)
    );
    const unsubMy = onSnapshot(qMy, (snapshot) => {
      const allMy = snapshot.docs.map(d => d.data());
      setCounts(prev => ({ 
        ...prev, 
        mySubmissions: allMy.length,
        actionRequired: allMy.filter(d => d.status === 'Amended').length
      }));
    });

    // 2. Exceptional Approvals
    let qExceptional = query(
      collection(db, "submissions"),
      where("isExceptional", "==", true)
    );
    const unsubExceptional = onSnapshot(qExceptional, (snapshot) => {
      const activeExceptions = snapshot.docs.filter(doc => {
        const data = doc.data();
        const isClosed = ["Completed", "Rejected", "None"].includes(data.exceptionalStatus);
        if (isClosed) return false;

        if (isAdmin) return true;
        if (user.role === 'District Director') return data.exceptionalStatus === 'Awaiting District' && data.district === user.district;
        if (user.role === 'Director') return data.exceptionalStatus === 'Awaiting Director';
        if (user.role === 'Supervisor') return data.exceptionalStatus === 'Awaiting Supervisor';
        
        // Branch Managers/Officers see their node's exceptions
        const scope = user.role === 'Branch Manager' ? [user.branch] : (user.assignedBranches || []);
        return scope.includes(data.branch);
      });
      setCounts(prev => ({ ...prev, exceptional: activeExceptions.length }));
    });

    // 3. Review Queues (KYC Workflows)
    const isGlobalReviewer = ['Admin', 'Director', 'Supervisor'].includes(user.role || '');
    const assigned = user.assignedBranches || [];
    const canReview = isGlobalReviewer || (user.role === 'KYC Officer' && assigned.length > 0);

    let unsubQueues = () => {};
    if (canReview) {
      const qAllActive = query(
        collection(db, "submissions"),
        where("status", "in", ["Pending", "In Review", "Escalated"])
      );
      unsubQueues = onSnapshot(qAllActive, (snapshot) => {
        const docs = snapshot.docs.map(d => d.data());
        
        const filterByScope = (data: any) => {
          if (isGlobalReviewer) return true;
          return assigned.includes(data.branch);
        };

        setCounts(prev => ({
          ...prev,
          reviewQueue: docs.filter(d => d.status !== 'Escalated' && d.isResubmitted === false && d.isExceptional === false && filterByScope(d)).length,
          resubmitted: docs.filter(d => d.status !== 'Escalated' && d.isResubmitted === true && filterByScope(d)).length,
          escalated: docs.filter(d => d.status === 'Escalated' && filterByScope(d)).length
        }));
      });
    }

    // 4. Branch Node Queue (Active branch volume)
    let unsubBranch = () => {};
    if (isAdmin || (user.role === 'Branch Manager' && user.branch)) {
      const qBranch = isAdmin 
        ? query(collection(db, "submissions"))
        : query(collection(db, "submissions"), where("branch", "==", user.branch));
        
      unsubBranch = onSnapshot(qBranch, (snapshot) => {
        const activeStatuses = ["Pending", "In Review", "Amended"];
        const count = snapshot.docs.filter(d => activeStatuses.includes(d.data().status)).length;
        setCounts(prev => ({ ...prev, branchNode: count }));
      });
    }

    return () => {
      unsubMy();
      unsubExceptional();
      unsubQueues();
      unsubBranch();
    };
  }, [db, user?.name, user?.role, user?.assignedBranches, user?.district, user?.branch]);

  return counts;
}
