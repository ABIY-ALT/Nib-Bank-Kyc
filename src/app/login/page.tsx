'use client';

import { useState } from 'react';
import { useAuth } from '@/lib/auth-mock';
import { useRouter } from 'next/navigation';
import { 
  Card, 
  CardContent, 
  CardDescription, 
  CardHeader, 
  CardTitle,
  CardFooter
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
  EyeOff
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { Alert, AlertDescription } from "@/components/ui/alert";

export default function LoginPage() {
  const { login, loginAs, allUsers } = useAuth();
  const router = useRouter();
  const { toast } = useToast();
  
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      await login(email, password);
      router.push('/');
    } catch (err: any) {
      setError(err.message || "Institutional authentication failed. Check credentials.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#FCFAF7] flex flex-col items-center justify-center p-4">
      <div className="w-full max-w-md space-y-8 animate-in fade-in zoom-in-95 duration-500">
        <div className="flex flex-col items-center text-center space-y-2">
          <div className="p-5 bg-primary rounded-2xl shadow-xl mb-4 flex items-center justify-center">
            <ShieldCheck className="w-12 h-12 text-white" />
          </div>
          <h1 className="text-4xl font-black text-slate-900 font-headline tracking-tighter">Nib Kyc</h1>
          <p className="text-slate-500 font-bold uppercase tracking-widest text-xs">Identity Management Gateway</p>
        </div>

        <Card className="shadow-2xl border-slate-200 overflow-hidden">
          <CardHeader className="bg-slate-50/50 border-b p-8">
            <CardTitle className="text-xl font-bold flex items-center gap-2">
              <Building2 className="w-5 h-5 text-primary" />
              Institutional Sign-in
            </CardTitle>
            <CardDescription className="font-medium">Enter your bank credentials to access the KYC environment.</CardDescription>
          </CardHeader>
          <CardContent className="pt-8 px-8">
            <form onSubmit={handleSubmit} className="space-y-6">
              {error && (
                <Alert variant="destructive" className="animate-in slide-in-from-top-2">
                  <AlertCircle className="h-4 w-4" />
                  <AlertDescription className="text-xs font-bold">{error}</AlertDescription>
                </Alert>
              )}

              <div className="space-y-2">
                <div className="flex justify-between items-center">
                  <Label className="text-[10px] font-black uppercase tracking-widest text-slate-500">Official Bank Email</Label>
                  <span className="text-[9px] font-bold text-primary">format: First.Last@nibbank.com.et</span>
                </div>
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                  <Input 
                    type="email" 
                    placeholder="Test.Test@nibbank.com.et" 
                    className="pl-10 h-12 bg-slate-50/50 border-slate-200 font-bold"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label className="text-[10px] font-black uppercase tracking-widest text-slate-500">Password</Label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                  <Input 
                    type={showPassword ? "text" : "password"} 
                    placeholder="••••••••" 
                    className="pl-10 pr-10 h-12 bg-slate-50/50 border-slate-200 font-bold"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 focus:outline-none transition-colors"
                  >
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              <Button 
                type="submit" 
                className="w-full h-14 bg-primary hover:bg-primary/90 text-white font-black text-lg shadow-xl shadow-primary/20 gap-2"
                disabled={loading}
              >
                {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : null}
                Authorize Access
                <ChevronRight className="w-5 h-5" />
              </Button>
            </form>
          </CardContent>
          <CardFooter className="bg-slate-50/50 border-t p-6 flex flex-col gap-4">
            <div className="flex items-center gap-2 text-[10px] font-bold text-slate-400 uppercase tracking-widest">
              <AlertCircle className="w-3.5 h-3.5" /> Security Notice
            </div>
            <p className="text-[10px] text-slate-500 leading-relaxed italic">
              Institutional access is restricted to authorized @nibbank.com.et addresses. All access events are logged for regulatory audit.
            </p>
          </CardFooter>
        </Card>

        {/* Prototype Switching Tool - To be removed in prod */}
        <div className="pt-8 border-t border-dashed space-y-4">
          <p className="text-center text-[10px] font-black uppercase text-slate-400 tracking-widest">Prototype Entry Points</p>
          <div className="flex flex-wrap justify-center gap-2">
            {allUsers.map(u => (
              <Button 
                key={u.id} 
                variant="outline" 
                size="sm" 
                className="text-[10px] h-8 font-bold border-slate-200 hover:bg-white"
                onClick={() => loginAs(u.id)}
              >
                {u.role}
              </Button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
