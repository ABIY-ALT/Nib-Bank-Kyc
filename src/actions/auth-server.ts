'use server';

import { cookies } from 'next/headers';
import { jwtVerify } from 'jose';
import { prisma } from '@/lib/prisma';

/**
 * Institutional Session Resolver.
 * Cryptographically verifies the auth token and validates against DB version.
 */
export async function getServerSession() {
  try {
    const cookieStore = await cookies();
    const token = cookieStore.get('nib-auth-token')?.value;
    if (!token) return null;

    const secret = new TextEncoder().encode(process.env.JWT_SECRET || 'institutional_default_secret_32_chars_min');
    const { payload }: any = await jwtVerify(token, secret);
    
    const nowSeconds = Math.floor(Date.now() / 1000);

    if (payload.abs && nowSeconds > payload.abs) return null;

    const user = await prisma.user.findUnique({
      where: { id: payload.id },
      select: { updatedAt: true }
    });

    if (!user) return null;

    const currentVersion = Math.floor(user.updatedAt.getTime() / 1000);
    if (payload.v !== currentVersion) return null;
    
    return payload as { id: string, email: string, role: string, v: number, abs: number, ip: string };
  } catch {
    return null;
  }
}

/**
 * Server-side Permission Guard.
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
  
  // Real-time role check for bypass
  if (user.roles.some(ur => ur.role.name === 'SUPER_ADMIN')) return true;

  return user.roles.some(ur => 
    ur.role.permissions.some(rp => rp.permission.slug === slug)
  );
}