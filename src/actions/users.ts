'use server';

import { prisma } from '@/lib/prisma';
import { UserStatus } from '@prisma/client';
import { revalidatePath } from 'next/cache';

export async function getAllUsers() {
  return await prisma.user.findMany({
    include: { 
      branch: true,
      roles: { include: { role: true } }
    },
    orderBy: { firstName: 'asc' }
  });
}

export async function updateUserRole(userId: string, roleName: string) {
  try {
    // Clear existing roles and set new one in relational schema
    await prisma.userRole.deleteMany({ where: { userId } });
    const role = await prisma.role.findUnique({ where: { name: roleName } });
    if (role) {
      await prisma.userRole.create({
        data: { userId, roleId: role.id }
      });
    }
    revalidatePath('/admin/users');
    return { success: true };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}

export async function updateUserStatus(userId: string, status: UserStatus) {
  const user = await prisma.user.update({
    where: { id: userId },
    data: { status }
  });
  revalidatePath('/admin/users');
  return user;
}

export async function provisionUser(data: {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  phoneNumber?: string;
  role: string;
  branchId?: string;
  status: UserStatus;
}) {
  // 1. Upsert the User without the 'role' field (moved to relational UserRole table)
  const user = await prisma.user.upsert({
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

  // 2. Link the role via the UserRole relation
  if (data.role) {
    const role = await prisma.role.findUnique({ where: { name: data.role } });
    if (role) {
      await prisma.userRole.deleteMany({ where: { userId: user.id } });
      await prisma.userRole.create({
        data: { userId: user.id, roleId: role.id }
      });
    }
  }

  revalidatePath('/admin/users');
  return user;
}
