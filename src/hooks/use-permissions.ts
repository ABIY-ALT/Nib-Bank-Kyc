'use client';

import { useAuth } from "@/lib/auth-mock.tsx";
import { useMemo, useCallback } from "react";

/**
 * Production-ready Permission Engine.
 * Optimized with useCallback to prevent infinite update loops in the UI Shell.
 */
export function usePermissions() {
  const { user, loading: authLoading } = useAuth();

  const isSuperAdmin = useMemo(() => {
    if (!user) return false;
    return user.roles?.some((ur: any) => ur.role?.name === 'SUPER_ADMIN');
  }, [user]);

  const permissionsSlugs = useMemo(() => {
    const aggregatedSlugs = new Set<string>();
    if (!user) return aggregatedSlugs;

    user.roles?.forEach((userRoleRel: any) => {
      const role = userRoleRel.role;
      if (role?.permissions) {
        role.permissions.forEach((permRel: any) => {
          if (permRel.permission?.slug) {
            aggregatedSlugs.add(permRel.permission.slug);
          }
        });
      }
    });

    return aggregatedSlugs;
  }, [user]);

  const hasPermission = useCallback((slug: string) => {
    return isSuperAdmin || permissionsSlugs.has(slug);
  }, [isSuperAdmin, permissionsSlugs]);
  
  const hasAnyInGroup = useCallback((group: string) => {
    if (isSuperAdmin) return true;
    if (!user || !user.roles) return false;
    
    return user.roles.some((ur: any) => 
      ur.role?.permissions?.some((pr: any) => pr.permission?.group === group)
    );
  }, [isSuperAdmin, user]);

  return { 
    permissions: permissionsSlugs, 
    hasPermission, 
    hasAnyInGroup, 
    isSuperAdmin,
    loading: authLoading,
    canManageFindings: hasPermission('VIEW_FQ_LIBRARY')
  };
}

export function usePermission(slug: string) {
  const { hasPermission, loading } = usePermissions();
  return { allowed: hasPermission(slug), loading };
}
