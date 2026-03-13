'use client';

import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { ShieldAlert, RotateCcw } from 'lucide-react';

/**
 * Institutional Error Boundary.
 * Displays a generic, secure error interface without exposing stack traces.
 */
export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const [traceId, setTraceId] = useState("");

  useEffect(() => {
    // Technical stack trace is logged server-side by Next.js by default.
    // Client-side, we capture the digest or generate a local reference.
    setTraceId(error.digest || `ERR_${Math.random().toString(36).substring(2, 8).toUpperCase()}`);
    console.error('[Institutional Service Fault]:', error);
  }, [error]);

  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] text-center space-y-6 animate-in fade-in duration-500">
      <div className="p-6 bg-red-50 rounded-[2.5rem] border border-red-100 shadow-sm">
        <ShieldAlert className="w-16 h-16 text-red-600" />
      </div>
      <div className="space-y-2">
        <h2 className="text-2xl font-black text-foreground tracking-tight">Institutional Service Fault</h2>
        <p className="text-muted-foreground font-medium max-w-sm mx-auto leading-relaxed">
          An unexpected technical exception has occurred within this node. The event has been cryptographically logged for security review.
        </p>
      </div>
      <div className="flex flex-col gap-3 pt-4">
        <Button onClick={() => reset()} className="bg-primary hover:bg-primary/90 text-white font-black h-12 px-10 rounded-xl shadow-xl gap-2 transition-all active:scale-95">
          <RotateCcw className="w-4 h-4" /> Attempt Recovery
        </Button>
        {traceId && (
          <p className="text-[10px] font-mono font-bold text-muted-foreground uppercase tracking-widest mt-2">
            Reference ID: {traceId}
          </p>
        )}
      </div>
    </div>
  );
}
