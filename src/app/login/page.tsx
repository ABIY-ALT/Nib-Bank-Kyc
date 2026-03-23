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
  Mail, 
  Lock, 
  Loader2, 
  AlertCircle,
  Building2,
  ChevronRight,
  Eye,
  EyeOff
} from "lucide-react";
import { isValidInternalRedirect } from '@/lib/url-security';
import { LogoResponsive } from '@/components/logo';
import { getInstitutionalLoginInputValue } from '@/lib/login-identifier';

export default function LoginPage() {
  return (
    <div className="min-h-screen bg-background flex flex-col items-center justify-center p-4">
      <Suspense fallback={
        <div className="flex flex-col items-center space-y-4">
          <Loader2 className="w-10 h-10 animate-spin text-primary" />
          <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Synchronizing Gateway...</p>
        </div>
      }>
        <LoginContent />
      </Suspense>
    </div>
  );
}

function LoginContent() {
  const { login, user, loading: authLoading } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();
  
  const [loginId, setLoginId] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const callbackUrl = searchParams?.get('callbackUrl');
  const redirectTarget = isValidInternalRedirect(callbackUrl) ? callbackUrl! : '/';

  useEffect(() => {
    if (!authLoading && user) {
      router.replace(redirectTarget);
    }
  }, [authLoading, user, router, redirectTarget]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      await login(loginId, password);
      
      router.replace(redirectTarget);
    } catch (err: any) {
      setError(err.message || "Invalid username or password.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="w-full max-w-md space-y-8 animate-in fade-in zoom-in-95 duration-500">
      <div className="flex flex-col items-center text-center space-y-4 mb-2">
        <LogoResponsive />
        <div className="space-y-1">
          <h1 className="text-4xl font-black text-foreground tracking-tighter">NIB BANK <span className="text-primary">KYC</span></h1>
          <p className="text-muted-foreground text-lg font-medium"></p>
        </div>
      </div>

      <Card className="shadow-2xl border overflow-hidden rounded-3xl bg-card">
        <CardHeader className="bg-card border-b p-8 py-6">
          <div className="flex items-center justify-between">
            <CardTitle className="text-xl font-black flex items-center gap-2 text-foreground">
              <Building2 className="w-5 h-5 text-[#B89334]" />
              Staff Login
            </CardTitle>
            <span className="text-[10px] font-black uppercase tracking-[0.2em] text-muted-foreground">SECURE</span>
          </div>
        </CardHeader>
        <CardContent className="pt-8 px-8 pb-10 space-y-8">
          <form onSubmit={handleSubmit} className="space-y-8">
            {error && (
              <div className="animate-in slide-in-from-top-2">
                <div className="flex items-start gap-4 p-5 rounded-2xl border border-red-200 bg-red-50/30">
                <div className="p-2 bg-card rounded-full shadow-sm mt-0.5">
                    <AlertCircle className="h-5 w-5 text-red-500 shrink-0" />
                  </div>
                  <span className="text-sm font-bold text-red-600 leading-relaxed">
                    {error}
                  </span>
                </div>
              </div>
            )}

            <div className="space-y-3">
              <Label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Official Username</Label>
              <div className="relative">
                <Mail className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input 
                  type="text"
                  inputMode="text"
                  autoComplete="username"
                  autoCapitalize="none"
                  autoCorrect="off"
                  spellCheck={false}
                  placeholder="firstname.surname"
                  className="pl-12 h-14 bg-background border font-black text-foreground rounded-xl focus-visible:ring-[#B89334]/20 transition-all shadow-inner"
                  value={loginId}
                  onChange={(e) => setLoginId(getInstitutionalLoginInputValue(e.target.value))}
                  required
                />
              </div>
              <p className="text-xs text-muted-foreground font-medium">Enter your registered first name, then a dot, then your surname.</p>
            </div>

            <div className="space-y-3">
              <Label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Password</Label>
              <div className="relative">
                <Lock className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input 
                  type={showPassword ? "text" : "password"} 
                  placeholder="••••••••" 
                  className="pl-12 pr-12 h-14 bg-background border-2 focus:border-[#B89334] font-black text-foreground rounded-xl focus-visible:ring-[#B89334]/20 transition-all"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-4 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground focus:outline-none transition-colors"
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
