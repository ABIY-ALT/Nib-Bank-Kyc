'use server';

import { prisma } from '@/lib/prisma';
import { revalidatePath } from 'next/cache';

/**
 * Retrieves follow-up verifications with optional date filtering.
 */
export async function getFollowUpVerifications(filters?: { startDate?: string; endDate?: string }) {
  try {
    let dateFilter = undefined;
    if (filters?.startDate || filters?.endDate) {
      const start = filters.startDate ? new Date(filters.startDate) : undefined;
      const end = filters.endDate ? new Date(filters.endDate) : undefined;
      if (end) end.setHours(23, 59, 59, 999);
      dateFilter = { gte: start, lte: end };
    }

    return await prisma.followUpVerification.findMany({
      where: {
        verifiedAt: dateFilter
      },
      orderBy: { verifiedAt: 'desc' }
    });
  } catch (error) {
    console.error('[Follow-up Action] Fetch Error:', error);
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
