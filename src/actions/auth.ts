'use server';

import { prisma } from '@/lib/prisma';

/**
 * Fetches a user profile for session hydration or internal verification.
 * EXCLUDES hashed passwords and construction of a strictly sanitized object.
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

    return {
      id: user.id,
      firstName: user.firstName,
      lastName: user.lastName,
      name: `${user.firstName} ${user.lastName}`,
      email: user.email,
      phoneNumber: user.phoneNumber,
      status: user.status,
      branchId: user.branchId,
      branchName: user.branch?.name || null,
      districtName: user.branch?.district?.name || null,
      assignedBranches: user.assignedBranches ? user.assignedBranches.split(',').filter(Boolean) : [],
      roles: user.roles.map(ur => ({
        role: {
          id: ur.role.id,
          name: ur.role.name,
          permissions: ur.role.permissions.map(p => ({
            permission: { 
              slug: p.permission.slug, 
              name: p.permission.name, 
              group: p.permission.group 
            }
          }))
        }
      })),
      needsPasswordChange: user.needsPasswordChange
    };
  } catch (error) {
    console.error('[Auth Action] Profile Retrieval Fault:', error);
    return null;
  }
}

/**
 * Fetches a user by email with strict sanitization.
 */
export async function getUserByEmail(email: string) {
  try {
    const user = await prisma.user.findUnique({
      where: { email: email.toLowerCase().trim() },
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

    return {
      id: user.id,
      firstName: user.firstName,
      lastName: user.lastName,
      email: user.email,
      status: user.status,
      branchName: user.branch?.name || null,
      districtName: user.branch?.district?.name || null,
      roles: user.roles.map(ur => ({
        role: {
          name: ur.role.name
        }
      }))
    };
  } catch (error) {
    return null;
  }
}
