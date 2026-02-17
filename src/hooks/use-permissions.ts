'use client';

import { UserProfile } from "@/lib/auth-mock.tsx";
import { useMemo, useState, useEffect } from "react";
import { UserRole } from "@prisma/client";
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

const DEFAULT_PERMISSIONS: Record<string, PermissionSet> = {
  [UserRole.ADMIN]: { 
    canSubmit: true, canReview: true, canEscalate: true, canViewReports: true, 
    canManageUsers: true, canManageSystem: true, canAccessPerformance: true,
    canAccessFollowUp: true, canAccessArchive: true 
  },
  [UserRole.KYC_OFFICER]: { 
    canSubmit: false, canReview: true, canEscalate: false, canViewReports: false, 
    canManageUsers: false, canManageSystem: false, canAccessPerformance: false,
    canAccessFollowUp: false, canAccessArchive: true 
  },
  [UserRole.SUPERVISOR]: { 
    canSubmit: false, canReview: true, canEscalate: true, canViewReports: true, 
    canManageUsers: false, canManageSystem: false, canAccessPerformance: true,
    canAccessFollowUp: true, canAccessArchive: true 
  },
  [UserRole.BRANCH_OFFICER]: { 
    canSubmit: true, canReview: false, canEscalate: false, canViewReports: false, 
    canManageUsers: false, canManageSystem: false, canAccessPerformance: false,
    canAccessFollowUp: false, canAccessArchive: false 
  },
  [UserRole.FOLLOW_UP_TEAM]: { 
    canSubmit: false, canReview: false, canEscalate: false, canViewReports: true, 
    canManageUsers: false, canManageSystem: false, canAccessPerformance: false,
    canAccessFollowUp: true, canAccessArchive: false 
  },
  [UserRole.BRANCH_MANAGER]: { 
    canSubmit: true, canReview: false, canEscalate: true, canViewReports: true, 
    canManageUsers: false, canManageSystem: false, canAccessPerformance: true,
    canAccessFollowUp: false, canAccessArchive: true 
  },
  [UserRole.DISTRICT_DIRECTOR]: { 
    canSubmit: true, canReview: false, canEscalate: true, canViewReports: true, 
    canManageUsers: false, canManageSystem: false, canAccessPerformance: true,
    canAccessFollowUp: false, canAccessArchive: true 
  }
};

export function usePermissions(user: UserProfile | null) {
  const [dbDefinitions, setDbDefinitions] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadDefinitions() {
      const data = await getRoleDefinitions();
      setDbDefinitions(data);
      setLoading(false);
    }
    loadDefinitions();
  }, []);

  const permissions = useMemo((): PermissionSet => {
    if (!user) return {
      canSubmit: false, canReview: false, canEscalate: false, 
      canViewReports: false, canManageUsers: false, canManageSystem: false,
      canAccessPerformance: false, canAccessFollowUp: false, canAccessArchive: false
    };

    const roleName = user.role;
    
    // Check if there's a dynamic override in the DB
    const dbMatch = dbDefinitions.find(d => d.name === roleName);
    if (dbMatch) {
      return {
        canSubmit: dbMatch.canSubmit,
        canReview: dbMatch.canReview,
        canEscalate: dbMatch.canEscalate,
        canViewReports: dbMatch.canViewReports,
        canManageUsers: dbMatch.canManageUsers,
        canManageSystem: dbMatch.canManageSystem,
        canAccessPerformance: dbMatch.canAccessPerformance ?? false,
        canAccessFollowUp: dbMatch.canAccessFollowUp ?? false,
        canAccessArchive: dbMatch.canAccessArchive ?? false,
      };
    }

    // Fallback to defaults
    return DEFAULT_PERMISSIONS[roleName] || {
      canSubmit: false, // Default to false for unknown roles
      canReview: false, 
      canEscalate: false, 
      canViewReports: false, 
      canManageUsers: false, 
      canManageSystem: false,
      canAccessPerformance: false,
      canAccessFollowUp: false, 
      canAccessArchive: false
    };
  }, [user, dbDefinitions]);

  return { permissions, loading };
}
