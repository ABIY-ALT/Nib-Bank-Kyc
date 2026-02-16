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
 * This ensures that administrative changes and logins are mirrored in PostgreSQL.
 */
export async function syncUserToSql(userData: SyncUserData) {
  try {
    console.log(`[SQL Sync] Synchronizing user: ${userData.email}`);
    
    // Normalize status and role to match Prisma Enums strictly (UPPER_SNAKE_CASE)
    const status = (userData.status?.toUpperCase() as any) || 'ACTIVE';
    
    // Ensure role is normalized to standard SQL enum naming
    let rawRole = userData.role?.toUpperCase() || 'BRANCH_OFFICER';
    rawRole = rawRole.replace(/\s+/g, '_');
    
    const role = rawRole as any;

    const user = await prisma.user.upsert({
      where: { id: userData.id },
      update: {
        email: userData.email,
        name: userData.name,
        role: role,
        status: status,
        districtName: userData.district || null,
        branchName: userData.branch || null,
      },
      create: {
        id: userData.id,
        email: userData.email,
        name: userData.name,
        role: role,
        status: status,
        districtName: userData.district || null,
        branchName: userData.branch || null,
      },
    });

    console.log(`[SQL Sync] Success for ${userData.email} (ID: ${userData.id})`);
    return { success: true, user };
  } catch (error) {
    console.error('[SQL Sync] Critical Failure:', error);
    return { 
      success: false, 
      error: error instanceof Error ? error.message : 'Database connection error. Ensure "npx prisma migrate dev" has been run.' 
    };
  }
}
