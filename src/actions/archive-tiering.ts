'use server';

import { prisma } from '@/lib/prisma';
import { revalidatePath } from 'next/cache';
import { requirePermission } from './rbac';
import { createAuditLog } from './audit';
import { getSafeErrorMessage } from '@/lib/information-disclosure-prevention';
import {
  copyToArchive,
  copyToPrimary,
  deleteSecureUploadedFile,
  ensureArchiveRoot,
  ensureSecureUploadRoot,
  secureUploadedFileExists,
  type StorageTier,
} from '@/lib/secure-file-storage';

const ARCHIVE_PERMISSION = 'DOWNLOAD_MASTER_ARCHIVE';

export type TierAction = 'COPY' | 'CUT' | 'RESTORE' | 'DELETE';

export interface TierActionResult {
  success: boolean;
  action: TierAction;
  processedCases: number;
  filesProcessed: number;
  filesSkipped: number;
  filesFailed: number;
  /** Files whose source was missing (can't be moved/restored). Subset of filesFailed. */
  filesMissing: number;
  bytesFreed: number;
  failures: { caseId: string; document: string; reason: string }[];
  error?: string;
}

// Minimal shape we rely on — declared locally so the action compiles against the
// generated Prisma client regardless of regeneration timing.
type TieringMemo = {
  id: string;
  name: string;
  originalName: string;
  storageKey: string;
  fileHash: string | null;
  size: number;
  storageTier: StorageTier;
  archiveDeletedAt: Date | null;
  kycId: string;
};

function emptyResult(action: TierAction): TierActionResult {
  return {
    success: true,
    action,
    processedCases: 0,
    filesProcessed: 0,
    filesSkipped: 0,
    filesFailed: 0,
    filesMissing: 0,
    bytesFreed: 0,
    failures: [],
  };
}

/**
 * Moves/copies/restores the documents of the given KYC cases between storage
 * tiers (PRIMARY secure folder <-> ARCHIVE volume such as E:).
 *
 * Safe ordering for the destructive paths:
 *   CUT     : copy PRIMARY->ARCHIVE -> verify hash -> mark DB ARCHIVE -> delete PRIMARY original
 *   RESTORE : copy ARCHIVE->PRIMARY -> verify hash -> mark DB PRIMARY -> delete ARCHIVE copy
 *   COPY    : copy PRIMARY->ARCHIVE -> verify hash   (no DB change, original kept — a backup duplicate)
 *
 * The original is only ever deleted after the destination copy is verified and
 * the DB row records the new tier, so an interruption can never lose a file.
 * Idempotent: files already on the target tier are skipped, so re-runs are safe.
 */
async function runTierAction(kycIds: string[], action: TierAction): Promise<TierActionResult> {
  const ctx = await requirePermission(ARCHIVE_PERMISSION, `STORAGE_TIER_${action}`);

  const result = emptyResult(action);

  if (!Array.isArray(kycIds) || kycIds.length === 0) {
    return { ...result, success: false, error: 'No cases were selected.' };
  }

  // Pre-flight: make sure the volume we are about to write to is reachable.
  try {
    if (action === 'RESTORE') {
      await ensureSecureUploadRoot();
    } else {
      await ensureArchiveRoot();
    }
  } catch {
    return {
      ...result,
      success: false,
      error:
        action === 'RESTORE'
          ? 'The primary storage folder is not reachable. Aborted before any change.'
          : 'The archive volume (e.g. E:) is not reachable. Connect it and try again. No files were changed.',
    };
  }

  // Source tier we act on: CUT/COPY pull from PRIMARY, RESTORE pulls from ARCHIVE.
  const sourceTier: StorageTier = action === 'RESTORE' ? 'ARCHIVE' : 'PRIMARY';

  const memos = (await prisma.memo.findMany({
    where: { kycId: { in: kycIds } },
  })) as unknown as TieringMemo[];

  const processedCaseIds = new Set<string>();
  const touchedKycIds = new Set<string>();

  for (const memo of memos) {
    const currentTier: StorageTier = memo.storageTier === 'ARCHIVE' ? 'ARCHIVE' : 'PRIMARY';

    // Skip anything not on the tier this action operates on (idempotent re-runs).
    if (currentTier !== sourceTier) {
      // For CUT/RESTORE this means "already in the desired state".
      if (action !== 'COPY') result.filesSkipped++;
      continue;
    }

    const documentLabel = memo.originalName || memo.name || memo.id;

    // Guard: if the source file is missing (moved/deleted out-of-band), record a
    // clean "not found" result and move on. This never throws, so a missing file
    // can't crash the operation — and for CUT we never touch the DB or delete
    // anything when the original isn't there to begin with.
    const sourceExists = await secureUploadedFileExists(memo.storageKey, false, sourceTier);
    if (!sourceExists) {
      result.filesFailed++;
      result.filesMissing++;
      result.failures.push({
        caseId: memo.kycId,
        document: documentLabel,
        reason:
          sourceTier === 'ARCHIVE'
            ? 'File not found in the archive. It may have been moved or the archive volume (E:) is not connected.'
            : 'File not found in primary storage. It may have already been moved or deleted.',
      });
      continue;
    }

    try {
      if (action === 'COPY') {
        // Backup duplicate to the archive tier. Original stays; no DB change.
        await copyToArchive(memo.storageKey, memo.fileHash);
        result.filesProcessed++;
      } else if (action === 'CUT') {
        // 1. copy + verify
        await copyToArchive(memo.storageKey, memo.fileHash);
        // 2. record new tier in DB
        await prisma.memo.update({
          where: { id: memo.id },
          data: { storageTier: 'ARCHIVE', archivedAt: new Date(), archivedById: ctx.userId } as any,
        });
        // 3. only now free primary space
        await deleteSecureUploadedFile(memo.storageKey, false, 'PRIMARY').catch(() => {});
        result.filesProcessed++;
        result.bytesFreed += memo.size || 0;
      } else {
        // RESTORE — also clears any soft-delete flag, so restoring a case from
        // the Deleted bin (after the file is re-placed on E:) brings it fully
        // back to primary/active in one step.
        await copyToPrimary(memo.storageKey, memo.fileHash);
        await prisma.memo.update({
          where: { id: memo.id },
          data: { storageTier: 'PRIMARY', archivedAt: null, archivedById: null, archiveDeletedAt: null, archiveDeletedById: null } as any,
        });
        await deleteSecureUploadedFile(memo.storageKey, false, 'ARCHIVE').catch(() => {});
        result.filesProcessed++;
      }
      processedCaseIds.add(memo.kycId);
      touchedKycIds.add(memo.kycId);
    } catch (error: any) {
      // Sanitize: never surface raw fs errors / server paths to the client.
      const isMissing = error?.code === 'ENOENT' || /ENOENT|not found/i.test(error?.message || '');
      const isIntegrity = /integrity|hash/i.test(error?.message || '');
      if (isMissing) result.filesMissing++;
      result.filesFailed++;
      result.failures.push({
        caseId: memo.kycId,
        document: documentLabel,
        reason: isMissing
          ? 'File not found in storage during transfer. It may have been moved or deleted.'
          : isIntegrity
          ? 'Integrity check failed — the copied file did not match its recorded checksum. Original left untouched.'
          : 'Transfer could not be completed for this file.',
      });
    }
  }

  result.processedCases = processedCaseIds.size;
  result.success = result.filesFailed === 0;

  await createAuditLog({
    userId: ctx.userId,
    userEmail: ctx.email,
    action: `STORAGE_TIER_${action}`,
    details:
      `${action} across ${result.processedCases} case(s): ` +
      `${result.filesProcessed} file(s) moved, ${result.filesSkipped} skipped, ${result.filesFailed} failed` +
      (result.filesMissing > 0 ? ` (${result.filesMissing} missing)` : '') +
      (action === 'CUT' ? `, ${result.bytesFreed} bytes freed from primary storage` : ''),
    severity: 'HIGH',
  }).catch(() => {});

  // Refresh views that show tier/archive state.
  revalidatePath('/submissions/master-bundle');
  revalidatePath('/admin/storage');
  for (const kycId of touchedKycIds) {
    revalidatePath(`/submissions/${kycId}`);
  }

  return result;
}

/** Copy the selected cases' documents to the archive tier (originals kept). */
export async function copyCasesToArchive(kycIds: string[]): Promise<TierActionResult> {
  try {
    return await runTierAction(kycIds, 'COPY');
  } catch (error: any) {
    return { ...emptyResult('COPY'), success: false, error: getSafeErrorMessage(error) };
  }
}

/** Move (cut) the selected cases' documents to the archive tier, freeing primary space. */
export async function cutCasesToArchive(kycIds: string[]): Promise<TierActionResult> {
  try {
    return await runTierAction(kycIds, 'CUT');
  } catch (error: any) {
    return { ...emptyResult('CUT'), success: false, error: getSafeErrorMessage(error) };
  }
}

/** Restore the selected cases' documents from the archive tier back to primary. */
export async function restoreCasesFromArchive(kycIds: string[]): Promise<TierActionResult> {
  try {
    return await runTierAction(kycIds, 'RESTORE');
  } catch (error: any) {
    return { ...emptyResult('RESTORE'), success: false, error: getSafeErrorMessage(error) };
  }
}

/**
 * Frees the selected cases' ARCHIVED documents from the archive volume (e.g. E:)
 * by deleting the physical bytes, while KEEPING the DB row. This reclaims archive
 * space without losing the record: the document stays listed in the Archived view
 * and can be brought back later by re-placing the original file in the archive
 * (under its storageKey) and running Restore.
 *
 * Safety: only ever touches files on the ARCHIVE tier (primary files are never
 * deleted by this). A file already gone from E: is treated as success.
 */
export async function deleteCasesFromArchive(kycIds: string[]): Promise<TierActionResult> {
  try {
    const ctx = await requirePermission(ARCHIVE_PERMISSION, 'STORAGE_TIER_DELETE');
    const result = emptyResult('DELETE');

    if (!Array.isArray(kycIds) || kycIds.length === 0) {
      return { ...result, success: false, error: 'No cases were selected.' };
    }

    const memos = (await prisma.memo.findMany({
      where: { kycId: { in: kycIds } },
    })) as unknown as TieringMemo[];

    const processedCaseIds = new Set<string>();
    const touchedKycIds = new Set<string>();

    for (const memo of memos) {
      const currentTier: StorageTier = memo.storageTier === 'ARCHIVE' ? 'ARCHIVE' : 'PRIMARY';

      // Hard safety rail: never delete a file that is still on primary storage.
      if (currentTier !== 'ARCHIVE') {
        result.filesSkipped++;
        continue;
      }

      // Idempotent: already soft-deleted (bytes freed, sitting in the Deleted bin).
      if (memo.archiveDeletedAt) {
        result.filesSkipped++;
        continue;
      }

      const documentLabel = memo.originalName || memo.name || memo.id;
      try {
        // Free the bytes from E:, KEEP the DB row, and mark it soft-deleted. The
        // case leaves the Archived list and shows only in the Deleted bin; it can
        // be restored later by re-placing the original file on E: under its
        // storageKey and running Restore. ENOENT (already gone) is fine.
        await deleteSecureUploadedFile(memo.storageKey, false, 'ARCHIVE').catch((e: any) => {
          if (e?.code === 'ENOENT') return;
          throw e;
        });
        await prisma.memo.update({
          where: { id: memo.id },
          data: { archiveDeletedAt: new Date(), archiveDeletedById: ctx.userId } as any,
        });
        result.filesProcessed++;
        result.bytesFreed += memo.size || 0;
        processedCaseIds.add(memo.kycId);
        touchedKycIds.add(memo.kycId);
      } catch {
        result.filesFailed++;
        result.failures.push({
          caseId: memo.kycId,
          document: documentLabel,
          reason: 'Could not delete this file from the archive.',
        });
      }
    }

    result.processedCases = processedCaseIds.size;
    result.success = result.filesFailed === 0;

    await createAuditLog({
      userId: ctx.userId,
      userEmail: ctx.email,
      action: 'STORAGE_TIER_DELETE',
      details:
        `Freed ${result.filesProcessed} archived file(s) from the archive volume across ${result.processedCases} case(s) ` +
        `(${result.bytesFreed} bytes freed, DB records kept for restore); ${result.filesFailed} failed, ${result.filesSkipped} skipped.`,
      severity: 'CRITICAL',
    }).catch(() => {});

    revalidatePath('/submissions/master-bundle');
    revalidatePath('/admin/storage');
    for (const kycId of touchedKycIds) {
      revalidatePath(`/submissions/${kycId}`);
    }

    return result;
  } catch (error: any) {
    return { ...emptyResult('DELETE'), success: false, error: getSafeErrorMessage(error) };
  }
}
