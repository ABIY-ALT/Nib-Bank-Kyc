import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { headers, cookies } from 'next/headers';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import { 
  applySecurityHeaders, 
  unauthorizedResponse,
  successResponse,
  getClientIp,
  badRequestResponse,
  internalErrorResponse
} from '@/lib/api-security';

/**
 * Token Refresh Endpoint
 * - Validates refresh token
 * - Checks idle timeout (15 minutes default)
 * - Issues new access_token (15m expiry)
 * - Rotates refresh_token (1d expiry)
 * - Updates last_activity
 */

const IDLE_TIMEOUT_MINUTES = 30; // User considered idle after this duration
const IS_PROD = process.env.NODE_ENV === 'production';

export async function POST(req: Request) {
  try {
    const cookieStore = await cookies();
    const headerList = await headers();
    const clientIp = getClientIp(req);
    const userAgent = headerList.get('user-agent') || 'unknown';
    const uaHash = crypto.createHash('sha256').update(userAgent).digest('hex');

    // Get refresh token from request body (for API clients) or attempt from cookie
    const text = await req.text();
    let body: any = {};
    
    if (text) {
      try {
        body = JSON.parse(text);
      } catch {
        // Continue if no body
      }
    }

    const refreshTokenFromBody = body.refreshToken;
    const refreshTokenFromCookie = cookieStore.get('nib-refresh-token')?.value;
    const refreshToken = refreshTokenFromBody || refreshTokenFromCookie;
    const accessTokenCookie = cookieStore.get('nib-auth-token')?.value;

    if (!refreshToken && !accessTokenCookie) {
      return badRequestResponse('Missing refresh token');
    }

    // If we have access token cookie, extract user ID from it first
    const secret = process.env.JWT_SECRET;
    if (!secret) {
      throw new Error('JWT_SECRET not configured');
    }

    let userId: string | null = null;
    let sessionId: string | null = null;

    if (accessTokenCookie) {
      try {
        const decoded: any = jwt.verify(accessTokenCookie, secret);
        userId = decoded.id;
        sessionId = decoded.sid;
      } catch {
        // Token might be expired, that's ok - we'll use the refresh token
      }
    }

    if (!userId) {
      return unauthorizedResponse('Unable to identify user');
    }

    // Fetch user and validate refresh token
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        status: true,
        sessionId: true,
        refreshToken: true,
        refreshTokenExpiry: true,
        lastActivity: true,
        updatedAt: true,
        needsPasswordChange: true,
        branchId: true,
        districtName: true,
        assignedBranches: true,
        branch: { include: { district: true } },
        roles: { 
          include: { 
            role: { 
              include: { 
                permissions: { include: { permission: true } } 
              } 
            } 
          } 
        }
      }
    });

    if (!user || user.status !== 'ACTIVE') {
      return unauthorizedResponse('User not found or inactive');
    }

    // Verify session ID matches
    if (user.sessionId !== sessionId) {
      return unauthorizedResponse('Session invalidated');
    }

    // Validate refresh token exists and hasn't expired
    if (!user.refreshToken || !user.refreshTokenExpiry) {
      return unauthorizedResponse('No valid refresh token');
    }

    if (new Date() > user.refreshTokenExpiry) {
      return unauthorizedResponse('Refresh token expired');
    }

    // Verify refresh token matches (compare with hashed)
    const refreshTokenValid = await bcrypt.compare(
      refreshToken || '',
      user.refreshToken
    );

    if (!refreshTokenValid) {
      return unauthorizedResponse('Invalid refresh token');
    }

    // Check idle timeout
    const idleTimeoutMs = IDLE_TIMEOUT_MINUTES * 60 * 1000;
    const timeSinceLastActivity = Date.now() - user.lastActivity.getTime();

    if (timeSinceLastActivity > idleTimeoutMs) {
      // Invalidate session
      await prisma.user.update({
        where: { id: user.id },
        data: {
          refreshToken: null,
          refreshTokenExpiry: null,
          sessionId: null,
          lastActivity: new Date()
        }
      });

      await prisma.auditLog.create({
        data: {
          userId: user.id,
          userEmail: user.email,
          action: 'REFRESH_IDLE_TIMEOUT',
          ipAddress: clientIp,
          details: `Session terminated due to idle timeout (${IDLE_TIMEOUT_MINUTES}m)`
        }
      });

      return unauthorizedResponse('Session expired due to inactivity');
    }

    // Generate new access token (15m expiry)
    // SECURITY FIX #3: Minimal JWT payload - only essential claims
    const nowSeconds = Math.floor(Date.now() / 1000);
    const absoluteLimit = nowSeconds + (8 * 60 * 60);
    const currentVersion = Math.floor(user.updatedAt.getTime() / 1000);

    const newAccessToken = jwt.sign(
      {
        id: user.id,
        sid: user.sessionId,
        v: currentVersion,
        abs: absoluteLimit,
        needsPasswordChange: user.needsPasswordChange
      },
      secret,
      { expiresIn: '30m' }
    );

    // Generate new refresh token (1d expiry)
    const newRefreshTokenPlain = crypto.randomBytes(32).toString('hex');
    const newRefreshTokenHashed = await bcrypt.hash(newRefreshTokenPlain, 10);
    const refreshTokenExpiry = new Date(Date.now() + 24 * 60 * 60 * 1000); // 1 day

    // Update user with new tokens and activity
    await prisma.user.update({
      where: { id: user.id },
      data: {
        refreshToken: newRefreshTokenHashed,
        refreshTokenExpiry,
        lastActivity: new Date()
      }
    });

    await prisma.auditLog.create({
      data: {
        userId: user.id,
        userEmail: user.email,
        action: 'TOKEN_ROTATED',
        ipAddress: clientIp,
        details: 'Access token refreshed and refresh token rotated'
      }
    });

    const response = successResponse({
      success: true,
      accessToken: newAccessToken,
      expiresIn: 15 * 60,
      user: {
        id: user.id,
        firstName: user.firstName,
        lastName: user.lastName,
        name: `${user.firstName} ${user.lastName}`,
        email: user.email,
        status: user.status,
        needsPasswordChange: user.needsPasswordChange
      }
    });

    response.cookies.set('nib-auth-token', newAccessToken, {
      httpOnly: true,
      secure: IS_PROD,
      sameSite: 'strict',
      maxAge: 60 * 15,
      path: '/',
    });

    // SECURITY: Rotate refresh token cookie
    response.cookies.set('nib-refresh-token', newRefreshTokenPlain, {
      httpOnly: true,
      secure: IS_PROD,
      sameSite: 'strict',
      maxAge: 24 * 60 * 60, // 1 day
      path: '/',
    });

    return response;
  } catch (error: any) {
    return internalErrorResponse('Token refresh failed');
  }
}
