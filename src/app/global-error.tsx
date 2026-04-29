'use client';

import { Button } from '@/components/ui/button';
import { ShieldAlert, Landmark } from 'lucide-react';
import { useEffect, useState } from 'react';

function createClientTraceId(prefix: string): string {
  return `${prefix}_${crypto.randomUUID().replace(/-/g, '').slice(0, 12).toUpperCase()}`;
}

/**
 * Critical Gateway Error Page.
 * Standardized fallback for root-level failures with no disclosure.
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const [traceId, setTraceId] = useState("");

  useEffect(() => {
    setTraceId(error.digest || createClientTraceId('FATAL'));
  }, [error]);

  return (
    <html lang="en" className="scroll-smooth">
      <body className="font-sans antialiased bg-background text-foreground">
        <div className="min-h-screen flex flex-col items-center justify-center p-4 text-center space-y-8">
          <div className="p-10 bg-card rounded-[3rem] shadow-2xl border max-w-md w-full animate-in zoom-in-95 duration-500">
            <div className="p-6 bg-red-50 rounded-full w-fit mx-auto mb-8 shadow-inner dark:bg-red-950">
              <ShieldAlert className="w-16 h-16 text-red-600" />
            </div>
            
            <div className="space-y-3 mb-10">
              <div className="flex items-center justify-center gap-2 mb-2">
                <Landmark className="w-4 h-4 text-primary" />
                <span className="text-[10px] font-black uppercase tracking-[0.2em] text-muted-foreground">Nib Bank Institutional</span>
              </div>
              <h1 className="text-3xl font-black text-foreground tracking-tight">System Disruption</h1>
              <p className="text-muted-foreground font-medium leading-relaxed">
                A critical institutional gateway failure has been detected. Operational access is temporarily suspended for security preservation.
              </p>
            </div>

            <Button onClick={() => reset()} className="w-full h-16 bg-primary text-white font-black text-lg rounded-2xl shadow-2xl shadow-primary/20 hover:bg-primary/90 transition-all active:scale-95">
              Initialize System Reset
            </Button>

            {traceId && (
              <div className="mt-10 pt-6 border-t">
                <p className="text-[10px] font-mono font-bold text-muted-foreground uppercase tracking-tighter">
                  Support Ref: {traceId}
                </p>
              </div>
            )}
          </div>
        </div>
      </body>
    </html>
  );
}
