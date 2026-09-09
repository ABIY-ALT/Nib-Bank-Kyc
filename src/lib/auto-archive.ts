/**
 * Automatic archive tiering — moves settled cases off the server on its own.
 *
 * POLICY
 * ------
 * A case's clock starts when it was APPROVED. Once that clock passes the
 * configured age (default 7 days), every document the case still holds on the
 * PRIMARY volume is moved to the ARCHIVE volume (e.g. E:) and the primary space
 * is returned. The case, its record, its history and its counts are untouched —
 * only the bytes move, and every screen keeps working because each document's
 * row records which volume to read it from.
 *
 * The archive volume is a WAITING ROOM, not a destination: the IT team copies
 * it into the institutional backup and someone then confirms that in Master
 * Archive, which frees the volume for the next batch. This job deliberately
 * does NOT clear the volume — no signal on disk can prove a backup was taken,
 * and the file it would delete is the last copy the application holds.
 *
 * SAFETY
 * ------
 * The move order is copy -> verify checksum -> record the new volume -> delete
 * the original, so an interruption at any point loses nothing: the worst case
 * is a duplicate, never a missing document. A file whose original cannot be
 * deleted is reported rather than silently left behind, because its row now
 * points at the archive and nothing else would ever find it again.
 *
 * The job refuses to run when the archive volume is unreachable or nearly full,
 * rather than half-moving a batch onto a disk with no room.
 *
 * OFF BY DEFAULT. The policy lives on the global settings row and is edited in
 * Settings → Automatic Archive Tiering: switch it on, set the days, and use its
 * dry-run mode first to see what would move. The policy is re-read on every
 * pass, so a change takes effect without restarting the server.
 */

import { statfs } from 'fs/promises';
import { prisma } from '@/lib/prisma';
import {
  copyToArchive,
  ensureArchiveRoot,
  getArchiveRoot,
  purgeStoredFileOrThrow,
  secureUploadedFileExists,
} from '@/lib/secure-file-storage';
import { syncCaseStorageState } from '@/lib/case-storage-state';

export interface AutoArchiveConfig {
  /** Master switch. When false the job does nothing at all. */
  enabled: boolean;
  /** Days after approval before a case's documents are moved. */
  days: number;
  /** When true the job reports what it would move but moves nothing. */
  dryRun: boolean;
}

export const AUTO_ARCHIVE_DEFAULTS: AutoArchiveConfig = {
  enabled: false,
  days: 7,
  dryRun: false,
};

/** Guideline entry key under which the policy is persisted on the global settings row. */
export const AUTO_ARCHIVE_GUIDELINE_ID = '__auto_archive__';
export const AUTO_ARCHIVE_GUIDELINE_KIND = 'autoArchive';

/** Sanity bounds so a typo in the settings screen cannot set an absurd policy. */
const MIN_DAYS = 1;
const MAX_DAYS = 3650;

/** Cases handled per pass, so one run can never monopolise the server. */
const MAX_CASES_PER_RUN = 100;
/** Cases loaded per database round trip. */
const CASE_CHUNK = 10;
/** Breather between chunks, handing the event loop back to user requests. */
const PAUSE_BETWEEN_CHUNKS_MS = 250;
/** Wall-clock budget for one pass; whatever is left waits for the next one. */
const TIME_BUDGET_MS = 60_000;
/**
 * Below this much free space the archive volume is treated as full. Moving onto
 * a nearly full disk risks a partial copy, and a partial copy that still passes
 * its checksum is not something to gamble a document on.
 */
const MIN_ARCHIVE_FREE_PERCENT = 5;

export interface AutoArchiveResult {
  ran: boolean;
  /** Why the pass did not run (disabled, volume unavailable, already running). */
  reason?: string;
  config: AutoArchiveConfig;
  startedAt: string;
  finishedAt: string;
  durationMs: number;
  casesProcessed: number;
  filesMoved: number;
  filesFailed: number;
  /** Moved correctly, but the original could not be deleted — space not freed. */
  filesNotFreed: number;
  bytesFreed: number;
  /** True when eligible cases remain, so the scheduler comes back sooner. */
  moreRemaining: boolean;
  warning?: string;
  failures: { kycId: string; document: string; reason: string }[];
}

/** Only one pass at a time, even if the timer and an operator overlap. */
let passInFlight = false;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

function envFlag(name: string): boolean | undefined {
  const raw = (process.env[name] || '').trim().toLowerCase();
  if (['1', 'true', 'yes', 'on'].includes(raw)) return true;
  if (['0', 'false', 'no', 'off'].includes(raw)) return false;
  return undefined;
}

/**
 * Turns a stored settings block into a usable policy.
 *
 * This job moves files between volumes on a live server, so an absent, partial
 * or garbled block must never be interpreted generously — anything unreadable
 * falls back to the safe defaults, which are "switched off".
 */
export function normalizeAutoArchiveConfig(raw: any): AutoArchiveConfig {
  const storedDays = Number(raw?.days);
  const envDays = Number(process.env.AUTO_ARCHIVE_DAYS);

  const days =
    Number.isFinite(envDays) && envDays >= MIN_DAYS
      ? Math.min(Math.floor(envDays), MAX_DAYS)
      : Number.isFinite(storedDays) && storedDays >= MIN_DAYS
        ? Math.min(Math.floor(storedDays), MAX_DAYS)
        : AUTO_ARCHIVE_DEFAULTS.days;

  // Environment variables stay as an override for emergencies — setting
  // AUTO_ARCHIVE_ENABLED=false halts the job without needing the database or
  // the settings screen. With nothing set, the settings screen is in charge.
  return {
    enabled: envFlag('AUTO_ARCHIVE_ENABLED') ?? !!raw?.enabled,
    days,
    dryRun: envFlag('AUTO_ARCHIVE_DRY_RUN') ?? !!raw?.dryRun,
  };
}

/**
 * Reads the archiving policy from the global settings row.
 *
 * Read on every pass rather than cached at start-up, so switching the job on or
 * off in Settings takes effect on the next pass instead of at the next server
 * restart.
 */
export async function resolveAutoArchiveConfig(): Promise<AutoArchiveConfig> {
  try {
    const settings = await prisma.globalSetting.findUnique({
      where: { id: 'global' },
      select: { guidelines: true },
    });
    const guidelines = Array.isArray(settings?.guidelines) ? (settings!.guidelines as any[]) : [];
    const entry = guidelines.find(
      (g: any) => g?.kind === AUTO_ARCHIVE_GUIDELINE_KIND || g?.id === AUTO_ARCHIVE_GUIDELINE_ID,
    );
    return normalizeAutoArchiveConfig(entry);
  } catch {
    // No settings row yet (fresh install) — fall back to the policy defaults.
    return normalizeAutoArchiveConfig(undefined);
  }
}

/**
 * Which cases are old enough to move.
 *
 * The clock is `statusChangedAt`, the moment the case reached APPROVED. Cases
 * approved before that column was populated fall back to their submission date:
 * without a fallback they would never become eligible and would sit on primary
 * storage forever, which is the opposite of what this job is for.
 */
function buildEligibleWhere(cutoff: Date) {
  return {
    status: 'APPROVED',
    OR: [
      { statusChangedAt: { lte: cutoff } },
      { statusChangedAt: null, submittedAt: { lte: cutoff } },
    ],
    // Only cases that still hold something on the server are worth loading.
    memos: { some: { storageTier: 'PRIMARY' as const } },
  };
}

/** Free space on the archive volume, or null when it cannot be read. */
async function archiveFreePercent(): Promise<{ percent: number | null; freeBytes: number }> {
  try {
    const stats = await statfs(getArchiveRoot());
    const free = Number(stats.bavail) * Number(stats.bsize);
    const total = Number(stats.blocks) * Number(stats.bsize);
    return { percent: total > 0 ? (free / total) * 100 : null, freeBytes: free };
  } catch {
    return { percent: null, freeBytes: 0 };
  }
}

export interface AutoArchivePreview {
  config: AutoArchiveConfig;
  cutoff: string;
  eligibleCases: number;
  eligibleFiles: number;
  eligibleBytes: number;
  archiveRoot: string;
  archiveAvailable: boolean;
  archiveFreeBytes: number;
  archiveFreePercent: number | null;
}

/** What the job would move right now. Reads only — changes nothing. */
export async function previewAutoArchive(): Promise<AutoArchivePreview> {
  const config = await resolveAutoArchiveConfig();
  const cutoff = new Date(Date.now() - config.days * 24 * 60 * 60 * 1000);
  const where = buildEligibleWhere(cutoff);

  const [eligibleCases, files, space] = await Promise.all([
    prisma.kYC.count({ where }),
    prisma.memo.aggregate({
      where: { storageTier: 'PRIMARY', kyc: where },
      _count: true,
      _sum: { size: true },
    }),
    archiveFreePercent(),
  ]);

  return {
    config,
    cutoff: cutoff.toISOString(),
    eligibleCases,
    eligibleFiles: files._count,
    eligibleBytes: files._sum.size || 0,
    archiveRoot: getArchiveRoot(),
    archiveAvailable: space.percent !== null,
    archiveFreeBytes: space.freeBytes,
    archiveFreePercent: space.percent,
  };
}

/**
 * Runs one archiving pass.
 *
 * Never throws: this is called from a background timer where an unhandled
 * rejection would take down the process guards with it.
 */
export async function runAutoArchive(
  options: { trigger: string; actorId?: string | null; actorEmail?: string; dryRunOverride?: boolean } = {
    trigger: 'MANUAL',
  },
): Promise<AutoArchiveResult> {
  const startedAt = new Date();
  const config = await resolveAutoArchiveConfig();
  if (options.dryRunOverride !== undefined) config.dryRun = options.dryRunOverride;

  const base: AutoArchiveResult = {
    ran: false,
    config,
    startedAt: startedAt.toISOString(),
    finishedAt: startedAt.toISOString(),
    durationMs: 0,
    casesProcessed: 0,
    filesMoved: 0,
    filesFailed: 0,
    filesNotFreed: 0,
    bytesFreed: 0,
    moreRemaining: false,
    failures: [],
  };

  const finish = (result: AutoArchiveResult): AutoArchiveResult => {
    const finishedAt = new Date();
    return {
      ...result,
      finishedAt: finishedAt.toISOString(),
      durationMs: finishedAt.getTime() - startedAt.getTime(),
    };
  };

  if (!config.enabled) {
    return finish({
      ...base,
      reason: 'Automatic archiving is switched off in Settings → Automatic Archive Tiering.',
    });
  }
  if (passInFlight) {
    return finish({ ...base, reason: 'A pass is already running.' });
  }

  passInFlight = true;
  try {
    // Pre-flight: the volume must be reachable AND have room. Both failures are
    // reported rather than worked around — a half-moved batch onto a full disk
    // is worse than not starting.
    try {
      await ensureArchiveRoot();
    } catch {
      return finish({
        ...base,
        reason: `The archive volume is not reachable at ${getArchiveRoot()}. Nothing was moved.`,
      });
    }

    const space = await archiveFreePercent();
    if (space.percent !== null && space.percent < MIN_ARCHIVE_FREE_PERCENT) {
      return finish({
        ...base,
        reason:
          `The archive volume is ${space.percent.toFixed(1)}% free, below the ${MIN_ARCHIVE_FREE_PERCENT}% minimum. ` +
          'Confirm the IT backup in Master Archive to clear it, then this will resume by itself.',
      });
    }

    const cutoff = new Date(Date.now() - config.days * 24 * 60 * 60 * 1000);
    const where = buildEligibleWhere(cutoff);

    const cases = await prisma.kYC.findMany({
      where,
      orderBy: { statusChangedAt: 'asc' },
      take: MAX_CASES_PER_RUN,
      select: { id: true, customerName: true, branchName: true, statusChangedAt: true },
    });

    const result: AutoArchiveResult = { ...base, ran: true };
    const deadline = Date.now() + TIME_BUDGET_MS;
    const auditRecords: any[] = [];

    for (let i = 0; i < cases.length; i += CASE_CHUNK) {
      if (Date.now() > deadline) break;
      const chunk = cases.slice(i, i + CASE_CHUNK);

      for (const kyc of chunk) {
        const memos = await prisma.memo.findMany({
          where: { kycId: kyc.id, storageTier: 'PRIMARY' },
        });
        if (memos.length === 0) continue;

        let movedForCase = 0;
        let bytesForCase = 0;

        for (const memo of memos as any[]) {
          const label = memo.originalName || memo.name || memo.id;

          if (config.dryRun) {
            result.filesMoved++;
            result.bytesFreed += memo.size || 0;
            movedForCase++;
            continue;
          }

          // A document whose bytes are already gone cannot be archived; leave
          // the row alone so the vault still shows it as a missing file.
          if (!(await secureUploadedFileExists(memo.storageKey, false, 'PRIMARY'))) {
            result.filesFailed++;
            result.failures.push({ kycId: kyc.id, document: label, reason: 'File missing from primary storage.' });
            continue;
          }

          try {
            // 1. copy to the archive and verify it against the recorded hash
            await copyToArchive(memo.storageKey, memo.fileHash);
            // 2. record the new volume BEFORE freeing the original, so a crash
            //    between the two leaves a duplicate rather than a lost file
            await prisma.memo.update({
              where: { id: memo.id },
              data: {
                storageTier: 'ARCHIVE',
                archivedAt: new Date(),
                archivedById: options.actorId ?? null,
              } as any,
            });
            result.filesMoved++;
            movedForCase++;

            // 3. free the primary copy, and confirm it is really gone
            try {
              await purgeStoredFileOrThrow(memo.storageKey, 'PRIMARY');
              result.bytesFreed += memo.size || 0;
              bytesForCase += memo.size || 0;
            } catch {
              result.filesNotFreed++;
              result.failures.push({
                kycId: kyc.id,
                document: label,
                reason:
                  'Archived, but the original could not be deleted from primary storage — no space freed for this file. ' +
                  'Run "npm run storage:reconcile" to clear it.',
              });
            }
          } catch (error: any) {
            result.filesFailed++;
            result.failures.push({
              kycId: kyc.id,
              document: label,
              reason: /integrity|hash/i.test(error?.message || '')
                ? 'Checksum mismatch after copying — the original was left untouched.'
                : 'Could not copy this file to the archive volume.',
            });
          }
        }

        if (movedForCase > 0) {
          result.casesProcessed++;
          // Documents left primary storage, so the case's storage state moved
          // with them. Recomputed from the documents, so a case whose files
          // only partly moved stays Active rather than being wrongly filed.
          if (!config.dryRun) await syncCaseStorageState([kyc.id]);
          if (!config.dryRun) {
            auditRecords.push({
              userId: options.actorId ?? null,
              userEmail: options.actorEmail || 'system@auto-archive',
              userName: 'Automatic Archiving',
              ipAddress: 'system',
              timestamp: new Date(),
              kycId: kyc.id,
              action: 'STORAGE_TIER_CUT',
              details:
                `[AUTO] Automatic archiving (${options.trigger}): moved ${movedForCase} document(s) ` +
                `(${bytesForCase} bytes) of case ${kyc.id} — ${kyc.customerName} [${kyc.branchName}] ` +
                `to the archive volume, ${config.days} day(s) after approval. ` +
                'Awaiting the IT backup confirmation before the volume is cleared.',
            });
          }
        }
      }

      if (auditRecords.length > 0) {
        await prisma.auditLog.createMany({ data: auditRecords.splice(0, auditRecords.length) }).catch(() => {});
      }
      await sleep(PAUSE_BETWEEN_CHUNKS_MS);
    }

    result.moreRemaining = (await prisma.kYC.count({ where })) > 0;

    if (result.filesNotFreed > 0) {
      result.warning =
        `${result.filesNotFreed} archived file(s) could not be deleted from primary storage and still occupy space.`;
    }

    return finish(result);
  } catch (error: any) {
    return finish({ ...base, reason: `Archiving pass failed: ${error?.message || 'unknown error'}` });
  } finally {
    passInFlight = false;
  }
}

export function formatArchiveBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  const units = ['KB', 'MB', 'GB', 'TB'];
  let value = bytes / 1024;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit++;
  }
  return `${value.toFixed(1)} ${units[unit]}`;
}
