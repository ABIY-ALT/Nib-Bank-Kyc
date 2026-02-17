'use server';

import { prisma } from '@/lib/prisma';
import { UserRole, UserStatus } from '@prisma/client';
import { revalidatePath } from 'next/cache';

export async function getAllUsers() {
  return await prisma.user.findMany({
    orderBy: { name: 'asc' }
  });
}

export async function updateUserRole(userId: string, role: UserRole) {
  const user = await prisma.user.update({
    where: { id: userId },
    data: { role }
  });
  revalidatePath('/admin/users');
  revalidatePath('/admin/roles');
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

export async function updateUserPortfolio(userId: string, branches: string[]) {
  const user = await prisma.user.update({
    where: { id: userId },
    data: { assignedBranches: branches }
  });
  revalidatePath('/admin/assignments');
  return user;
}

export async function provisionUser(data: {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  branch?: string;
  district?: string;
  status: UserStatus;
}) {
  const user = await prisma.user.upsert({
    where: { id: data.id },
    update: { ...data },
    create: { ...data }
  });
  revalidatePath('/admin/users');
  return user;
}
