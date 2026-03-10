
'use server';

import { cookies } from 'next/headers';
import { jwtVerify } from 'jose';
import { prisma } from '@/lib/prisma';

/**
 * Institutional Session Resolver.
 * Hardened with token versioning and short session awareness.
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

    if (payload.abs && nowSeconds > payload.abs) return null;

    const user = await prisma.user.findUnique({
      where: { id: payload.id },
      select: { updatedAt: true, status: true, roles: { include: { role: true } } }
    });

    if (!user || user.status !== 'ACTIVE') return null;

    const currentVersion = Math.floor(user.updatedAt.getTime() / 1000);
    if (payload.v !== currentVersion) return null;
    
    return {
      ...payload,
      role: user.roles.some(ur => ur.role.name === 'SUPER_ADMIN') ? 'SUPER_ADMIN' : payload.role
    } as { id: string, email: string, role: string, v: number, abs: number, iat: number, ip: string };
  } catch {
    return null;
  }
}

/**
 * Sensitive Action Guard.
 * Requires that the session was issued or refreshed within the last 5 minutes.
 * This satisfies the "Require re-authentication for sensitive actions" requirement programmatically.
 */
export async function verifySensitiveSession() {
  const session = await getServerSession();
  if (!session) return false;

  const nowSeconds = Math.floor(Date.now() / 1000);
  const sessionAgeSeconds = nowSeconds - session.iat;

  // Rule: Action is rejected if session age exceeds 5 minutes
  return sessionAgeSeconds <= 5 * 60;
}

export async function verifyPermission(slug: string) {
  const session = await getServerSession();
  if (!session) return false;

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
  if (user.roles.some(ur => ur.role.name === 'SUPER_ADMIN')) return true;

  return user.roles.some(ur => 
    ur.role.permissions.some(rp => rp.permission.slug === slug)
  );
}
