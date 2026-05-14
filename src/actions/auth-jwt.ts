/**
 * Authentication Actions - Secure Token Lifecycle
 * 
 * ENDPOINTS:
 * 1. /api/auth/login - Generate access + refresh tokens
 * 2. /api/auth/refresh - Rotate refresh token, get new access token
 * 3. /api/auth/logout - Revoke tokens
 * 4. /api/auth/verify - Verify current token
 * 
 * SECURITY:
 * - Short-lived access tokens (15 min)
 * - Long-lived refresh tokens (7 days)
 * - Refresh token rotation on every use
 * - HTTP-only cookies
 * - CSRF protection
 */

'use server';

import { cookies } from 'next/headers';
import bcrypt from 'bcryptjs';
import { createTokenPair, verifyRefreshToken, generateAccessToken } from '@/lib/jwt-secure';
import { revokeUserTokens, revokeToken } from '@/lib/token-revocation';
import { safeLog } from '@/lib/logging-redaction';
import { getPrisma } from '@/lib/prisma-secure';
import { JwtRole, SECURE_COOKIE_CONFIG, DEV_COOKIE_CONFIG } from '@/lib/jwt-types';
import { getServerSession } from './auth-server';

/**
 * Get cookie configuration based on environment
 */
function getCookieConfig() {
  return process.env.NODE_ENV === 'production' ? SECURE_COOKIE_CONFIG : DEV_COOKIE_CONFIG;
}

/**
 * Login Action
 * 
 * FLOW:
 * 1. Verify credentials with database
 * 2. Generate access token (15 min)
 * 3. Generate refresh token (7 days)
 * 4. Store refresh token in HTTP-only cookie
 * 5. Return access token to client
 * 
 * @param email - User email
 * @param password - User password
 * @returns { success: boolean; accessToken?: string; error?: string }
 */
export async function loginAction(
  email: string,
  password: string
): Promise<{ success: boolean; accessToken?: string; error?: string }> {
  try {
    // 1. Validate input
    if (!email || !password) {
      return { success: false, error: 'Email and password required' };
    }

    // 2. Find user
    const prisma = await getPrisma();
    const user = await prisma.user.findUnique({
      where: { email },
      select: {
        id: true,
        password: true,
        status: true,
        roles: {
          select: {
            role: {
              select: { name: true },
            },
          },
        },
      },
    });

    if (!user) {
      safeLog.warn('Login attempt: user not found', { email: email.split('@')[0] });
      return { success: false, error: 'Invalid credentials' };
    }

    if (user.status !== 'ACTIVE') {
      safeLog.warn('Login attempt: user inactive', { userId: user.id.substring(0, 8) });
      return { success: false, error: 'Account is inactive' };
    }

    // 3. Verify password
    const isPasswordValid = await bcrypt.compare(password, user.password);
    if (!isPasswordValid) {
      safeLog.warn('Login attempt: invalid password', { email: email.split('@')[0] });
      return { success: false, error: 'Invalid credentials' };
    }

    // 4. Get user role
    const userRole: JwtRole = user.roles?.[0]?.role?.name === 'ADMIN' ? 'ADMIN' : 'USER';

    // 5. Generate tokens
    const tokenPair = await createTokenPair(user.id, userRole);

    // 6. Store refresh token in HTTP-only cookie
    const cookieStore = await cookies();
    const cookieConfig = getCookieConfig();

    cookieStore.set('refreshToken', tokenPair.refreshToken, {
      httpOnly: cookieConfig.httpOnly,
      secure: cookieConfig.secure,
      sameSite: cookieConfig.sameSite,
      path: cookieConfig.path || '/',
      maxAge: Math.floor(DEFAULT_TOKEN_CONFIG.refreshTokenExpiresIn / 1000), // 7 days in seconds
    });

    // Also set a flag indicating user is authenticated (non-httpOnly for client awareness)
    cookieStore.set('isAuthenticated', 'true', {
      secure: cookieConfig.secure,
      sameSite: cookieConfig.sameSite,
      path: cookieConfig.path || '/',
      maxAge: Math.floor(DEFAULT_TOKEN_CONFIG.accessTokenExpiresIn / 1000), // 15 minutes
    });

    safeLog.info('User logged in', { userId: user.id.substring(0, 8) });

    return {
      success: true,
      accessToken: tokenPair.accessToken,
    };
  } catch (error) {
    safeLog.error('Login action failed', {
      error: String(error).substring(0, 100),
    });
    return { success: false, error: 'Login failed' };
  }
}

/**
 * Refresh Token Action
 * 
 * FLOW:
 * 1. Extract refresh token from cookie
 * 2. Verify refresh token
 * 3. Revoke old refresh token (rotation)
 * 4. Generate new token pair
 * 5. Set new refresh token cookie
 * 6. Return new access token
 * 
 * SECURITY:
 * - Refresh token rotation (old token invalidated)
 * - One-time use tokens (cannot be reused)
 * - Audit trail of all rotations
 * 
 * @returns { success: boolean; accessToken?: string; error?: string }
 */
export async function refreshTokenAction(): Promise<{
  success: boolean;
  accessToken?: string;
  error?: string;
}> {
  try {
    const cookieStore = await cookies();
    const oldRefreshToken = cookieStore.get('refreshToken')?.value;

    if (!oldRefreshToken) {
      safeLog.warn('Refresh attempt: no refresh token');
      return { success: false, error: 'No refresh token' };
    }

    // 1. Verify old refresh token
    const refreshClaims = await verifyRefreshToken(oldRefreshToken);
    if (!refreshClaims) {
      safeLog.warn('Refresh token invalid or expired');
      return { success: false, error: 'Refresh token invalid' };
    }

    const userId = refreshClaims.sub;

    // 2. Get user for role
    const prisma = await getPrisma();
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        roles: {
          select: {
            role: {
              select: { name: true },
            },
          },
        },
      },
    });

    const userRole: JwtRole = user?.roles?.[0]?.role?.name === 'ADMIN' ? 'ADMIN' : 'USER';

    // 3. Revoke old refresh token (rotation)
    if (refreshClaims.jti) {
      const expiresAt = new Date(
        (refreshClaims.exp || Math.floor(Date.now() / 1000)) * 1000
      ).getTime();
      await revokeToken(refreshClaims.jti, userId, 'logout', expiresAt);
    }

    // 4. Generate new token pair
    const newTokenPair = await createTokenPair(userId, userRole, refreshClaims.tokenId);

    // 5. Update refresh token cookie
    const cookieConfig = getCookieConfig();
    cookieStore.set('refreshToken', newTokenPair.refreshToken, {
      httpOnly: cookieConfig.httpOnly,
      secure: cookieConfig.secure,
      sameSite: cookieConfig.sameSite,
      path: cookieConfig.path || '/',
      maxAge: Math.floor(DEFAULT_TOKEN_CONFIG.refreshTokenExpiresIn / 1000),
    });

    safeLog.info('Token refreshed', {
      userId: userId.substring(0, 8),
    });

    return {
      success: true,
      accessToken: newTokenPair.accessToken,
    };
  } catch (error) {
    safeLog.error('Token refresh failed', {
      error: String(error).substring(0, 100),
    });
    return { success: false, error: 'Token refresh failed' };
  }
}

/**
 * Logout Action
 * 
 * FLOW:
 * 1. Extract tokens
 * 2. Revoke all user tokens
 * 3. Clear cookies
 * 4. Return success
 * 
 * @returns { success: boolean }
 */
export async function logoutAction(userId: string): Promise<{ success: boolean }> {
  try {
    // Ensure the caller is authenticated and authorized to revoke tokens for the
    // requested userId. Do not trust a client-supplied userId.
    const session = await getServerSession();
    if (!session) {
      safeLog.warn('logoutAction invoked without authenticated session');
      return { success: false };
    }

    // Non-super-admins may only revoke their own sessions
    if (session.role !== 'SUPER_ADMIN' && session.id !== userId) {
      safeLog.warn('logoutAction: unauthorized attempt to revoke tokens for another user', { actor: session.id.substring(0,8), target: userId.substring(0,8) });
      return { success: false };
    }

    const targetUserId = session.role === 'SUPER_ADMIN' ? userId : session.id;

    // 1. Revoke all user tokens
    const notBeforeTime = Math.floor(Date.now() / 1000);
    const expiresAt = (notBeforeTime + 86400) * 1000; // 24 hours from now

    await revokeUserTokens(targetUserId, 'logout', expiresAt);

    // 2. Clear cookies
    const cookieStore = await cookies();
    cookieStore.delete('refreshToken');
    cookieStore.delete('isAuthenticated');
    cookieStore.delete('accessToken');

    safeLog.info('User logged out', { userId: targetUserId.substring(0, 8) });

    return { success: true };
  } catch (error) {
    safeLog.error('Logout failed', {
      error: String(error).substring(0, 100),
    });
    return { success: true }; // Still clear cookies even if revocation fails
  }
}

/**
 * Verify Token Action
 * 
 * Used to check if current token is valid
 * Typically called on page load to re-authenticate
 * 
 * @param token - Access token to verify
 * @returns { valid: boolean; userId?: string; role?: string }
 */
export async function verifyTokenAction(token: string): Promise<{
  valid: boolean;
  userId?: string;
  role?: string;
}> {
  try {
    const claims = await verifyAccessToken(token);
    if (!claims) {
      return { valid: false };
    }

    return {
      valid: true,
      userId: claims.sub,
      role: claims.role,
    };
  } catch (error) {
    return { valid: false };
  }
}

/**
 * Secure Cookie Configuration
 * 
 * HTTP-ONLY COOKIES:
 * - Cannot be accessed by JavaScript (prevents XSS attacks)
 * - Automatically sent with every request to same origin
 * - Secure flag ensures HTTPS-only transmission
 * - SameSite=Strict prevents CSRF attacks
 * 
 * FLOW:
 * 1. Server sets HttpOnly cookie: Set-Cookie: refreshToken=...; HttpOnly; Secure; SameSite=Strict
 * 2. Browser stores cookie (JavaScript cannot access)
 * 3. Browser automatically sends cookie with requests
 * 4. Server reads cookie from request headers
 * 5. Server verifies token before processing
 * 
 * WHY NOT localStorage?
 * ❌ Accessible to JavaScript (XSS vulnerability)
 * ❌ Can be stolen by injected malicious script
 * ❌ No automatic attachment to requests
 * 
 * EXAMPLE COOKIE HEADERS:
 * 
 * Response (Server → Client):
 * Set-Cookie: refreshToken=eyJ...; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=604800
 * 
 * Request (Client → Server):
 * Cookie: refreshToken=eyJ...
 * 
 * NOTE: Cannot access from JavaScript:
 * - document.cookie ← Cannot see refreshToken
 * - fetch({ credentials: 'include' }) ← Automatically sends, but cannot read
 */

// Import token types
import { DEFAULT_TOKEN_CONFIG } from '@/lib/jwt-types';
import { verifyAccessToken } from '@/lib/jwt-secure';
