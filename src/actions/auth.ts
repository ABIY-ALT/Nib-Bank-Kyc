
'use server';

import { prisma } from '@/lib/prisma';

interface SyncUserData {
  id: string;
  email: string;
  name: string;
  role?: string;
  branch?: string;
  district?: string;
}

/**
 * Synchronizes a Firebase authenticated user with the SQL database via Prisma.
 * This is called during the login flow to ensure the user profile exists in PostgreSQL.
 */
export async function syncUserToSql(userData: SyncUserData) {
  try {
    const user = await prisma.user.upsert({
      where: { id: userData.id },
      update: {
        email: userData.email,
        name: userData.name,
        // Only update role/branch if provided from the source
        ...(userData.role && { role: userData.role as any }),
        ...(userData.branch && { branch: userData.branch }),
        ...(userData.district && { district: userData.district }),
      },
      create: {
        id: userData.id,
        email: userData.email,
        name: userData.name,
        role: (userData.role as any) || 'BRANCH_OFFICER',
        status: 'ACTIVE',
        branch: userData.branch || null,
        district: userData.district || null,
      },
    });
    return { success: true, user };
  } catch (error) {
    console.error('Failed to sync user to SQL:', error);
    return { success: false, error: 'Database synchronization failed' };
  }
}
