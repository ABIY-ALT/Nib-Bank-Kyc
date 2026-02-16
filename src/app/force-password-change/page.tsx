
'use client';

import { useState } from 'react';
import { useAuth } from '@/lib/auth-mock';
import { useRouter } from 'next/navigation';
import { 
  Card, 
  CardContent, 
  CardHeader, 
  CardTitle,
  CardFooter
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { 
  ShieldCheck, 
  Lock, 
  Loader2, 
  AlertCircle,
  ShieldAlert,
  CheckCircle2,
  ChevronRight,
  Eye,
  EyeOff
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { Alert, AlertDescription } from "@/components/ui/alert";

export default function ForcePasswordChangePage() {
  const { user, changePassword, logout } = useAuth();
  const router = useRouter();
  const { toast } = useToast();
  
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    if (newPassword.length < 8) {
      setError("Institutional policy requires at least 8 characters.");
      setLoading(false);
      return;
    }

    if (newPassword !== confirmPassword) {
      setError("Passwords do not match.");
      setLoading(false);
      return;
    }

    try {
      await changePassword(newPassword);
      toast({
        title: "Security Profile Updated",
        description: "Your new institutional credential has been established.",
      });
      router.push('/');
    } catch (err: any) {
      setError(err.message || "Failed to update security profile.");
    } finally {
      setLoading(false);
    }
  };

  if (!user) return null;

  return (
    <div className="min-h-screen bg-[#FCFAF7] flex flex-col items-center justify-center p-4">
      <div className="w-full max-w-md space-y-8 animate-in fade-in zoom-in-95 duration-500">
        <div className="flex flex-col items-center text-center space-y-2 mb-4">
          <div className="p-4 bg-orange-100 rounded-2xl mb-4 flex items-center justify-center">
            <ShieldAlert className="w-10 h-10 text-orange-600" />
          </div>
          <h1 className="text-4xl font-black text-slate-900 font-headline tracking-tight">Security Required</h1>
          <p className="text-slate-500 text-lg font-medium">You must establish a private password before accessing institutional operations.</p>
        </div>

        <Card className="shadow-2xl border-orange-200 overflow-hidden">
          <CardHeader className="bg-orange-50 border-b p-8">
            <div className="flex items-center justify-between">
              <CardTitle className="text-xl font-bold flex items-center gap-2 text-orange-800">
                <Lock className="w-5 h-5 text-orange-600" />
                Establish New Credential
              </CardTitle>
              <span className="text-[10px] font-black uppercase tracking-widest text-orange-400">Security Gate</span>
            </div>
          </CardHeader>
          <CardContent className="pt-8 px-8 pb-8 bg-white">
            <form onSubmit={handleSubmit} className="space-y-6">
              {error && (
                <Alert variant="destructive" className="animate-in slide-in-from-top-2">
                  <AlertCircle className="h-4 w-4" />
                  <AlertDescription className="text-xs font-bold">{error}</AlertDescription>
                </Alert>
              )}

              <div className="space-y-2">
                <Label className="text-[10px] font-black uppercase tracking-widest text-slate-500">New Institutional Password</Label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                  <Input 
                    type={showPassword ? "text" : "password"} 
                    placeholder="••••••••" 
                    className="pl-10 pr-10 h-12 bg-slate-50/50 border-slate-200 font-bold"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
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

              <div className="space-y-2">
                <Label className="text-[10px] font-black uppercase tracking-widest text-slate-500">Confirm Password</Label>
                <div className="relative">
                  <CheckCircle2 className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                  <Input 
                    type={showPassword ? "text" : "password"} 
                    placeholder="••••••••" 
                    className="pl-10 pr-10 h-12 bg-slate-50/50 border-slate-200 font-bold"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    required
                  />
                </div>
              </div>

              <div className="p-4 rounded-xl bg-blue-50 border border-blue-100 flex gap-3">
                <ShieldCheck className="w-5 h-5 text-blue-600 shrink-0" />
                <p className="text-[10px] text-blue-800 font-medium leading-relaxed">
                  <strong>Policy Reminder:</strong> Use at least 8 characters with a mix of letters, numbers, and symbols. Your password is cryptographically secured.
                </p>
              </div>

              <Button 
                type="submit" 
                className="w-full h-14 bg-primary hover:bg-primary/90 text-white font-black text-lg shadow-xl shadow-primary/20 gap-2 transition-all active:scale-[0.98]"
                disabled={loading}
              >
                {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : null}
                Establish Security Profile
                <ChevronRight className="w-5 h-5" />
              </Button>
            </form>
          </CardContent>
          <CardFooter className="bg-slate-50 border-t p-4 flex justify-center">
            <Button variant="ghost" size="sm" onClick={() => logout()} className="text-[10px] font-bold text-slate-400 uppercase tracking-widest hover:text-slate-600">
              Abort and Logout
            </Button>
          </CardFooter>
        </Card>
      </div>
    </div>
  );
}
