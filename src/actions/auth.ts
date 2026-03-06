'use server';

import { prisma } from '@/lib/prisma';

/**
 * Fetches a user profile for session hydration or internal verification.
 * EXCLUDES hashed passwords to prevent accidental exposure in client-facing calls.
 */
export async function getUserProfile(userId: string) {
  try {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      include: { 
        branch: {
          include: { district: true }
        }, 
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

    if (!user) return null;

    // Stripping sensitive credential hash
    const { password: _, ...userWithoutPassword } = user;
    return userWithoutPassword;
  } catch (error) {
    return null;
  }
}

/**
 * Fetches a user by email.
 * EXCLUDES hashed passwords.
 */
export async function getUserByEmail(email: string) {
  try {
    const user = await prisma.user.findUnique({
      where: { email },
      include: { 
        branch: {
          include: { district: true }
        },
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

    if (!user) return null;

    const { password: _, ...userWithoutPassword } = user;
    return userWithoutPassword;
  } catch (error) {
    return null;
  }
}
