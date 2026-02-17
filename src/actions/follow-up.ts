'use server';

import { prisma } from '@/lib/prisma';
import { revalidatePath } from 'next/cache';

export async function getFollowUpVerifications() {
  try {
    return await prisma.followUpVerification.findMany({
      orderBy: { verifiedAt: 'desc' }
    });
  } catch (error) {
    return [];
  }
}

export async function getFollowUpById(id: string) {
  try {
    return await prisma.followUpVerification.findUnique({
      where: { id }
    });
  } catch (error) {
    return null;
  }
}

export async function seedFollowUpPool(cases: any[]) {
  try {
    await prisma.followUpVerification.createMany({
      data: cases,
      skipDuplicates: true
    });
    revalidatePath('/head-office/follow-up');
    return { success: true };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}

export async function updateFollowUp(id: string, data: any) {
  try {
    const v = await prisma.followUpVerification.update({
      where: { id },
      data: {
        ...data,
        verifiedAt: new Date()
      }
    });
    revalidatePath('/head-office/follow-up');
    revalidatePath('/reports/follow-up');
    return { success: true, v };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}
