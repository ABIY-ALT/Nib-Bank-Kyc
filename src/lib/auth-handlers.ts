/**
 * Authentication Handler
 * Verifies JWT tokens and authenticates requests
 * 
 * Security: Uses jose for JWT verification (compliant with Web Standards)
 */

import { NextRequest } from 'next/server';
import { jwtVerify } from 'jose';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

/**
 * Get JWT secret from environment
 * Ensures secret is properly loaded and available
 */
function getJWTSecret(): Uint8Array {
  const secret = process.env.JWT_SECRET;
  
  if (!secret) {
    throw new Error('JWT_SECRET environment variable is not set');
  }
  
  if (secret.length < 64) {
    throw new Error('JWT_SECRET must be at least 64 characters');
  }
  
  return new TextEncoder().encode(secret);
}

/**
 * Authenticate incoming request using JWT token from Authorization header
 * 
 * @param request - NextRequest object
 * @returns User object if authenticated, null if authentication fails
 */
export async function authenticateRequest(request: NextRequest) {
  try {
    // Extract token from Authorization header
    const authHeader = request.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return null;
    }

    const token = authHeader.replace('Bearer ', '');
    if (!token) {
      return null;
    }

    // Verify JWT token
    const secret = getJWTSecret();
    const { payload } = await jwtVerify(token, secret);
    
    if (!payload.sub) {
      return null;
    }

    // Fetch user from database
    const user = await prisma.user.findUnique({
      where: { id: payload.sub as string },
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        phoneNumber: true,
        status: true,
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
      return null;
    }

    const activeRoleNames = (user.roles ?? [])
      .filter((userRole: any) => userRole.role?.active)
      .map((userRole: any) => userRole.role.name);

    return {
      ...user,
      role: activeRoleNames.includes('SUPER_ADMIN')
        ? 'SUPER_ADMIN'
        : (activeRoleNames[0] || 'UNASSIGNED'),
    };
  } catch (error) {
    // Log error for security monitoring (without sensitive data)
    console.error('Authentication error:', error instanceof Error ? error.message : 'Unknown error');
    return null;
  }
}

/**
 * Verify JWT token without fetching user
 * Useful for API-level checks
 * 
 * @param token - JWT token string
 * @returns Decoded payload if valid, null if invalid
 */
export async function verifyJWT(token: string) {
  try {
    const secret = getJWTSecret();
    const { payload } = await jwtVerify(token, secret);
    return payload;
  } catch {
    return null;
  }
}
