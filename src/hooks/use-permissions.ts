'use client';

import { useAuth } from "@/lib/auth";
import { useMemo, useCallback } from "react";

/**
 * Production-ready Permission Engine.
 * HARDENED: Grants absolute bypass for SUPER_ADMIN role.
 */
export function usePermissions() {
  const { user, loading: authLoading } = useAuth();

  const isSuperAdmin = useMemo(() => {
    if (!user) return false;
    
    // Check direct role string from JWT payload
    if ((user as any).role === 'SUPER_ADMIN') return true;

    // Check serializable roles array
    return user.roles?.some((ur: any) => {
      const name = ur.role?.name || ur.name;
      return name === 'SUPER_ADMIN';
    });
  }, [user]);

  const permissionsSlugs = useMemo(() => {
    const aggregatedSlugs = new Set<string>();
    if (!user) return aggregatedSlugs;

    user.roles?.forEach((userRoleRel: any) => {
      const role = userRoleRel.role || userRoleRel;
      if (role?.permissions) {
        role.permissions.forEach((permRel: any) => {
          const slug = permRel.permission?.slug || permRel.slug;
          if (slug) aggregatedSlugs.add(slug);
        });
      }
    });

    return aggregatedSlugs;
  }, [user]);

  const hasPermission = useCallback((slug: string) => {
    // RULE: Master Override for Super Admin (Full Access)
    if (isSuperAdmin) return true;
    return permissionsSlugs.has(slug);
  }, [isSuperAdmin, permissionsSlugs]);
  
  const hasAnyInGroup = useCallback((group: string) => {
    // RULE: Master Override for Super Admin (Full Access)
    if (isSuperAdmin) return true;
    if (!user || !user.roles) return false;
    
    return user.roles.some((ur: any) => {
      const role = ur.role || ur;
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
    loading: authLoading,
    canManageFindings: isSuperAdmin || permissionsSlugs.has('VIEW_FQ_LIBRARY')
  };
}

export function usePermission(slug: string) {
  const { hasPermission, loading } = usePermissions();
  return { allowed: hasPermission(slug), loading };
}