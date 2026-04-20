/**
 * Client auth token helpers.
 *
 * The project now relies on native fetch rather than Axios, but several
 * components still import these helpers. Keep the same surface area for
 * token storage/logout while making interceptor setup a no-op.
 */

'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { safeLog } from './logging-redaction';

/**
 * Compatibility shim for legacy callers.
 */
export function setupAxiosInterceptors(_client?: unknown): void {
  // Native fetch does not use Axios interceptors.
}

/**
 * Hook Version: preserve the old API for callers that still initialize it.
 */
export function useAxiosInterceptor(client?: unknown): void {
  const router = useRouter();

  useEffect(() => {
    setupAxiosInterceptors(client);
  }, [client, router]);
}

/**
 * Utility: Logout function to clear tokens and redirect.
 */
export async function logout(_context?: unknown): Promise<void> {
  try {
    await fetch('/api/auth/logout', {
      method: 'POST',
      credentials: 'include',
    });
  } catch (error) {
    safeLog.error('Logout request failed', {
      error: String(error).substring(0, 100),
    });
  }

  clearTokens();

  if (typeof window !== 'undefined') {
    window.location.href = '/login';
  }
}

/**
 * Utility: Check if user is authenticated.
 */
export function isAuthenticated(): boolean {
  if (typeof window === 'undefined') return false;

  return !!localStorage.getItem('accessToken');
}

/**
 * Utility: Get current access token.
 */
export function getAccessToken(): string | null {
  if (typeof window === 'undefined') return null;

  return localStorage.getItem('accessToken');
}

/**
 * Utility: Store tokens after login.
 */
export function storeTokens(accessToken: string, sessionId: string): void {
  if (typeof window === 'undefined') return;

  localStorage.setItem('accessToken', accessToken);
  localStorage.setItem('sessionId', sessionId);
}

/**
 * Utility: Clear all tokens and session.
 */
export function clearTokens(): void {
  if (typeof window === 'undefined') return;

  localStorage.removeItem('accessToken');
  localStorage.removeItem('sessionId');
}
