'use server';

import { prisma } from '@/lib/prisma';
import { UserStatus } from '@prisma/client';

interface SyncUserData {
  id: string;
  email: string;
  name: string;
}

export async function syncUserToSql(userData: SyncUserData) {
  try {
    const nameParts = userData.name.split(' ');
    const firstName = nameParts[0] || 'Unknown';
    const lastName = nameParts.slice(1).join(' ') || 'User';

    const user = await prisma.user.upsert({
      where: { firebaseUid: userData.id },
      update: { email: userData.email, firstName, lastName },
      create: {
        id: userData.id,
        firebaseUid: userData.id,
        email: userData.email,
        firstName,
        lastName,
        status: UserStatus.ACTIVE,
      },
    });

    return { success: true, user };
  } catch (error) {
    console.error('[SQL Sync] Error:', error);
    return { success: false, error: 'Database error.' };
  }
}

export async function getUserProfile(uid: string) {
  try {
    return await prisma.user.findUnique({
      where: { firebaseUid: uid },
      include: { 
        branch: true, 
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
  } catch (error) {
    return null;
  }
}

export async function getUserByEmail(email: string) {
  try {
    return await prisma.user.findUnique({
      where: { email },
      include: { 
        branch: true, 
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
  } catch (error) {
    return null;
  }
}
