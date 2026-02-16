'use client';

import { useState, useEffect } from 'react';
import { useFirestore } from "@/firebase";
import { collection, query, where, onSnapshot } from "firebase/firestore";
import { User } from "@/lib/auth-mock";
import { firebaseConfig } from "@/firebase/config";

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

  const isMockMode = !firebaseConfig.apiKey || firebaseConfig.apiKey === 'undefined' || firebaseConfig.apiKey === 'INITIALIZING';

  useEffect(() => {
    if (!db || !user?.name || isMockMode) {
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

    const isAdmin = user.role === 'ADMIN';

    const qMy = isAdmin 
      ? query(collection(db, "submissions"))
      : query(collection(db, "submissions"), where("submittedBy", "==", user.name));
      
    const unsubMy = onSnapshot(qMy, (snapshot) => {
      const allDocs = snapshot.docs.map(d => d.data());
      setCounts(prev => ({ 
        ...prev, 
        mySubmissions: isAdmin ? allDocs.length : allDocs.filter(d => d.submittedBy === user.name).length,
        actionRequired: allDocs.filter(d => d.status === 'AMENDED' && (isAdmin || d.submittedBy === user.name)).length
      }));
    }, (err) => console.warn("My queue sync bypassed:", err.message));

    const qExceptional = query(
      collection(db, "submissions"),
      where("isExceptional", "==", true)
    );
    const unsubExceptional = onSnapshot(qExceptional, (snapshot) => {
      const activeExceptions = snapshot.docs.filter(doc => {
        const data = doc.data();
        const isClosed = ["COMPLETED", "REJECTED", "NONE"].includes(data.exceptionalStatus);
        if (isClosed) return false;

        if (isAdmin) return true;
        if (user.role === 'DISTRICT_DIRECTOR') return data.exceptionalStatus === 'AWAITING_DISTRICT' && data.district === user.district;
        if (user.role === 'BRANCH_BANKING_DIRECTOR') return data.exceptionalStatus === 'AWAITING_DIRECTOR';
        if (user.role === 'CHIEF_RETAIL_SME_OFFICER') return data.exceptionalStatus === 'AWAITING_CHIEF';
        if (user.role === 'DIVISION_MANAGER') return data.exceptionalStatus === 'AWAITING_DIVISION';
        if (user.role === 'SUPERVISOR') return data.exceptionalStatus === 'AWAITING_SUPERVISOR';
        
        const scope = user.role === 'BRANCH_MANAGER' ? [user.branch] : (user.assignedBranches || []);
        return scope.includes(data.branch);
      });
      setCounts(prev => ({ ...prev, exceptional: activeExceptions.length }));
    }, (err) => console.warn("Exceptional sync bypassed:", err.message));

    const qAllActive = query(
      collection(db, "submissions"),
      where("status", "in", ["PENDING", "IN_REVIEW", "ESCALATED"])
    );
    const unsubQueues = onSnapshot(qAllActive, (snapshot) => {
      const docs = snapshot.docs.map(d => d.data());
      
      const filterByScope = (data: any) => {
        if (isAdmin) return true;
        if (user.role === 'DISTRICT_DIRECTOR') return data.district === user.district;

        const isGlobalReviewer = ['BRANCH_BANKING_DIRECTOR', 'SUPERVISOR', 'DIVISION_MANAGER', 'CHIEF_RETAIL_SME_OFFICER'].includes(user.role || '');
        if (isGlobalReviewer) return true;
        
        const assigned = user.assignedBranches || [];
        return assigned.includes(data.branch);
      };

      setCounts(prev => ({
        ...prev,
        reviewQueue: docs.filter(d => d.status !== 'ESCALATED' && d.isResubmitted === false && d.isExceptional === false && filterByScope(d)).length,
        resubmitted: docs.filter(d => d.status !== 'ESCALATED' && d.isResubmitted === true && filterByScope(d)).length,
        escalated: docs.filter(d => d.status === 'ESCALATED' && filterByScope(d)).length
      }));
    }, (err) => console.warn("Review queue sync bypassed:", err.message));

    let unsubBranch = () => {};
    if (isAdmin || user.branch || user.role === 'DISTRICT_DIRECTOR') {
      const qBranch = isAdmin 
        ? query(collection(db, "submissions"))
        : user.role === 'DISTRICT_DIRECTOR'
        ? query(collection(db, "submissions"), where("district", "==", user.district))
        : query(collection(db, "submissions"), where("branch", "==", user.branch));
        
      unsubBranch = onSnapshot(qBranch, (snapshot) => {
        const activeStatuses = ["PENDING", "IN_REVIEW", "AMENDED"];
        const count = snapshot.docs.filter(d => {
          const data = d.data();
          const matchesStatus = activeStatuses.includes(data.status);
          if (isAdmin) return matchesStatus;
          if (user.role === 'DISTRICT_DIRECTOR') return matchesStatus && data.district === user.district;
          return matchesStatus && data.branch === user.branch;
        }).length;
        setCounts(prev => ({ ...prev, branchNode: count }));
      }, (err) => console.warn("Branch sync bypassed:", err.message));
    }

    return () => {
      unsubMy();
      unsubExceptional();
      unsubQueues();
      unsubBranch();
    };
  }, [db, user?.name, user?.role, user?.assignedBranches, user?.district, user?.branch, isMockMode]);

  return counts;
}
