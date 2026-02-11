
'use client';

import { useState, useEffect } from 'react';
import { useFirestore } from "@/firebase";
import { collection, query, where, onSnapshot } from "firebase/firestore";
import { User } from "@/lib/auth-mock";

/**
 * Hook to fetch real-time counts for sidebar badges.
 * Optimized for institutional workflow segregation and role-aware task lists.
 * Updated: Admins now see global counts for all badges to enable master oversight.
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
    if (!db || !user?.name) return;

    const isAdmin = user.role === 'Admin';

    // 1. My Submissions: All cases created by the current user (Always personal)
    const qMy = query(
      collection(db, "submissions"), 
      where("submittedBy", "==", user.name)
    );
    const unsubMy = onSnapshot(qMy, (snapshot) => {
      setCounts(prev => ({ ...prev, mySubmissions: snapshot.size }));
    });

    // 2. Action Required: Cases returned by KYC for corrections (for the submitter)
    const qAction = query(
      collection(db, "submissions"), 
      where("submittedBy", "==", user.name),
      where("status", "==", "Amended")
    );
    const unsubAction = onSnapshot(qAction, (snapshot) => {
      setCounts(prev => ({ ...prev, actionRequired: snapshot.size }));
    });

    // 3. Exceptional Approvals: Role-based task list
    let qExceptional;
    let filterExceptionalClient = false;

    if (isAdmin) {
      // Admins see all active exceptions regardless of stage
      qExceptional = query(
        collection(db, "submissions"),
        where("isExceptional", "==", true),
        where("exceptionalStatus", "not-in", ["Completed", "Rejected", "None"])
      );
    } else if (user.role === 'District Director') {
      qExceptional = query(
        collection(db, "submissions"),
        where("isExceptional", "==", true),
        where("exceptionalStatus", "==", "Awaiting District"),
        where("district", "==", user.district || "")
      );
    } else if (user.role === 'Director') {
      qExceptional = query(
        collection(db, "submissions"),
        where("isExceptional", "==", true),
        where("exceptionalStatus", "==", "Awaiting Director")
      );
    } else if (user.role === 'Supervisor') {
      qExceptional = query(
        collection(db, "submissions"),
        where("isExceptional", "==", true),
        where("exceptionalStatus", "==", "Awaiting Supervisor")
      );
    } else if (user.role === 'Branch Manager' || user.role === 'KYC Officer') {
      const scope = user.role === 'Branch Manager' ? [user.branch] : (user.assignedBranches || []);
      if (scope.length > 0 && scope[0]) {
        qExceptional = query(
          collection(db, "submissions"),
          where("isExceptional", "==", true),
          where("branch", "in", scope)
        );
        filterExceptionalClient = true;
      }
    }

    const unsubExceptional = qExceptional ? onSnapshot(qExceptional, (snapshot) => {
      if (filterExceptionalClient) {
        const excluded = ["Completed", "Rejected", "None"];
        const activeCount = snapshot.docs.filter(doc => !excluded.includes(doc.data().exceptionalStatus)).length;
        setCounts(prev => ({ ...prev, exceptional: activeCount }));
      } else {
        setCounts(prev => ({ ...prev, exceptional: snapshot.size }));
      }
    }) : () => {};

    // 4. Review Queues: Normal KYC workflows
    const isGlobalReviewer = ['Admin', 'Director', 'Supervisor'].includes(user.role || '');
    const assigned = user.assignedBranches || [];
    const canReview = isGlobalReviewer || (user.role === 'KYC Officer' && assigned.length > 0);

    let unsubQueue = () => {};
    let unsubResub = () => {};
    let unsubEsc = () => {};

    if (canReview) {
      // Review Queue: New submissions
      if (isGlobalReviewer) {
        const qQueueGlobal = query(
          collection(db, "submissions"), 
          where("status", "in", ["Pending", "In Review"]), 
          where("isResubmitted", "==", false), 
          where("isExceptional", "==", false)
        );
        unsubQueue = onSnapshot(qQueueGlobal, (s) => setCounts(prev => ({ ...prev, reviewQueue: s.size })));
      } else {
        const qQueueLocal = query(
          collection(db, "submissions"), 
          where("branch", "in", assigned), 
          where("isResubmitted", "==", false), 
          where("isExceptional", "==", false)
        );
        unsubQueue = onSnapshot(qQueueLocal, (s) => {
          const count = s.docs.filter(d => ["Pending", "In Review"].includes(d.data().status)).length;
          setCounts(prev => ({ ...prev, reviewQueue: count }));
        });
      }

      // Resubmitted: Cases corrected by Branch Officers
      if (isGlobalReviewer) {
        const qResubGlobal = query(
          collection(db, "submissions"), 
          where("isResubmitted", "==", true), 
          where("status", "in", ["Pending", "In Review"])
        );
        unsubResub = onSnapshot(qResubGlobal, (s) => setCounts(prev => ({ ...prev, resubmitted: s.size })));
      } else {
        const qResubLocal = query(
          collection(db, "submissions"), 
          where("isResubmitted", "==", true), 
          where("branch", "in", assigned)
        );
        unsubResub = onSnapshot(qResubLocal, (s) => {
          const count = s.docs.filter(d => ["Pending", "In Review"].includes(d.data().status)).length;
          setCounts(prev => ({ ...prev, resubmitted: count }));
        });
      }

      // Escalated: High-priority cases
      const qEsc = isGlobalReviewer
        ? query(collection(db, "submissions"), where("status", "==", "Escalated"))
        : query(collection(db, "submissions"), where("status", "==", "Escalated"), where("branch", "in", assigned));
      
      unsubEsc = onSnapshot(qEsc, (snapshot) => {
        setCounts(prev => ({ ...prev, escalated: snapshot.size }));
      });
    }

    // 5. Branch Node Queue: Overall volume tracking
    let unsubBranch = () => {};
    if (isAdmin) {
      // Admin sees global active volume
      const qBranchGlobal = query(
        collection(db, "submissions"),
        where("status", "in", ["Pending", "In Review", "Amended"])
      );
      unsubBranch = onSnapshot(qBranchGlobal, (snapshot) => {
        setCounts(prev => ({ ...prev, branchNode: snapshot.size }));
      });
    } else if (user.role === 'Branch Manager' && user.branch) {
      const qBranch = query(
        collection(db, "submissions"),
        where("branch", "==", user.branch),
        where("status", "in", ["Pending", "In Review", "Amended"])
      );
      unsubBranch = onSnapshot(qBranch, (snapshot) => {
        setCounts(prev => ({ ...prev, branchNode: snapshot.size }));
      });
    }

    return () => {
      unsubMy();
      unsubAction();
      unsubExceptional();
      unsubQueue();
      unsubResub();
      unsubEsc();
      unsubBranch();
    };
  }, [db, user?.name, user?.role, user?.assignedBranches, user?.district, user?.branch]);

  return counts;
}
