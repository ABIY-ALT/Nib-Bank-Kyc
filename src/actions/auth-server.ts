'use server';

import { cookies } from 'next/headers';
import { jwtVerify } from 'jose';
import { prisma } from '@/lib/prisma';

/**
 * Institutional Session Resolver.
 * Cryptographically verifies the auth token, validates against DB version,
 * and enforces absolute session lifetime boundaries.
 */
export async function getServerSession() {
  try {
    const cookieStore = await cookies();
    const token = cookieStore.get('nib-auth-token')?.value;
    if (!token) return null;

    const secret = new TextEncoder().encode(process.env.JWT_SECRET || 'institutional_default_secret_32_chars_min');
    const { payload }: any = await jwtVerify(token, secret);
    
    const nowSeconds = Math.floor(Date.now() / 1000);

    // 1. ABSOLUTE LIFETIME CHECK
    if (payload.abs && nowSeconds > payload.abs) {
      return null;
    }

    // 2. SERVER-SIDE REVOCATION CHECK
    const user = await prisma.user.findUnique({
      where: { id: payload.id },
      select: { updatedAt: true }
    });

    if (!user) return null;

    // Use second-level precision to match token storage
    const currentVersion = Math.floor(user.updatedAt.getTime() / 1000);
    if (payload.v !== currentVersion) {
      return null;
    }
    
    return payload as { id: string, email: string, role: string, v: number, abs: number, ip: string };
  } catch {
    return null;
  }
}

/**
 * Server-side Permission Guard.
 * Validates if the active session holds the required capability slug.
 * HARDENED: Super Admin bypasses all slug-level restrictions.
 */
export async function verifyPermission(slug: string) {
  const session = await getServerSession();
  if (!session) return false;

  // RULE: Master Admin Override (Absolute Bypass)
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

  if (!user) return false;
  
  // Secondary check for role name in DB
  if (user.roles.some(ur => ur.role.name === 'SUPER_ADMIN')) return true;

  // Standard RBAC check
  return user.roles.some(ur => 
    ur.role.permissions.some(rp => rp.permission.slug === slug)
  );
}
