'use client';

// SECURITY REQUIREMENTS:
// - Do not store passwords (temporary or permanent) in client-side storage
// - Use secure, server-side mechanisms for password handling
// - Implement protections against XSS attacks
//
// Password reset token is extracted from URL query parameter only and held in memory.
// Token is NOT stored in localStorage, sessionStorage, or cookies.
// Password is never persisted; only sent to server over HTTPS POST.
// Form state is cleared immediately after submission.
// Input is sanitized by React; server validates all inputs.

import { useState, useEffect, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useToast } from '@/hooks/use-toast';
import { Loader2, KeyRound, Eye, EyeOff, AlertCircle } from 'lucide-react';

export default function CompletePasswordResetPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-50 to-slate-100">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    }>
      <CompletePasswordResetForm />
    </Suspense>
  );
}

function CompletePasswordResetForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { toast } = useToast();

  const [token, setToken] = useState<string>('');
  const [password, setPassword] = useState<string>('');
  const [confirmPassword, setConfirmPassword] = useState<string>('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string>('');
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    // Extract token from URL query parameter
    const tokenParam = searchParams?.get('token');
    if (!tokenParam) {
      setError('Invalid or missing reset link.');
      return;
    }
    setToken(tokenParam);
  }, [searchParams]);

  const validatePassword = (pwd: string): string | null => {
    if (!pwd || pwd.length < 12) {
      return 'Password must be at least 12 characters.';
    }
    if (!/[A-Z]/.test(pwd)) {
      return 'Password must contain uppercase letters.';
    }
    if (!/[a-z]/.test(pwd)) {
      return 'Password must contain lowercase letters.';
    }
    if (!/\d/.test(pwd)) {
      return 'Password must contain numbers.';
    }
    if (!/[!@#$%^&*(),.?":{}|<>]/.test(pwd)) {
      return 'Password must contain special characters.';
    }
    return null;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    // Validate inputs
    if (!password || !confirmPassword) {
      setError('Please enter and confirm your password.');
      return;
    }

    if (password !== confirmPassword) {
      setError('Passwords do not match.');
      return;
    }

    const passwordError = validatePassword(password);
    if (passwordError) {
      setError(passwordError);
      return;
    }

    setLoading(true);

    try {
      const response = await fetch('/api/auth/complete-password-reset', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, password }),
      });

      const data = await response.json();

      if (!response.ok) {
        setError(data.error || 'Failed to reset password.');
        return;
      }

      setSuccess(true);
      toast({
        title: 'Success',
        description: 'Your password has been reset successfully.',
      });

      // Redirect to login after brief delay
      setTimeout(() => {
        router.push('/login');
      }, 2000);
    } catch (err) {
      setError('An error occurred. Please try again.');
      toast({
        variant: 'destructive',
        title: 'Error',
        description: 'Failed to reset password.',
      });
    } finally {
      setLoading(false);
      // Clear sensitive data from memory
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
              <CardTitle className="text-red-600">Invalid Reset Link</CardTitle>
            </div>
          </CardHeader>
          <CardContent className="pt-8 space-y-4">
            <p className="text-slate-600 font-medium">This password reset link is invalid or has expired.</p>
            <Button
              onClick={() => router.push('/login')}
              className="w-full bg-primary hover:bg-primary/90"
            >
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
            <CardTitle className="text-emerald-600">Password Reset Successful</CardTitle>
          </CardHeader>
          <CardContent className="pt-8 space-y-4">
            <p className="text-slate-600 font-medium">
              Your password has been reset successfully. You will be redirected to the login page shortly.
            </p>
            <Button
              onClick={() => router.push('/login')}
              className="w-full bg-emerald-600 hover:bg-emerald-700"
            >
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
        <CardHeader className="bg-gradient-to-r from-slate-900 to-slate-800 text-white">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-white/10 rounded-lg">
              <KeyRound className="w-6 h-6" />
            </div>
            <CardTitle>Reset Your Password</CardTitle>
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
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-700"
                  tabIndex={-1}
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
              <p className="text-xs text-slate-500 mt-2">
                Minimum 12 characters, must include uppercase, lowercase, numbers, and special characters.
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="confirmPassword" className="font-bold text-slate-700">
                Confirm Password
              </Label>
              <div className="relative">
                <Input
                  id="confirmPassword"
                  type={showConfirmPassword ? 'text' : 'password'}
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="Confirm password"
                  disabled={loading}
                  className="pr-10 h-11 font-medium"
                />
                <button
                  type="button"
                  onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-700"
                  tabIndex={-1}
                >
                  {showConfirmPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
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
                  Resetting...
                </>
              ) : (
                'Reset Password'
              )}
            </Button>
          </form>

          <div className="mt-6 p-4 bg-slate-50 rounded-lg border border-slate-200">
            <p className="text-xs text-slate-600 font-medium">
              <strong>Security Note:</strong> This link will expire in 15 minutes. If it expires, request a new password reset from the login page.
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
