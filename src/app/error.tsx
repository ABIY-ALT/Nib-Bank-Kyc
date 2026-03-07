
'use client';

import { useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { ShieldAlert, RotateCcw } from 'lucide-react';

/**
 * Institutional Error Boundary.
 * Displays a generic, secure error interface without exposing stack traces or technical metadata.
 */
export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Log the error to internal console for server-side monitoring
    console.error('[Institutional Service Fault]:', error);
  }, [error]);

  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] text-center space-y-6 animate-in fade-in duration-500">
      <div className="p-6 bg-red-50 rounded-[2.5rem] border border-red-100 shadow-sm">
        <ShieldAlert className="w-16 h-16 text-red-600" />
      </div>
      <div className="space-y-2">
        <h2 className="text-2xl font-black text-slate-900 tracking-tight">Institutional Service Fault</h2>
        <p className="text-muted-foreground font-medium max-w-sm mx-auto leading-relaxed">
          An unexpected technical exception has occurred within this node. The event has been cryptographically logged for security review.
        </p>
      </div>
      <div className="flex flex-col gap-3 pt-4">
        <Button onClick={() => reset()} className="bg-primary hover:bg-primary/90 text-white font-black h-12 px-10 rounded-xl shadow-xl gap-2 transition-all active:scale-95">
          <RotateCcw className="w-4 h-4" /> Attempt Recovery
        </Button>
        <p className="text-[10px] font-mono font-bold text-slate-400 uppercase tracking-widest mt-2">
          Event Hash: {error.digest || 'ERR_PROTOCOL_VIOLATION'}
        </p>
      </div>
    </div>
  );
}
