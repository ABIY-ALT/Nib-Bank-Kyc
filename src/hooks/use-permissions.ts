'use client';

import { UserProfile } from "@/lib/auth-mock.tsx";
import { useMemo, useState, useEffect } from "react";
import { getRoleDefinitions } from "@/actions/roles";

export interface PermissionSet {
  canSubmit: boolean;
  canReview: boolean;
  canEscalate: boolean;
  canViewReports: boolean;
  canManageUsers: boolean;
  canManageSystem: boolean;
  canAccessPerformance: boolean;
  canAccessFollowUp: boolean;
  canAccessArchive: boolean;
  canManageFindings: boolean;
}

const EMPTY_PERMISSIONS: PermissionSet = {
  canSubmit: false, canReview: false, canEscalate: false, 
  canViewReports: false, canManageUsers: false, canManageSystem: false,
  canAccessPerformance: false, canAccessFollowUp: false, canAccessArchive: false,
  canManageFindings: false
};

// System protected ADMIN role fallback
const ADMIN_PERMISSIONS: PermissionSet = { 
  canSubmit: true, canReview: true, canEscalate: true, canViewReports: true, 
  canManageUsers: true, canManageSystem: true, canAccessPerformance: true,
  canAccessFollowUp: true, canAccessArchive: true, canManageFindings: true
};

export function usePermissions(user: UserProfile | null) {
  const [dbDefinitions, setDbDefinitions] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadDefinitions() {
      try {
        const data = await getRoleDefinitions();
        setDbDefinitions(data);
      } catch (e) {
        console.error("Failed to load institutional permissions:", e);
      } finally {
        setLoading(false);
      }
    }
    loadDefinitions();
  }, []);

  const permissions = useMemo((): PermissionSet => {
    if (!user) return EMPTY_PERMISSIONS;
    
    // 1. Protected Admin bypass
    if (user.role === 'ADMIN' || user.role === 'SUPER_ADMIN') return ADMIN_PERMISSIONS;

    // 2. Dynamic lookup in SQL RoleDefinition table
    const dbMatch = dbDefinitions.find(d => d.name === user.role);
    
    if (dbMatch) {
      return {
        canSubmit: !!dbMatch.canSubmit,
        canReview: !!dbMatch.canReview,
        canEscalate: !!dbMatch.canEscalate,
        canViewReports: !!dbMatch.canViewReports,
        canManageUsers: !!dbMatch.canManageUsers,
        canManageSystem: !!dbMatch.canManageSystem,
        canAccessPerformance: !!dbMatch.canAccessPerformance,
        canAccessFollowUp: !!dbMatch.canAccessFollowUp,
        canAccessArchive: !!dbMatch.canAccessArchive,
        canManageFindings: !!dbMatch.canManageFindings,
      };
    }

    // 3. Secure Default: If role isn't in DB and isn't ADMIN, deny all
    return EMPTY_PERMISSIONS;
  }, [user, dbDefinitions]);

  return { permissions, loading };
}