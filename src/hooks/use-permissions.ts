'use client';

import { useAuth } from "@/lib/auth-mock.tsx";
import { useMemo, useState, useEffect } from "react";
import { getRoleDefinitions } from "@/actions/roles";

export function usePermissions() {
  const { user } = useAuth();
  const [dbRoles, setDbRoles] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadPermissions() {
      try {
        const roles = await getRoleDefinitions();
        setDbRoles(roles);
      } catch (e) {
        console.error("Failed to load institutional permissions:", e);
      } finally {
        setLoading(false);
      }
    }
    loadPermissions();
  }, []);

  const permissions = useMemo(() => {
    if (!user || !user.roles) return new Set<string>();
    
    const aggregatedSlugs = new Set<string>();

    // user.roles is an array of UserRole objects which contain a role object
    user.roles.forEach((ur: any) => {
      const roleName = ur.role?.name;
      const dbRole = dbRoles.find(r => r.name === roleName);
      if (dbRole) {
        dbRole.permissions.forEach((rp: any) => {
          aggregatedSlugs.add(rp.permission.slug);
        });
      }
    });

    return aggregatedSlugs;
  }, [user, dbRoles]);

  const hasPermission = (slug: string) => permissions.has(slug);
  
  const hasAnyInGroup = (group: string) => {
    if (!user || !user.roles) return false;
    return dbRoles.some(role => 
      user.roles.some((ur: any) => ur.role?.name === role.name) &&
      role.permissions.some((rp: any) => rp.permission.group === group)
    );
  };

  return { permissions, hasPermission, hasAnyInGroup, loading };
}

export function usePermission(slug: string) {
  const { hasPermission, loading } = usePermissions();
  return { allowed: hasPermission(slug), loading };
}
