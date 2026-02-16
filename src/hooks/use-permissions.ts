
'use client';

import { useFirestore, useDoc, useMemoFirebase } from "@/firebase";
import { doc } from "firebase/firestore";
import { User, UserRole } from "@/lib/auth-mock.tsx";
import { useMemo } from "react";

export interface PermissionSet {
  canSubmit: boolean;
  canReview: boolean;
  canEscalate: boolean;
  canViewReports: boolean;
  canManageUsers: boolean;
  canManageSystem: boolean;
}

/**
 * Hook to resolve functional permissions for the current user.
 * Merges hardcoded system roles with dynamic roles from roleDefinitions.
 */
export function usePermissions(user: User | null) {
  const db = useFirestore();
  
  // Resolve role ID for custom roles (normalized slug)
  const roleId = useMemo(() => {
    return user?.role?.toLowerCase().replace(/\s+/g, '-') || null;
  }, [user?.role]);

  const roleRef = useMemoFirebase(() => {
    return db && roleId ? doc(db, "roleDefinitions", roleId) : null;
  }, [db, roleId]);

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

    // SYSTEM LOCKED ROLES (Hardcoded defaults for core safety)
    if (role === 'Admin') return {
      canSubmit: true, canReview: true, canEscalate: true, canViewReports: true, canManageUsers: true, canManageSystem: true
    };

    if (role === 'KYC Officer') return {
      canSubmit: true, canReview: true, canEscalate: false, canViewReports: false, canManageUsers: false, canManageSystem: false
    };

    if (role === 'Supervisor') return {
      canSubmit: true, canReview: true, canEscalate: true, canViewReports: true, canManageUsers: false, canManageSystem: false
    };

    if (role === 'Branch Officer') return {
      canSubmit: true, canReview: false, canEscalate: false, canViewReports: false, canManageUsers: false, canManageSystem: false
    };

    if (role === 'Follow-up Team') return {
      canSubmit: false, canReview: false, canEscalate: false, canViewReports: true, canManageUsers: false, canManageSystem: false
    };

    // MANAGEMENT ROLES
    if (['Branch Manager', 'District Director', 'Branch Banking Director', 'Division Manager', 'Chief Retail & SME Banking Officer', 'Chief'].includes(role || '')) {
      return {
        canSubmit: true, 
        canReview: false, 
        canEscalate: true, 
        canViewReports: true, 
        canManageUsers: false, 
        canManageSystem: false
      };
    }

    // DYNAMIC CUSTOM ROLES (Resolved from Firestore)
    if (dynamicRole?.permissions) {
      return dynamicRole.permissions;
    }

    // FALLBACK (No permissions)
    return {
      canSubmit: false, canReview: false, canEscalate: false, canViewReports: false, canManageUsers: false, canManageSystem: false
    };
  }, [user, dynamicRole]);

  return { permissions, loading };
}
