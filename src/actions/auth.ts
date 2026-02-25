
'use server';

import { prisma } from '@/lib/prisma';

export async function getUserProfile(userId: string) {
  try {
    return await prisma.user.findUnique({
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
  } catch (error) {
    return null;
  }
}

export async function getUserByEmail(email: string) {
  try {
    return await prisma.user.findUnique({
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
  } catch (error) {
    return null;
  }
}
