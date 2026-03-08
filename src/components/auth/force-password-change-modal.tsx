'use client';

import { useState } from 'react';
import { useAuth } from '@/lib/auth';
import { 
  Dialog, 
  DialogContent,
  DialogHeader, 
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { 
  ShieldCheck, 
  Lock, 
  Loader2, 
  AlertCircle,
  CheckCircle2,
  ChevronRight,
  Eye,
  EyeOff
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { Alert, AlertDescription } from "@/components/ui/alert";

export function ForcePasswordChangeModal() {
  const { user, changePassword, logout } = useAuth();
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
    } catch (err: any) {
      setError(err.message || "Failed to update security profile.");
    } finally {
      setLoading(false);
    }
  };

  if (!user) return null;

  return (
    <Dialog open={true}>
      <DialogContent 
        className="max-w-md p-0 overflow-hidden border-none shadow-2xl animate-in zoom-in-95 duration-300"
        onPointerDownOutside={(e) => e.preventDefault()}
        onEscapeKeyDown={(e) => e.preventDefault()}
      >
        <div className="bg-white">
          <DialogHeader className="bg-orange-50/50 border-b p-8 space-y-0">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-white rounded-lg shadow-sm">
                  <Lock className="w-5 h-5 text-orange-600" />
                </div>
                <DialogTitle className="text-2xl font-black text-slate-900 tracking-tight">
                  Create New Password
                </DialogTitle>
              </div>
              <span className="text-[10px] font-black uppercase tracking-[0.2em] text-orange-400">Security Gate</span>
            </div>
          </DialogHeader>

          <div className="p-8 space-y-8">
            <form onSubmit={handleSubmit} className="space-y-6">
              {error && (
                <Alert variant="destructive" className="animate-in slide-in-from-top-2 border-red-100 bg-red-50 text-red-900">
                  <AlertCircle className="h-4 w-4" />
                  <AlertDescription className="text-xs font-bold">{error}</AlertDescription>
                </Alert>
              )}

              <div className="space-y-2">
                <Label className="text-[10px] font-black uppercase tracking-widest text-slate-500">New Password</Label>
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

              <div className="p-5 rounded-2xl bg-blue-50 border border-blue-100 flex gap-4">
                <div className="p-2 bg-white rounded-full h-fit shadow-sm">
                  <ShieldCheck className="w-5 h-5 text-blue-600 shrink-0" />
                </div>
                <p className="text-[11px] text-blue-800 font-medium leading-relaxed">
                  Use at least 8 characters with a mix of letters, numbers, and symbols.
                </p>
              </div>

              <Button 
                type="submit" 
                className="w-full h-14 bg-primary hover:bg-primary/90 text-white font-black text-lg shadow-xl shadow-primary/20 gap-2 transition-all active:scale-[0.98]"
                disabled={loading}
              >
                {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : null}
                Change New Password
                <ChevronRight className="w-5 h-5" />
              </Button>
            </form>

            <div className="pt-4 border-t flex justify-center">
              <Button 
                variant="ghost" 
                size="sm" 
                onClick={() => logout()} 
                className="text-[10px] font-bold text-slate-400 uppercase tracking-widest hover:text-slate-600 hover:bg-slate-50"
              >
                Abort and Logout
              </Button>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
