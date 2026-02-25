'use server';

import { prisma } from '@/lib/prisma';
import { revalidatePath } from 'next/cache';
import fs from 'fs/promises';
import path from 'path';

/**
 * Retrieves the institutional file inventory based on user jurisdiction.
 */
export async function getStorageInventory(params: {
  userId: string;
  isSuperAdmin: boolean;
  assignedBranches: string[];
  branchName?: string;
}) {
  const { userId, isSuperAdmin, assignedBranches, branchName } = params;

  try {
    let whereClause: any = {};

    if (!isSuperAdmin) {
      if (assignedBranches && assignedBranches.length > 0) {
        whereClause.kyc = {
          branchName: { in: assignedBranches }
        };
      } else if (branchName) {
        whereClause.kyc = {
          branchName: branchName
        };
      } else {
        // Restricted access
        return [];
      }
    }

    return await prisma.memo.findMany({
      where: whereClause,
      include: {
        kyc: {
          select: {
            id: true,
            customerName: true,
            branchName: true,
            status: true
          }
        },
        uploadedBy: {
          select: {
            firstName: true,
            lastName: true
          }
        }
      },
      orderBy: { createdAt: 'desc' }
    });
  } catch (error) {
    console.error('[Vault Storage] Fetch Error:', error);
    return [];
  }
}

/**
 * Purges a file from the physical storage and removes its record from the Vault.
 */
export async function deleteInstitutionalFile(memoId: string) {
  try {
    const memo = await prisma.memo.findUnique({
      where: { id: memoId }
    });

    if (!memo) throw new Error("File record not found in the Institutional Vault.");

    // 1. Delete from physical storage (public/uploads)
    const filePath = path.join(process.cwd(), 'public', memo.fileUrl);
    try {
      await fs.unlink(filePath);
    } catch (err) {
      console.warn(`[Vault Storage] Physical file missing at path: ${memo.fileUrl}. Proceeding with record purge.`);
    }

    // 2. Delete the record from the database
    await prisma.memo.delete({
      where: { id: memoId }
    });

    // 3. Clear relevant caches
    revalidatePath('/admin/storage');
    revalidatePath(`/submissions/${memo.kycId}`);
    
    return { success: true };
  } catch (error: any) {
    console.error('[Vault Storage] Purge Failure:', error);
    return { success: false, error: error.message };
  }
}
