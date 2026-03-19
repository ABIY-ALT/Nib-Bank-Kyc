'use server';

import { prisma } from '@/lib/prisma';
import { revalidatePath } from 'next/cache';
import { getServerSession, verifyPermission } from './auth-server';
import { KYC_STATUS } from '@/lib/kyc-data';

async function getFollowUpAccess() {
  const session = await getServerSession();
  if (!session) {
    return { session: null, canWorkPool: false, canViewLogs: false };
  }

  const [canWorkPool, canViewLogs] = await Promise.all([
    verifyPermission('VIEW_AUDIT_POOL'),
    verifyPermission('VIEW_AUDIT_LOGS')
  ]);

  return { session, canWorkPool, canViewLogs };
}

/**
 * Retrieves follow-up verifications with optional date filtering.
 */
export async function getFollowUpVerifications(filters?: { startDate?: string; endDate?: string }) {
  try {
    const { canWorkPool, canViewLogs } = await getFollowUpAccess();
    if (!canWorkPool && !canViewLogs) {
      return [];
    }

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
    const { canWorkPool } = await getFollowUpAccess();
    if (!canWorkPool) {
      return null;
    }

    return await prisma.followUpVerification.findUnique({
      where: { id }
    });
  } catch (error) {
    return null;
  }
}

export async function getApprovedCasesForFollowUp(filters?: { startDate?: string; endDate?: string; limit?: number }) {
  try {
    const { canWorkPool } = await getFollowUpAccess();
    if (!canWorkPool) {
      return [];
    }

    let dateFilter = undefined;
    if (filters?.startDate || filters?.endDate) {
      const start = filters.startDate ? new Date(filters.startDate) : undefined;
      const end = filters.endDate ? new Date(filters.endDate) : undefined;
      if (end) end.setHours(23, 59, 59, 999);
      dateFilter = { gte: start, lte: end };
    }

    return await prisma.kYC.findMany({
      where: {
        status: KYC_STATUS.APPROVED,
        submittedAt: dateFilter,
        active: true
      },
      include: {
        createdBy: true
      },
      orderBy: { submittedAt: 'desc' },
      take: filters?.limit || 100
    });
  } catch (error) {
    console.error('[Follow-up Action] Approved Case Fetch Error:', error);
    return [];
  }
}

export async function seedFollowUpPool(cases: any[]) {
  try {
    const { canWorkPool } = await getFollowUpAccess();
    if (!canWorkPool) {
      return { success: false, error: 'Unauthorized' };
    }

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
    const { canWorkPool } = await getFollowUpAccess();
    if (!canWorkPool) {
      return { success: false, error: 'Unauthorized' };
    }

    const current = await prisma.followUpVerification.findUnique({
      where: { id },
      select: { status: true }
    });

    if (!current) {
      return { success: false, error: 'Follow-up record not found' };
    }

    if (current.status === 'COMPLETED') {
      return { success: false, error: 'This follow-up review is already completed.' };
    }

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
