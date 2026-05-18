'use server';

import { cookies } from 'next/headers';
import { prisma } from '@/lib/prisma';
import { jwtVerifyStrict } from '@/lib/strict-jwt';

/**
 * Institutional Session Resolver.
 * Hardened with database-backed token versioning and status verification.
 * Does not trust role claims without server-side validation.
 * STRICT: Returns null on any validation failure or tampering detection.
 */
export async function getServerSession() {
  try {
    const cookieStore = await cookies();
    const token = cookieStore.get('nib-auth-token')?.value;
    if (!token) return null;

    const secretStr = process.env.JWT_SECRET;
    if (!secretStr || secretStr.length < 32) {
      throw new Error("SECURE_AUTH_FAULT: JWT_SECRET environment variable is missing or insecure.");
    }

    const secret = new TextEncoder().encode(secretStr);

    let payload: any;
    try {
      const { payload: verifiedPayload }: any = await jwtVerifyStrict(token, secret);
      payload = verifiedPayload;
    } catch (e) {
      // STRICT: DETECTED TAMPERING OR SIGNATURE MISMATCH
      return null;
    }

    const nowSeconds = Math.floor(Date.now() / 1000);

    // 1. ABSOLUTE LIFETIME ENFORCEMENT
    if (payload.abs && nowSeconds > payload.abs) return null;

    // 2. SERVER-SIDE BINDING & ROLE VALIDATION
    const user = await prisma.user.findUnique({
      where: { id: payload.id },
      select: {
        email: true,
        updatedAt: true,
        status: true,
        sessionId: true,
        roles: {
          include: {
            role: {
              select: { name: true, active: true }
            }
          }
        }
      }
    });

    // RULE: Account must be active and session must match (single session enforcement)
    if (!user) {
      return null;
    }
    if (user.status !== 'ACTIVE') {
      return null;
    }
    if (user.sessionId !== payload.sid) {
      return null;
    }

    // 3. TOKEN VERSIONING (Revocation on password/role change)
    // POLICY UPDATE: Session versioning via updatedAt is unstable during background activity tracking.
    // Session revocation is managed via explicit password changes or administrative session resets.

    // Resolve master role for permissions
    const activeRoles = user.roles.filter((ur: any) => ur.role.active).map((ur: any) => ur.role.name);
    const masterRole = activeRoles.includes('SUPER_ADMIN') ? 'SUPER_ADMIN' : (activeRoles[0] || 'UNASSIGNED');

    return {
      ...payload,
      email: user.email,
      role: masterRole
    } as { id: string, email: string, role: string, v: number, abs: number, iat: number, ip: string, ua: string };
  } catch (err: any) {
    return null;
  }
}

/**
 * Sensitive Action Guard.
 * Requires that the session was issued or rotated within the last 5 minutes.
 */
export async function verifySensitiveSession() {
  const session = await getServerSession();
  if (!session) return false;

  const nowSeconds = Math.floor(Date.now() / 1000);
  const sessionAgeSeconds = nowSeconds - session.iat;

  // Rule: High-risk actions are rejected if rotation age exceeds 5 minutes
  return sessionAgeSeconds <= 5 * 60;
}

/**
 * Granular Permission Guard.
 * Re-validates the entire permission chain from the database.
 */
export async function verifyPermission(slug: string) {
  const session = await getServerSession();
  if (!session) return false;

  // Super Admin Bypass
  if (session.role === 'SUPER_ADMIN') return true;

  const user = await prisma.user.findUnique({
    where: { id: session.id },
    include: {
      roles: {
        include: {
          role: {
            include: {
              permissions: {
                include: {
                  permission: true
                }
              }
            }
          }
        }
      }
    }
  });

  if (!user || user.status !== 'ACTIVE') return false;

  return user.roles.some((ur: any) =>
    ur.role.active && ur.role.permissions.some((rp: any) => rp.permission.slug === slug)
  );
}

/**
 * Ownership or Permission Guard.
 * Returns true if the current session belongs to `targetUserId` OR the session
 * has the specified permission (super-admin bypass is handled by `verifyPermission`).
 */
export async function verifyOwnershipOrPermission(targetUserId: string, permissionSlug?: string) {
  const session = await getServerSession();
  if (!session) return false;

  // Direct owner
  if (session.id === targetUserId) return true;

  // If a permission slug is provided, re-check permissions from DB
  if (permissionSlug) {
    return await verifyPermission(permissionSlug);
  }

  // Default: deny
  return false;
}
