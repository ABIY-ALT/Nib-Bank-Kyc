'use server';

import { cookies } from 'next/headers';
import { jwtVerify } from 'jose';
import { prisma } from '@/lib/prisma';

/**
 * Institutional Session Resolver.
 * Cryptographically verifies the __Secure- auth token and validates against DB version.
 */
export async function getServerSession() {
  try {
    const cookieStore = await cookies();
    const token = cookieStore.get('__Secure-auth-token')?.value;
    if (!token) return null;

    const secret = new TextEncoder().encode(process.env.JWT_SECRET || 'institutional_default_secret_32_chars_min');
    const { payload }: any = await jwtVerify(token, secret);
    
    // SERVER-SIDE REVOCATION CHECK
    // Every Server Action must verify that the session hasn't been rotated or revoked.
    const user = await prisma.user.findUnique({
      where: { id: payload.id },
      select: { updatedAt: true }
    });

    if (!user || payload.v !== user.updatedAt.getTime()) {
      return null;
    }
    
    return payload as { id: string, email: string, role: string, v: number };
  } catch {
    return null;
  }
}

/**
 * Server-side Permission Guard.
 * Validates if the active session holds the required capability slug.
 */
export async function verifyPermission(slug: string) {
  const session = await getServerSession();
  if (!session) return false;

  const user = await prisma.user.findUnique({
    where: { id: session.id },
    include: {
      roles: {
        include: {
          role: {
            include: {
              permissions: {
                include: { permission: true }
              }
            }
          }
        }
      }
    }
  });

  if (!user) return false;
  
  // Rule: Master Admin bypasses slug check
  if (user.roles.some(ur => ur.role.name === 'SUPER_ADMIN')) return true;

  return user.roles.some(ur => 
    ur.role.permissions.some(rp => rp.permission.slug === slug)
  );
}