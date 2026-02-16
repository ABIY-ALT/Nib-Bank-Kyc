
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
    
    // Normalize status and role to match Prisma Enums strictly
    // Defaults are set if the values are missing or invalid
    const status = (userData.status?.toUpperCase() as any) || 'ACTIVE';
    const rawRole = userData.role?.toUpperCase().replace(/\s+/g, '_') || 'BRANCH_OFFICER';
    
    // Use type casting to match generated Prisma Enums
    const role = rawRole as any;

    const user = await prisma.user.upsert({
      where: { id: userData.id },
      update: {
        email: userData.email,
        name: userData.name,
        role: role,
        status: status,
        // In this implementation, we store branch/district names as strings if relations aren't fully mapped
      },
      create: {
        id: userData.id,
        email: userData.email,
        name: userData.name,
        role: role,
        status: status,
      },
    });

    console.log(`[SQL Sync] Success for ${userData.email} (ID: ${userData.id})`);
    return { success: true, user };
  } catch (error) {
    console.error('[SQL Sync] Critical Failure:', error);
    return { 
      success: false, 
      error: error instanceof Error ? error.message : 'Database synchronization failed due to internal connection error' 
    };
  }
}
