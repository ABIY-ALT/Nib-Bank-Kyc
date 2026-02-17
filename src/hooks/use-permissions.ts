
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
}

// System defaults for when the database isn't initialized yet or for critical fallback
const HARDCODED_DEFAULTS: Record<string, PermissionSet> = {
  "ADMIN": { 
    canSubmit: true, canReview: true, canEscalate: true, canViewReports: true, 
    canManageUsers: true, canManageSystem: true, canAccessPerformance: true,
    canAccessFollowUp: true, canAccessArchive: true 
  },
  "KYC_OFFICER": { 
    canSubmit: false, canReview: true, canEscalate: false, canViewReports: false, 
    canManageUsers: false, canManageSystem: false, canAccessPerformance: false,
    canAccessFollowUp: false, canAccessArchive: true 
  },
  "BRANCH_OFFICER": { 
    canSubmit: true, canReview: false, canEscalate: false, canViewReports: false, 
    canManageUsers: false, canManageSystem: false, canAccessPerformance: false,
    canAccessFollowUp: false, canAccessArchive: false 
  }
};

const EMPTY_PERMISSIONS: PermissionSet = {
  canSubmit: false, canReview: false, canEscalate: false, 
  canViewReports: false, canManageUsers: false, canManageSystem: false,
  canAccessPerformance: false, canAccessFollowUp: false, canAccessArchive: false
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

    // 1. Check for dynamic lookup in SQL RoleDefinition table
    const roleName = user.role;
    const dbMatch = dbDefinitions.find(d => d.name === roleName);
    
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
      };
    }

    // 2. Fallback to baseline hardcoded defaults if DB isn't seeded yet
    return HARDCODED_DEFAULTS[roleName] || EMPTY_PERMISSIONS;
  }, [user, dbDefinitions]);

  return { permissions, loading };
}
