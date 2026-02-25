'use client';

import { useAuth } from '@/lib/auth';
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
      <div className="min-h-screen flex flex-col items-center justify-center bg-[#FCFAF7] gap-6">
        <div className="relative flex items-center justify-center">
          <div className="bg-primary p-6 rounded-2xl shadow-2xl animate-pulse">
            <ShieldCheck className="w-12 h-12 text-white" />
          </div>
          <Loader2 className="w-24 h-24 animate-spin text-primary/20 absolute" />
        </div>
        <div className="text-center space-y-1">
          <p className="font-black text-slate-900 tracking-tighter text-xl">Nib Institutional Gateway</p>
          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-[0.2em]">Verifying Secure Session...</p>
        </div>
      </div>
    );
  }

  if (!user && pathname !== '/login') {
    return null;
  }

  return <>{children}</>;
}
