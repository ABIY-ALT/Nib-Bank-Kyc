'use server';

import { prisma } from '@/lib/prisma';
import { revalidatePath } from 'next/cache';
import { signDownloadToken } from '@/lib/security';
import { getServerSession } from './auth-server';
import { resolveRbacContext, requireRole, requirePermission, logPrivilegeChange } from './rbac';
import { getSafeErrorMessage } from '@/lib/information-disclosure-prevention';
import { purgeStoredFileOrThrow } from '@/lib/secure-file-storage';
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
 * If this was the LAST document of a case, the case is soft-deleted (active: false)
 * so it immediately disappears from every workflow queue, dashboard count, and badge
 * without breaking audit trails or referential integrity.
 *
 * RBAC: Requires PURGE_VAULT_STORAGE permission exclusively from server-side session.
 */
export async function deleteInstitutionalFile(memoId: string) {
  // requirePermission fetches permissions from DB, never from client params
  const ctx = await requirePermission('PURGE_VAULT_STORAGE', 'DELETE_INSTITUTIONAL_FILE');

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
      details: `Super Admin initiated purge of file: ${memoId} (storageKey: ${memo.storageKey})`,
    });

    // 1. Free the physical bytes, and proceed only once they are verifiably
    //    gone. Deleting the record while the file survives would strand the
    //    space forever — nothing references it and nothing reconciles it back.
    const tier = (memo as any).storageTier === 'ARCHIVE' ? 'ARCHIVE' : 'PRIMARY';
    try {
      await purgeStoredFileOrThrow(memo.storageKey, tier);
    } catch (purgeError: any) {
      await createAuditLog({
        userId: ctx.userId,
        userEmail: ctx.email,
        action: 'FILE_PURGE_FAILED',
        details: `Storage purge failed for memo ${memoId} (storageKey: ${memo.storageKey}, tier: ${tier}, code: ${purgeError?.code || 'UNKNOWN'}). Record retained to avoid orphaning the file.`,
        kycId: memo.kycId,
        severity: 'HIGH',
      }).catch(() => {});

      return {
        success: false,
        error:
          'The document could not be removed from storage, so its record has been kept. The file may be locked by another program (antivirus or backup) or its storage volume may be unavailable. Please try again shortly.',
      };
    }

    // 2. Bytes confirmed freed — now it is safe to drop the record.
    await prisma.memo.delete({ where: { id: memoId } });

    let caseDeleted = false;
    const remainingMemos = await prisma.memo.count({ where: { kycId: memo.kycId } });

    if (remainingMemos === 0) {
      // It was the last document — soft-delete the case so it vanishes from ALL queues
      // (In Review, Submitted, Action Required, Resubmitted, Escalated, Exceptional,
      //  Follow-up) without breaking foreign-key references or the audit trail.
      await prisma.kYC.update({
        where: { id: memo.kycId },
        data: {
          active: false,       // disappears from every active: true query (all dashboard cards, badge counts, queues)
          assignedToId: null,  // release from officer queue so it doesn't inflate assigned counts
        },
      });

      await createAuditLog({
        userId: ctx.userId,
        userEmail: ctx.email,
        action: 'DELETE_KYC_CASE',
        details: `Super Admin soft-deleted case ${memo.kycId} after its last document was removed. Case deactivated and removed from all workflow queues.`,
        severity: 'CRITICAL',
      });
      caseDeleted = true;
    }

    // 3. Revalidate all pages whose badge counts / queue lists depend on active cases
    revalidatePath('/admin/storage');
    revalidatePath('/admin/dashboard');
    revalidatePath('/admin/submissions');
    revalidatePath('/admin/review');
    revalidatePath('/admin/cases');
    revalidatePath('/admin/exceptional');
    revalidatePath('/admin/escalated');
    revalidatePath('/admin/follow-up');
    revalidatePath(`/submissions/${memo.kycId}`);

    return { success: true, kycId: memo.kycId, caseDeleted };
  } catch (error: any) {
    return { success: false, error: getSafeErrorMessage(error) };
  }
}
