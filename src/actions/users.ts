'use server';

import { prisma } from '@/lib/prisma';
import { UserStatus } from '@prisma/client';
import { revalidatePath } from 'next/cache';

export async function getAllUsers() {
  return await prisma.user.findMany({
    include: { branch: true },
    orderBy: { firstName: 'asc' }
  });
}

export async function updateUserRole(userId: string, role: string) {
  const user = await prisma.user.update({
    where: { id: userId },
    data: { role }
  });
  revalidatePath('/admin/users');
  return user;
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
  const user = await prisma.user.upsert({
    where: { firebaseUid: data.id },
    update: { 
      firstName: data.firstName,
      lastName: data.lastName,
      email: data.email,
      phoneNumber: data.phoneNumber,
      role: data.role,
      branchId: data.branchId,
      status: data.status
    },
    create: { 
      id: data.id,
      firebaseUid: data.id,
      firstName: data.firstName,
      lastName: data.lastName,
      email: data.email,
      phoneNumber: data.phoneNumber,
      role: data.role,
      branchId: data.branchId,
      status: data.status
    }
  });
  revalidatePath('/admin/users');
  return user;
}
