/**
 * Backend Authentication Endpoints
 * 
 * Main Routes:
 * - POST /api/auth/login - Create new session + issue tokens
 * - POST /api/auth/refresh - Rotate tokens with security checks
 * - POST /api/auth/logout - Revoke session
 * - GET /api/auth/sessions - List active sessions
 * 
 * SECURITY:
 * - Refresh tokens stored as HTTP-only cookies (XSS protected)
 * - Access tokens in Authorization header
 * - CSRF protection via secure cookies
 * - Rate limiting (prevent brute force)
 * - Device tracking and binding
 */

import { NextRequest, NextResponse } from 'next/server';
import { sessionManager } from '@/lib/session-manager';
import { prisma } from '@/lib/prisma';
import * as bcrypt from 'bcryptjs';
import { safeLog } from '@/lib/logging-redaction';

/**
 * Utility: Get client IP address
 */
function getClientIp(request: NextRequest): string {
  return (
    request.headers.get('x-forwarded-for')?.split(',')[0].trim() ||
    request.headers.get('x-real-ip') ||
    'unknown'
  );
}

/**
 * Utility: Get device fingerprint
 */
function getDeviceInfo(request: NextRequest) {
  const userAgent = request.headers.get('user-agent') || 'unknown';

  // Simple device ID from user agent (in production, use more sophisticated fingerprinting)
  const deviceId = Buffer.from(userAgent).toString('base64').substring(0, 32);

  return { deviceId, userAgent };
}

/**
 * Utility: Set secure cookie with refresh token
 */
function setRefreshTokenCookie(response: NextResponse, refreshToken: string): void {
  // Calculate expiration: 7 days
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

  response.cookies.set('refreshToken', refreshToken, {
    httpOnly: true, // ✅ XSS protected - JavaScript cannot access
    secure: process.env.NODE_ENV === 'production', // ✅ HTTPS only
    sameSite: 'strict', // ✅ CSRF protected
    path: '/',
    maxAge: 7 * 24 * 60 * 60, // 7 days in seconds
    expires: expiresAt,
  });

  // OPTIONAL: Also set session ID cookie (for server-side tracking)
  response.cookies.set('sessionId', '', {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',
    path: '/',
  });
}

/**
 * Clear refresh token cookie on logout
 */
function clearRefreshTokenCookie(response: NextResponse): void {
  response.cookies.set('refreshToken', '', {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',
    path: '/',
    maxAge: 0, // Immediate expiration
  });

  response.cookies.set('sessionId', '', {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',
    path: '/',
    maxAge: 0,
  });
}

/**
 * POST /api/auth/login
 * 
 * Flow:
 * 1. Validate credentials
 * 2. Create session
 * 3. Issue access + refresh tokens
 * 4. Return access token + set refresh token cookie
 */
export async function postLogin(request: NextRequest) {
  try {
    const body = await request.json();
    const { email, password } = body;

    // Validate input
    if (!email || !password) {
      return NextResponse.json(
        { error: 'Email and password required' },
        { status: 400 }
      );
    }

    // 1. Find user by email
    const user = await prisma.user.findUnique({
      where: { email },
      include: {
        roles: {
          include: {
            role: {
              select: {
                name: true,
                active: true,
              },
            },
          },
        },
      },
    });

    if (!user) {
      // Don't reveal if email exists (security)
      safeLog.warn('Login attempt with unknown email', { email: email.substring(0, 10) });
      return NextResponse.json(
        { error: 'Invalid credentials' },
        { status: 401 }
      );
    }

    // 2. Verify password hash
    if (!user.password) {
      return NextResponse.json(
        { error: 'User has no password set' },
        { status: 401 }
      );
    }

    const passwordValid = await bcrypt.compare(password, user.password);
    if (!passwordValid) {
      safeLog.warn('Login attempt with invalid password', {
        userId: user.id.substring(0, 8),
      });
      return NextResponse.json(
        { error: 'Invalid credentials' },
        { status: 401 }
      );
    }

    // 3. Get client info
    const clientIp = getClientIp(request);
    const { deviceId, userAgent } = getDeviceInfo(request);

    // 4. Create session
    const { accessToken, refreshToken, sessionId } = await sessionManager.createSession(
      user.id,
      {
        deviceId,
        deviceName: 'Web Browser', // Can be enhanced with device name detection
        userAgent,
        ipAddress: clientIp,
      }
    );

    const activeRoleNames = (user.roles ?? [])
      .filter((userRole: any) => userRole.role?.active)
      .map((userRole: any) => userRole.role.name);
    const roleName = activeRoleNames.includes('SUPER_ADMIN')
      ? 'SUPER_ADMIN'
      : (activeRoleNames[0] || 'UNASSIGNED');

    // 5. Create response
    const response = NextResponse.json(
      {
        message: 'Login successful',
        accessToken,
        user: {
          id: user.id,
          email: user.email,
          role: roleName,
        },
        sessionId,
      },
      { status: 200 }
    );

    // 6. Set refresh token in HTTP-only cookie
    setRefreshTokenCookie(response, refreshToken);

    safeLog.info('User logged in', {
      userId: user.id.substring(0, 8),
      ip: clientIp,
    });

    return response;
  } catch (error) {
    safeLog.error('Login failed', {
      error: String(error).substring(0, 100),
    });

    return NextResponse.json(
      { error: 'Login failed' },
      { status: 500 }
    );
  }
}

/**
 * POST /api/auth/refresh
 * 
 * Flow:
 * 1. Extract refresh token from cookie
 * 2. Verify session + token validity
 * 3. Rotate tokens (old token invalidated)
 * 4. Return new access token + refresh token
 * 
 * CRITICAL: Token is rotated on every refresh
 * This prevents token reuse if old token is compromised
 */
export async function postRefresh(request: NextRequest) {
  try {
    // 1. Get refresh token from cookie
    const refreshToken = request.cookies.get('refreshToken')?.value;
    const sessionId = request.cookies.get('sessionId')?.value;

    if (!refreshToken) {
      safeLog.warn('Refresh attempt without token');
      return NextResponse.json(
        { error: 'No refresh token' },
        { status: 401 }
      );
    }

    if (!sessionId) {
      safeLog.warn('Refresh attempt without session ID');
      return NextResponse.json(
        { error: 'No session ID' },
        { status: 401 }
      );
    }

    // 2. Verify session is valid
    const sessionValid = await sessionManager.verifySessionValid(sessionId);
    if (!sessionValid) {
      safeLog.warn('Refresh with invalid session', {
        sessionId: sessionId.substring(0, 8),
      });

      const response = NextResponse.json(
        { error: 'Session expired or invalid' },
        { status: 401 }
      );
      clearRefreshTokenCookie(response);
      return response;
    }

    // 3. Get client info for audit
    const clientIp = getClientIp(request);

    // 4. Rotate tokens
    try {
      const { accessToken, refreshToken: newRefreshToken } =
        await sessionManager.rotateRefreshToken(sessionId, refreshToken, clientIp);

      // 5. Create response
      const response = NextResponse.json(
        {
          message: 'Token refreshed',
          accessToken,
        },
        { status: 200 }
      );

      // 6. Update refresh token cookie
      setRefreshTokenCookie(response, newRefreshToken);

      // 7. Update last activity
      await sessionManager.updateSessionActivity(sessionId);

      safeLog.info('Token rotated successfully', {
        sessionId: sessionId.substring(0, 8),
      });

      return response;
    } catch (rotationError) {
      // Token reuse detected or invalid
      const errorMsg = String(rotationError);

      if (errorMsg.includes('reuse')) {
        safeLog.error('Token reuse attack detected', {
          sessionId: sessionId.substring(0, 8),
        });

        const response = NextResponse.json(
          { error: 'Session compromised - please login again' },
          { status: 401 }
        );
        clearRefreshTokenCookie(response);
        return response;
      }

      const response = NextResponse.json(
        { error: 'Token refresh failed' },
        { status: 401 }
      );
      clearRefreshTokenCookie(response);
      return response;
    }
  } catch (error) {
    safeLog.error('Refresh endpoint failed', {
      error: String(error).substring(0, 100),
    });

    return NextResponse.json(
      { error: 'Refresh failed' },
      { status: 500 }
    );
  }
}

/**
 * POST /api/auth/logout
 * 
 * Flow:
 * 1. Get session from request
 * 2. Revoke session
 * 3. Clear cookies
 * 4. Respond with success
 */
export async function postLogout(request: NextRequest) {
  try {
    const sessionId = request.cookies.get('sessionId')?.value;

    if (sessionId) {
      // Revoke session
      await sessionManager.revokeSession(sessionId, 'user_logout');
    }

    // Clear cookies
    const response = NextResponse.json(
      { message: 'Logged out successfully' },
      { status: 200 }
    );

    clearRefreshTokenCookie(response);

    safeLog.info('User logged out', {
      sessionId: sessionId?.substring(0, 8),
    });

    return response;
  } catch (error) {
    safeLog.error('Logout failed', {
      error: String(error).substring(0, 100),
    });

    // Still clear cookies on error
    const response = NextResponse.json(
      { message: 'Logged out' },
      { status: 200 }
    );
    clearRefreshTokenCookie(response);

    return response;
  }
}

/**
 * GET /api/auth/sessions
 * 
 * List all active sessions for current user
 * 
 * Security: Requires valid access token from Authorization header
 */
export async function getSessions(request: NextRequest, userId: string) {
  try {
    const sessions = await sessionManager.getUserActiveSessions(userId);

    return NextResponse.json(
      {
        sessions: sessions.map((s: any) => ({
          id: s.id,
          device: s.deviceName,
          ip: s.ipAddress,
          createdAt: s.createdAt,
          lastActivity: s.lastActivityAt,
        })),
      },
      { status: 200 }
    );
  } catch (error) {
    safeLog.error('Failed to get sessions', {
      error: String(error).substring(0, 100),
    });

    return NextResponse.json(
      { error: 'Failed to get sessions' },
      { status: 500 }
    );
  }
}

/**
 * POST /api/auth/sessions/:sessionId/revoke
 * 
 * Revoke a specific session
 * Useful for logging out other devices
 */
export async function postRevokeSession(request: NextRequest, sessionId: string) {
  try {
    await sessionManager.revokeSession(sessionId, 'user_revoked_session');

    safeLog.info('Session revoked by user', {
      sessionId: sessionId.substring(0, 8),
    });

    return NextResponse.json(
      { message: 'Session revoked' },
      { status: 200 }
    );
  } catch (error) {
    safeLog.error('Failed to revoke session', {
      error: String(error).substring(0, 100),
    });

    return NextResponse.json(
      { error: 'Failed to revoke session' },
      { status: 500 }
    );
  }
}
