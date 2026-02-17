
'use server';

import { prisma } from '@/lib/prisma';
import { UserRole, UserStatus } from '@prisma/client';

interface SyncUserData {
  id: string;
  email: string;
  name: string;
  role?: string;
  branch?: string;
  district?: string;
  status?: string;
  phoneNumber?: string;
}

/**
 * Synchronizes a user profile with the SQL database via Prisma.
 */
export async function syncUserToSql(userData: SyncUserData) {
  try {
    const status = (userData.status?.toUpperCase() as UserStatus) || UserStatus.ACTIVE;
    
    // Normalize role string to Prisma Enum
    let rawRole = userData.role?.toUpperCase() || 'BRANCH_OFFICER';
    rawRole = rawRole.replace(/\s+/g, '_');
    const role = rawRole as UserRole;

    const user = await prisma.user.upsert({
      where: { id: userData.id },
      update: {
        email: userData.email,
        name: userData.name,
        role: role,
        status: status,
        districtName: userData.district || null,
        branchName: userData.branch || null,
        phoneNumber: userData.phoneNumber || null,
      },
      create: {
        id: userData.id,
        email: userData.email,
        name: userData.name,
        role: role,
        status: status,
        districtName: userData.district || null,
        branchName: userData.branch || null,
        phoneNumber: userData.phoneNumber || null,
      },
    });

    return { success: true, user };
  } catch (error) {
    console.error('[SQL Sync] Error:', error);
    return { 
      success: false, 
      error: error instanceof Error ? error.message : 'Database error.' 
    };
  }
}

export async function getUserProfile(userId: string) {
  try {
    const user = await prisma.user.findUnique({
      where: { id: userId }
    });
    return user;
  } catch (error) {
    return null;
  }
}

export async function getUserByEmail(email: string) {
  try {
    return await prisma.user.findUnique({
      where: { email }
    });
  } catch (error) {
    return null;
  }
}
