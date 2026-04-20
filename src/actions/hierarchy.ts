'use server';

import { prisma } from '@/lib/prisma';
import { revalidatePath } from 'next/cache';
import { generateSecureNumericCode } from '@/lib/security';
import { getSafeErrorMessage } from '@/lib/information-disclosure-prevention';

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
  try {
    const district = await prisma.district.create({
      data: { name }
    });
    revalidatePath('/admin/branches');
    return district;
  } catch (error: any) {
    if (error.code === 'P2002') {
      throw new Error(`The region "${name}" is already established in the hierarchy.`);
    }
    throw new Error('Institutional database fault during region registration.');
  }
}

export async function updateDistrict(id: string, name: string) {
  try {
    const district = await prisma.district.update({
      where: { id },
      data: { name }
    });
    revalidatePath('/admin/branches');
    return district;
  } catch (error: any) {
    if (error.code === 'P2002') {
      throw new Error(`Another region with the name "${name}" already exists.`);
    }
    throw new Error('Institutional database fault during region update.');
  }
}

export async function createBranch(data: { name: string, code?: string, districtName: string }) {
  try {
    const district = await prisma.district.findUnique({
      where: { name: data.districtName }
    });

    if (!district) {
      throw new Error(`Parent District "${data.districtName}" not found.`);
    }

    const branch = await prisma.branch.create({
      data: {
        name: data.name,
        code: data.code || `BR-${generateSecureNumericCode(100, 999)}`,
        districtId: district.id
      }
    });

    revalidatePath('/admin/branches');
    return branch;
  } catch (error: any) {
    if (error.code === 'P2002') {
      throw new Error(`Branch node "${data.name}" is already registered.`);
    }
    // SECURITY: Use generic safe error message (A03:2021 - Information Disclosure)
    throw new Error(getSafeErrorMessage(error) || 'Institutional database fault during branch registration.');
  }
}

export async function updateBranch(id: string, data: { name: string, code?: string, districtName: string }) {
  try {
    const district = await prisma.district.findUnique({
      where: { name: data.districtName }
    });

    if (!district) {
      throw new Error(`Parent District "${data.districtName}" not found.`);
    }

    const branch = await prisma.branch.update({
      where: { id },
      data: {
        name: data.name,
        code: data.code,
        districtId: district.id
      }
    });

    revalidatePath('/admin/branches');
    return branch;
  } catch (error: any) {
    if (error.code === 'P2002') {
      throw new Error(`Another branch node with the name "${data.name}" already exists.`);
    }
    // SECURITY: Use generic safe error message (A03:2021 - Information Disclosure)
    throw new Error(getSafeErrorMessage(error) || 'Institutional database fault during branch update.');
  }
}

export async function deleteNode(type: 'district' | 'branch', id: string) {
  try {
    if (type === 'district') {
      await prisma.district.delete({ where: { id } });
    } else {
      await prisma.branch.delete({ where: { id } });
    }
    revalidatePath('/admin/branches');
  } catch (error) {
    throw new Error('Node contains active records and cannot be purged.');
  }
}
