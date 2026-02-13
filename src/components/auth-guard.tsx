
'use client';

import { useAuth } from '@/lib/auth-mock';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { Loader2, ShieldCheck } from 'lucide-react';

export function AuthGuard({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    if (!loading && !user && pathname !== '/login') {
      router.push('/login');
    }
  }, [user, loading, pathname, router]);

  if (loading) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-[#FCFAF7] gap-4">
        <div className="relative">
          <Loader2 className="w-12 h-12 animate-spin text-primary" />
          <ShieldCheck className="w-6 h-6 text-primary absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2" />
        </div>
        <div className="text-center space-y-1">
          <p className="font-black text-slate-900 tracking-tight">Nib Institutional Gateway</p>
          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Verifying Secure Session...</p>
        </div>
      </div>
    );
  }

  if (!user && pathname !== '/login') {
    return null;
  }

  return <>{children}</>;
}
