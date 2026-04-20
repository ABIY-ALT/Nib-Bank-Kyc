/**
 * Client-Side Login Component
 * 
 * Features:
 * - Email/password form submission
 * - Session creation on successful login
 * - Automatic token storage
 * - Error handling with user feedback
 * - Auto-refresh setup
 */

'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { storeTokens } from '@/lib/axios-interceptor';

export function LoginForm() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const response = await fetch('/api/auth/login', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
        body: JSON.stringify({ email, password }),
      });
      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        const message = data?.error || 'Login failed';
        setError(message);
        setLoading(false);
        return;
      }

      const { accessToken, sessionId } = data;

      // Store tokens
      storeTokens(accessToken, sessionId);

      // Redirect to dashboard
      router.push('/');
    } catch (err: any) {
      const message = err.response?.data?.error || 'Login failed';
      setError(message);
      setLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded">
          {error}
        </div>
      )}

      <div>
        <label htmlFor="email" className="block text-sm font-medium">
          Email
        </label>
        <input
          type="email"
          id="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          disabled={loading}
          className="mt-1 w-full px-3 py-2 border rounded-md"
          required
        />
      </div>

      <div>
        <label htmlFor="password" className="block text-sm font-medium">
          Password
        </label>
        <input
          type="password"
          id="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          disabled={loading}
          className="mt-1 w-full px-3 py-2 border rounded-md"
          required
        />
      </div>

      <button
        type="submit"
        disabled={loading}
        className="w-full bg-blue-600 text-white py-2 rounded-md disabled:opacity-50"
      >
        {loading ? 'Logging in...' : 'Login'}
      </button>
    </form>
  );
}

/**
 * Usage in page:
 * 
 * import { LoginForm } from '@/components/auth/login-form';
 * 
 * export default function LoginPage() {
 *   return (
 *     <div className="max-w-md mx-auto mt-8">
 *       <h1 className="text-2xl font-bold mb-6">Login</h1>
 *       <LoginForm />
 *     </div>
 *   );
 * }
 */
