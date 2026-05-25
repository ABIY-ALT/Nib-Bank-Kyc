
'use client';

import { useAuth } from "@/lib/auth";
import { useMemo, useCallback } from "react";
import { getPermissionSlugs, isSuperAdminUser, normalizePermissionSlug } from "@/lib/access-control";

/**
 * Production-ready Permission Engine.
 * HARDENED: Grants absolute bypass for SUPER_ADMIN role.
 */
export function usePermissions() {
  const { user, loading: authLoading } = useAuth();

  const isSuperAdmin = useMemo(() => {
    return isSuperAdminUser(user);
  }, [user]);

  const permissionsSlugs = useMemo(() => {
    return getPermissionSlugs(user);
  }, [user]);

  const hasPermission = useCallback((slug: string) => {
    // RULE: Master Override for Super Admin (Full Access)
    if (isSuperAdmin) return true;
    return permissionsSlugs.has(normalizePermissionSlug(slug));
  }, [isSuperAdmin, permissionsSlugs]);
  
  const hasAnyInGroup = useCallback((group: string) => {
    // RULE: Master Override for Super Admin (Full Access)
    if (isSuperAdmin) return true;
    if (!user || !user.roles) return false;
    
    return user.roles.some((ur: any) => {
      const role = ur.role || ur;
      if (!role?.name || role.active === false) return false;
      return role.permissions?.some((pr: any) => {
        const p = pr.permission || pr;
        return p.group === group;
      });
    });
  }, [isSuperAdmin, user]);

  return { 
    permissions: permissionsSlugs, 
    hasPermission, 
    hasAnyInGroup, 
    isSuperAdmin,
    loading: authLoading
  };
}

export function usePermission(slug: string) {
  const { hasPermission, loading } = usePermissions();
  return { allowed: hasPermission(slug), loading };
}
