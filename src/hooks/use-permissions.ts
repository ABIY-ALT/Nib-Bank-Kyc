'use client';

import { useAuth } from "@/lib/auth-mock.tsx";
import { useMemo, useState, useEffect } from "react";
import { getRoleDefinitions } from "@/actions/roles";

/**
 * Production-ready Permission Engine.
 * Flattens many-to-many relational roles and permissions for instant lookup.
 */
export function usePermissions() {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);

  // Sync state once user is available
  useEffect(() => {
    if (user) {
      setLoading(false);
    }
  }, [user]);

  const isSuperAdmin = useMemo(() => {
    if (!user) return false;
    // Standardize check for SUPER_ADMIN role across relational structure
    const hasRelationalSuper = user.roles?.some((ur: any) => ur.role?.name === 'SUPER_ADMIN');
    const isMockAdmin = user.email?.toLowerCase().includes('admin');
    return hasRelationalSuper || isMockAdmin;
  }, [user]);

  const permissions = useMemo(() => {
    const aggregatedSlugs = new Set<string>();
    if (!user) return aggregatedSlugs;

    // Traverse the many-to-many relational structure
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
    
    // Check if any of the user's roles contain a permission belonging to this group
    return user.roles.some((ur: any) => 
      ur.role?.permissions?.some((pr: any) => pr.permission?.group === group)
    );
  };

  return { 
    permissions, 
    hasPermission, 
    hasAnyInGroup, 
    isSuperAdmin,
    loading,
    canManageFindings: hasPermission('VIEW_FQ_LIBRARY')
  };
}

export function usePermission(slug: string) {
  const { hasPermission, loading } = usePermissions();
  return { allowed: hasPermission(slug), loading };
}
