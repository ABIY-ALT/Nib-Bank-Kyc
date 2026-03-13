
'use client';

import { Button } from "@/components/ui/button";
import { ShieldAlert, ArrowLeft, Home } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";

export default function UnauthorizedPage() {
  const router = useRouter();

  return (
    <div className="min-h-screen bg-background flex flex-col items-center justify-center p-4">
      <div className="max-w-md w-full text-center space-y-8 animate-in fade-in zoom-in-95 duration-500">
        <div className="relative flex justify-center">
          <div className="p-6 bg-red-50 rounded-[2.5rem] border-4 border-card shadow-2xl dark:bg-red-950">
            <ShieldAlert className="w-20 h-20 text-red-600" />
          </div>
          <div className="absolute -top-2 -right-2 bg-red-600 text-white text-[10px] font-black uppercase px-3 py-1 rounded-full shadow-lg">
            Access Denied
          </div>
        </div>

        <div className="space-y-3">
          <h1 className="text-4xl font-black text-foreground font-headline tracking-tight">Security Restriction</h1>
          <p className="text-muted-foreground text-lg font-medium leading-relaxed">
            Your institutional credentials do not grant authorization for this specific network node.
          </p>
        </div>

        <div className="p-6 bg-card border rounded-3xl shadow-xl space-y-4">
          <p className="text-[10px] font-black uppercase tracking-[0.2em] text-muted-foreground">Policy Breach Logged</p>
          <div className="flex flex-col gap-3">
            <Button asChild className="h-14 bg-primary hover:bg-primary/90 text-white font-black rounded-2xl shadow-lg shadow-primary/20 gap-3">
              <Link href="/">
                <Home className="w-5 h-5" />
                Return to Dashboard
              </Link>
            </Button>
            <Button variant="ghost" onClick={() => router.back()} className="h-14 font-bold text-muted-foreground hover:text-foreground gap-2">
              <ArrowLeft className="w-4 h-4" />
              Go Back
            </Button>
          </div>
        </div>

        <p className="text-[10px] font-mono font-bold text-muted-foreground uppercase">
          Ref ID: ERR_AUTH_RESTRICTED_{Date.now().toString().slice(-6)}
        </p>
      </div>
    </div>
  );
}
