'use client';

import { useFirestore, useDoc, useMemoFirebase } from "@/firebase";
import { doc } from "firebase/firestore";
import { User } from "@/lib/auth-mock.tsx";
import { useMemo } from "react";
import { firebaseConfig } from "@/firebase/config";

export interface PermissionSet {
  canSubmit: boolean;
  canReview: boolean;
  canEscalate: boolean;
  canViewReports: boolean;
  canManageUsers: boolean;
  canManageSystem: boolean;
}

export function usePermissions(user: User | null) {
  const db = useFirestore();
  
  const isMockMode = !firebaseConfig.apiKey || firebaseConfig.apiKey === 'undefined' || firebaseConfig.apiKey === 'INITIALIZING';

  const roleId = useMemo(() => {
    return user?.role?.toLowerCase().replace(/\s+/g, '-') || null;
  }, [user?.role]);

  const roleRef = useMemoFirebase(() => {
    return db && roleId && !isMockMode ? doc(db, "roleDefinitions", roleId) : null;
  }, [db, roleId, isMockMode]);

  const { data: dynamicRole, loading } = useDoc<{ permissions: PermissionSet }>(roleRef);

  const permissions = useMemo((): PermissionSet => {
    if (!user) return {
      canSubmit: false,
      canReview: false,
      canEscalate: false,
      canViewReports: false,
      canManageUsers: false,
      canManageSystem: false
    };

    const role = user.role;

    if (role === 'ADMIN') return {
      canSubmit: true, canReview: true, canEscalate: true, canViewReports: true, canManageUsers: true, canManageSystem: true
    };

    if (role === 'KYC_OFFICER') return {
      canSubmit: true, canReview: true, canEscalate: false, canViewReports: false, canManageUsers: false, canManageSystem: false
    };

    if (role === 'SUPERVISOR') return {
      canSubmit: true, canReview: true, canEscalate: true, canViewReports: true, canManageUsers: false, canManageSystem: false
    };

    if (role === 'BRANCH_OFFICER') return {
      canSubmit: true, canReview: false, canEscalate: false, canViewReports: false, canManageUsers: false, canManageSystem: false
    };

    if (role === 'FOLLOW_UP_TEAM') return {
      canSubmit: false, canReview: false, canEscalate: false, canViewReports: true, canManageUsers: false, canManageSystem: false
    };

    if (['BRANCH_MANAGER', 'DISTRICT_DIRECTOR', 'BRANCH_BANKING_DIRECTOR', 'DIVISION_MANAGER', 'CHIEF_RETAIL_SME_OFFICER', 'CHIEF'].includes(role || '')) {
      return {
        canSubmit: true, 
        canReview: false, 
        canEscalate: true, 
        canViewReports: true, 
        canManageUsers: false, 
        canManageSystem: false
      };
    }

    if (dynamicRole?.permissions) {
      return dynamicRole.permissions;
    }

    return {
      canSubmit: false,
      canReview: false,
      canEscalate: false,
      canViewReports: false,
      canManageUsers: false,
      canManageSystem: false
    };
  }, [user, dynamicRole]);

  return { permissions, loading: isMockMode ? false : loading };
}
