'use server';

import { prisma } from '@/lib/prisma';
import { revalidatePath } from 'next/cache';

export async function getDistricts() {
  return await prisma.district.findMany({
    include: { branches: true },
    orderBy: { name: 'asc' }
  });
}

export async function getBranches() {
  return await prisma.branch.findMany({
    orderBy: { name: 'asc' }
  });
}

export async function createDistrict(name: string) {
  const district = await prisma.district.create({
    data: { name }
  });
  revalidatePath('/admin/branches');
  return district;
}

export async function createBranch(data: { name: string, code?: string, districtName: string }) {
  const branch = await prisma.branch.create({
    data: data
  });
  revalidatePath('/admin/branches');
  return branch;
}

export async function deleteNode(type: 'district' | 'branch', id: string) {
  if (type === 'district') {
    await prisma.district.delete({ where: { id } });
  } else {
    await prisma.branch.delete({ where: { id } });
  }
  revalidatePath('/admin/branches');
}
