'use client';

import { useState, useEffect, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { useToast } from '@/hooks/use-toast';
import { Loader2, KeyRound, Eye, EyeOff, AlertCircle, CheckCircle2, XCircle, ShieldAlert } from 'lucide-react';
import { isBreachedPassword } from '@/lib/breached-password';

type StrengthState = {
  minLength: boolean;
  hasUppercase: boolean;
  hasLowercase: boolean;
  hasNumber: boolean;
  hasSpecial: boolean;
};

function checkStrength(pwd: string): StrengthState {
  return {
    minLength: pwd.length >= 12,
    hasUppercase: /[A-Z]/.test(pwd),
    hasLowercase: /[a-z]/.test(pwd),
    hasNumber: /\d/.test(pwd),
    hasSpecial: /[!@#$%^&*(),.?":{}|<>]/.test(pwd),
  };
}

function validatePassword(pwd: string): string | null {
  const s = checkStrength(pwd);
  if (!s.minLength) return 'Password must be at least 12 characters.';
  if (!s.hasUppercase) return 'Password must contain an uppercase letter.';
  if (!s.hasLowercase) return 'Password must contain a lowercase letter.';
  if (!s.hasNumber) return 'Password must contain a number.';
  if (!s.hasSpecial) return 'Password must contain a special character.';
  return null;
}

const REQUIREMENTS: { key: keyof StrengthState; label: string }[] = [
  { key: 'minLength',    label: 'At least 12 characters' },
  { key: 'hasUppercase', label: 'One uppercase letter' },
  { key: 'hasLowercase', label: 'One lowercase letter' },
  { key: 'hasNumber',    label: 'One number' },
  { key: 'hasSpecial',   label: 'One special character' },
];

export default function SetupPasswordPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-50 to-slate-100">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    }>
      <SetupPasswordForm />
    </Suspense>
  );
}

function SetupPasswordForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { toast } = useToast();

  const [token, setToken] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);
  const [isBreached, setIsBreached] = useState(false);
  const [strength, setStrength] = useState<StrengthState>({
    minLength: false,
    hasUppercase: false,
    hasLowercase: false,
    hasNumber: false,
    hasSpecial: false,
  });

  useEffect(() => {
    const t = searchParams?.get('token');
    if (!t) {
      setError('This setup link is invalid or has already been used.');
      return;
    }
    setToken(t);
  }, [searchParams]);

  const handlePasswordChange = async (val: string) => {
    setPassword(val);
    setStrength(checkStrength(val));
    if (val.length >= 8) {
      const breached = await isBreachedPassword(val);
      setIsBreached(breached);
    } else {
      setIsBreached(false);
    }
  };

  const metCount = Object.values(strength).filter(Boolean).length;
  const strengthPercent = (metCount / 5) * 100;
  const strengthColor =
    metCount <= 1 ? 'bg-red-500' :
    metCount <= 2 ? 'bg-orange-500' :
    metCount <= 3 ? 'bg-amber-400' :
    metCount === 4 ? 'bg-yellow-400' :
    'bg-emerald-500';

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (!password || !confirmPassword) {
      setError('Please enter and confirm your new password.');
      return;
    }
    if (password !== confirmPassword) {
      setError('Passwords do not match.');
      return;
    }
    const pwdError = validatePassword(password);
    if (pwdError) {
      setError(pwdError);
      return;
    }

    setLoading(true);
    try {
      const res = await fetch('/api/auth/complete-password-reset', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, password }),
      });
      const data = await res.json();

      if (!res.ok) {
        setError(data.error || 'Failed to set password. The link may have expired.');
        return;
      }

      setSuccess(true);
      toast({ title: 'Password set', description: 'You can now log in with your new password.' });
      setTimeout(() => router.push('/login'), 2500);
    } catch {
      setError('An unexpected error occurred. Please try again.');
    } finally {
      setLoading(false);
      setPassword('');
      setConfirmPassword('');
    }
  };

  if (!token) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-50 to-slate-100 px-4">
        <Card className="w-full max-w-md shadow-2xl">
          <CardHeader className="bg-red-50 border-b">
            <div className="flex items-center gap-3">
              <AlertCircle className="w-6 h-6 text-red-600" />
              <CardTitle className="text-red-700">Invalid Setup Link</CardTitle>
            </div>
          </CardHeader>
          <CardContent className="pt-8 space-y-4">
            <p className="text-slate-600 font-medium">
              This password setup link is invalid, expired, or has already been used.
            </p>
            <p className="text-sm text-slate-500">
              Contact your administrator to request a new setup link.
            </p>
            <Button onClick={() => router.push('/login')} className="w-full bg-primary hover:bg-primary/90">
              Return to Login
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (success) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-emerald-50 to-emerald-100 px-4">
        <Card className="w-full max-w-md shadow-2xl">
          <CardHeader className="bg-emerald-50 border-b">
            <div className="flex items-center gap-3">
              <CheckCircle2 className="w-6 h-6 text-emerald-600" />
              <CardTitle className="text-emerald-700">Password Set Successfully</CardTitle>
            </div>
          </CardHeader>
          <CardContent className="pt-8 space-y-4">
            <p className="text-slate-600 font-medium">
              Your password has been saved. Redirecting you to the login page…
            </p>
            <Button onClick={() => router.push('/login')} className="w-full bg-emerald-600 hover:bg-emerald-700">
              Go to Login
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-50 to-slate-100 px-4 py-8">
      <Card className="w-full max-w-md shadow-2xl">
        <CardHeader className="bg-gradient-to-r from-[#B89334] to-[#96771A] text-white rounded-t-lg">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-white/15 rounded-lg">
              <KeyRound className="w-6 h-6" />
            </div>
            <div>
              <CardTitle className="text-xl">Set Up Your Password</CardTitle>
              <CardDescription className="text-white/75 text-xs mt-0.5 font-medium">
                NIB Bank KYC Portal — Account Activation
              </CardDescription>
            </div>
          </div>
        </CardHeader>

        <CardContent className="pt-8">
          <form onSubmit={handleSubmit} className="space-y-6">
            {error && (
              <div className="p-4 bg-red-50 border border-red-200 rounded-lg flex gap-3">
                <AlertCircle className="w-5 h-5 text-red-600 shrink-0 mt-0.5" />
                <p className="text-sm text-red-800 font-medium">{error}</p>
              </div>
            )}

            {isBreached && (
              <div className="p-4 bg-orange-50 border border-orange-200 rounded-lg flex gap-3">
                <ShieldAlert className="w-5 h-5 text-orange-600 shrink-0 mt-0.5" />
                <p className="text-sm text-orange-800 font-medium">
                  This password was found in a public data breach. Please choose a different password.
                </p>
              </div>
            )}

            {/* New Password */}
            <div className="space-y-2">
              <Label htmlFor="password" className="font-bold text-slate-700">
                New Password
              </Label>
              <div className="relative">
                <Input
                  id="password"
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => handlePasswordChange(e.target.value)}
                  placeholder="Enter new password"
                  disabled={loading}
                  className="pr-10 h-11 font-medium"
                  autoComplete="new-password"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700"
                  tabIndex={-1}
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>

              {/* Strength bar */}
              {password.length > 0 && (
                <div className="h-1 w-full bg-slate-200 rounded-full overflow-hidden mt-1">
                  <div
                    className={`h-full rounded-full transition-all duration-300 ${strengthColor}`}
                    style={{ width: `${strengthPercent}%` }}
                  />
                </div>
              )}

              {/* Per-requirement checklist */}
              <div className="space-y-1.5 pt-1">
                {REQUIREMENTS.map(({ key, label }) => {
                  const met = strength[key];
                  return (
                    <div key={key} className="flex items-center gap-2">
                      {met ? (
                        <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" />
                      ) : (
                        <XCircle className="w-4 h-4 text-slate-300 shrink-0" />
                      )}
                      <span className={`text-xs font-medium ${met ? 'text-emerald-600' : 'text-slate-500'}`}>
                        {label}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Confirm Password */}
            <div className="space-y-2">
              <Label htmlFor="confirmPassword" className="font-bold text-slate-700">
                Confirm Password
              </Label>
              <div className="relative">
                <Input
                  id="confirmPassword"
                  type={showConfirm ? 'text' : 'password'}
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="Re-enter new password"
                  disabled={loading}
                  className={`pr-10 h-11 font-medium ${
                    confirmPassword && confirmPassword !== password
                      ? 'border-red-400 focus-visible:ring-red-400'
                      : confirmPassword && confirmPassword === password
                      ? 'border-emerald-400 focus-visible:ring-emerald-400'
                      : ''
                  }`}
                  autoComplete="new-password"
                />
                <button
                  type="button"
                  onClick={() => setShowConfirm(!showConfirm)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700"
                  tabIndex={-1}
                >
                  {showConfirm ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
              {confirmPassword && confirmPassword !== password && (
                <p className="text-xs text-red-600 font-medium">Passwords do not match.</p>
              )}
              {confirmPassword && confirmPassword === password && (
                <p className="text-xs text-emerald-600 font-medium">Passwords match.</p>
              )}
            </div>

            <Button
              type="submit"
              disabled={loading || metCount < 5 || password !== confirmPassword || isBreached}
              className="w-full h-11 bg-primary hover:bg-primary/90 font-bold text-base"
            >
              {loading ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Saving…
                </>
              ) : (
                'Set Password & Activate Account'
              )}
            </Button>
          </form>

          <div className="mt-6 p-4 bg-amber-50 rounded-lg border border-amber-200">
            <p className="text-xs text-amber-800 font-medium">
              <strong>Security note:</strong> This link expires in 24 hours and is valid for one use only.
              If it has expired, ask your administrator to send a new one.
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
