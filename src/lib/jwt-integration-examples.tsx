// @ts-nocheck
/**
 * Secure JWT Authentication - Integration Examples
 * 
 * This file shows how to integrate the new secure JWT system into your Next.js application.
 * 
 * KEY PRINCIPLES:
 * 1. Minimal JWT payload (sub + role only)
 * 2. Short-lived access tokens (15 minutes)
 * 3. Long-lived refresh tokens (7 days)
 * 4. HTTP-only cookies for token storage
 * 5. Token rotation on refresh
 * 6. Comprehensive logging with redaction
 */

/**
 * ============================================================================
 * EXAMPLE 1: Login Page Component
 * ============================================================================
 */

// File: src/app/login/page.tsx

import { useState } from 'react';
import { loginAction } from '@/actions/auth-jwt';

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();

    // Call secure login action
    const result = await loginAction(email, password);

    if (!result.success) {
      setError(result.error || 'Login failed');
      return;
    }

    // Success: Navigate to dashboard
    // Store access token in memory or state
    // Refresh token is automatically set in HTTP-only cookie
    window.location.href = '/dashboard';
  };

  return (
    <form onSubmit={handleLogin}>
      <input
        type="email"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        placeholder="Email"
      />
      <input
        type="password"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        placeholder="Password"
      />
      {error && <p style={{ color: 'red' }}>{error}</p>}
      <button type="submit">Login</button>
    </form>
  );
}

/**
 * ============================================================================
 * EXAMPLE 2: Authenticated API Route
 * ============================================================================
 */

// File: src/app/api/me/route.ts

import { NextRequest, NextResponse } from 'next/server';
import { verifyAccessTokenMiddleware } from '@/lib/token-revocation';
import { getPrisma } from '@/lib/prisma-secure';

export async function GET(request: NextRequest) {
  // 1. Verify access token
  const claims = await verifyAccessTokenMiddleware(request);

  if (!claims) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // 2. Token is valid, fetch user profile
  const prisma = getPrisma();
  const user = await prisma.user.findUnique({
    where: { id: claims.sub },
    select: {
      id: true,
      firstName: true,
      lastName: true,
      email: true,
      role: { select: { name: true } },
      status: true,
    },
  });

  if (!user) {
    return NextResponse.json({ error: 'User not found' }, { status: 404 });
  }

  // 3. Return user profile (no sensitive data in JWT)
  return NextResponse.json({
    id: user.id,
    firstName: user.firstName,
    lastName: user.lastName,
    email: user.email,
    role: user.role?.name,
    status: user.status,
  });
}

/**
 * ============================================================================
 * EXAMPLE 3: Refresh Token Endpoint
 * ============================================================================
 */

// File: src/app/api/auth/refresh/route.ts

import { NextRequest, NextResponse } from 'next/server';
import { refreshTokenAction } from '@/actions/auth-jwt';

export async function POST(request: NextRequest) {
  // 1. Call refresh action (automatically uses refresh token from cookie)
  const result = await refreshTokenAction();

  if (!result.success) {
    return NextResponse.json({ error: result.error }, { status: 401 });
  }

  // 2. Return new access token to client
  // Refresh token automatically updated in cookie (HttpOnly)
  return NextResponse.json({
    accessToken: result.accessToken,
    tokenType: 'Bearer',
    expiresIn: 900, // 15 minutes in seconds
  });
}

/**
 * ============================================================================
 * EXAMPLE 4: Logout Endpoint
 * ============================================================================
 */

// File: src/app/api/auth/logout/route.ts

import { NextRequest, NextResponse } from 'next/server';
import { logoutAction } from '@/actions/auth-jwt';

export async function POST(request: NextRequest) {
  // Extract user ID from token
  const token = request.headers.get('authorization')?.replace('Bearer ', '');
  if (!token) {
    return NextResponse.json({ error: 'No token' }, { status: 401 });
  }

  // In production, extract user ID from verified claims
  // For now, get from request body or cookie
  const userId = request.headers.get('x-user-id') || '';

  if (!userId) {
    return NextResponse.json({ error: 'No user ID' }, { status: 400 });
  }

  // Call logout action
  await logoutAction(userId);

  // Response with cookie deletion headers
  const response = NextResponse.json({ success: true });

  // Clear cookies on client
  response.cookies.delete('refreshToken');
  response.cookies.delete('isAuthenticated');

  return response;
}

/**
 * ============================================================================
 * EXAMPLE 5: Protected Page with Middleware
 * ============================================================================
 */

// File: src/middleware.ts

import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { verifyAccessTokenMiddleware } from '@/lib/token-revocation';

// Protected routes
const protectedRoutes = ['/api/admin', '/api/profile', '/dashboard', '/memos'];

export async function middleware(request: NextRequest) {
  const pathname = request.nextUrl.pathname;

  // Check if route is protected
  const isProtected = protectedRoutes.some((route) => pathname.startsWith(route));

  if (!isProtected) {
    return NextResponse.next();
  }

  // 1. Verify access token
  const claims = await verifyAccessTokenMiddleware(request);

  if (!claims) {
    // 2. Token invalid - redirect to login
    return NextResponse.redirect(new URL('/login', request.url));
  }

  // 3. Token valid - add user info to request headers
  const response = NextResponse.next();
  response.headers.set('x-user-id', claims.sub);
  response.headers.set('x-user-role', claims.role);

  return response;
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};

/**
 * ============================================================================
 * EXAMPLE 6: Token Refresh on Client
 * ============================================================================
 */

// File: src/lib/api-client.ts

let accessToken: string | null = null;
let refreshTimer: NodeJS.Timeout | null = null;

/**
 * Set access token and start refresh timer
 */
export function setAccessToken(token: string, expiresIn: number) {
  accessToken = token;

  // Clear existing timer
  if (refreshTimer) {
    clearTimeout(refreshTimer);
  }

  // Schedule refresh before expiration
  // Refresh at 80% of token lifetime
  const refreshIn = Math.floor((expiresIn * 80) / 100) * 1000;

  refreshTimer = setTimeout(() => {
    refreshAccessToken();
  }, refreshIn);
}

/**
 * Refresh access token
 */
async function refreshAccessToken() {
  try {
    const response = await fetch('/api/auth/refresh', {
      method: 'POST',
      credentials: 'include', // Include cookies (refreshToken)
      headers: {
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      // Refresh failed - redirect to login
      window.location.href = '/login';
      return;
    }

    const data = await response.json();
    setAccessToken(data.accessToken, data.expiresIn);
  } catch (error) {
    console.error('Token refresh failed:', error);
    window.location.href = '/login';
  }
}

/**
 * Make API call with access token
 */
export async function apiCall(
  url: string,
  options: RequestInit = {}
): Promise<Response> {
  const headers = {
    ...options.headers,
    'Content-Type': 'application/json',
  };

  if (accessToken) {
    // Add Bearer token to Authorization header
    headers['Authorization'] = `Bearer ${accessToken}`;
  }

  return fetch(url, {
    ...options,
    headers,
    credentials: 'include', // Include cookies for CSRF protection
  });
}

/**
 * ============================================================================
 * EXAMPLE 7: Protected Component with Auto-Refresh
 * ============================================================================
 */

// File: src/components/protected-dashboard.tsx

'use client';

import { useEffect, useState } from 'react';
import { setAccessToken, apiCall } from '@/lib/api-client';

export function ProtectedDashboard() {
  const [user, setUser] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const initUser = async () => {
      try {
        // Fetch current user from API
        const response = await apiCall('/api/me');

        if (response.status === 401) {
          // Token expired or invalid
          // Middleware will redirect to login
          return;
        }

        const userData = await response.json();
        setUser(userData);
      } catch (error) {
        console.error('Failed to fetch user:', error);
      } finally {
        setLoading(false);
      }
    };

    initUser();
  }, []);

  if (loading) return <div>Loading...</div>;
  if (!user) return <div>Not authenticated</div>;

  return (
    <div>
      <h1>Welcome, {user.firstName}!</h1>
      <p>Role: {user.role}</p>
      <p>Email: {user.email}</p>
    </div>
  );
}

/**
 * ============================================================================
 * BEFORE vs AFTER: Payload Comparison
 * ============================================================================
 */

/**
 * ❌ BEFORE (Insecure):
 * 
 * JWT Payload:
 * {
 *   "sub": "user123",
 *   "email": "user@example.com",              // PII
 *   "firstName": "John",                      // PII
 *   "lastName": "Doe",                        // PII
 *   "role": "SUPER_ADMIN",
 *   "sid": "session-abc123",                  // Session metadata
 *   "ip": "192.168.1.1",                      // Device-specific
 *   "user_agent": "Mozilla/5.0...",           // Device fingerprint
 *   "branchId": "branch-456",                 // Sensitive metadata
 *   "permissions": [...]                      // Can infer organization
 * }
 * 
 * Risks:
 * ✗ Can decode token in browser console
 * ✗ Anyone with token sees all user data
 * ✗ Device fingerprint aids tracking
 * ✗ Session ID could enable session hijacking
 * ✗ IP address leaks network info
 * ✗ User agent helps fingerprinting
 */

/**
 * ✅ AFTER (Secure):
 * 
 * JWT Payload:
 * {
 *   "sub": "user123",                        // Only user ID
 *   "role": "ADMIN",                         // Only if needed for authz
 *   "iat": 1713288000,                       // Standard claim
 *   "exp": 1713288900,                       // Expires in 15 min
 *   "iss": "nib-bank-kyc",                   // Standard claim
 *   "aud": "api",                            // Standard claim
 *   "jti": "token-id-uuid"                   // For revocation
 * }
 * 
 * Benefits:
 * ✓ Token decoding reveals no PII
 * ✓ Cannot infer user identity from token
 * ✓ No device-specific information
 * ✓ No organization structure leakage
 * ✓ Short expiration (15 min)
 * ✓ Revocable via JTI
 * ✓ Can be safely logged
 */

/**
 * ============================================================================
 * Security Considerations
 * ============================================================================
 * 
 * 1. HTTPS Only
 *    - All tokens transmitted over HTTPS
 *    - Secure flag set on cookies
 *    - No tokens in URLs
 * 
 * 2. Storage
 *    - Access token: Memory or state (not localStorage)
 *    - Refresh token: HTTP-only cookie only
 *    - Never both in localStorage
 * 
 * 3. Expiration
 *    - Access token: 15 minutes (quick rotation)
 *    - Refresh token: 7 days (longer but rotated on use)
 *    - Tokens cannot be revoked (except by JTI)
 * 
 * 4. Revocation
 *    - Logout: Revoke all user tokens
 *    - Password change: Revoke all tokens
 *    - Role change: Revoke all tokens
 *    - Security incident: Revoke all tokens
 * 
 * 5. CSRF Protection
 *    - SameSite=Strict on cookies
 *    - Double-submit cookie pattern
 *    - Origin header validation
 * 
 * 6. XSS Protection
 *    - HttpOnly flag prevents JavaScript access
 *    - Content Security Policy headers
 *    - No sensitive data in tokens
 */
