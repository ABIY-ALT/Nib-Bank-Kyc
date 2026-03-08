'use server';

import { prisma } from '@/lib/prisma';
import { UserStatus } from '@prisma/client';
import { revalidatePath } from 'next/cache';
import bcrypt from 'bcryptjs';
import { generateSecurePassword } from '@/lib/security';
import { getServerSession } from './auth-server';
import { createAuditLog } from './audit';
import { CreateUserSchema } from '@/lib/validation';
import { z } from 'zod';

async function verifyAdminClearance() {
  const session = await getServerSession();
  if (!session) return false;
  return session.role === 'SUPER_ADMIN';
}

export async function resetUserPassword(email: string, authorizerId: string) {
  if (!(await verifyAdminClearance())) {
    return { success: false, error: 'Unauthorized: Administrative clearance required.' };
  }

  try {
    const normalizedEmail = email.toLowerCase().trim();
    if (!normalizedEmail.endsWith('@nibbank.com.et')) {
      throw new Error("Target identity is outside the institutional domain.");
    }

    const user = await prisma.user.findUnique({ where: { email: normalizedEmail } });
    if (!user) throw new Error("Personnel record not discovered.");

    const tempPass = generateSecurePassword(10);
    const hashedPassword = await bcrypt.hash(tempPass, 10);

    await prisma.$transaction(async (tx) => {
      await tx.user.update({
        where: { id: user.id },
        data: { password: hashedPassword, needsPasswordChange: true, updatedAt: new Date() }
      });

      await createAuditLog({
        userId: authorizerId,
        userEmail: normalizedEmail,
        action: 'PASSWORD_RESET_ADMIN',
        details: `Administrative credential reset for ${user.firstName} ${user.lastName}.`,
        severity: 'HIGH'
      });
    });

    return { success: true, tempPassword: tempPass, userName: `${user.firstName} ${user.lastName}` };
  } catch (error: any) {
    return { success: false, error: error.message };
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
  authorizingAdminId?: string;
}) {
  if (!(await verifyAdminClearance())) {
    return { success: false, error: 'Unauthorized.' };
  }

  try {
    const validated = CreateUserSchema.parse(data);
    const isNewUser = !data.id;
    let tempPass = data.password;
    
    if (isNewUser && !tempPass) {
      tempPass = generateSecurePassword(10);
    }

    const result = await prisma.$transaction(async (tx) => {
      const existingUser = await tx.user.findFirst({
        where: data.id ? { id: data.id } : { email: validated.email },
        include: { roles: { include: { role: true } } }
      });

      let hashedPassword = tempPass ? await bcrypt.hash(tempPass, 10) : undefined;

      let user;
      if (existingUser) {
        user = await tx.user.update({
          where: { id: existingUser.id },
          data: { 
            firstName: validated.firstName,
            lastName: validated.lastName,
            email: validated.email,
            phoneNumber: validated.phoneNumber,
            branch: validated.branchId ? { connect: { id: validated.branchId } } : { disconnect: true },
            status: data.status,
            password: hashedPassword,
            needsPasswordChange: hashedPassword ? true : undefined,
            updatedAt: new Date() 
          }
        });
      } else {
        user = await tx.user.create({
          data: { 
            email: validated.email,
            password: hashedPassword!,
            firstName: validated.firstName,
            lastName: validated.lastName,
            phoneNumber: validated.phoneNumber,
            branch: validated.branchId ? { connect: { id: validated.branchId } } : undefined,
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

    revalidatePath('/admin/users');
    return { 
      success: true, 
      user: { id: result.id, email: result.email, status: result.status }, 
      tempPassword: isNewUser ? tempPass : null 
    };
  } catch (error: any) {
    if (error instanceof z.ZodError) return { success: false, error: error.errors[0].message };
    return { success: false, error: error.message };
  }
}

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
        branch: { select: { id: true, name: true, district: { select: { id: true, name: true } } } },
        roles: { include: { role: { select: { id: true, name: true } } } }
      },
      orderBy: [{ firstName: 'asc' }, { lastName: 'asc' }]
    });
  } catch (error) {
    return [];
  }
}

export async function updateUserStatus(userId: string, status: UserStatus) {
  if (!(await verifyAdminClearance())) throw new Error('Unauthorized');
  const user = await prisma.user.update({
    where: { id: userId },
    data: { status, updatedAt: new Date() }
  });
  revalidatePath('/admin/users');
  return { id: user.id, status: user.status };
}

export async function updateUserPortfolio(userId: string, branches: string[]) {
  if (!(await verifyAdminClearance())) throw new Error('Unauthorized');
  await prisma.user.update({
    where: { id: userId },
    data: { assignedBranches: branches, updatedAt: new Date() }
  });
  revalidatePath('/admin/assignments');
  return { success: true };
}
