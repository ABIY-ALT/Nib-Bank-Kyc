'use client';

import { useState, useEffect, useRef } from 'react';
import { useAuth } from '@/lib/auth';
import { validatePassword, type PasswordValidation } from '@/lib/password-validation';
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
  EyeOff,
  X
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { Alert, AlertDescription } from "@/components/ui/alert";

export function ForcePasswordChangeModal() {
  const { user, changePassword, logout } = useAuth();
  const { toast } = useToast();
  const currentPasswordInputRef = useRef<HTMLInputElement>(null);
  
  const [passwordValidation, setPasswordValidation] = useState<PasswordValidation>({
    isValid: false,
    requirements: {
      minLength: false,
      hasLowercase: false,
      hasUppercase: false,
      hasNumber: false,
      hasSpecialChar: false,
    },
  });
  
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPasswords, setShowPasswords] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Ensure focus is properly moved to the dialog content to avoid aria-hidden conflicts
  useEffect(() => {
    // Small delay to ensure DOM is ready after dialog animation starts
    const timer = setTimeout(() => {
      if (currentPasswordInputRef.current) {
        currentPasswordInputRef.current.focus();
      }
    }, 0);
    
    return () => clearTimeout(timer);
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    if (!currentPassword) {
      setError("Current password is required.");
      setLoading(false);
      return;
    }

    if (!passwordValidation.isValid) {
      setError("Password does not meet all institutional security requirements.");
      setLoading(false);
      return;
    }

    if (newPassword !== confirmPassword) {
      setError("New passwords do not match.");
      setLoading(false);
      return;
    }

    try {
      await changePassword(newPassword, currentPassword);
      toast({
        title: "Security Profile Updated",
        description: "Your new institutional credential has been established.",
      });
    } catch (err: any) {
      setError(err.message || "Database fault during credential reset.");
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
        inert={false}
      >
        <div className="bg-card">
          <DialogHeader className="bg-muted border-b p-8 space-y-0">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-card rounded-lg shadow-sm">
                  <Lock className="w-5 h-5 text-primary" />
                </div>
                <DialogTitle className="text-2xl font-black text-foreground tracking-tight">
                  Create New Password
                </DialogTitle>
              </div>
              <span className="text-[10px] font-black uppercase tracking-[0.2em] text-primary">Security Gate</span>
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
                <Label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Current Password</Label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                  <Input 
                    ref={currentPasswordInputRef}
                    type={showPasswords ? "text" : "password"} 
                    placeholder="••••••••" 
                    className="pl-10 pr-10 h-12 bg-slate-50/50 border-slate-200 font-bold"
                    value={currentPassword}
                    onChange={(e) => setCurrentPassword(e.target.value)}
                    required
                  />
                  <button
                    type="button"
                    tabIndex={-1}
                    onClick={() => setShowPasswords(!showPasswords)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground focus:outline-none transition-colors"
                  >
                    {showPasswords ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              <div className="space-y-2">
                <Label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">New Password</Label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                  <Input 
                    type={showPasswords ? "text" : "password"} 
                    placeholder="••••••••" 
                    className="pl-10 pr-10 h-12 bg-slate-50/50 border-slate-200 font-bold"
                    value={newPassword}
                    onChange={(e) => {
                      const pwd = e.target.value;
                      setNewPassword(pwd);
                      setPasswordValidation(validatePassword(pwd));
                    }}
                    required
                  />
                  <button
                    type="button"
                    tabIndex={-1}
                    onClick={() => setShowPasswords(!showPasswords)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 focus:outline-none transition-colors"
                  >
                    {showPasswords ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              <div className="space-y-2">
                <Label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Confirm Password</Label>
                <div className="relative">
                  <CheckCircle2 className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <Input 
                    type={showPasswords ? "text" : "password"} 
                    placeholder="••••••••" 
                    className="pl-10 pr-10 h-12 bg-background border font-bold"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    required
                  />
                  <button
                    type="button"
                    tabIndex={-1}
                    onClick={() => setShowPasswords(!showPasswords)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 focus:outline-none transition-colors"
                  >
                    {showPasswords ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              <div className="p-5 rounded-2xl bg-blue-50 border border-blue-100">
                <p className="text-[10px] font-bold uppercase tracking-widest text-blue-800 mb-4">Password Requirements</p>
                <div className="space-y-3">
                  <div className="flex items-center gap-2">
                    {passwordValidation.requirements.minLength ? (
                      <CheckCircle2 className="w-4 h-4 text-green-600 shrink-0" />
                    ) : (
                      <X className="w-4 h-4 text-slate-300 shrink-0" />
                    )}
                    <span className={`text-[11px] font-medium ${passwordValidation.requirements.minLength ? 'text-green-700' : 'text-slate-600'}`}>
                      At least 8 characters
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    {passwordValidation.requirements.hasLowercase ? (
                      <CheckCircle2 className="w-4 h-4 text-green-600 shrink-0" />
                    ) : (
                      <X className="w-4 h-4 text-slate-300 shrink-0" />
                    )}
                    <span className={`text-[11px] font-medium ${passwordValidation.requirements.hasLowercase ? 'text-green-700' : 'text-slate-600'}`}>
                      At least one lowercase letter
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    {passwordValidation.requirements.hasUppercase ? (
                      <CheckCircle2 className="w-4 h-4 text-green-600 shrink-0" />
                    ) : (
                      <X className="w-4 h-4 text-slate-300 shrink-0" />
                    )}
                    <span className={`text-[11px] font-medium ${passwordValidation.requirements.hasUppercase ? 'text-green-700' : 'text-slate-600'}`}>
                      At least one uppercase letter
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    {passwordValidation.requirements.hasNumber ? (
                      <CheckCircle2 className="w-4 h-4 text-green-600 shrink-0" />
                    ) : (
                      <X className="w-4 h-4 text-slate-300 shrink-0" />
                    )}
                    <span className={`text-[11px] font-medium ${passwordValidation.requirements.hasNumber ? 'text-green-700' : 'text-slate-600'}`}>
                      At least one number
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    {passwordValidation.requirements.hasSpecialChar ? (
                      <CheckCircle2 className="w-4 h-4 text-green-600 shrink-0" />
                    ) : (
                      <X className="w-4 h-4 text-slate-300 shrink-0" />
                    )}
                    <span className={`text-[11px] font-medium ${passwordValidation.requirements.hasSpecialChar ? 'text-green-700' : 'text-slate-600'}`}>
                      At least one special character (@$!%*?&)
                    </span>
                  </div>
                </div>
              </div>

              <Button 
                type="submit" 
                className="w-full h-14 bg-primary hover:bg-primary/90 text-white font-black text-lg shadow-xl shadow-primary/20 gap-2 transition-all active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed"
                disabled={loading || !passwordValidation.isValid || !confirmPassword || newPassword !== confirmPassword}
              >
                {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : null}
                Change New Password
                <ChevronRight className="w-5 h-5" />
              </Button>
            </form>

            <button
              type="button"
              onClick={() => logout('User initiated abort')}
              className="w-full text-center py-3 text-[10px] font-black uppercase tracking-widest text-slate-400 hover:text-slate-600 transition-colors border-t"
            >
              Abort and Logout
            </button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
