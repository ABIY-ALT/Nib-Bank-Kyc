'use server';

import { prisma } from '@/lib/prisma';
import { revalidatePath } from 'next/cache';

export async function getRoleDefinitions() {
  try {
    return await prisma.roleDefinition.findMany({
      orderBy: { name: 'asc' }
    });
  } catch (error) {
    return [];
  }
}

export async function upsertRoleDefinition(data: {
  id?: string;
  name: string;
  canSubmit: boolean;
  canReview: boolean;
  canEscalate: boolean;
  canViewReports: boolean;
  canManageUsers: boolean;
  canManageSystem: boolean;
  canAccessPerformance: boolean;
  canAccessFollowUp: boolean;
  canAccessArchive: boolean;
}) {
  try {
    const role = await prisma.roleDefinition.upsert({
      where: { name: data.name },
      update: data,
      create: data
    });
    revalidatePath('/admin/roles');
    return { success: true, role };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}

export async function deleteRoleDefinition(id: string) {
  try {
    await prisma.roleDefinition.delete({ where: { id } });
    revalidatePath('/admin/roles');
    return { success: true };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}
