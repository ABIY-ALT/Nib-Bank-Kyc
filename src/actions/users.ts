
'use server';

import { prisma } from '@/lib/prisma';
import { UserStatus } from '@prisma/client';
import { revalidatePath } from 'next/cache';
import bcrypt from 'bcryptjs';
import { generateSecurePassword } from '@/lib/security';
import { getServerSession } from './auth-server';
import { createAuditLog } from './audit';
import { CreateUserSchema } from '@/lib/validation';

/**
 * Robust Authorization Helper.
 * Performs a real-time database fallback for Master Admins to prevent stale token rejection.
 */
async function verifyAdminClearance() {
  const session = await getServerSession();
  if (!session) return false;

  // Level 1: JWT Session Check
  if (session.role === 'SUPER_ADMIN') return true;

  // Level 2: Database Fallback (Ensures promoted admins have instant access)
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
    return [];
  }
}

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

  try {
    const validated = CreateUserSchema.parse(data);
    const isNewUser = !data.id;
    let tempPass = data.password;
    
    if (isNewUser && !tempPass) {
      tempPass = generateSecurePassword(10);
    }

    const result = await prisma.$transaction(async (tx) => {
      let hashedPassword = tempPass ? await bcrypt.hash(tempPass, 10) : undefined;

      const user = await tx.user.upsert({
        where: { id: data.id || 'new-id' },
        update: {
          firstName: validated.firstName,
          lastName: validated.lastName,
          email: validated.email,
          phoneNumber: validated.phoneNumber,
          branchId: validated.branchId || null,
          status: data.status,
          password: hashedPassword,
          needsPasswordChange: hashedPassword ? true : undefined,
          updatedAt: new Date()
        },
        create: {
          firstName: validated.firstName,
          lastName: validated.lastName,
          email: validated.email,
          password: hashedPassword!,
          phoneNumber: validated.phoneNumber,
          branchId: validated.branchId || null,
          status: data.status,
          needsPasswordChange: true
        }
      });

      const role = await tx.role.findUnique({ where: { name: validated.role } });
      if (role) {
        await tx.userRole.deleteMany({ where: { userId: user.id } });
        await tx.userRole.create({ data: { userId: user.id, roleId: role.id } });
      }

      return user;
    });

    revalidatePath('/admin/users');
    return { success: true, user: result, tempPassword: isNewUser ? tempPass : null };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}

export async function resetUserPassword(email: string, authorizerId: string) {
  if (!(await verifyAdminClearance())) {
    return { success: false, error: 'Unauthorized.' };
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
    return { success: false, error: error.message };
  }
}

export async function updateUserStatus(userId: string, status: UserStatus) {
  if (!(await verifyAdminClearance())) throw new Error('Unauthorized');
  return await prisma.user.update({
    where: { id: userId },
    data: { status, updatedAt: new Date() }
  });
}

export async function updateUserPortfolio(userId: string, branches: string[]) {
  if (!(await verifyAdminClearance())) throw new Error('Unauthorized');
  return await prisma.user.update({
    where: { id: userId },
    data: { assignedBranches: branches.join(','), updatedAt: new Date() }
  });
}
