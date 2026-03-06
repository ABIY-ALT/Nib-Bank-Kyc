'use server';

import { prisma } from '@/lib/prisma';
import { UserStatus } from '@prisma/client';
import { revalidatePath } from 'next/cache';
import bcrypt from 'bcryptjs';
import { generateSecurePassword } from '@/lib/security';
import { cookies } from 'next/headers';
import { jwtVerify } from 'jose';

/**
 * Server-side RBAC Check.
 * Verifies if the current session has the required administrative clearance.
 */
async function verifyAdminClearance() {
  const cookieStore = await cookies();
  const token = cookieStore.get('token')?.value;
  if (!token) return false;

  try {
    const secret = new TextEncoder().encode(process.env.JWT_SECRET || 'institutional_default_secret_32_chars_min');
    const { payload } = await jwtVerify(token, secret);
    return payload.role === 'SUPER_ADMIN';
  } catch {
    return false;
  }
}

/**
 * Administrative Credential Reset.
 * Generates a temporary password and forces a rotation upon next login.
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

    // Generate cryptographic random temporary password
    const tempPass = generateSecurePassword(10);
    const hashedPassword = await bcrypt.hash(tempPass, 10);

    await prisma.$transaction(async (tx) => {
      // 1. Update User Credential and Security Flag
      await tx.user.update({
        where: { id: user.id },
        data: {
          password: hashedPassword,
          needsPasswordChange: true
        }
      });

      // 2. Log Security Event
      await tx.auditLog.create({
        data: {
          userId: authorizerId,
          action: 'PASSWORD_RESET_ADMIN',
          details: `Administrative credential reset for ${user.firstName} ${user.lastName}. Jurisdictional security gate engaged.`,
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
  if (!(await verifyAdminClearance())) {
    throw new Error('Unauthorized');
  }

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
  if (!(await verifyAdminClearance())) {
    return { success: false, error: 'Unauthorized: Administrative clearance required.' };
  }

  try {
    const isNewUser = !data.id;
    let tempPass = data.password;
    
    // Generate a temporary password ONLY for new users if one wasn't provided
    if (isNewUser && !tempPass) {
      tempPass = generateSecurePassword(10);
    }

    const result = await prisma.$transaction(async (tx) => {
      // 1. Fetch current state for audit comparison and existence check
      const existingUser = await tx.user.findFirst({
        where: data.id ? { id: data.id } : { email: data.email.toLowerCase() },
        include: { 
          branch: true,
          roles: { include: { role: true } }
        }
      });

      // Only hash a password if it's new or being updated
      let hashedPassword = undefined;
      if (tempPass) {
        hashedPassword = await bcrypt.hash(tempPass, 10);
      }

      // 2. Process the User record using separate Update/Create calls to satisfy Prisma constraints
      let user;
      if (existingUser) {
        // UPDATE existing personnel
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
        // CREATE new personnel
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
