'use server';

import { prisma } from '@/lib/prisma';
import { revalidatePath } from 'next/cache';
import { signDownloadToken } from '@/lib/security';
import { getServerSession } from './auth-server';
import { getSafeErrorMessage } from '@/lib/information-disclosure-prevention';
import { deleteSecureUploadedFile } from '@/lib/secure-file-storage';

/**
 * Retrieves the institutional file inventory based on user jurisdiction.
 * Includes relations for deep hierarchical filtering and secures URLs with time-limited tokens.
 */
export async function getStorageInventory(params: {
  userId: string;
  isSuperAdmin: boolean;
  assignedBranches: string[];
  branchName?: string;
}) {
  const { isSuperAdmin, assignedBranches, branchName } = params;

  try {
    // Ownership enforcement: Do not trust client-supplied `userId`.
    const session = await getServerSession();
    if (!session) {
      throw new Error("Authentication required");
    }

    // SECURITY: Ignore privilege flags from client. Derive solely from verified session.
    const isSuperAdmin = session.role === 'SUPER_ADMIN';

    if (session.id !== params.userId && !isSuperAdmin) {
      throw new Error("Access denied");
    }

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

    const memos = await prisma.memo.findMany({
      where: whereClause,
      include: {
        kyc: {
          select: {
            id: true,
            customerName: true,
            branchName: true,
            status: true,
            isResubmitted: true,
            branch: {
              include: {
                district: true
              }
            }
          }
        },
        uploadedBy: {
          select: {
            firstName: true,
            lastName: true
          }
        }
      },
      orderBy: { createdAt: 'desc' },
      take: 1000 // Optimized limit for discovery
    });

    // Tokenize IDs with expiration to prevent IDOR and stale link reuse
    return memos.map((m: any) => ({
      ...m,
      fileUrl: `/api/memos/${signDownloadToken(m.id)}` // Indirect route
    }));
  } catch (error) {
    return [];
  }
}

/**
 * Purges a file from the physical storage and removes its record from the Vault.
 */
export async function deleteInstitutionalFile(memoId: string) {
  const session = await getServerSession();
  if (!session || session.role !== 'SUPER_ADMIN') {
    throw new Error('Unauthorized: Administrative clearance required.');
  }

  try {
    const memo = await prisma.memo.findUnique({
      where: { id: memoId }
    });

    if (!memo) throw new Error("File record not found in the Institutional Vault.");

    // 1. Delete from physical storage with strict path resolution
    try {
      await deleteSecureUploadedFile(memo.storageKey);
    } catch (err) {
    }

    // 2. Delete the record from the database
    await prisma.memo.delete({
      where: { id: memoId }
    });

    // 3. Clear relevant caches
    revalidatePath('/admin/storage');
    revalidatePath(`/submissions/${memo.kycId}`);
    
    return { success: true, kycId: memo.kycId };
  } catch (error: any) {
    // SECURITY: Use generic safe error message (A03:2021 - Information Disclosure)
    return { success: false, error: getSafeErrorMessage(error) };
  }
}
