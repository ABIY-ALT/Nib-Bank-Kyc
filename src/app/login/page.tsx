'use client';

import { useState, useEffect, Suspense } from 'react';
import { useAuth } from '@/lib/auth';
import { useRouter, useSearchParams } from 'next/navigation';
import { 
  Card, 
  CardContent, 
  CardHeader, 
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { 
  ShieldCheck, 
  Mail, 
  Lock, 
  Loader2, 
  AlertCircle,
  Building2,
  ChevronRight,
  Eye,
  EyeOff,
  Landmark
} from "lucide-react";
import { cn } from "@/lib/utils";
import { isValidInternalRedirect } from '@/lib/url-security';

/**
 * Institutional Authentication Gateway.
 * Wrapped in Suspense to handle search parameter hydration in Next.js 15.
 */
export default function LoginPage() {
  return (
    <div className="min-h-screen bg-[#FCFAF7] flex flex-col items-center justify-center p-4">
      <Suspense fallback={
        <div className="flex flex-col items-center space-y-4">
          <Loader2 className="w-10 h-10 animate-spin text-primary" />
          <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Synchronizing Gateway...</p>
        </div>
      }>
        <LoginContent />
      </Suspense>
    </div>
  );
}

function LoginContent() {
  const { login, user } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();
  
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (user) {
      const callbackUrl = searchParams.get('callbackUrl');
      const target = isValidInternalRedirect(callbackUrl) ? callbackUrl! : '/';
      router.push(target);
    }
  }, [user, router, searchParams]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      await login(email, password);
      
      const callbackUrl = searchParams.get('callbackUrl');
      const target = isValidInternalRedirect(callbackUrl) ? callbackUrl! : '/';
      router.push(target);
    } catch (err: any) {
      setError(err.message || "Invalid institutional credentials.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="w-full max-w-md space-y-8 animate-in fade-in zoom-in-95 duration-500">
      {/* INSTITUTIONAL LOGO SECTION */}
      <div className="flex flex-col items-center text-center space-y-4 mb-2">
        <div className="flex items-center gap-3">
          <div className="p-3 bg-primary text-white rounded-2xl shadow-xl">
            <Landmark className="w-8 h-8" />
          </div>
          <h1 className="text-4xl font-black text-slate-900 tracking-tighter">NIB BANK <span className="text-primary">KYC</span></h1>
        </div>
        <p className="text-slate-500 text-lg font-medium">Secure institutional access portal.</p>
      </div>

      <Card className="shadow-2xl border-slate-200 overflow-hidden rounded-2xl bg-white">
        <CardHeader className="bg-white border-b p-8 py-6">
          <div className="flex items-center justify-between">
            <CardTitle className="text-xl font-black flex items-center gap-2 text-slate-800">
              <Building2 className="w-5 h-5 text-[#B89334]" />
              Staff Login
            </CardTitle>
            <span className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400">SECURE</span>
          </div>
        </CardHeader>
        <CardContent className="pt-8 px-8 pb-10 space-y-8">
          <form onSubmit={handleSubmit} className="space-y-8">
            {error && (
              <div className="animate-in slide-in-from-top-2">
                <div className="flex items-start gap-4 p-5 rounded-2xl border border-red-200 bg-red-50/30">
                  <div className="p-2 bg-white rounded-full shadow-sm mt-0.5">
                    <AlertCircle className="h-5 w-5 text-red-500 shrink-0" />
                  </div>
                  <span className="text-sm font-bold text-red-600 leading-relaxed">
                    {error}
                  </span>
                </div>
              </div>
            )}

            <div className="space-y-3">
              <Label className="text-[10px] font-black uppercase tracking-widest text-slate-400">Official Bank Email</Label>
              <div className="relative">
                <Mail className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                <Input 
                  type="email" 
                  placeholder="admin.user@nibbank.com.et" 
                  className="pl-12 h-14 bg-[#EBF2FF] border-slate-100 font-black text-slate-900 rounded-xl focus-visible:ring-[#B89334]/20 transition-all shadow-inner"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                />
              </div>
            </div>

            <div className="space-y-3">
              <Label className="text-[10px] font-black uppercase tracking-widest text-slate-400">Password</Label>
              <div className="relative">
                <Lock className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                <Input 
                  type={showPassword ? "text" : "password"} 
                  placeholder="••••••••" 
                  className="pl-12 pr-12 h-14 bg-white border-2 border-[#B89334]/40 focus:border-[#B89334] font-black text-slate-900 rounded-xl focus-visible:ring-[#B89334]/20 transition-all"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 focus:outline-none transition-colors"
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            <Button 
              type="submit" 
              className="w-full h-16 bg-[#B89334] hover:bg-[#A6822D] text-white font-black text-2xl rounded-xl shadow-xl shadow-[#B89334]/20 gap-2 transition-all active:scale-[0.98]"
              disabled={loading}
            >
              {loading ? <Loader2 className="w-6 h-6 animate-spin" /> : null}
              Login
              <ChevronRight className="w-6 h-6 stroke-[4px]" />
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
