'use client';

// Token is extracted from the URL query parameter only — never stored client-side.
// Password is never persisted locally; sent to the server over HTTPS and cleared after submit.

import { useState, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { useToast } from '@/hooks/use-toast';
import { Loader2, KeyRound, Eye, EyeOff, AlertCircle, CheckCircle2 } from 'lucide-react';

function validatePassword(pwd: string): string | null {
  if (!pwd || pwd.length < 12) return 'Password must be at least 12 characters.';
  if (!/[A-Z]/.test(pwd)) return 'Password must contain an uppercase letter.';
  if (!/[a-z]/.test(pwd)) return 'Password must contain a lowercase letter.';
  if (!/\d/.test(pwd)) return 'Password must contain a number.';
  if (!/[!@#$%^&*(),.?":{}|<>]/.test(pwd)) return 'Password must contain a special character.';
  return null;
}

export default function SetupPasswordPage() {
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

  useEffect(() => {
    const t = searchParams?.get('token');
    if (!t) {
      setError('This setup link is invalid or has already been used.');
      return;
    }
    setToken(t);
  }, [searchParams]);

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

            <div className="space-y-2">
              <Label htmlFor="password" className="font-bold text-slate-700">
                New Password
              </Label>
              <div className="relative">
                <Input
                  id="password"
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
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
              <p className="text-xs text-slate-500">
                Minimum 12 characters · uppercase · lowercase · number · special character
              </p>
            </div>

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
                  className="pr-10 h-11 font-medium"
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
            </div>

            <Button
              type="submit"
              disabled={loading}
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
