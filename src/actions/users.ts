'use server';

import { prisma } from '@/lib/prisma';
import { UserStatus } from '@prisma/client';
import { revalidatePath } from 'next/cache';
import bcrypt from 'bcryptjs';

/**
 * Retrieves all personnel from the institutional registry, sorted alphabetically.
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
      orderBy: [
        { firstName: 'asc' },
        { lastName: 'asc' }
      ]
    });
  } catch (error) {
    console.error('[Vault Registry] getAllUsers Error:', error);
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
 * Returns the generated temporary password for initial registration.
 */
export async function provisionUser(data: {
  id?: string;
  firstName: string;
  lastName: string;
  email: string;
  password?: string;
  phoneNumber?: string;
  role: string;
  branchId?: string | null;
  status: UserStatus;
  authorizingAdminId?: string;
}) {
  try {
    // Generate a secure temporary password if none provided
    const tempPass = data.password || Math.random().toString(36).slice(-8);
    const isNewUser = !data.id;

    const result = await prisma.$transaction(async (tx) => {
      // 1. Fetch current state for audit comparison
      const existingUser = await tx.user.findUnique({
        where: { email: data.email.toLowerCase() },
        include: { 
          branch: true,
          roles: { include: { role: true } }
        }
      });

      const hashedPassword = await bcrypt.hash(tempPass, 10);

      // 2. Upsert the User record
      // needsPasswordChange is enabled when a new user is created or password is changed by admin
      const user = await tx.user.upsert({
        where: { email: data.email.toLowerCase() },
        update: { 
          firstName: data.firstName,
          lastName: data.lastName,
          phoneNumber: data.phoneNumber,
          branch: data.branchId ? { connect: { id: data.branchId } } : { disconnect: true },
          status: data.status,
          // Only update password if manually provided, and force reset if it is changed
          password: data.password ? hashedPassword : undefined,
          needsPasswordChange: data.password ? true : undefined
        },
        create: { 
          email: data.email.toLowerCase(),
          password: hashedPassword,
          firstName: data.firstName,
          lastName: data.lastName,
          phoneNumber: data.phoneNumber,
          branch: data.branchId ? { connect: { id: data.branchId } } : undefined,
          status: data.status,
          needsPasswordChange: true
        }
      });

      // 3. Handle Branch Transfer Logging
      const currentBranchId = existingUser?.branch?.id;
      if (existingUser && currentBranchId !== data.branchId) {
        const oldBranchName = existingUser.branch?.name || 'Institutional';
        const newBranch = data.branchId ? await tx.branch.findUnique({ where: { id: data.branchId } }) : null;
        const newBranchName = newBranch?.name || 'Institutional';
        
        await tx.auditLog.create({
          data: {
            userId: data.authorizingAdminId && data.authorizingAdminId !== 'SYSTEM' ? data.authorizingAdminId : null,
            action: 'BRANCH_TRANSFER',
            details: `Personnel ${user.firstName} ${user.lastName} moved from ${oldBranchName} to ${newBranchName}. Jurisdictional handover complete.`,
            metadata: {
              targetUserId: user.id,
              previousBranch: oldBranchName,
              newBranch: newBranchName,
              authorizer: data.authorizingAdminId || 'SYSTEM'
            }
          }
        });
      }

      // 4. Handle Role Transition Logging
      const currentRoleName = existingUser?.roles?.[0]?.role?.name;
      if (existingUser && currentRoleName !== data.role) {
        await tx.auditLog.create({
          data: {
            userId: data.authorizingAdminId && data.authorizingAdminId !== 'SYSTEM' ? data.authorizingAdminId : null,
            action: 'ROLE_TRANSITION',
            details: `Personnel ${user.firstName} ${user.lastName} authority updated from ${currentRoleName?.replace(/_/g, ' ')} to ${data.role.replace(/_/g, ' ')}.`,
            metadata: {
              targetUserId: user.id,
              previousRole: currentRoleName,
              newRole: data.role,
              authorizer: data.authorizingAdminId || 'SYSTEM'
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
    return { 
      success: true, 
      user: result, 
      tempPassword: isNewUser ? tempPass : null 
    };
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
