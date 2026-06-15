'use client';

import { useAuth } from '@/lib/auth';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useMemo } from 'react';
import { Loader2 } from 'lucide-react';
import { getRouteAccessDecision } from '@/lib/access-control';

const PUBLIC_ROUTES = new Set([
  '/login',
  '/unauthorized',
  '/auth/setup-password',
  '/auth/complete-password-reset',
]);

export function AuthGuard({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const isPublicRoute = PUBLIC_ROUTES.has(pathname || "");
  const accessDecision = useMemo(() => {
    if (isPublicRoute) {
      return { allowed: true };
    }

    return getRouteAccessDecision(user, pathname || '/');
  }, [isPublicRoute, pathname, user]);

  useEffect(() => {
    if (!loading && !accessDecision.allowed && accessDecision.redirectTo) {
      router.replace(accessDecision.redirectTo);
    }
  }, [accessDecision, loading, router]);

  if (loading && !isPublicRoute) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-[#FCFAF7]">
        <Loader2 className="w-16 h-16 animate-spin text-primary" />
      </div>
    );
  }

  if (!accessDecision.allowed && !isPublicRoute) {
    return null;
  }

  return <>{children}</>;
}
