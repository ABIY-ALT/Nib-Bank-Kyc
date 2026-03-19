'use client';

import { useState, useEffect } from 'react';
import { useAuth } from '@/lib/auth';
import { useRouter } from 'next/navigation';
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { 
  KeyRound, 
  Loader2, 
  ShieldCheck, 
  Copy, 
  Mail,
  AlertCircle,
  UserCheck,
  ArrowLeft
} from "lucide-react";
import { resetUserPassword } from '@/actions/users';
import { tempPasswordRegistry } from '@/lib/temp-password-registry';
import Link from 'next/link';
import { usePermissions } from '@/hooks/use-permissions';
import { SYSTEM_SECTION_COPY } from '@/lib/access-ui';

export default function AdminPasswordResetPage() {
  const router = useRouter();
  const { user: currentUser } = useAuth();
  const { isSuperAdmin, loading: permissionsLoading } = usePermissions();
  const { toast } = useToast();
  
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<{ tempPass: string, name: string } | null>(null);

  useEffect(() => {
    if (!permissionsLoading && !isSuperAdmin) {
      router.push('/unauthorized?required=SUPER_ADMIN');
    }
  }, [isSuperAdmin, permissionsLoading, router]);

  const handleReset = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim() || !currentUser) return;

    setLoading(true);
    setResult(null);
    try {
      const res = await resetUserPassword(email, currentUser.id);
      if (res.success) {
        setResult({ tempPass: res.tempPassword!, name: res.userName! });
        
        // Persist to session registry for hover view in User Directory
        tempPasswordRegistry.add(email, res.tempPassword!);
        
        toast({ title: "Successful", description: `Credential rotated for ${res.userName}.` });
      } else {
        toast({ variant: "destructive", title: "Reset Denied", description: res.error });
      }
    } catch (e) {
      toast({ variant: "destructive", title: "System Fault", description: "Internal security service error." });
    } finally {
      setLoading(false);
    }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    toast({ title: "Successful", description: "Credential saved to clipboard." });
  };

  if (permissionsLoading) {
    return (
      <div className="flex flex-col items-center justify-center py-24 gap-4">
        <Loader2 className="w-10 h-10 animate-spin text-primary" />
        <p className="font-bold text-muted-foreground uppercase tracking-widest text-[10px]">Verifying Clearance...</p>
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto space-y-0 animate-in fade-in duration-500 pb-20 pt-10 px-4 md:px-0">
      {/* NAVIGATION HEADER */}
      <div className="mb-8">
        <Button asChild variant="ghost" className="h-10 px-4 -ml-4 text-muted-foreground hover:text-primary font-bold gap-2 group transition-all">
          <Link href="/admin/users">
            <ArrowLeft className="w-4 h-4 transition-transform group-hover:-translate-x-1" />
            Back to {SYSTEM_SECTION_COPY.USER_CREATE.label}
          </Link>
        </Button>
      </div>

      {/* INSTITUTIONAL HEADER */}
      <div className="rounded-t-[2.5rem] bg-[#3E2B1E] p-12 shadow-2xl flex items-center gap-8 border-b border-white/5">
        <div className="p-5 bg-white/5 rounded-full shadow-inner ring-1 ring-white/10 shrink-0">
          <KeyRound className="w-12 h-12 text-[#B89334]" />
        </div>
        <div>
          <h1 className="text-3xl font-black text-[#B89334] tracking-tight">Reset a User's Password</h1>
          <p className="text-white/60 font-bold text-lg mt-1">Quickly issue a temporary password for any user.</p>
        </div>
      </div>

      {/* ACTION CARD */}
      <Card className="border-none shadow-2xl shadow-black/10 bg-card rounded-b-[2.5rem] overflow-hidden -mt-8">
        <CardContent className="p-12 space-y-10">
          <form onSubmit={handleReset} className="space-y-6">
            <div className="space-y-4">
              <Label className="text-lg font-bold text-foreground pl-1">User's Bank Email</Label>
              <div className="flex flex-col md:flex-row gap-4">
                <div className="relative flex-1">
                  <Mail className="absolute left-5 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
                  <Input 
                    placeholder="Enter outlook or bank email..." 
                    className="h-16 pl-14 bg-background border font-bold text-lg rounded-2xl focus-visible:ring-[#B89334]/20 transition-all shadow-inner"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                  />
                </div>
                <Button 
                  type="submit" 
                  disabled={loading}
                  className="h-16 px-12 bg-[#B89334] hover:bg-[#A6822D] text-white font-black text-lg rounded-2xl shadow-xl shadow-[#B89334]/20 transition-all active:scale-[0.98] min-w-[200px]"
                >
                  {loading ? <Loader2 className="w-6 h-6 animate-spin" /> : "Find User"}
                </Button>
              </div>
              <p className="text-sm text-muted-foreground font-medium pl-1">
                Enter the official bank email tied to the user's account. A temporary password will be set.
              </p>
            </div>
          </form>

          {/* RESULT CONSOLE */}
          {result && (
            <div className="animate-in zoom-in-95 duration-500 p-8 rounded-[2.5rem] bg-emerald-50 border-2 border-emerald-100 border-dashed space-y-8">
              <div className="flex items-center gap-5">
                <div className="p-4 bg-emerald-500 text-white rounded-2xl shadow-lg">
                  <UserCheck className="w-8 h-8" />
                </div>
                <div>
                  <p className="text-[11px] font-black uppercase text-emerald-600 tracking-widest leading-none">Discovery Successful</p>
                  <p className="text-2xl font-black text-foreground mt-1">{result.name}</p>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-8 items-end">
                <div className="space-y-3">
                  <Label className="text-[11px] font-black uppercase text-emerald-600 tracking-widest">Generated Temporary Credential</Label>
                  <div className="flex items-center gap-4 bg-white p-5 rounded-2xl border border-emerald-200 shadow-sm group">
                    <code className="text-3xl font-mono font-black text-[#B89334] tracking-[0.2em] flex-1 text-center">{result.tempPass}</code>
                    <Button 
                      variant="ghost" 
                      size="icon" 
                      onClick={() => copyToClipboard(result.tempPass)}
                      className="h-14 w-14 hover:bg-emerald-50 text-emerald-600 rounded-xl transition-all"
                    >
                      <Copy className="w-6 h-6" />
                    </Button>
                  </div>
                </div>
                <div className="bg-white p-6 rounded-2xl border border-emerald-100 flex gap-5 shadow-sm">
                  <AlertCircle className="w-6 h-6 text-emerald-500 shrink-0" />
                  <p className="text-sm text-slate-600 leading-relaxed font-medium">
                    This password is valid for one-time use. The system will force a rotation upon the next login attempt at the Gateway.
                  </p>
                </div>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* POLICY REMINDER FOOTER */}
      <div className="mt-10 flex items-center gap-5 p-8 bg-slate-50/50 rounded-[2.5rem] border border-slate-100 border-dashed">
        <div className="p-3 bg-white rounded-xl shadow-sm">
          <ShieldCheck className="w-6 h-6 text-[#B89334]" />
        </div>
        <p className="text-[11px] text-slate-500 font-bold uppercase tracking-[0.1em] leading-relaxed">
          Protocol: All administrative rotations are cryptographically logged in the master audit vault for compliance and identity preservation.
        </p>
      </div>
    </div>
  );
}
