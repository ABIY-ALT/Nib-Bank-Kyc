/**
 * User Ownership Validator
 * 
 * Prevents User ID Manipulation (CWE-639)
 * Ensures users can only access their own data unless admin
 * 
 * File: src/lib/user-ownership-validator.ts
 * Severity: CRITICAL - Horizontal Privilege Escalation Prevention
 */

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { jwtVerifyStrict } from '@/lib/strict-jwt';

if (!process.env.JWT_SECRET) {
  throw new Error('FATAL: JWT_SECRET environment variable is not set. Cannot initialise ownership validator.');
}
const JWT_SECRET = new TextEncoder().encode(process.env.JWT_SECRET);

/**
 * Verify that authenticated user can access the requested resource ID
 * 
 * @param request - NextRequest with Authorization header
 * @param requestedUserId - User ID from URL parameter (e.g., /api/users/123)
 * @returns { authorized: boolean, userId?: string, isAdmin?: boolean, error?: string }
 */
export async function verifyUserOwnership(
  request: NextRequest,
  requestedUserId: string
): Promise<{
  authorized: boolean;
  userId?: string;
  isAdmin?: boolean;
  error?: string;
}> {
  try {
    // ===== STEP 1: Extract JWT from Authorization header =====
    const authHeader = request.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return {
        authorized: false,
        error: 'Missing or invalid Authorization header',
      };
    }

    const token = authHeader.substring(7);

    // ===== STEP 2: Verify JWT signature =====
    let decoded: any;
    try {
      const verified = await jwtVerifyStrict(token, JWT_SECRET);
      decoded = verified.payload;
    } catch (err) {
      return {
        authorized: false,
        error: 'Invalid or expired token',
      };
    }

    const authenticatedUserId = decoded.sub || decoded.userId;
    if (!authenticatedUserId) {
      return {
        authorized: false,
        error: 'Token does not contain user ID',
      };
    }

    // ===== STEP 3: Check if user is admin =====
    const user = await prisma.user.findUnique({
      where: { id: authenticatedUserId },
      select: {
        id: true,
        roles: {
          select: {
            role: {
              select: {
                name: true,
                permissions: {
                  select: {
                    permission: {
                      select: { slug: true }
                    }
                  }
                }
              }
            }
          }
        }
      }
    });

    if (!user) {
      return {
        authorized: false,
        error: 'User not found',
      };
    }

    const isAdmin = user.roles?.some((ur: any) =>
      ur.role?.permissions?.some((rp: any) =>
        rp.permission?.slug === 'ADMIN_ACCESS' || rp.permission?.slug === 'SUPER_ADMIN'
      )
    ) || false;

    // ===== STEP 4: Ownership check =====
    // Users can access their own data
    if (authenticatedUserId === requestedUserId) {
      return {
        authorized: true,
        userId: authenticatedUserId,
        isAdmin,
      };
    }

    // Only admins can access other users' data
    if (isAdmin) {
      return {
        authorized: true,
        userId: authenticatedUserId,
        isAdmin: true,
      };
    }

    // Non-admin trying to access another user's data = VIOLATION
    return {
      authorized: false,
      userId: authenticatedUserId,
      isAdmin: false,
      error: 'You cannot access this user\'s data',
    };
  } catch (error) {
    return {
      authorized: false,
      error: 'Authorization check failed',
    };
  }
}

/**
 * Verify that authenticated user can perform admin-only actions
 */
export async function verifyAdminAccess(
  request: NextRequest
): Promise<{
  authorized: boolean;
  userId?: string;
  error?: string;
}> {
  try {
    const authHeader = request.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return {
        authorized: false,
        error: 'Missing or invalid Authorization header',
      };
    }

    const token = authHeader.substring(7);

    let decoded: any;
    try {
      const verified = await jwtVerifyStrict(token, JWT_SECRET);
      decoded = verified.payload;
    } catch (err) {
      return {
        authorized: false,
        error: 'Invalid or expired token',
      };
    }

    const authenticatedUserId = decoded.sub || decoded.userId;
    if (!authenticatedUserId) {
      return {
        authorized: false,
        error: 'Token does not contain user ID',
      };
    }

    // Check admin permissions
    const user = await prisma.user.findUnique({
      where: { id: authenticatedUserId },
      select: {
        roles: {
          select: {
            role: {
              select: {
                permissions: {
                  select: {
                    permission: {
                      select: { slug: true }
                    }
                  }
                }
              }
            }
          }
        }
      }
    });

    const isAdmin = user?.roles?.some((ur: any) =>
      ur.role?.permissions?.some((rp: any) =>
        rp.permission?.slug === 'ADMIN_ACCESS' || rp.permission?.slug === 'SUPER_ADMIN'
      )
    ) || false;

    if (!isAdmin) {
      return {
        authorized: false,
        userId: authenticatedUserId,
        error: 'Admin access required',
      };
    }

    return {
      authorized: true,
      userId: authenticatedUserId,
    };
  } catch (error) {
    return {
      authorized: false,
      error: 'Authorization check failed',
    };
  }
}

/**
 * Check if authenticated user has specific permission
 */
export async function verifyPermissionAccess(
  request: NextRequest,
  requiredPermission: string
): Promise<{
  authorized: boolean;
  userId?: string;
  error?: string;
}> {
  try {
    const authHeader = request.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return {
        authorized: false,
        error: 'Missing or invalid Authorization header',
      };
    }

    const token = authHeader.substring(7);

    let decoded: any;
    try {
      const verified = await jwtVerifyStrict(token, JWT_SECRET);
      decoded = verified.payload;
    } catch (err) {
      return {
        authorized: false,
        error: 'Invalid or expired token',
      };
    }

    const authenticatedUserId = decoded.sub || decoded.userId;
    if (!authenticatedUserId) {
      return {
        authorized: false,
        error: 'Token does not contain user ID',
      };
    }

    // Check for specific permission
    const user = await prisma.user.findUnique({
      where: { id: authenticatedUserId },
      select: {
        roles: {
          select: {
            role: {
              select: {
                permissions: {
                  select: {
                    permission: {
                      select: { slug: true }
                    }
                  }
                }
              }
            }
          }
        }
      }
    });

    const hasPermission = user?.roles?.some((ur: any) =>
      ur.role?.permissions?.some((rp: any) =>
        rp.permission?.slug === requiredPermission
      )
    ) || false;

    if (!hasPermission) {
      return {
        authorized: false,
        userId: authenticatedUserId,
        error: `Permission '${requiredPermission}' required`,
      };
    }

    return {
      authorized: true,
      userId: authenticatedUserId,
    };
  } catch (error) {
    return {
      authorized: false,
      error: 'Authorization check failed',
    };
  }
}

/**
 * Verify that the authenticated user owns a specific record in the database.
 */
export async function verifyRecordOwnership(
  request: NextRequest,
  modelName: string,
  recordId: string,
  ownerField: string
): Promise<{ authorized: boolean; isAdmin: boolean; userId?: string }> {
  try {
    const identity = await verifyUserOwnership(request, '');
    
    // Identity.authorized will be false if the ID match failed, but we only care about if they are logged in
    // and if they are an admin.
    const userId = identity.userId;
    const isAdmin = identity.isAdmin || false;

    if (!userId) {
      return { authorized: false, isAdmin: false };
    }

    if (isAdmin) {
      return { authorized: true, isAdmin: true, userId };
    }

    const model = (prisma as any)[modelName];
    if (!model) return { authorized: false, isAdmin: false };

    const record = await model.findUnique({
      where: { id: recordId },
      select: { [ownerField]: true }
    });

    if (!record) return { authorized: false, isAdmin: false };

    return { 
      authorized: record[ownerField] === userId, 
      isAdmin: false, 
      userId 
    };
  } catch (error) {
    return { authorized: false, isAdmin: false };
  }
}
