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
      toast({ variant: "destructive", title: "Mismatch", description: "Passwords do not match." });
      return;
    }
    if (newPassword.length < 8) {
      toast({ variant: "destructive", title: "Security Policy", description: "Password must be at least 8 characters." });
      return;
    }

    setLoading(true);
    try {
      await changePassword(newPassword);
      toast({ title: "Success", description: "Credential updated successfully." });
      setIsChangingPassword(false);
      setNewPassword("");
      setConfirmPassword("");
    } catch (e: any) {
      toast({ variant: "destructive", title: "Update Failed", description: e.message });
    } finally {
      setLoading(false);
    }
  };

  if (!user) return null;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {children}
      </DialogTrigger>
      <DialogContent className="max-w-md p-0 overflow-hidden border-none shadow-2xl rounded-3xl bg-white">
        <DialogHeader className="p-8 bg-primary text-white space-y-1">
          <div className="flex items-center gap-4">
            <div className="p-3 bg-white/20 rounded-2xl">
              <UserCircle className="w-8 h-8 text-white" />
            </div>
            <div>
              <DialogTitle className="text-2xl font-black tracking-tight text-white">Staff Profile</DialogTitle>
              <p className="text-white/70 font-bold text-[10px] uppercase tracking-widest">Institutional Identity Card</p>
            </div>
          </div>
        </DialogHeader>

        <div className="p-8 space-y-8">
          <div className="space-y-6">
            <div className="flex items-center gap-4 p-4 rounded-2xl bg-slate-50 border border-slate-100">
              <div className="w-12 h-12 rounded-full bg-primary/10 text-primary flex items-center justify-center font-black text-lg">
                {user.firstName.charAt(0)}
              </div>
              <div className="flex-1">
                <p className="text-[10px] font-black uppercase text-slate-400 tracking-widest">Full Legal Name</p>
                <p className="font-black text-slate-900">{user.firstName} {user.lastName}</p>
              </div>
            </div>

            <div className="grid grid-cols-1 gap-4">
              <div className="space-y-1 px-1">
                <Label className="text-[10px] font-black uppercase text-slate-400 tracking-widest flex items-center gap-2">
                  <Mail className="w-3 h-3" /> Official Email
                </Label>
                <p className="text-sm font-bold text-slate-700">{user.email}</p>
              </div>
              <div className="space-y-1 px-1">
                <Label className="text-[10px] font-black uppercase text-slate-400 tracking-widest flex items-center gap-2">
                  <ShieldCheck className="w-3 h-3" /> Assigned Authority
                </Label>
                <div className="mt-1">
                  <Badge variant="outline" className="bg-primary/5 text-primary border-primary/10 font-black uppercase text-[10px] px-3 py-1">
                    {user.roles?.[0]?.role.name.replace(/_/g, ' ')}
                  </Badge>
                </div>
              </div>
              <div className="space-y-1 px-1">
                <Label className="text-[10px] font-black uppercase text-slate-400 tracking-widest flex items-center gap-2">
                  <Building2 className="w-3 h-3" /> Jurisdiction Node
                </Label>
                <p className="text-sm font-bold text-slate-700">{user.branchName || 'Institutional Headquarters'}</p>
              </div>
            </div>
          </div>

          {!isChangingPassword ? (
            <Button 
              variant="outline" 
              className="w-full h-14 rounded-2xl border-slate-200 font-black text-sm gap-3 group hover:border-primary/30 transition-all"
              onClick={() => setIsChangingPassword(true)}
            >
              <KeyRound className="w-5 h-5 text-primary group-hover:scale-110 transition-transform" />
              Modify Security Credential
            </Button>
          ) : (
            <form onSubmit={handlePasswordUpdate} className="space-y-4 animate-in slide-in-from-top-2 duration-300">
              <div className="h-px bg-slate-100 my-2" />
              <div className="space-y-2">
                <Label className="text-[10px] font-black uppercase text-slate-500 tracking-widest">New Password</Label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                  <Input 
                    type={showPassword ? "text" : "password"} 
                    className="pl-10 h-12 bg-slate-50 border-slate-200 font-bold rounded-xl"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    required
                  />
                  <button type="button" onClick={() => setShowPassword(!showPassword)} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400">
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>
              <div className="space-y-2">
                <Label className="text-[10px] font-black uppercase text-slate-500 tracking-widest">Confirm New Password</Label>
                <div className="relative">
                  <CheckCircle2 className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                  <Input 
                    type={showPassword ? "text" : "password"} 
                    className="pl-10 h-12 bg-slate-50 border-slate-200 font-bold rounded-xl"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    required
                  />
                </div>
              </div>
              <div className="flex gap-2 pt-2">
                <Button type="button" variant="ghost" className="flex-1 h-12 font-bold" onClick={() => setIsChangingPassword(false)}>Cancel</Button>
                <Button type="submit" className="flex-[2] h-12 bg-primary text-white font-black rounded-xl shadow-xl" disabled={loading}>
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