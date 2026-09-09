'use server';

import { prisma } from '@/lib/prisma';
import { revalidatePath } from 'next/cache';
import { requirePermission } from './rbac';
import { createAuditLog } from './audit';
import { getSafeErrorMessage } from '@/lib/information-disclosure-prevention';
import { statfs as fsStatfs } from 'fs/promises';
import { syncCaseStorageState } from '@/lib/case-storage-state';
import {
  copyToArchive,
  copyToPrimary,
  deleteSecureUploadedFile,
  ensureArchiveRoot,
  ensureSecureUploadRoot,
  getArchiveRoot,
  getSecureUploadRoot,
  purgeStoredFileOrThrow,
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
  /**
   * Files that reached their destination intact but whose ORIGINAL could not be
   * deleted afterwards. The document is safe and correctly recorded — only the
   * space was not reclaimed. Counted separately from filesFailed because the
   * transfer itself succeeded, and reported so the leftover never goes unnoticed.
   */
  filesNotFreed: number;
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
    filesNotFreed: 0,
    bytesFreed: 0,
    failures: [],
  };
}

/**
 * Deletes a transferred file's ORIGINAL and confirms the bytes are really gone.
 *
 * The destination copy is already written, verified against its recorded hash,
 * and recorded in the database by the time this runs, so the document itself is
 * safe either way. What is at stake is the space — and a delete that fails
 * silently here is the worst kind of leftover: the row now points at the OTHER
 * tier, so the file sitting on this one is referenced by nothing that looks at
 * this folder, and the reconcile script counts its storage key as live. Nothing
 * would ever find it again.
 *
 * Records the leftover instead of hiding it, and never throws — the transfer
 * succeeded, so it must not be reported as a failed move.
 */
async function freeTransferredOriginal(
  result: TierActionResult,
  memo: TieringMemo,
  tier: StorageTier,
  documentLabel: string,
): Promise<void> {
  try {
    await purgeStoredFileOrThrow(memo.storageKey, tier);
    result.bytesFreed += memo.size || 0;
  } catch (error: any) {
    result.filesNotFreed++;
    result.failures.push({
      caseId: memo.kycId,
      document: documentLabel,
      reason:
        tier === 'PRIMARY'
          ? 'Archived successfully, but the original could not be removed from primary storage — it may be locked by antivirus or a backup agent. The document is safe; no space was freed for this file.'
          : 'Restored successfully, but the archived copy could not be removed. The document is safe; no archive space was freed for this file.',
    });
  }
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
        // 3. only now free primary space, and confirm it was actually freed
        await freeTransferredOriginal(result, memo, 'PRIMARY', documentLabel);
        result.filesProcessed++;
      } else {
        // RESTORE — also clears any soft-delete flag, so restoring a case from
        // the Deleted bin (after the file is re-placed on E:) brings it fully
        // back to primary/active in one step.
        await copyToPrimary(memo.storageKey, memo.fileHash);
        await prisma.memo.update({
          where: { id: memo.id },
          data: { storageTier: 'PRIMARY', archivedAt: null, archivedById: null, archiveDeletedAt: null, archiveDeletedById: null } as any,
        });
        await freeTransferredOriginal(result, memo, 'ARCHIVE', documentLabel);
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
      (action === 'CUT' ? `, ${result.bytesFreed} bytes freed from primary storage` : '') +
      (result.filesNotFreed > 0
        ? `. WARNING: ${result.filesNotFreed} original(s) could not be deleted after transfer and still occupy space`
        : ''),
    severity: 'HIGH',
  }).catch(() => {});

  // The documents moved, so the cases' storage state may have changed with
  // them. Recomputed from the documents themselves, not inferred from the
  // action, so a partial batch lands correctly.
  await syncCaseStorageState([...touchedKycIds]);

  // Refresh views that show tier/archive state.
  invalidateOverviewCache();
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

    await syncCaseStorageState([...touchedKycIds]);
    invalidateOverviewCache();
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

// ---------------------------------------------------------------------------
// IT backup confirmation — clearing the archive volume in one step
// ---------------------------------------------------------------------------

/**
 * The archive volume is a waiting room, not a store: the IT team copies files
 * off it into the institutional backup, and only then may the volume be cleared
 * for the next batch. Clearing it is therefore a HUMAN confirmation — no signal
 * on disk can prove that a copy was taken, and the file being removed is the
 * last one the application holds.
 *
 * The cut-off date is what makes the confirmation safe. Files keep arriving on
 * the archive every night, so by the time someone confirms, the volume also
 * holds documents that landed AFTER the IT team finished copying. Clearing
 * everything present would delete exactly those — the ones with no backup
 * anywhere. Only documents archived on or before the confirmed date are freed.
 */
export interface ArchiveBackupPreview {
  /** Documents eligible to be cleared for the given cut-off. */
  files: number;
  cases: number;
  bytes: number;
  /** Earliest archive date among eligible documents (ISO), for context. */
  oldestArchivedAt: string | null;
  /** Documents on the volume that arrived AFTER the cut-off and stay untouched. */
  filesAfterCutoff: number;
  /**
   * Archived documents with no recorded archive date. They are never included
   * automatically — without a date there is no way to tell whether the IT copy
   * covered them. Clear these case by case with the Delete from E: button.
   */
  filesWithoutArchiveDate: number;
}

export interface ArchiveBackupClearResult {
  success: boolean;
  filesCleared: number;
  filesFailed: number;
  casesTouched: number;
  bytesFreed: number;
  /** Eligible documents still waiting after this batch — call again to continue. */
  remaining: number;
  failures: { caseId: string; document: string; reason: string }[];
  error?: string;
}

/** Documents cleared per call, so a large confirmation runs as several batches. */
const CLEAR_BATCH_SIZE = 200;

/**
 * Why one file could not be freed, in terms the person confirming can act on.
 *
 * These used to collapse into a single "could not be delete it, retry later",
 * which is misleading: a locked file is worth retrying, a malformed storage key
 * never will be, and an unreachable volume means stopping and calling IT. A
 * whole batch failing identically is the signal that matters, and it is only
 * visible if the reason distinguishes the causes.
 */
function describeClearFailure(error: any): string {
  const code = error?.code;
  const message = String(error?.message || '');

  if (/invalid storage key/i.test(message)) {
    return 'This document\'s storage key is not in a valid format, so the file was not touched. ' +
      'Retrying will not help — the record needs correcting.';
  }
  if (code === 'EBUSY' || code === 'EPERM' || code === 'EACCES') {
    return 'The file is held open by another program (antivirus, backup or indexing). ' +
      'It stays listed and can be retried shortly.';
  }
  if (code === 'EPURGEUNVERIFIED') {
    return 'The delete reported success but the file is still on the volume. It stays listed.';
  }
  if (code === 'ENODEV' || code === 'EIO' || code === 'EHOSTDOWN' || code === 'ENXIO') {
    return 'The archive volume could not be reached. Check that it is mounted, then retry.';
  }
  return 'Could not delete this file from the archive volume. It stays listed and can be retried.';
}

function parseCutoff(cutoffISO: string): Date {
  // Built from the calendar parts rather than `new Date(cutoffISO)`, which reads
  // a bare "YYYY-MM-DD" as UTC midnight while setHours() below works in local
  // time — west of UTC that combination silently lands on the previous day.
  const parts = /^(\d{4})-(\d{2})-(\d{2})$/.exec(cutoffISO.trim());
  if (!parts) throw new Error('Invalid confirmation date.');
  const [, y, m, d] = parts;
  // The whole confirmed day counts: IT finishing at 16:00 must include 09:00.
  const cutoff = new Date(Number(y), Number(m) - 1, Number(d), 23, 59, 59, 999);
  if (Number.isNaN(cutoff.getTime())) throw new Error('Invalid confirmation date.');

  // Compared against the end of TODAY, not the current moment. Comparing to
  // Date.now() rejected today itself, because today at 23:59 is always still
  // ahead of now — and today is what the dialog offers by default.
  const endOfToday = new Date();
  endOfToday.setHours(23, 59, 59, 999);
  if (cutoff.getTime() > endOfToday.getTime()) {
    throw new Error('The confirmation date cannot be in the future.');
  }
  return cutoff;
}

/** What a confirmation for `cutoffISO` would clear — shown before confirming. */
export async function getArchiveBackupPreview(cutoffISO: string): Promise<ArchiveBackupPreview> {
  await requirePermission(ARCHIVE_PERMISSION, 'STORAGE_ARCHIVE_BACKUP_PREVIEW');
  const cutoff = parseCutoff(cutoffISO);

  const onVolume = { storageTier: 'ARCHIVE' as const, archiveDeletedAt: null };

  // One aggregate rather than loading every eligible row. This used to read all
  // matching documents into memory to count them, de-duplicate their cases and
  // sum their bytes — a confirmation covering 100,000 files fetched 100,000 rows
  // to produce three numbers.
  const [totals, afterCutoff, withoutDate] = await Promise.all([
    prisma.$queryRaw<{ files: number; cases: number; bytes: bigint; oldest: Date | null }[]>`
      SELECT COUNT(*)::int                     AS files,
             COUNT(DISTINCT "kycId")::int      AS cases,
             COALESCE(SUM(size), 0)::bigint    AS bytes,
             MIN("archivedAt")                 AS oldest
      FROM "Memo"
      WHERE "storageTier" = 'ARCHIVE'
        AND "archiveDeletedAt" IS NULL
        AND "archivedAt" <= ${cutoff}
    `,
    prisma.memo.count({ where: { ...onVolume, archivedAt: { gt: cutoff } } }),
    prisma.memo.count({ where: { ...onVolume, archivedAt: null } }),
  ]);

  const row = totals[0];

  return {
    files: row?.files ?? 0,
    cases: row?.cases ?? 0,
    bytes: Number(row?.bytes ?? 0),
    oldestArchivedAt: row?.oldest ? new Date(row.oldest).toISOString() : null,
    filesAfterCutoff: afterCutoff,
    filesWithoutArchiveDate: withoutDate,
  };
}

/**
 * Frees the archive volume for every document archived on or before the
 * confirmed date, keeping each record so the case history stays intact.
 *
 * Processes at most `CLEAR_BATCH_SIZE` documents per call and reports how many
 * remain, so the caller can drive a long confirmation as a sequence of short
 * requests instead of one that outlives its timeout. Re-running is safe: a
 * document already cleared is excluded by `archiveDeletedAt`.
 */
export async function confirmArchiveBackupAndClear(cutoffISO: string): Promise<ArchiveBackupClearResult> {
  const empty: ArchiveBackupClearResult = {
    success: true,
    filesCleared: 0,
    filesFailed: 0,
    casesTouched: 0,
    bytesFreed: 0,
    remaining: 0,
    failures: [],
  };

  try {
    const ctx = await requirePermission(ARCHIVE_PERMISSION, 'STORAGE_ARCHIVE_BACKUP_CLEAR');
    const cutoff = parseCutoff(cutoffISO);
    const result = { ...empty, failures: [] as ArchiveBackupClearResult['failures'] };

    const where = {
      storageTier: 'ARCHIVE' as const,
      archiveDeletedAt: null,
      archivedAt: { lte: cutoff },
    };

    const batch = (await prisma.memo.findMany({
      where,
      orderBy: { archivedAt: 'asc' },
      take: CLEAR_BATCH_SIZE,
    })) as unknown as TieringMemo[];

    const touchedKycIds = new Set<string>();

    for (const memo of batch) {
      const documentLabel = memo.originalName || memo.name || memo.id;
      try {
        // A file already absent from the volume counts as freed — the space is
        // back and the record is safe to mark.
        await deleteSecureUploadedFile(memo.storageKey, false, 'ARCHIVE').catch((e: any) => {
          if (e?.code === 'ENOENT') return;
          throw e;
        });
        await prisma.memo.update({
          where: { id: memo.id },
          data: { archiveDeletedAt: new Date(), archiveDeletedById: ctx.userId } as any,
        });
        result.filesCleared++;
        result.bytesFreed += memo.size || 0;
        touchedKycIds.add(memo.kycId);
      } catch (error: any) {
        result.filesFailed++;
        result.failures.push({
          caseId: memo.kycId,
          document: documentLabel,
          reason: describeClearFailure(error),
        });
      }
    }

    result.casesTouched = touchedKycIds.size;
    result.remaining = await prisma.memo.count({ where });
    result.success = result.filesFailed === 0;

    if (result.filesCleared > 0) {
      await createAuditLog({
        userId: ctx.userId,
        userEmail: ctx.email,
        action: 'STORAGE_ARCHIVE_BACKUP_CLEAR',
        details:
          `[CRITICAL] IT backup confirmed up to ${cutoff.toISOString()}: freed ${result.filesCleared} file(s) ` +
          `(${result.bytesFreed} bytes) from the archive volume across ${result.casesTouched} case(s). ` +
          `Records kept and restorable. ${result.filesFailed} failed, ${result.remaining} still awaiting this confirmation.`,
        severity: 'CRITICAL',
      }).catch(() => {});
    }

    await syncCaseStorageState([...touchedKycIds]);
    invalidateOverviewCache();
    revalidatePath('/submissions/master-bundle');
    revalidatePath('/admin/storage');
    for (const kycId of touchedKycIds) {
      revalidatePath(`/submissions/${kycId}`);
    }

    return result;
  } catch (error: any) {
    return { ...empty, success: false, error: getSafeErrorMessage(error) };
  }
}

// ---------------------------------------------------------------------------
// Storage overview — one place that answers "is this working?"
// ---------------------------------------------------------------------------

export interface VolumeSpace {
  root: string;
  available: boolean;
  freeBytes: number;
  totalBytes: number;
  /** Free space as a percentage, or null when the volume is unreachable. */
  freePercent: number | null;
}

export interface ArchiveStorageOverview {
  /** Documents whose bytes are still in the secure upload folder. */
  primary: { files: number; bytes: number };
  /** Documents sitting on the archive volume, waiting for the IT backup. */
  waiting: {
    files: number;
    bytes: number;
    oldestArchivedAt: string | null;
    /** Days the oldest waiting document has been on the volume. */
    oldestWaitingDays: number | null;
  };
  /** Documents whose bytes IT has backed up and which were cleared from E:. */
  cleared: { files: number };
  volumes: { primary: VolumeSpace; archive: VolumeSpace };
  lastMoveToArchive: { at: string; details: string } | null;
  lastBackupClear: { at: string; details: string } | null;
}

/** How long to wait on a volume before calling it unreachable. */
const VOLUME_PROBE_TIMEOUT_MS = 2000;

/**
 * Reads free space for one volume. Reports `available: false` rather than
 * throwing, because an unreachable archive volume is exactly the condition this
 * panel exists to make visible — an error page would hide it.
 */
async function readVolumeSpace(root: string): Promise<VolumeSpace> {
  const unreachable: VolumeSpace = { root, available: false, freeBytes: 0, totalBytes: 0, freePercent: null };
  // statfs against a disconnected network or removable volume can hang for a
  // long time. This card is informational, so a stalled probe must never hold
  // a request open — after the timeout the volume simply reads "not reachable".
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const stats = await Promise.race([
      fsStatfs(root),
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error('statfs timed out')), VOLUME_PROBE_TIMEOUT_MS);
      }),
    ]);
    const freeBytes = Number(stats.bavail) * Number(stats.bsize);
    const totalBytes = Number(stats.blocks) * Number(stats.bsize);
    return {
      root,
      available: true,
      freeBytes,
      totalBytes,
      freePercent: totalBytes > 0 ? (freeBytes / totalBytes) * 100 : null,
    };
  } catch {
    return unreachable;
  } finally {
    if (timer) clearTimeout(timer);
  }
}

/** Most recent audit entry for an action, used to show when things last ran. */
async function lastAuditEntry(action: string) {
  const entry = await prisma.auditLog.findFirst({
    where: { action },
    orderBy: { timestamp: 'desc' },
    select: { timestamp: true, details: true },
  });
  return entry ? { at: entry.timestamp.toISOString(), details: entry.details || '' } : null;
}

/**
 * How long a computed overview is reused. The numbers change only when files
 * are physically moved, and every path that moves them clears the cache below,
 * so within this window the answer cannot be wrong in a way anyone would act on.
 */
const OVERVIEW_TTL_MS = 60_000;

let overviewCache: { at: number; value: ArchiveStorageOverview } | null = null;
/**
 * The scan currently running, if any, tagged with the generation it was started
 * for. Sharing one scan matters as much as the TTL: on a cold cache, ten people
 * opening the page in the same second would otherwise each start their own
 * aggregate over the whole Memo table.
 */
let overviewInFlight: { generation: number; promise: Promise<ArchiveStorageOverview> } | null = null;
/**
 * Bumped by every invalidation. A scan reads the database at the moment it
 * starts, so a scan that began before files moved is describing the old world
 * no matter when it finishes — without this, such a scan could finish AFTER the
 * invalidation and write its stale numbers back into the cache with a fresh
 * timestamp, leaving the page showing pre-move figures for a further minute.
 */
let overviewGeneration = 0;

/**
 * Drops the cached overview so the next read recomputes it, and marks any scan
 * already in flight as describing a world that no longer exists. Called by every
 * action that moves, restores, deletes or clears files, so the numbers are
 * current the moment after an action rather than up to a minute later.
 */
function invalidateOverviewCache() {
  overviewCache = null;
  overviewGeneration++;
}

/**
 * Summarises where documents physically are and how much room is left.
 *
 * The number that matters most is how long the oldest document has been waiting
 * on the archive volume. Between the move and the IT copy, that volume holds the
 * only copy of those documents, so a waiting time that keeps growing means the
 * backup step has stalled — which nothing else in the system would reveal.
 *
 * Served from the cache above wherever possible: the underlying aggregates read
 * every document row, and this runs on every load of the master bundle page.
 */
export async function getArchiveStorageOverview(): Promise<ArchiveStorageOverview> {
  // Authorisation is never cached — only the numbers are.
  await requirePermission(ARCHIVE_PERMISSION, 'STORAGE_OVERVIEW');

  // At most two passes: one to use what is already there, and if that turned
  // out to predate a file move, one more to get the current answer.
  for (let attempt = 0; attempt < 2; attempt++) {
    if (overviewCache && Date.now() - overviewCache.at < OVERVIEW_TTL_MS) {
      return overviewCache.value;
    }

    // Only join a scan started for the CURRENT generation. One started before
    // the last move is already answering the wrong question.
    if (!overviewInFlight || overviewInFlight.generation !== overviewGeneration) {
      const generation = overviewGeneration;
      overviewInFlight = {
        generation,
        promise: computeArchiveStorageOverview()
          .then(value => {
            // Nothing moved while this was running, so it is safe to keep.
            if (overviewGeneration === generation) overviewCache = { at: Date.now(), value };
            return value;
          })
          .finally(() => {
            if (overviewInFlight?.generation === generation) overviewInFlight = null;
          }),
      };
    }

    const inFlight = overviewInFlight;
    const value = await inFlight.promise;
    if (overviewGeneration === inFlight.generation) return value;
    // Files moved while that scan was running — go round once more.
  }

  return computeArchiveStorageOverview();
}

async function computeArchiveStorageOverview(): Promise<ArchiveStorageOverview> {
  const waitingWhere = { storageTier: 'ARCHIVE' as const, archiveDeletedAt: null };

  const [primaryAgg, waitingAgg, oldestWaiting, clearedCount, primarySpace, archiveSpace, lastCut, lastClear] =
    await Promise.all([
      prisma.memo.aggregate({ where: { storageTier: 'PRIMARY' }, _count: true, _sum: { size: true } }),
      prisma.memo.aggregate({ where: waitingWhere, _count: true, _sum: { size: true } }),
      prisma.memo.findFirst({
        where: waitingWhere,
        orderBy: { archivedAt: 'asc' },
        select: { archivedAt: true },
      }),
      prisma.memo.count({ where: { storageTier: 'ARCHIVE', archiveDeletedAt: { not: null } } }),
      readVolumeSpace(getSecureUploadRoot()),
      readVolumeSpace(getArchiveRoot()),
      lastAuditEntry('STORAGE_TIER_CUT'),
      lastAuditEntry('STORAGE_ARCHIVE_BACKUP_CLEAR'),
    ]);

  const oldestAt = oldestWaiting?.archivedAt ?? null;

  return {
    primary: { files: primaryAgg._count, bytes: primaryAgg._sum.size || 0 },
    waiting: {
      files: waitingAgg._count,
      bytes: waitingAgg._sum.size || 0,
      oldestArchivedAt: oldestAt ? oldestAt.toISOString() : null,
      oldestWaitingDays: oldestAt
        ? Math.floor((Date.now() - oldestAt.getTime()) / (24 * 60 * 60 * 1000))
        : null,
    },
    cleared: { files: clearedCount },
    volumes: { primary: primarySpace, archive: archiveSpace },
    lastMoveToArchive: lastCut,
    lastBackupClear: lastClear,
  };
}
