
'use client';

import { useState, useEffect } from 'react';
import { useFirestore, useMemoFirebase } from "@/firebase";
import { collection, query, where, onSnapshot } from "firebase/firestore";
import { User } from "@/lib/auth-mock";

/**
 * Hook to fetch real-time counts for sidebar badges.
 * In a large enterprise production environment, these counts should be 
 * read from a single 'stats' document updated by Cloud Functions.
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

  // 1. My Submissions
  useEffect(() => {
    if (!db || !user.name) return;
    const q = query(collection(db, "submissions"), where("submittedBy", "==", user.name));
    return onSnapshot(q, (snapshot) => {
      setCounts(prev => ({ ...prev, mySubmissions: snapshot.size }));
    });
  }, [db, user.name]);

  // 2. Action Required (My Amended Submissions)
  useEffect(() => {
    if (!db || !user.name) return;
    const q = query(
      collection(db, "submissions"), 
      where("submittedBy", "==", user.name),
      where("status", "==", "Amended")
    );
    return onSnapshot(q, (snapshot) => {
      setCounts(prev => ({ ...prev, actionRequired: snapshot.size }));
    });
  }, [db, user.name]);

  // 3. Review Queue (Roles aware + Portfolio aware)
  useEffect(() => {
    if (!db) return;
    const isGlobalReviewer = ['Admin', 'Director', 'Supervisor'].includes(user.role || '');
    const assigned = user.assignedBranches || [];
    
    let q;
    if (isGlobalReviewer) {
      q = query(
        collection(db, "submissions"),
        where("status", "in", ["Pending", "In Review"]),
        where("isResubmitted", "==", false)
      );
    } else if (assigned.length > 0) {
      q = query(
        collection(db, "submissions"),
        where("status", "in", ["Pending", "In Review"]),
        where("branch", "in", assigned),
        where("isResubmitted", "==", false)
      );
    } else {
      return;
    }

    return onSnapshot(q, (snapshot) => {
      setCounts(prev => ({ ...prev, reviewQueue: snapshot.size }));
    });
  }, [db, user.role, user.assignedBranches]);

  // 4. Resubmitted Cases
  useEffect(() => {
    if (!db) return;
    const isGlobalReviewer = ['Admin', 'Director', 'Supervisor'].includes(user.role || '');
    const assigned = user.assignedBranches || [];
    
    let q;
    if (isGlobalReviewer) {
      q = query(
        collection(db, "submissions"),
        where("isResubmitted", "==", true),
        where("status", "in", ["Pending", "In Review"])
      );
    } else if (assigned.length > 0) {
      q = query(
        collection(db, "submissions"),
        where("isResubmitted", "==", true),
        where("branch", "in", assigned),
        where("status", "in", ["Pending", "In Review"])
      );
    } else {
      return;
    }

    return onSnapshot(q, (snapshot) => {
      setCounts(prev => ({ ...prev, resubmitted: snapshot.size }));
    });
  }, [db, user.role, user.assignedBranches]);

  // 5. Escalated Cases
  useEffect(() => {
    if (!db) return;
    const isGlobalReviewer = ['Admin', 'Director', 'Supervisor'].includes(user.role || '');
    const assigned = user.assignedBranches || [];
    
    let q;
    if (isGlobalReviewer) {
      q = query(
        collection(db, "submissions"),
        where("status", "==", "Escalated")
      );
    } else if (assigned.length > 0) {
      q = query(
        collection(db, "submissions"),
        where("status", "==", "Escalated"),
        where("branch", "in", assigned)
      );
    } else {
      return;
    }

    return onSnapshot(q, (snapshot) => {
      setCounts(prev => ({ ...prev, escalated: snapshot.size }));
    });
  }, [db, user.role, user.assignedBranches]);

  return counts;
}
