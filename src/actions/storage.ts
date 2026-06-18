'use server';

import { prisma } from '@/lib/prisma';
import { revalidatePath } from 'next/cache';
import { signDownloadToken } from '@/lib/security';
import { getServerSession } from './auth-server';
import { resolveRbacContext, requireRole, logPrivilegeChange } from './rbac';
import { getSafeErrorMessage } from '@/lib/information-disclosure-prevention';
import { deleteSecureUploadedFile } from '@/lib/secure-file-storage';
import { createAuditLog } from './audit';
import { GLOBAL_SCOPE_PERMISSIONS } from '@/lib/jurisdiction';

/**
 * Retrieves the institutional file inventory based on user jurisdiction.
 *
 * SECURITY:
 * - All privilege decisions are derived from the server-side session + DB.
 * - No client-supplied userId, isSuperAdmin, assignedBranches, or branchName
 *   values are used for access control.
 * - Jurisdiction scope is fetched directly from the DB using session.id.
 */
export async function getStorageInventory() {
  const ctx = await resolveRbacContext();
  if (!ctx) {
    throw new Error('Authentication required');
  }

  // Log admin-level vault access
  if (ctx.isSuperAdmin) {
    await createAuditLog({
      userId: ctx.userId,
      userEmail: ctx.email,
      action: 'ADMIN_ACCESS_STORAGE_VAULT',
      details: 'Super Admin accessed the full institutional storage vault.',
      severity: 'HIGH',
    }).catch(() => {});
  }

  try {
    // Fetch jurisdiction from DB — never from params
    const user = await prisma.user.findUnique({
      where: { id: ctx.userId },
      select: {
        assignedBranches: true,
        branch: { select: { name: true } }
      }
    });

    if (!user) return [];

    // Check if user has global scope access via permissions (e.g. MANAGE_VAULT_STORAGE)
    const hasGlobalScope = ctx.isSuperAdmin || 
      ctx.permissions.some(p => GLOBAL_SCOPE_PERMISSIONS.has(p));

    let whereClause: any = {};

    if (!hasGlobalScope) {
      const dbAssignedBranches = user.assignedBranches
        ? user.assignedBranches.split(',').map((b: string) => b.trim()).filter(Boolean)
        : [];
      const dbBranchName = user.branch?.name;

      if (dbAssignedBranches.length > 0) {
        whereClause.kyc = { branchName: { in: dbAssignedBranches } };
      } else if (dbBranchName) {
        whereClause.kyc = { branchName: dbBranchName };
      } else {
        return []; // No jurisdiction — return empty
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
            branch: { include: { district: true } }
          }
        },
        uploadedBy: {
          select: { firstName: true, lastName: true }
        }
      },
      orderBy: { createdAt: 'desc' },
      take: 1000,
    });

    // Tokenize IDs with expiration to prevent IDOR and stale link reuse
    return memos.map((m: any) => ({
      ...m,
      fileUrl: `/api/memos/${signDownloadToken(m.id)}`
    }));
  } catch (error) {
    return [];
  }
}

/**
 * Purges a file from physical storage and removes its record from the Vault.
 * RBAC: Requires SUPER_ADMIN role exclusively from server-side session.
 */
export async function deleteInstitutionalFile(memoId: string) {
  // requireRole fetches role from DB, never from client params
  const ctx = await requireRole('SUPER_ADMIN', 'DELETE_INSTITUTIONAL_FILE');

  try {
    const memo = await prisma.memo.findUnique({ where: { id: memoId } });
    if (!memo) throw new Error('File record not found in the Institutional Vault.');

    // Log the privileged purge action
    await logPrivilegeChange({
      actorId: ctx.userId,
      actorEmail: ctx.email,
      targetUserId: ctx.userId,
      targetUserEmail: ctx.email,
      changeType: 'ROLE_ASSIGNED',
      details: `Super Admin purged file: ${memoId} (storageKey: ${memo.storageKey})`,
    });

    // 1. Delete from physical storage (from whichever tier the file lives on)
    try {
      const tier = (memo as any).storageTier === 'ARCHIVE' ? 'ARCHIVE' : 'PRIMARY';
      await deleteSecureUploadedFile(memo.storageKey, false, tier);
    } catch {}

    // 2. Delete from database
    await prisma.memo.delete({ where: { id: memoId } });

    // 3. Clear caches
    revalidatePath('/admin/storage');
    revalidatePath(`/submissions/${memo.kycId}`);

    return { success: true, kycId: memo.kycId };
  } catch (error: any) {
    return { success: false, error: getSafeErrorMessage(error) };
  }
}
