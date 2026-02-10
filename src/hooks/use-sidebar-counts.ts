
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
    escalated: 0
  });

  useEffect(() => {
    if (!db || !user?.name) return;

    // 1. My Submissions (All cases submitted by the user)
    const qMy = query(
      collection(db, "submissions"), 
      where("submittedBy", "==", user.name)
    );
    const unsubMy = onSnapshot(qMy, (snapshot) => {
      setCounts(prev => ({ ...prev, mySubmissions: snapshot.size }));
    }, (err) => console.error("My Submissions count error:", err));

    // 2. Action Required (Cases submitted by user that need amendment)
    const qAction = query(
      collection(db, "submissions"), 
      where("submittedBy", "==", user.name),
      where("status", "==", "Amended")
    );
    const unsubAction = onSnapshot(qAction, (snapshot) => {
      setCounts(prev => ({ ...prev, actionRequired: snapshot.size }));
    }, (err) => console.error("Action Required count error:", err));

    // Role-based Reviewer Logic
    const isGlobalReviewer = ['Admin', 'Director', 'Supervisor'].includes(user.role || '');
    const assigned = user.assignedBranches || [];
    const canReview = isGlobalReviewer || assigned.length > 0;

    if (canReview) {
      // 3. Review Queue (Pending/In Review cases that are NOT resubmissions)
      let qQueue;
      if (isGlobalReviewer) {
        qQueue = query(
          collection(db, "submissions"),
          where("status", "in", ["Pending", "In Review"]),
          where("isResubmitted", "==", false)
        );
      } else {
        qQueue = query(
          collection(db, "submissions"),
          where("status", "in", ["Pending", "In Review"]),
          where("branch", "in", assigned),
          where("isResubmitted", "==", false)
        );
      }
      const unsubQueue = onSnapshot(qQueue, (snapshot) => {
        setCounts(prev => ({ ...prev, reviewQueue: snapshot.size }));
      });

      // 4. Resubmitted Cases (Pending/In Review cases that ARE resubmissions)
      let qResub;
      if (isGlobalReviewer) {
        qResub = query(
          collection(db, "submissions"),
          where("isResubmitted", "==", true),
          where("status", "in", ["Pending", "In Review"])
        );
      } else {
        qResub = query(
          collection(db, "submissions"),
          where("isResubmitted", "==", true),
          where("branch", "in", assigned),
          where("status", "in", ["Pending", "In Review"])
        );
      }
      const unsubResub = onSnapshot(qResub, (snapshot) => {
        setCounts(prev => ({ ...prev, resubmitted: snapshot.size }));
      });

      // 5. Escalated Cases
      let qEsc;
      if (isGlobalReviewer) {
        qEsc = query(
          collection(db, "submissions"),
          where("status", "==", "Escalated")
        );
      } else {
        qEsc = query(
          collection(db, "submissions"),
          where("status", "==", "Escalated"),
          where("branch", "in", assigned)
        );
      }
      const unsubEsc = onSnapshot(qEsc, (snapshot) => {
        setCounts(prev => ({ ...prev, escalated: snapshot.size }));
      });

      return () => {
        unsubMy();
        unsubAction();
        unsubQueue();
        unsubResub();
        unsubEsc();
      };
    }

    return () => {
      unsubMy();
      unsubAction();
    };
  }, [db, user?.name, user?.role, user?.assignedBranches]);

  return counts;
}
