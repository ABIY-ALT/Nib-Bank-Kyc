'use server';

import { prisma } from '@/lib/prisma';
import { UserStatus } from '@prisma/client';
import { revalidatePath } from 'next/cache';
import bcrypt from 'bcryptjs';
import { generateSecurePassword } from '@/lib/security';
import { getServerSession, verifySensitiveSession } from './auth-server';
import { createAuditLog } from './audit';
import { CreateUserSchema } from '@/lib/validation';
import { logInstitutionalError } from '@/lib/logger';

/**
 * Robust Authorization Helper.
 */
async function verifyAdminClearance() {
  const session = await getServerSession();
  if (!session) return false;
  if (session.role === 'SUPER_ADMIN') return true;

  const user = await prisma.user.findUnique({
    where: { id: session.id },
    include: { roles: { include: { role: true } } }
  });

  return user?.roles.some(ur => ur.role.name === 'SUPER_ADMIN') || false;
}

export async function getAllUsers() {
  try {
    const users = await prisma.user.findMany({
      include: {
        branch: { include: { district: true } },
        roles: { include: { role: true } }
      },
      orderBy: [{ firstName: 'asc' }, { lastName: 'asc' }]
    });

    return users.map(u => ({
      ...u,
      assignedBranches: u.assignedBranches ? u.assignedBranches.split(',').filter(Boolean) : []
    }));
  } catch (error) {
    logInstitutionalError(error, 'DB_FETCH_USERS');
    return [];
  }
}

/**
 * Institutional Provisioning Action.
 * Enforces a Sensitive Session Check (session must be fresh < 5m).
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
}) {
  if (!(await verifyAdminClearance())) {
    return { success: false, error: 'Unauthorized: Administrative clearance required.' };
  }

  // SENSITIVE ACTION GUARD: Requires fresh session context
  if (!(await verifySensitiveSession())) {
    return { success: false, error: 'Security Protocol: Session too old for personnel modification. Please refresh or re-login.' };
  }

  try {
    const validated = CreateUserSchema.parse(data);
    const isUpdate = !!data.id;
    let tempPass = data.password;
    
    const branch = data.branchId ? await prisma.branch.findUnique({
      where: { id: data.branchId },
      include: { district: true }
    }) : null;

    const result = await prisma.$transaction(async (tx) => {
      let user;

      if (isUpdate) {
        let updateData: any = {
          firstName: validated.firstName,
          lastName: validated.lastName,
          email: validated.email,
          phoneNumber: validated.phoneNumber,
          branchId: data.branchId || null,
          branchName: branch?.name || null,
          districtName: branch?.district?.name || null,
          status: data.status,
          updatedAt: new Date()
        };

        if (tempPass) {
          updateData.password = await bcrypt.hash(tempPass, 10);
          updateData.needsPasswordChange = true;
        }

        user = await tx.user.update({
          where: { id: data.id },
          data: updateData
        });
      } else {
        if (!tempPass) tempPass = generateSecurePassword(10);
        const hashedPassword = await bcrypt.hash(tempPass, 10);

        user = await tx.user.create({
          data: {
            firstName: validated.firstName,
            lastName: validated.lastName,
            email: validated.email,
            password: hashedPassword,
            phoneNumber: validated.phoneNumber,
            branchId: data.branchId || null,
            branchName: branch?.name || null,
            districtName: branch?.district?.name || null,
            status: data.status,
            needsPasswordChange: true
          }
        });
      }

      const role = await tx.role.findUnique({ where: { name: validated.role } });
      if (role) {
        await tx.userRole.deleteMany({ where: { userId: user.id } });
        await tx.userRole.create({ data: { userId: user.id, roleId: role.id } });
      }

      return user;
    });

    await createAuditLog({
      userId: null,
      userEmail: result.email,
      action: isUpdate ? 'USER_PROFILE_UPDATE' : 'USER_PROVISION_SUCCESS',
      details: isUpdate 
        ? `Profile modified for ${result.firstName} ${result.lastName}. Role: ${data.role}` 
        : `New personnel provisioned: ${result.firstName} ${result.lastName}. Role: ${data.role}`,
      severity: 'MEDIUM'
    });

    revalidatePath('/admin/users');
    return { success: true, user: result, tempPassword: !isUpdate ? tempPass : (data.password ? tempPass : null) };
  } catch (error: any) {
    const { message } = logInstitutionalError(error, 'DB_PROVISION_USER');
    return { success: false, error: message };
  }
}

export async function resetUserPassword(email: string, authorizerId: string) {
  if (!(await verifyAdminClearance())) {
    return { success: false, error: 'Unauthorized.' };
  }

  // SENSITIVE ACTION GUARD
  if (!(await verifySensitiveSession())) {
    return { success: false, error: 'Security Protocol: Session too old for credential reset. Please re-authenticate.' };
  }

  try {
    const normalizedEmail = email.toLowerCase().trim();
    const user = await prisma.user.findUnique({ where: { email: normalizedEmail } });
    if (!user) throw new Error("Personnel record not found.");

    const tempPass = generateSecurePassword(10);
    const hashedPassword = await bcrypt.hash(tempPass, 10);

    await prisma.user.update({
      where: { id: user.id },
      data: { password: hashedPassword, needsPasswordChange: true, updatedAt: new Date() }
    });

    return { success: true, tempPassword: tempPass, userName: `${user.firstName} ${user.lastName}` };
  } catch (error: any) {
    const { message } = logInstitutionalError(error, 'DB_RESET_PASSWORD');
    return { success: false, error: message };
  }
}

export async function updateUserStatus(userId: string, status: UserStatus) {
  if (!(await verifyAdminClearance())) throw new Error('Unauthorized');
  if (!(await verifySensitiveSession())) throw new Error('Security Protocol Violation: Session too old.');
  
  try {
    return await prisma.user.update({
      where: { id: userId },
      data: { status, updatedAt: new Date() }
    });
  } catch (error) {
    logInstitutionalError(error, 'DB_UPDATE_STATUS');
    throw new Error('Institutional database fault.');
  }
}

export async function updateUserPortfolio(userId: string, branches: string[]) {
  if (!(await verifyAdminClearance())) throw new Error('Unauthorized');
  if (!(await verifySensitiveSession())) throw new Error('Security Protocol Violation: Session too old.');

  try {
    return await prisma.user.update({
      where: { id: userId },
      data: { assignedBranches: branches.join(','), updatedAt: new Date() }
    });
  } catch (error) {
    logInstitutionalError(error, 'DB_UPDATE_PORTFOLIO');
    throw new Error('Institutional database fault.');
  }
}
