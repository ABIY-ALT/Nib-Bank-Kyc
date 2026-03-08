
'use server';

import { prisma } from '@/lib/prisma';
import { UserStatus } from '@prisma/client';
import { revalidatePath } from 'next/cache';
import bcrypt from 'bcryptjs';
import { generateSecurePassword } from '@/lib/security';
import { getServerSession } from './auth-server';
import { createAuditLog } from './audit';
import { z } from 'zod';

/**
 * Institutional Validation Schemas.
 */
const UserProvisionSchema = z.object({
  id: z.string().optional(),
  firstName: z.string().min(2).max(100),
  lastName: z.string().min(2).max(100),
  email: z.string().email().endsWith('@nibbank.com.et'),
  phoneNumber: z.string().max(20).optional(),
  role: z.string().min(1),
  status: z.nativeEnum(UserStatus),
  branchId: z.string().nullable().optional(),
});

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
    if (!normalizedEmail.endsWith('@nibbank.com.et')) {
      throw new Error("Target identity is outside the institutional domain.");
    }

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
          needsPasswordChange: true,
          updatedAt: new Date() // Revoke any active sessions immediately
        }
      });

      await createAuditLog({
        userId: authorizerId,
        userEmail: normalizedEmail,
        action: 'PASSWORD_RESET_ADMIN',
        details: `Administrative credential reset for ${user.firstName} ${user.lastName}. Previous sessions revoked.`,
        severity: 'HIGH',
        metadata: {
          targetUserId: user.id
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
    data: { 
      status,
      updatedAt: new Date() // Revoke session if status changes
    }
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
    // 1. Validation
    const validated = UserProvisionSchema.parse(data);
    const isNewUser = !validated.id;
    let tempPass = data.password;
    
    if (isNewUser && !tempPass) {
      tempPass = generateSecurePassword(10);
    }

    const result = await prisma.$transaction(async (tx) => {
      const existingUser = await tx.user.findFirst({
        where: validated.id ? { id: validated.id } : { email: validated.email.toLowerCase() },
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
            firstName: validated.firstName,
            lastName: validated.lastName,
            email: validated.email.toLowerCase(),
            phoneNumber: validated.phoneNumber,
            branch: validated.branchId ? { connect: { id: validated.branchId } } : { disconnect: true },
            status: validated.status,
            password: hashedPassword,
            needsPasswordChange: hashedPassword ? true : undefined,
            updatedAt: new Date() // Force logout on profile modification for security
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
            email: validated.email.toLowerCase(),
            password: hashedPassword,
            firstName: validated.firstName,
            lastName: validated.lastName,
            phoneNumber: validated.phoneNumber,
            branch: validated.branchId ? { connect: { id: validated.branchId } } : undefined,
            status: validated.status,
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
    if (error instanceof z.ZodError) {
      return { success: false, error: "Validation fault: " + error.errors[0].message };
    }
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
        assignedBranches: branches,
        updatedAt: new Date() // Force logout to refresh session claims
      }
    });
    revalidatePath('/admin/assignments');
    return { success: true };
  } catch (error: any) {
    console.error('[Vault Portfolio Update] Error:', error);
    throw new Error('Institutional portfolio update fault.');
  }
}
