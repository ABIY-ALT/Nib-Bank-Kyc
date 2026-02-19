'use client';

import { useAuth } from "@/lib/auth-mock.tsx";
import { useMemo } from "react";

/**
 * Production-ready Permission Engine.
 * Optimized to prevent unmount flickers by deriving loading from Auth context.
 */
export function usePermissions() {
  const { user, loading: authLoading } = useAuth();

  const isSuperAdmin = useMemo(() => {
    if (!user) return false;
    const hasRelationalSuper = user.roles?.some((ur: any) => ur.role?.name === 'SUPER_ADMIN');
    const isMockAdmin = user.email?.toLowerCase().includes('admin');
    return hasRelationalSuper || isMockAdmin;
  }, [user]);

  const permissions = useMemo(() => {
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

  const hasPermission = (slug: string) => isSuperAdmin || permissions.has(slug);
  
  const hasAnyInGroup = (group: string) => {
    if (isSuperAdmin) return true;
    if (!user || !user.roles) return false;
    
    return user.roles.some((ur: any) => 
      ur.role?.permissions?.some((pr: any) => pr.permission?.group === group)
    );
  };

  return { 
    permissions, 
    hasPermission, 
    hasAnyInGroup, 
    isSuperAdmin,
    loading: authLoading, // Direct derivation prevents navigation lag
    canManageFindings: hasPermission('VIEW_FQ_LIBRARY')
  };
}

export function usePermission(slug: string) {
  const { hasPermission, loading } = usePermissions();
  return { allowed: hasPermission(slug), loading };
}
