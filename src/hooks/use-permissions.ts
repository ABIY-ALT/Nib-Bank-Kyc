'use client';

import { UserProfile } from "@/lib/auth-mock.tsx";
import { useMemo } from "react";
import { UserRole } from "@prisma/client";

export interface PermissionSet {
  canSubmit: boolean;
  canReview: boolean;
  canEscalate: boolean;
  canViewReports: boolean;
  canManageUsers: boolean;
  canManageSystem: boolean;
}

export function usePermissions(user: UserProfile | null) {
  const permissions = useMemo((): PermissionSet => {
    if (!user) return {
      canSubmit: false, canReview: false, canEscalate: false, 
      canViewReports: false, canManageUsers: false, canManageSystem: false
    };

    const role = user.role;

    if (role === UserRole.ADMIN) return {
      canSubmit: true, canReview: true, canEscalate: true, canViewReports: true, canManageUsers: true, canManageSystem: true
    };

    if (role === UserRole.KYC_OFFICER) return {
      canSubmit: true, canReview: true, canEscalate: false, canViewReports: false, canManageUsers: false, canManageSystem: false
    };

    if (role === UserRole.SUPERVISOR) return {
      canSubmit: true, canReview: true, canEscalate: true, canViewReports: true, canManageUsers: false, canManageSystem: false
    };

    if (role === UserRole.BRANCH_OFFICER) return {
      canSubmit: true, canReview: false, canEscalate: false, canViewReports: false, canManageUsers: false, canManageSystem: false
    };

    if (role === UserRole.FOLLOW_UP_TEAM) return {
      canSubmit: false, canReview: false, canEscalate: false, canViewReports: true, canManageUsers: false, canManageSystem: false
    };

    return {
      canSubmit: true, canReview: false, canEscalate: true, canViewReports: true, canManageUsers: false, canManageSystem: false
    };
  }, [user]);

  return { permissions, loading: false };
}
