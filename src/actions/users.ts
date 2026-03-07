'use server';

import { prisma } from '@/lib/prisma';
import { UserStatus } from '@prisma/client';
import { revalidatePath } from 'next/cache';
import bcrypt from 'bcryptjs';
import { generateSecurePassword } from '@/lib/security';
import { getServerSession } from './auth-server';

/**
 * Server-side RBAC Check.
 * Verifies if the current session has the required administrative clearance.
 */
async function verifyAdminClearance() {
  const session = await getServerSession();
  if (!session) return false;
  return session.role === 'SUPER_ADMIN';
}

/**
 * Administrative Credential Reset.
 * Generates a temporary password and forces a rotation upon next login.
 * Sanitizes response to only return the specific temporary password.
 */
export async function resetUserPassword(email: string, authorizerId: string) {
  if (!(await verifyAdminClearance())) {
    return { success: false, error: 'Unauthorized: Administrative clearance required.' };
  }

  try {
    const normalizedEmail = email.toLowerCase().trim();
    const user = await prisma.user.findUnique({ 
      where: { email: normalizedEmail } 
    });

    if (!user) {
      throw new Error("Personnel record not discovered in the Institutional Vault.");
    }

    const tempPass = generateSecurePassword(10);
    const hashedPassword = await bcrypt.hash(tempPass, 10);

    await prisma.$transaction(async (tx) => {
      await tx.user.update({
        where: { id: user.id },
        data: {
          password: hashedPassword,
          needsPasswordChange: true
        }
      });

      await tx.auditLog.create({
        data: {
          userId: authorizerId,
          action: 'PASSWORD_RESET_ADMIN',
          details: `Administrative credential reset for ${user.firstName} ${user.lastName}.`,
          timestamp: new Date(),
          metadata: {
            targetUserId: user.id,
            targetEmail: normalizedEmail
          }
        }
      });
    });

    return { 
      success: true, 
      tempPassword: tempPass, 
      userName: `${user.firstName} ${user.lastName}` 
    };
  } catch (error: any) {
    console.error('[Vault Security] Reset Failure:', error);
    return { success: false, error: error.message || 'Institutional database fault during reset.' };
  }
}

/**
 * Retrieves all personnel from the institutional registry.
 * Explicitly sanitizes results via Prisma select.
 */
export async function getAllUsers() {
  try {
    return await prisma.user.findMany({
      select: {
        id: true,
        firstName: true,
        lastName: true,
        email: true,
        phoneNumber: true,
        status: true,
        branchId: true,
        needsPasswordChange: true,
        assignedBranches: true,
        branch: {
          select: { 
            id: true, 
            name: true,
            district: { select: { id: true, name: true } }
          }
        },
        roles: { 
          include: { 
            role: {
              select: {
                id: true,
                name: true,
                permissions: {
                  include: {
                    permission: {
                      select: { id: true, slug: true, name: true, group: true }
                    }
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
 * Updates a staff member's active status.
 */
export async function updateUserStatus(userId: string, status: UserStatus) {
  if (!(await verifyAdminClearance())) {
    throw new Error('Unauthorized');
  }

  const user = await prisma.user.update({
    where: { id: userId },
    data: { status }
  });
  revalidatePath('/admin/users');
  return { id: user.id, status: user.status };
}

/**
 * Provisions a new user or updates an existing one.
 * Uses strict object mapping for the return value to prevent metadata leakage.
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
  if (!(await verifyAdminClearance())) {
    return { success: false, error: 'Unauthorized: Administrative clearance required.' };
  }

  try {
    const isNewUser = !data.id;
    let tempPass = data.password;
    
    if (isNewUser && !tempPass) {
      tempPass = generateSecurePassword(10);
    }

    const result = await prisma.$transaction(async (tx) => {
      const existingUser = await tx.user.findFirst({
        where: data.id ? { id: data.id } : { email: data.email.toLowerCase() },
        include: { 
          branch: true,
          roles: { include: { role: true } }
        }
      });

      let hashedPassword = undefined;
      if (tempPass) {
        hashedPassword = await bcrypt.hash(tempPass, 10);
      }

      let user;
      if (existingUser) {
        user = await tx.user.update({
          where: { id: existingUser.id },
          data: { 
            firstName: data.firstName,
            lastName: data.lastName,
            email: data.email.toLowerCase(),
            phoneNumber: data.phoneNumber,
            branch: data.branchId ? { connect: { id: data.branchId } } : { disconnect: true },
            status: data.status,
            password: hashedPassword,
            needsPasswordChange: hashedPassword ? true : undefined
          }
        });
      } else {
        if (!hashedPassword) {
          const generated = generateSecurePassword(10);
          tempPass = generated;
          hashedPassword = await bcrypt.hash(generated, 10);
        }

        user = await tx.user.create({
          data: { 
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
      }

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
    
    // Explicit construction of safe response object
    const safeUser = {
      id: result.id,
      firstName: result.firstName,
      lastName: result.lastName,
      email: result.email,
      status: result.status,
      branchId: result.branchId,
      needsPasswordChange: result.needsPasswordChange
    };

    return { 
      success: true, 
      user: safeUser, 
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
  if (!(await verifyAdminClearance())) {
    throw new Error('Unauthorized');
  }

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
