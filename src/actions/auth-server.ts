
'use server';

import { cookies } from 'next/headers';
import { jwtVerify } from 'jose';
import { prisma } from '@/lib/prisma';

/**
 * Institutional Session Resolver.
 * Hardened with token versioning and absolute lifetime verification.
 */
export async function getServerSession() {
  try {
    const cookieStore = await cookies();
    const token = cookieStore.get('nib-auth-token')?.value;
    if (!token) return null;

    const secretStr = process.env.JWT_SECRET || "";
    if (secretStr.length < 32) return null;

    const secret = new TextEncoder().encode(secretStr);
    const { payload }: any = await jwtVerify(token, secret);
    
    const nowSeconds = Math.floor(Date.now() / 1000);

    // 1. Absolute Limit Check
    if (payload.abs && nowSeconds > payload.abs) return null;

    // 2. Versioning Check (DB Verification)
    const user = await prisma.user.findUnique({
      where: { id: payload.id },
      select: { updatedAt: true, status: true, roles: { include: { role: true } } }
    });

    if (!user || user.status !== 'ACTIVE') return null;

    // Token rotation check
    const currentVersion = Math.floor(user.updatedAt.getTime() / 1000);
    if (payload.v !== currentVersion) return null;
    
    return {
      ...payload,
      role: user.roles.some(ur => ur.role.name === 'SUPER_ADMIN') ? 'SUPER_ADMIN' : payload.role
    } as { id: string, email: string, role: string, v: number, abs: number, ip: string };
  } catch {
    return null;
  }
}

/**
 * Server-side Permission Guard.
 * MASTER BYPASS: Super Admin role is evaluated at the session level for total command.
 */
export async function verifyPermission(slug: string) {
  const session = await getServerSession();
  if (!session) return false;

  // Level 1: JWT Role Bypass
  if (session.role === 'SUPER_ADMIN') return true;

  // Level 2: Database Role Verification
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
  
  if (user.roles.some(ur => ur.role.name === 'SUPER_ADMIN')) return true;

  return user.roles.some(ur => 
    ur.role.permissions.some(rp => rp.permission.slug === slug)
  );
}
