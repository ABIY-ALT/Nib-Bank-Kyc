'use server';

import { prisma } from '@/lib/prisma';
import { revalidatePath } from 'next/cache';

export async function getDistricts() {
  try {
    return await prisma.district.findMany({
      include: { branches: true },
      orderBy: { name: 'asc' }
    });
  } catch (error) {
    return [];
  }
}

export async function getBranches() {
  try {
    return await prisma.branch.findMany({
      include: { 
        district: true 
      },
      orderBy: { name: 'asc' }
    });
  } catch (error) {
    return [];
  }
}

export async function createDistrict(name: string) {
  const district = await prisma.district.create({
    data: { name }
  });
  revalidatePath('/admin/branches');
  return district;
}

export async function createBranch(data: { name: string, code?: string, districtName: string }) {
  try {
    // 1. Find the parent district ID
    const district = await prisma.district.findUnique({
      where: { name: data.districtName }
    });

    if (!district) {
      throw new Error(`Parent District "${data.districtName}" not found. Create the district first.`);
    }

    // 2. Create branch linked via districtId
    const branch = await prisma.branch.create({
      data: {
        name: data.name,
        code: data.code || `BR-${Math.floor(100 + Math.random() * 900)}`,
        districtId: district.id
      }
    });

    revalidatePath('/admin/branches');
    return branch;
  } catch (error: any) {
    console.error('[Vault Hierarchy] Error:', error);
    throw new Error(error.message || 'Institutional database fault during branch registration.');
  }
}

export async function deleteNode(type: 'district' | 'branch', id: string) {
  if (type === 'district') {
    await prisma.district.delete({ where: { id } });
  } else {
    await prisma.branch.delete({ where: { id } });
  }
  revalidatePath('/admin/branches');
}