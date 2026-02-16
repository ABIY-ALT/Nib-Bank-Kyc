
'use server';

import { prisma } from '@/lib/prisma';

interface SyncUserData {
  id: string;
  email: string;
  name: string;
  role?: string;
  branch?: string;
  district?: string;
  status?: string;
}

/**
 * Synchronizes a user profile with the SQL database via Prisma.
 * This is called during login and during administrative user management.
 */
export async function syncUserToSql(userData: SyncUserData) {
  try {
    console.log(`[SQL Sync] Synchronizing user: ${userData.email}`);
    
    // Normalize status and role to match Prisma Enums
    const status = (userData.status?.toUpperCase() as any) || 'ACTIVE';
    const role = (userData.role?.toUpperCase().replace(/\s+/g, '_') as any) || 'BRANCH_OFFICER';

    const user = await prisma.user.upsert({
      where: { id: userData.id },
      update: {
        email: userData.email,
        name: userData.name,
        role: role,
        status: status,
        branch: userData.branch || null,
        district: userData.district || null,
      },
      create: {
        id: userData.id,
        email: userData.email,
        name: userData.name,
        role: role,
        status: status,
        branch: userData.branch || null,
        district: userData.district || null,
      },
    });

    console.log(`[SQL Sync] Success for ${userData.email}`);
    return { success: true, user };
  } catch (error) {
    console.error('[SQL Sync] Error:', error);
    return { success: false, error: 'Database synchronization failed' };
  }
}
