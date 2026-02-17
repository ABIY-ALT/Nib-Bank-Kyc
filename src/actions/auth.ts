'use server';

import { prisma } from '@/lib/prisma';
import { UserStatus } from '@prisma/client';

interface SyncUserData {
  id: string;
  email: string;
  name: string; // Combined name from Firebase for JIT
  role?: string;
  branchId?: string;
  status?: string;
  phoneNumber?: string;
}

/**
 * Synchronizes a user profile with the SQL database via Prisma.
 * Handles split names for the Institutional Blueprint.
 */
export async function syncUserToSql(userData: SyncUserData) {
  try {
    const status = (userData.status?.toUpperCase() as UserStatus) || UserStatus.ACTIVE;
    const role = userData.role || 'BRANCH_OFFICER';

    // Institutional name splitting
    const nameParts = userData.name.split(' ');
    const firstName = nameParts[0] || 'Unknown';
    const lastName = nameParts.slice(1).join(' ') || 'User';

    const user = await prisma.user.upsert({
      where: { firebaseUid: userData.id },
      update: {
        email: userData.email,
        firstName,
        lastName,
        role: role,
        status: status,
        branchId: userData.branchId || null,
        phoneNumber: userData.phoneNumber || null,
      },
      create: {
        id: userData.id,
        firebaseUid: userData.id,
        email: userData.email,
        firstName,
        lastName,
        role: role,
        status: status,
        branchId: userData.branchId || null,
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

export async function getUserProfile(uid: string) {
  try {
    return await prisma.user.findUnique({
      where: { firebaseUid: uid },
      include: { branch: true }
    });
  } catch (error) {
    return null;
  }
}

export async function getUserByEmail(email: string) {
  try {
    return await prisma.user.findUnique({
      where: { email },
      include: { branch: true }
    });
  } catch (error) {
    return null;
  }
}
