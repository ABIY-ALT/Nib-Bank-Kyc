'use server';

import { cookies } from 'next/headers';
import { jwtVerify } from 'jose';
import { prisma } from '@/lib/prisma';

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

    const secretStr = process.env.JWT_SECRET || "";
    if (secretStr.length < 32) return null;

    const secret = new TextEncoder().encode(secretStr);
    
    let payload: any;
    try {
      const { payload: verifiedPayload }: any = await jwtVerify(token, secret);
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
        updatedAt: true, 
        status: true, 
        roles: { 
          include: { 
            role: {
              select: { name: true, active: true }
            } 
          } 
        } 
      }
    });

    // RULE: Account must be active and role must be valid
    if (!user || user.status !== 'ACTIVE') return null;

    // 3. TOKEN VERSIONING (Revocation on password/role change)
    const currentVersion = Math.floor(user.updatedAt.getTime() / 1000);
    if (payload.v !== currentVersion) return null;
    
    // Resolve master role for permissions
    const activeRoles = user.roles.filter(ur => ur.role.active).map(ur => ur.role.name);
    const masterRole = activeRoles.includes('SUPER_ADMIN') ? 'SUPER_ADMIN' : (activeRoles[0] || 'VIEWER');

    return {
      ...payload,
      role: masterRole
    } as { id: string, email: string, role: string, v: number, abs: number, iat: number, ip: string, ua: string };
  } catch {
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

  return user.roles.some(ur => 
    ur.role.active && ur.role.permissions.some(rp => rp.permission.slug === slug)
  );
}
