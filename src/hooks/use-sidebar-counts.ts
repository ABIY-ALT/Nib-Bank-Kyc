
'use client';

import { useState, useEffect } from 'react';
import { useFirestore } from "@/firebase";
import { collection, query, where, onSnapshot } from "firebase/firestore";
import { User } from "@/lib/auth-mock";

/**
 * Hook to fetch real-time counts for sidebar badges.
 * Optimized for institutional workflow segregation.
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

    // 1. My Submissions
    const qMy = query(
      collection(db, "submissions"), 
      where("submittedBy", "==", user.name)
    );
    const unsubMy = onSnapshot(qMy, (snapshot) => {
      setCounts(prev => ({ ...prev, mySubmissions: snapshot.size }));
    });

    // 2. Action Required
    const qAction = query(
      collection(db, "submissions"), 
      where("submittedBy", "==", user.name),
      where("status", "==", "Amended")
    );
    const unsubAction = onSnapshot(qAction, (snapshot) => {
      setCounts(prev => ({ ...prev, actionRequired: snapshot.size }));
    });

    // 3. Exceptional Approvals (Role-based filtering)
    let qExceptional;
    if (user.role === 'District Director') {
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
    } else if (user.role === 'Admin') {
      qExceptional = query(
        collection(db, "submissions"),
        where("isExceptional", "==", true)
      );
    } else if (user.role === 'Branch Manager') {
      qExceptional = query(
        collection(db, "submissions"),
        where("isExceptional", "==", true),
        where("branch", "==", user.branch || "")
      );
    }

    const unsubExceptional = qExceptional ? onSnapshot(qExceptional, (snapshot) => {
      setCounts(prev => ({ ...prev, exceptional: snapshot.size }));
    }) : () => {};

    // 4. Review Queues (Normal KYC)
    const isGlobalReviewer = ['Admin', 'Director', 'Supervisor'].includes(user.role || '');
    const assigned = user.assignedBranches || [];
    const canReview = isGlobalReviewer || (user.role === 'KYC Officer' && assigned.length > 0);

    let unsubQueue = () => {};
    let unsubResub = () => {};
    let unsubEsc = () => {};

    if (canReview) {
      // Review Queue
      let qQueue = isGlobalReviewer 
        ? query(collection(db, "submissions"), where("status", "in", ["Pending", "In Review"]), where("isResubmitted", "==", false), where("isExceptional", "==", false))
        : query(collection(db, "submissions"), where("status", "in", ["Pending", "In Review"]), where("branch", "in", assigned), where("isResubmitted", "==", false), where("isExceptional", "==", false));
      
      unsubQueue = onSnapshot(qQueue, (snapshot) => {
        setCounts(prev => ({ ...prev, reviewQueue: snapshot.size }));
      });

      // Resubmitted
      let qResub = isGlobalReviewer
        ? query(collection(db, "submissions"), where("isResubmitted", "==", true), where("status", "in", ["Pending", "In Review"]))
        : query(collection(db, "submissions"), where("isResubmitted", "==", true), where("branch", "in", assigned), where("status", "in", ["Pending", "In Review"]));
      
      unsubResub = onSnapshot(qResub, (snapshot) => {
        setCounts(prev => ({ ...prev, resubmitted: snapshot.size }));
      });

      // Escalated
      let qEsc = isGlobalReviewer
        ? query(collection(db, "submissions"), where("status", "==", "Escalated"))
        : query(collection(db, "submissions"), where("status", "==", "Escalated"), where("branch", "in", assigned));
      
      unsubEsc = onSnapshot(qEsc, (snapshot) => {
        setCounts(prev => ({ ...prev, escalated: snapshot.size }));
      });
    }

    // 5. Branch Node Queue (For Branch Managers)
    let unsubBranch = () => {};
    if (user.role === 'Branch Manager' && user.branch) {
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
