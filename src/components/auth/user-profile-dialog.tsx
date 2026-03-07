'use client';

import { useState } from 'react';
import { useAuth } from '@/lib/auth';
import { 
  Dialog, 
  DialogContent,
  DialogHeader, 
  DialogTitle, 
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { Badge } from '@/components/ui/badge';
import { 
  Mail, 
  ShieldCheck, 
  Building2, 
  Lock, 
  KeyRound, 
  Loader2, 
  Eye,
  EyeOff,
  UserCircle,
  CheckCircle2
} from "lucide-react";

export function UserProfileDialog({ children }: { children: React.ReactNode }) {
  const { user, changePassword } = useAuth();
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  
  const [isChangingPassword, setIsChangingPassword] = useState(false);
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);

  const handlePasswordUpdate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (newPassword !== confirmPassword) {
      toast({ variant: "destructive", title: "Update Failed", description: "Passwords do not match." });
      return;
    }
    if (newPassword.length < 8) {
      toast({ variant: "destructive", title: "Update Failed", description: "Institutional policy requires at least 8 characters." });
      return;
    }

    setLoading(true);
    try {
      await changePassword(newPassword);
      toast({ title: "Successful", description: "Your new institutional credential has been established." });
      setIsChangingPassword(false);
      setNewPassword("");
      setConfirmPassword("");
    } catch (e: any) {
      toast({ variant: "destructive", title: "Update Failed", description: e.message || "Database fault during credential reset." });
    } finally {
      setLoading(false);
    }
  };

  const openSecurityConsole = () => {
    setNewPassword("");
    setConfirmPassword("");
    setIsChangingPassword(true);
  };

  if (!user) return null;

  const userInitial = (user.firstName || user.name || "?")[0];

  return (
    <Dialog open={open} onOpenChange={(val) => {
      setOpen(val);
      if (!val) {
        setIsChangingPassword(false);
        setNewPassword("");
        setConfirmPassword("");
      }
    }}>
      <DialogTrigger asChild>
        {children}
      </DialogTrigger>
      <DialogContent className="max-w-md p-0 overflow-hidden border-none shadow-2xl rounded-3xl bg-white">
        <DialogHeader className="p-8 bg-primary text-white space-y-1 relative">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div className="p-3 bg-white/20 rounded-2xl">
                <UserCircle className="w-8 h-8 text-white" />
              </div>
              <div>
                <DialogTitle className="text-2xl font-black tracking-tight text-white leading-none">Staff Profile</DialogTitle>
                <p className="text-white/70 font-bold text-[10px] uppercase tracking-[0.2em] mt-1">Institutional Identity Card</p>
              </div>
            </div>
          </div>
        </DialogHeader>

        <div className="p-8 space-y-8">
          {/* IDENTITY SECTION */}
          <div className="space-y-6">
            <div className="flex items-center gap-5 p-5 rounded-2xl bg-[#F8F9FA] border border-slate-100">
              <div className="w-14 h-14 rounded-full bg-primary/10 text-primary flex items-center justify-center font-black text-xl shadow-inner border border-primary/5">
                {userInitial}
              </div>
              <div className="flex-1">
                <p className="text-[10px] font-black uppercase text-slate-400 tracking-widest">Full Legal Name</p>
                <p className="text-lg font-black text-slate-900 leading-tight">{user.firstName} {user.lastName}</p>
              </div>
            </div>

            <div className="grid grid-cols-1 gap-6 px-1">
              <div className="space-y-1.5">
                <Label className="text-[10px] font-black uppercase text-slate-400 tracking-widest flex items-center gap-2">
                  <Mail className="w-3.5 h-3.5 text-primary/60" /> Official Email
                </Label>
                <p className="text-sm font-black text-slate-700">{user.email}</p>
              </div>
              
              <div className="space-y-1.5">
                <Label className="text-[10px] font-black uppercase text-slate-400 tracking-widest flex items-center gap-2">
                  <ShieldCheck className="w-3.5 h-3.5 text-primary/60" /> Assigned Authority
                </Label>
                <div>
                  <Badge variant="outline" className="bg-primary/5 text-primary border-primary/20 font-black uppercase text-[9px] px-3 py-1 tracking-widest">
                    {user.roles?.[0]?.role.name.replace(/_/g, ' ') || 'Specialist'}
                  </Badge>
                </div>
              </div>

              <div className="space-y-1.5">
                <Label className="text-[10px] font-black uppercase text-slate-400 tracking-widest flex items-center gap-2">
                  <Building2 className="w-3.5 h-3.5 text-primary/60" /> Jurisdiction Node
                </Label>
                <p className="text-sm font-black text-slate-700">{user.branchName || 'Institutional Headquarters'}</p>
              </div>
            </div>
          </div>

          {!isChangingPassword ? (
            <Button 
              variant="outline" 
              className="w-full h-14 rounded-2xl border-slate-200 font-black text-sm gap-3 group hover:border-primary/30 transition-all shadow-sm"
              onClick={openSecurityConsole}
            >
              <KeyRound className="w-5 h-5 text-primary group-hover:scale-110 transition-transform" />
              Change Password
            </Button>
          ) : (
            <form onSubmit={handlePasswordUpdate} className="space-y-6 animate-in slide-in-from-top-4 duration-300">
              <div className="h-px bg-slate-100" />
              
              <div className="space-y-2.5">
                <Label className="text-[10px] font-black uppercase text-slate-500 tracking-widest">New Password</Label>
                <div className="relative">
                  <Lock className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                  <Input 
                    type={showPassword ? "text" : "password"} 
                    className="pl-11 pr-12 h-14 bg-slate-50/50 border-slate-200 font-bold rounded-2xl focus-visible:ring-primary/20 transition-all"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    placeholder="••••••••"
                    autoComplete="new-password"
                    required
                  />
                  <button type="button" onClick={() => setShowPassword(!showPassword)} className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600">
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              <div className="space-y-2.5">
                <Label className="text-[10px] font-black uppercase text-slate-500 tracking-widest">Confirm New Password</Label>
                <div className="relative">
                  <CheckCircle2 className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                  <Input 
                    type={showPassword ? "text" : "password"} 
                    className="pl-11 h-14 bg-slate-50/50 border-slate-200 font-bold rounded-2xl focus-visible:ring-primary/20 transition-all"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    placeholder="••••••••"
                    autoComplete="new-password"
                    required
                  />
                </div>
              </div>

              <div className="flex items-center gap-4 pt-4 border-t border-slate-100">
                <Button 
                  type="button" 
                  variant="ghost" 
                  className="flex-1 h-14 font-black text-sm text-slate-500 hover:text-slate-900"
                  onClick={() => setIsChangingPassword(false)}
                >
                  Cancel
                </Button>
                <Button 
                  type="submit" 
                  className="flex-[2] h-14 bg-primary text-white font-black rounded-2xl shadow-xl shadow-primary/20 hover:bg-primary/90 transition-all active:scale-[0.98]" 
                  disabled={loading}
                >
                  {loading ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
                  Update Credential
                </Button>
              </div>
            </form>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
