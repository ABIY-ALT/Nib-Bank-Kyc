'use server';

import { prisma } from '@/lib/prisma';
import { revalidatePath } from 'next/cache';
import { getServerSession, verifyPermission } from './auth-server';
import { KYC_STATUS } from '@/lib/kyc-data';
import { getSafeErrorMessage } from '@/lib/information-disclosure-prevention';

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
 * Retrieves follow-up verifications with optional date filtering and pagination.
 */
export async function getFollowUpVerifications(filters?: {
  startDate?: string;
  endDate?: string;
  limit?: number;
  offset?: number;
  // Server-side narrowing/ordering for the paginated Follow-up Report: with
  // limit/offset pagination, search/result filters and sorting applied
  // client-side would only ever operate on the currently visible page.
  search?: string;
  result?: string;
  sortField?: 'id' | 'customer' | 'result' | 'verifiedBy' | 'verifiedAt';
  sortOrder?: 'asc' | 'desc';
}) {
  try {
    const { canWorkPool, canViewLogs } = await getFollowUpAccess();
    if (!canWorkPool && !canViewLogs) {
      throw new Error('Unauthorized');
    }

    let dateFilter = undefined;
    if (filters?.startDate || filters?.endDate) {
      const start = filters.startDate ? new Date(filters.startDate) : undefined;
      const end = filters.endDate ? new Date(filters.endDate) : undefined;
      if (end) end.setHours(23, 59, 59, 999);
      dateFilter = { gte: start, lte: end };
    }

    const where: any = { verifiedAt: dateFilter };
    if (filters?.result) where.result = filters.result;

    const searchTerm = filters?.search?.trim();
    if (searchTerm) {
      where.OR = [
        { id: { contains: searchTerm, mode: 'insensitive' } },
        { submissionId: { contains: searchTerm, mode: 'insensitive' } },
        { customerName: { contains: searchTerm, mode: 'insensitive' } },
        { branch: { contains: searchTerm, mode: 'insensitive' } },
        { verifiedBy: { contains: searchTerm, mode: 'insensitive' } },
      ];
    }

    // Without an explicit sortField the order stays newest-first, so existing
    // callers (e.g. the head-office pool page) are unaffected. The report page
    // passes its own explicit sort. `id` tiebreak keeps pagination stable.
    const order = filters?.sortOrder === 'desc' ? 'desc' as const : 'asc' as const;
    const sortColumn: Record<string, any> = {
      id: { id: order },
      customer: { customerName: order },
      result: { result: order },
      verifiedBy: { verifiedBy: order },
      verifiedAt: { verifiedAt: order },
    };
    const orderBy: any = filters?.sortField
      ? [sortColumn[filters.sortField] || { verifiedAt: order }, { id: 'asc' }]
      : { verifiedAt: 'desc' };

    const [verifications, total] = await Promise.all([
      prisma.followUpVerification.findMany({
        where,
        include: {
          kyc: {
            include: {
              assignedTo: true
            }
          }
        },
        orderBy,
        take: filters?.limit || 100,
        skip: filters?.offset || 0
      }),
      prisma.followUpVerification.count({ where })
    ]);

    return { verifications, total };
  } catch (error) {
    return { verifications: [], total: 0 };
  }
}

export async function getFollowUpById(id: string) {
  try {
    const { canWorkPool, canViewLogs } = await getFollowUpAccess();
    if (!canWorkPool && !canViewLogs) {
      throw new Error('Unauthorized');
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
      throw new Error('Unauthorized');
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
    return [];
  }
}

export async function seedFollowUpPool(cases: any[]) {
  try {
    const { canWorkPool } = await getFollowUpAccess();
    if (!canWorkPool) {
      throw new Error('Unauthorized');
    }

    await prisma.followUpVerification.createMany({
      data: cases,
      skipDuplicates: true
    });
    revalidatePath('/head-office/follow-up');
    return { success: true };
  } catch (error: any) {
    // SECURITY: Use generic safe error message (A03:2021 - Information Disclosure)
    return { success: false, error: getSafeErrorMessage(error) };
  }
}

export async function updateFollowUp(id: string, data: any) {
  try {
    const { canWorkPool } = await getFollowUpAccess();
    if (!canWorkPool) {
      throw new Error('Unauthorized');
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
    // SECURITY: Use generic safe error message (A03:2021 - Information Disclosure)
    return { success: false, error: getSafeErrorMessage(error) };
  }
}
