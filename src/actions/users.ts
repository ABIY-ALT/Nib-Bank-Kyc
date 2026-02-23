'use server';

import { prisma } from '@/lib/prisma';
import { UserStatus } from '@prisma/client';
import { revalidatePath } from 'next/cache';

/**
 * Retrieves all personnel from the institutional registry.
 */
export async function getAllUsers() {
  try {
    return await prisma.user.findMany({
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
      },
      orderBy: { firstName: 'asc' }
    });
  } catch (error) {
    console.error('[Vault] getAllUsers Error:', error);
    return [];
  }
}

/**
 * Updates a staff member's active status (Active/Inactive).
 */
export async function updateUserStatus(userId: string, status: UserStatus) {
  const user = await prisma.user.update({
    where: { id: userId },
    data: { status }
  });
  revalidatePath('/admin/users');
  return user;
}

/**
 * Provisions a new user or updates an existing one, including Branch Transfers and Role Transitions.
 */
export async function provisionUser(data: {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  phoneNumber?: string;
  role: string;
  branchId?: string | null;
  status: UserStatus;
  authorizingAdminId?: string;
}) {
  try {
    const result = await prisma.$transaction(async (tx) => {
      // 1. Fetch current state for audit comparison
      const existingUser = await tx.user.findUnique({
        where: { firebaseUid: data.id },
        include: { 
          branch: true,
          roles: { include: { role: true } }
        }
      });

      // 2. Upsert the User record
      const user = await tx.user.upsert({
        where: { firebaseUid: data.id },
        update: { 
          firstName: data.firstName,
          lastName: data.lastName,
          email: data.email,
          phoneNumber: data.phoneNumber,
          branchId: data.branchId || null,
          status: data.status
        },
        create: { 
          id: data.id,
          firebaseUid: data.id,
          firstName: data.firstName,
          lastName: data.lastName,
          email: data.email,
          phoneNumber: data.phoneNumber,
          branchId: data.branchId || null,
          status: data.status
        }
      });

      // 3. Handle Branch Transfer Logging
      if (existingUser && existingUser.branchId !== data.branchId) {
        const oldBranchName = existingUser.branch?.name || 'Institutional';
        const newBranch = data.branchId ? await tx.branch.findUnique({ where: { id: data.branchId } }) : null;
        const newBranchName = newBranch?.name || 'Institutional';
        
        await tx.auditLog.create({
          data: {
            userId: data.authorizingAdminId || 'SYSTEM',
            action: 'BRANCH_TRANSFER',
            details: `Personnel ${user.firstName} ${user.lastName} moved from ${oldBranchName} to ${newBranchName}. Jurisdictional handover complete.`,
            metadata: {
              targetUserId: user.id,
              previousBranch: oldBranchName,
              newBranch: newBranchName
            }
          }
        });
      }

      // 4. Handle Role Transition (Promotion/Reassignment) Logging
      const currentRoleName = existingUser?.roles?.[0]?.role?.name;
      if (existingUser && currentRoleName !== data.role) {
        await tx.auditLog.create({
          data: {
            userId: data.authorizingAdminId || 'SYSTEM',
            action: 'ROLE_TRANSITION',
            details: `Personnel ${user.firstName} ${user.lastName} authority updated from ${currentRoleName?.replace(/_/g, ' ')} to ${data.role.replace(/_/g, ' ')}.`,
            metadata: {
              targetUserId: user.id,
              previousRole: currentRoleName,
              newRole: data.role
            }
          }
        });
      }

      // 5. Link the role via UserRole relational table
      if (data.role) {
        const role = await tx.role.findUnique({ where: { name: data.role } });
        if (role) {
          await tx.userRole.deleteMany({ where: { userId: user.id } });
          await tx.userRole.create({
            data: { userId: user.id, roleId: role.id }
          });
        }
      }
      return user;
    });

    revalidatePath('/admin/users');
    return { success: true, user: result };
  } catch (error: any) {
    console.error('[Vault Provisioning] Error:', error);
    return { success: false, error: error.message || 'Institutional registration fault.' };
  }
}

/**
 * Updates a specialist's assigned multi-branch portfolio.
 */
export async function updateUserPortfolio(userId: string, branches: string[]) {
  try {
    await prisma.user.update({
      where: { id: userId },
      data: {
        assignedBranches: branches
      }
    });
    revalidatePath('/admin/assignments');
    return { success: true };
  } catch (error: any) {
    console.error('[Vault Portfolio Update] Error:', error);
    throw new Error('Institutional portfolio update fault.');
  }
}
