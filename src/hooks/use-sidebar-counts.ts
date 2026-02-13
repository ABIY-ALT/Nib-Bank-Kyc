'use client';

import { useState, useEffect } from 'react';
import { useFirestore } from "@/firebase";
import { collection, query, where, onSnapshot } from "firebase/firestore";
import { User } from "@/lib/auth-mock";

/**
 * Hook to fetch real-time counts for sidebar badges.
 */
export function useSidebarCounts(user: User | null) {
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

    // 1. My Submissions & Action Required
    const qMy = isAdmin 
      ? query(collection(db, "submissions"))
      : query(collection(db, "submissions"), where("submittedBy", "==", user.name));
      
    const unsubMy = onSnapshot(qMy, (snapshot) => {
      const allDocs = snapshot.docs.map(d => d.data());
      setCounts(prev => ({ 
        ...prev, 
        mySubmissions: isAdmin ? allDocs.length : allDocs.filter(d => d.submittedBy === user.name).length,
        actionRequired: allDocs.filter(d => d.status === 'Amended' && (isAdmin || d.submittedBy === user.name)).length
      }));
    });

    // 2. Exceptional Approvals
    const qExceptional = query(
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
        if (user.role === 'Branch Banking Director') return data.exceptionalStatus === 'Awaiting Director';
        if (user.role === 'Chief Retail & SME Banking Officer') return data.exceptionalStatus === 'Awaiting Chief';
        if (user.role === 'Division Manager') return data.exceptionalStatus === 'Awaiting Division';
        if (user.role === 'Supervisor') return data.exceptionalStatus === 'Awaiting Supervisor';
        
        const scope = user.role === 'Branch Manager' ? [user.branch] : (user.assignedBranches || []);
        return scope.includes(data.branch);
      });
      setCounts(prev => ({ ...prev, exceptional: activeExceptions.length }));
    });

    // 3. Review Queues
    const qAllActive = query(
      collection(db, "submissions"),
      where("status", "in", ["Pending", "In Review", "Escalated"])
    );
    const unsubQueues = onSnapshot(qAllActive, (snapshot) => {
      const docs = snapshot.docs.map(d => d.data());
      
      const filterByScope = (data: any) => {
        if (isAdmin) return true;
        const isGlobalReviewer = ['Branch Banking Director', 'Supervisor', 'Division Manager', 'Chief Retail & SME Banking Officer'].includes(user.role || '');
        if (isGlobalReviewer) return true;
        const assigned = user.assignedBranches || [];
        return assigned.includes(data.branch);
      };

      setCounts(prev => ({
        ...prev,
        reviewQueue: docs.filter(d => d.status !== 'Escalated' && d.isResubmitted === false && d.isExceptional === false && filterByScope(d)).length,
        resubmitted: docs.filter(d => d.status !== 'Escalated' && d.isResubmitted === true && filterByScope(d)).length,
        escalated: docs.filter(d => d.status === 'Escalated' && filterByScope(d)).length
      }));
    });

    // 4. Branch Node Queue
    let unsubBranch = () => {};
    if (isAdmin || user.branch) {
      const qBranch = isAdmin 
        ? query(collection(db, "submissions"))
        : query(collection(db, "submissions"), where("branch", "==", user.branch));
        
      unsubBranch = onSnapshot(qBranch, (snapshot) => {
        const activeStatuses = ["Pending", "In Review", "Amended"];
        const count = snapshot.docs.filter(d => {
          const data = d.data();
          const matchesStatus = activeStatuses.includes(data.status);
          if (isAdmin) return matchesStatus;
          return matchesStatus && data.branch === user.branch;
        }).length;
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
