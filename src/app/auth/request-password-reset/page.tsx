'use client';

// SECURITY REQUIREMENTS:
// - Do not store passwords (temporary or permanent) in client-side storage
// - Use secure, server-side mechanisms for password handling
// - Implement protections against XSS attacks
//
// This page only requests a password reset.
// No sensitive data is stored in localStorage, sessionStorage, or cookies.
// Input is sanitized by Next.js by default; form submission is POST only.

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useToast } from '@/hooks/use-toast';
import { Loader2, Mail, AlertCircle, CheckCircle2 } from 'lucide-react';

export default function RequestPasswordResetPage() {
  const router = useRouter();
  const { toast } = useToast();

  const [email, setEmail] = useState<string>('');
  const [loading, setLoading] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState<string>('');

  const validateEmail = (e: string): boolean => {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(e);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (!email.trim()) {
      setError('Please enter your email address.');
      return;
    }

    if (!validateEmail(email)) {
      setError('Please enter a valid email address.');
      return;
    }

    setLoading(true);

    try {
      const response = await fetch('/api/auth/request-password-reset', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      });

      const data = await response.json();

      if (!response.ok) {
        setError(data.error || 'Failed to request password reset.');
        return;
      }

      setSubmitted(true);
      toast({
        title: 'Reset Link Sent',
        description: 'Check your email for password reset instructions.',
      });
    } catch (err) {
      setError('An error occurred. Please try again.');
      toast({
        variant: 'destructive',
        title: 'Error',
        description: 'Failed to request password reset.',
      });
    } finally {
      setLoading(false);
    }
  };

  if (submitted) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-emerald-50 to-emerald-100 px-4">
        <Card className="w-full max-w-md shadow-2xl">
          <CardHeader className="bg-emerald-50 border-b">
            <div className="flex items-center gap-3">
              <CheckCircle2 className="w-6 h-6 text-emerald-600" />
              <CardTitle className="text-emerald-600">Check Your Email</CardTitle>
            </div>
          </CardHeader>
          <CardContent className="pt-8 space-y-4">
            <p className="text-slate-600 font-medium">
              If an account exists for <strong>{email}</strong>, you will receive a password reset link shortly.
            </p>
            <p className="text-sm text-slate-500">
              The reset link will expire in 15 minutes. If you don't see the email, please check your spam folder.
            </p>
            <div className="space-y-3 pt-4">
              <Button
                onClick={() => router.push('/login')}
                className="w-full bg-primary hover:bg-primary/90"
              >
                Return to Login
              </Button>
              <Button
                onClick={() => {
                  setSubmitted(false);
                  setEmail('');
                }}
                variant="outline"
                className="w-full"
              >
                Request Another Reset
              </Button>
            </div>
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
              <Mail className="w-6 h-6" />
            </div>
            <CardTitle>Forgot Your Password?</CardTitle>
          </div>
        </CardHeader>

        <CardContent className="pt-8">
          <form onSubmit={handleSubmit} className="space-y-6">
            <p className="text-slate-600 text-sm">
              Enter your email address and we'll send you a link to reset your password.
            </p>

            {error && (
              <div className="p-4 bg-red-50 border border-red-200 rounded-lg flex gap-3">
                <AlertCircle className="w-5 h-5 text-red-600 shrink-0 mt-0.5" />
                <p className="text-sm text-red-800 font-medium">{error}</p>
              </div>
            )}

            <div className="space-y-2">
              <Label htmlFor="email" className="font-bold text-slate-700">
                Email Address
              </Label>
              <Input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="your@email.com"
                disabled={loading}
                className="h-11 font-medium"
              />
            </div>

            <Button
              type="submit"
              disabled={loading}
              className="w-full h-11 bg-primary hover:bg-primary/90 font-bold text-base"
            >
              {loading ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Sending...
                </>
              ) : (
                'Send Reset Link'
              )}
            </Button>
          </form>

          <div className="mt-6 pt-6 border-t border-slate-200">
            <p className="text-center text-sm text-slate-600">
              Remember your password?{' '}
              <button
                onClick={() => router.push('/login')}
                className="text-primary font-bold hover:underline"
              >
                Back to Login
              </button>
            </p>
          </div>

          <div className="mt-6 p-4 bg-slate-50 rounded-lg border border-slate-200">
            <p className="text-xs text-slate-600 font-medium">
              <strong>Security Note:</strong> Reset links expire in 15 minutes and can only be used once.
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
