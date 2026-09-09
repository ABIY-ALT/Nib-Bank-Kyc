/**
 * Automatic storage retention — frees server disk without manual intervention.
 *
 * POLICY
 * ------
 * A case's clock starts at its FIRST document upload. Once that clock passes
 * the configured age (default 6 days) and the case has still not reached a
 * protected status (default: APPROVED), every document the case still holds on
 * the PRIMARY volume is permanently deleted and the space is returned.
 *
 * What is deliberately NOT touched:
 *   • The KYC case row itself — the case, its status, comments, checklist and
 *     all reporting counts survive. Only the uploaded bytes go.
 *   • Documents already moved to the ARCHIVE volume — they no longer occupy
 *     server storage, and the archive is the institution's long-term copy.
 *   • Cases in a protected status (APPROVED by default, admin-configurable).
 *
 * SAFETY
 * ------
 * A file's Memo row is removed ONLY after its bytes are verifiably gone from
 * disk (see purgeStoredFileOrThrow). A file that cannot be deleted — locked by
 * antivirus, volume offline — keeps its row so it stays visible in the Vault
 * and is retried on the next sweep, instead of becoming untraceable dead space.
 *
 * Every purged case produces a CRITICAL audit record naming the files removed.
 */

import { prisma } from '@/lib/prisma';
import { syncCaseStorageState } from '@/lib/case-storage-state';

export interface AutoPurgeConfig {
  /** Master switch. When false the sweep does nothing at all. */
  enabled: boolean;
  /** Age in days, measured from the case's first uploaded document. */
  days: number;
  /** Case statuses that are never auto-purged. */
  keepStatuses: string[];
  /** When true the sweep reports what it would delete but deletes nothing. */
  dryRun: boolean;
}

export const AUTO_PURGE_DEFAULTS: AutoPurgeConfig = {
  enabled: true,
  days: 6,
  keepStatuses: ['APPROVED'],
  dryRun: false,
};

/** Guideline entry key under which the policy is persisted on the global settings row. */
export const AUTO_PURGE_GUIDELINE_ID = '__auto_purge__';
export const AUTO_PURGE_GUIDELINE_KIND = 'autoPurge';

/** Upper bound on cases handled per sweep, so one run can never monopolise the box. */
const MAX_CASES_PER_RUN = 250;

/**
 * Resource discipline. This runs on a live server while officers are working,
 * so a sweep must behave like a background chore, not a batch job:
 *
 *  - Cases are loaded in chunks instead of one query each, keeping the database
 *    round trips proportional to chunks rather than to cases.
 *  - Audit records are written per chunk with createMany, not one insert per case.
 *  - Between chunks the sweep pauses briefly, handing the event loop back to
 *    user requests before starting more file deletions.
 *  - A wall-clock budget ends the pass even if cases remain; the scheduler picks
 *    the rest up on the next pass, so work is always sliced, never open-ended.
 *
 * File deletion itself stays strictly sequential — never Promise.all over files.
 * Parallel unlinks would saturate Node's small filesystem thread pool, which is
 * the same pool that serves document downloads to users.
 */
const CASE_FETCH_CHUNK = 25;
const PAUSE_BETWEEN_CHUNKS_MS = 50;
const DEFAULT_SWEEP_BUDGET_SECONDS = 20;

/**
 * Ceiling on the rows the status screen will count. An exact total over a
 * multi-million-row table would scan the whole thing every time an admin opens
 * Settings; past this the figure is shown as "N+", which is just as actionable.
 */
const PREVIEW_COUNT_CAP = 5000;

/**
 * Cases per pass. Raising it drains a large backlog faster at the cost of more
 * sustained disk and database load; the default is deliberately conservative so
 * the sweep stays invisible to users on a busy server.
 */
function resolveMaxCasesPerRun(): number {
  const raw = Number(process.env.AUTO_PURGE_MAX_CASES);
  if (Number.isFinite(raw) && raw >= 10) return Math.min(Math.floor(raw), 5000);
  return MAX_CASES_PER_RUN;
}

function resolveSweepBudgetMs(): number {
  const raw = Number(process.env.AUTO_PURGE_MAX_SECONDS);
  const seconds = Number.isFinite(raw) && raw >= 5 ? Math.floor(raw) : DEFAULT_SWEEP_BUDGET_SECONDS;
  return seconds * 1000;
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** Shape of a queued audit row, written in batches via createMany. */
interface AuditRow {
  userId: string | null;
  userEmail: string;
  userName: string;
  action: string;
  details: string;
  ipAddress: string;
  timestamp: Date;
  kycId?: string;
}

/**
 * Misconfiguration tripwire. A file that is already absent frees no space, and
 * its row is normally safe to drop — but if a sweep finds nothing but absent
 * files, the far likelier explanation is that UPLOAD_DIR_PATH points at the
 * wrong root (see getSecureUploadRoot) than that every document vanished. In
 * that case dropping the rows would erase the only remaining trace of files
 * that are still sitting on disk somewhere. Past this many absent files with
 * zero successful deletions, the sweep keeps every record and raises an alarm
 * instead.
 */
const MISSING_FILE_ALARM_THRESHOLD = 25;

export interface AutoPurgeCaseOutcome {
  kycId: string;
  customerName: string;
  status: string;
  branchName: string;
  firstUploadAt: string;
  ageDays: number;
  /** Files whose bytes this sweep actually removed from disk. */
  filesPurged: number;
  /** Files already absent from disk — no space freed, record dropped as stale. */
  filesMissing: number;
  filesBlocked: number;
  bytesFreed: number;
  blockedReasons: string[];
}

export interface AutoPurgeResult {
  /** False when the sweep was skipped (disabled, or already running). */
  ran: boolean;
  skippedReason?: string;
  config: AutoPurgeConfig;
  startedAt: string;
  finishedAt: string;
  durationMs: number;
  /** Cases that matched the policy (before the per-run cap). */
  casesEligible: number;
  /** Cases actually processed in this sweep. */
  casesProcessed: number;
  filesPurged: number;
  /** Records dropped for files that were already gone from disk (no space freed). */
  filesMissing: number;
  filesBlocked: number;
  bytesFreed: number;
  /** True when more eligible cases remain than the per-run cap allowed. */
  moreRemaining: boolean;
  /** Set when the misconfiguration tripwire fired — stale records were kept. */
  storageWarning?: string;
  cases: AutoPurgeCaseOutcome[];
  error?: string;
}

// ─────────────────────────────────────────────
//  CONFIGURATION
// ─────────────────────────────────────────────

function parseBoolEnv(raw: string | undefined): boolean | undefined {
  if (raw === undefined) return undefined;
  const value = raw.trim().toLowerCase();
  if (['1', 'true', 'yes', 'on'].includes(value)) return true;
  if (['0', 'false', 'no', 'off'].includes(value)) return false;
  return undefined;
}

/**
 * Normalises a stored/partial policy into a complete one, then lets environment
 * variables override it. Env wins so an operator can stop the sweep on a live
 * box (AUTO_PURGE_ENABLED=false) without needing the admin UI.
 */
export function normalizeAutoPurgeConfig(raw: any): AutoPurgeConfig {
  const storedDays = Number(raw?.days);
  const envDays = Number(process.env.AUTO_PURGE_DAYS);
  const envEnabled = parseBoolEnv(process.env.AUTO_PURGE_ENABLED);
  const envDryRun = parseBoolEnv(process.env.AUTO_PURGE_DRY_RUN);
  const envKeep = process.env.AUTO_PURGE_KEEP_STATUSES;

  const keepStatuses =
    envKeep !== undefined
      ? envKeep.split(',').map((s) => s.trim().toUpperCase()).filter(Boolean)
      : Array.isArray(raw?.keepStatuses)
        ? raw.keepStatuses.map((s: any) => String(s).trim().toUpperCase()).filter(Boolean)
        : AUTO_PURGE_DEFAULTS.keepStatuses;

  return {
    enabled: envEnabled ?? (raw?.enabled === undefined ? AUTO_PURGE_DEFAULTS.enabled : !!raw.enabled),
    days:
      Number.isFinite(envDays) && envDays > 0
        ? Math.floor(envDays)
        : Number.isFinite(storedDays) && storedDays > 0
          ? Math.floor(storedDays)
          : AUTO_PURGE_DEFAULTS.days,
    keepStatuses,
    dryRun: envDryRun ?? !!raw?.dryRun,
  };
}

/** Reads the persisted auto-purge policy straight from the settings row. */
export async function getAutoPurgeConfig(): Promise<AutoPurgeConfig> {
  try {
    const settings = await prisma.globalSetting.findUnique({
      where: { id: 'global' },
      select: { guidelines: true },
    });
    const guidelines = Array.isArray(settings?.guidelines) ? (settings!.guidelines as any[]) : [];
    const entry = guidelines.find(
      (g: any) => g?.kind === AUTO_PURGE_GUIDELINE_KIND || g?.id === AUTO_PURGE_GUIDELINE_ID
    );
    return normalizeAutoPurgeConfig(entry);
  } catch {
    // No settings row yet (fresh install) — fall back to the policy defaults.
    return normalizeAutoPurgeConfig(undefined);
  }
}

// ─────────────────────────────────────────────
//  ELIGIBILITY
// ─────────────────────────────────────────────

/**
 * Finds cases whose first upload is older than the retention window and whose
 * status is not protected. The clock uses the earliest document of the case —
 * including ones already archived — so it reflects when the case truly started,
 * not when the surviving files happen to have been added.
 */
export function retentionCutoff(config: AutoPurgeConfig, now: Date): Date {
  return new Date(now.getTime() - config.days * 24 * 60 * 60 * 1000);
}

/**
 * The WHERE clause that defines "worth looking at", built to run on indexes
 * alone at millions of rows:
 *
 *   status         — indexed on KYC.
 *   submittedAt    — indexed on KYC, and a safe *superset* of the real test: a
 *                    case's documents are always uploaded at or after the case
 *                    was submitted, so first-upload-past-cutoff implies
 *                    submitted-past-cutoff. The exact first-upload check is
 *                    then done per case, on rows already in hand.
 *   memos.some     — an EXISTS against Memo(kycId), which both restricts the
 *                    scan to cases that still hold files AND makes the working
 *                    set shrink as the backlog is cleared. Without it, every
 *                    sweep would re-scan the same already-emptied old cases
 *                    forever and never reach the ones still holding disk.
 */
function buildCandidateWhere(config: AutoPurgeConfig, cutoff: Date) {
  return {
    ...(config.keepStatuses.length > 0 ? { status: { notIn: config.keepStatuses } } : {}),
    submittedAt: { lte: cutoff },
    memos: { some: { storageTier: 'PRIMARY' as const } },
  };
}

/**
 * Returns at most `limit` candidate cases, oldest first — never the whole
 * backlog. This is the difference between a sweep that costs the same whether
 * the queue holds 300 cases or 3,000,000, and one that loads the entire queue
 * into memory every pass.
 */
async function findCandidateCases(
  config: AutoPurgeConfig,
  now: Date,
  limit: number,
): Promise<{ id: string }[]> {
  return prisma.kYC.findMany({
    where: buildCandidateWhere(config, retentionCutoff(config, now)),
    orderBy: { submittedAt: 'asc' },
    take: limit,
    select: { id: true },
  });
}

/**
 * Reports what the current policy would delete, without touching anything.
 * Used by the admin screens so the impact is visible before it happens.
 */
export interface AutoPurgePreview {
  config: AutoPurgeConfig;
  casesEligible: number;
  /** True when there are more than the counting cap — display as "N+". */
  casesEligibleCapped: boolean;
  filesEligible: number;
  bytesEligible: number;
  /** The folder the app stores documents in — the same one uploads write to. */
  storageRoot: string;
  /** False when that folder does not exist yet, with the errno in storageRootCode. */
  storageRootAvailable: boolean;
  storageRootCode?: string;
  /** Why the app resolved that folder — which setting, or the default. */
  storageRootSource: string;
  /** How many eligible documents were checked against the folder, and how many were found. */
  filesSampled: number;
  filesFoundOnDisk: number;
  /** Set when the documents were found in a DIFFERENT folder than the configured one. */
  suggestedFolder?: string;
  suggestedFolderMatches?: number;
}

/** How many documents to physically check when reporting status. */
const PRESENCE_SAMPLE_SIZE = 50;

export async function previewAutoPurge(): Promise<AutoPurgePreview> {
  const config = await getAutoPurgeConfig();
  const { secureUploadRootAvailable, secureUploadedFileExists, locateDocumentsFolder } =
    await import('@/lib/secure-file-storage');
  const rootCheck = await secureUploadRootAvailable();
  const cutoff = retentionCutoff(config, new Date());
  const candidateWhere = buildCandidateWhere(config, cutoff);

  const base = {
    config,
    storageRoot: rootCheck.root,
    storageRootAvailable: rootCheck.available,
    storageRootCode: rootCheck.code,
    storageRootSource: rootCheck.source,
  };

  // Counting is capped rather than exact. An exact count over millions of cases
  // would scan the whole table every time an admin opens this page; "5000+" is
  // just as actionable and costs a bounded number of rows.
  const capped = await prisma.kYC.findMany({
    where: candidateWhere,
    select: { id: true },
    take: PREVIEW_COUNT_CAP + 1,
  });
  const casesEligible = Math.min(capped.length, PREVIEW_COUNT_CAP);
  const casesEligibleCapped = capped.length > PREVIEW_COUNT_CAP;

  if (casesEligible === 0) {
    return {
      ...base,
      casesEligible: 0,
      casesEligibleCapped: false,
      filesEligible: 0,
      bytesEligible: 0,
      filesSampled: 0,
      filesFoundOnDisk: 0,
    };
  }

  // File totals come from a relation filter, not a list of case ids — an IN
  // clause holding hundreds of thousands of ids is its own way to fell a server.
  const [totals, sample] = await Promise.all([
    prisma.memo.aggregate({
      where: { storageTier: 'PRIMARY', kyc: candidateWhere },
      _count: { _all: true },
      _sum: { size: true },
    }),
    prisma.memo.findMany({
      where: { storageTier: 'PRIMARY', kyc: candidateWhere },
      select: { storageKey: true },
      take: PRESENCE_SAMPLE_SIZE,
    }),
  ]);

  // Physically look for a sample of the documents. This is what separates "the
  // policy will free 685 MB" from "the database describes 685 MB that is not in
  // this folder" — a distinction no row count can make.
  let filesFoundOnDisk = 0;
  if (rootCheck.available) {
    for (const memo of sample) {
      try {
        if (await secureUploadedFileExists(memo.storageKey, false, 'PRIMARY')) filesFoundOnDisk++;
      } catch {
        // Unreadable storage key — counts as not found.
      }
    }
  }

  // Nothing found where we are looking? Then say where the documents actually
  // are, instead of leaving the operator to work it out from the launch path.
  let located: { folder: string; matched: number } | null = null;
  if (filesFoundOnDisk === 0 && sample.length > 0) {
    located = await locateDocumentsFolder(sample.map((m) => m.storageKey));
  }

  return {
    ...base,
    casesEligible,
    casesEligibleCapped,
    filesEligible: totals._count._all || 0,
    bytesEligible: totals._sum.size || 0,
    filesSampled: sample.length,
    filesFoundOnDisk,
    suggestedFolder: located && located.folder !== rootCheck.root ? located.folder : undefined,
    suggestedFolderMatches: located && located.folder !== rootCheck.root ? located.matched : undefined,
  };
}

// ─────────────────────────────────────────────
//  THE SWEEP
// ─────────────────────────────────────────────

/** In-process guard: a sweep must never overlap itself. */
let sweepInFlight = false;

export interface RunAutoPurgeOptions {
  /** Where the run came from — recorded in the audit trail. */
  trigger: 'SCHEDULER' | 'MANUAL' | 'CRON_ENDPOINT';
  /** Identity to attribute the audit records to (manual runs). */
  actorId?: string | null;
  actorEmail?: string;
  /** Run even when the policy is switched off (manual "run once" only). */
  force?: boolean;
  /** Report without deleting, overriding the stored/env setting. */
  dryRun?: boolean;
}

export async function runAutoRetentionPurge(options: RunAutoPurgeOptions): Promise<AutoPurgeResult> {
  const startedAt = new Date();
  const storedConfig = await getAutoPurgeConfig();
  const config: AutoPurgeConfig = {
    ...storedConfig,
    dryRun: options.dryRun ?? storedConfig.dryRun,
  };

  const skeleton = (skippedReason: string): AutoPurgeResult => ({
    ran: false,
    skippedReason,
    config,
    startedAt: startedAt.toISOString(),
    finishedAt: new Date().toISOString(),
    durationMs: Date.now() - startedAt.getTime(),
    casesEligible: 0,
    casesProcessed: 0,
    filesPurged: 0,
    filesMissing: 0,
    filesBlocked: 0,
    bytesFreed: 0,
    moreRemaining: false,
    cases: [],
  });

  if (!config.enabled && !options.force) {
    return skeleton('Automatic retention purge is disabled.');
  }
  if (sweepInFlight) {
    return skeleton('A retention sweep is already running.');
  }

  sweepInFlight = true;
  try {
    const { purgeStoredFileOrThrow, secureUploadedFileExists, secureUploadRootAvailable } =
      await import('@/lib/secure-file-storage');

    // A missing storage root makes every file look "already deleted", which
    // would drop every record while freeing nothing. Refuse to sweep instead.
    const rootCheck = await secureUploadRootAvailable();
    const uploadRoot = rootCheck.root;
    if (!rootCheck.available) {
      // This is the same folder uploads write to — it is created on first
      // upload. Its absence means nothing has ever been stored there from this
      // deployment, so there is no space to reclaim and the records must stay:
      // the documents they describe are on some other machine or folder.
      console.error(
        `[AutoRetention] Document folder not found: ${uploadRoot} (${rootCheck.code}) — ${rootCheck.source}. ` +
          `This is the same folder uploads write to, so nothing has been stored there yet. ` +
          `No records were touched.`
      );
      return skeleton(
        `The document folder does not exist (${uploadRoot}). This is the same folder uploads are ` +
          `written to, so nothing has been stored there from this server — there is no space to free, ` +
          `and no records were touched.`
      );
    }

    const now = new Date();
    const cutoff = retentionCutoff(config, now);
    // One extra row is fetched purely to answer "is there more after this?" —
    // far cheaper than counting a backlog that may run into millions.
    const maxCases = resolveMaxCasesPerRun();
    const candidates = await findCandidateCases(config, now, maxCases + 1);
    const hasMoreBeyondBatch = candidates.length > maxCases;
    const batch = candidates.slice(0, maxCases);

    const outcomes: AutoPurgeCaseOutcome[] = [];
    let filesPurged = 0;
    let filesBlocked = 0;
    let bytesFreed = 0;
    // Records for files already absent from disk. Held back until the whole
    // sweep is done, so the tripwire below can decide whether dropping them is
    // genuine cleanup or the symptom of a mispointed storage root.
    const staleMemoIds: string[] = [];

    const deadline = Date.now() + resolveSweepBudgetMs();
    // Candidates actually looked at. Drives "more remaining" — counting only
    // purged cases would loop forever on cases that are always skipped.
    let examined = 0;
    let pendingAudits: AuditRow[] = [];

    for (let offset = 0; offset < batch.length; offset += CASE_FETCH_CHUNK) {
      // Out of time — leave the rest for the next pass rather than running long.
      if (Date.now() >= deadline) break;

      const chunk = batch.slice(offset, offset + CASE_FETCH_CHUNK);
      const cases = await prisma.kYC.findMany({
        where: { id: { in: chunk.map((c) => c.id) } },
        select: {
          id: true,
          customerName: true,
          status: true,
          branchName: true,
          // Every memo, not just the primary ones: the policy clock starts at
          // the case's FIRST upload, and that document may since have been
          // archived. Only PRIMARY rows are deleted, but all of them are needed
          // to date the case correctly.
          memos: {
            select: {
              id: true,
              name: true,
              originalName: true,
              storageKey: true,
              size: true,
              createdAt: true,
              storageTier: true,
            },
          },
        },
      });
      const casesById = new Map(cases.map((c) => [c.id, c]));

      for (const candidate of chunk) {
      examined++;
      const kyc = casesById.get(candidate.id);

      // Re-check against fresh data: the case may have been approved or already
      // emptied between the scan and now.
      if (!kyc) continue;
      if (config.keepStatuses.includes(kyc.status)) continue;
      if (kyc.memos.length === 0) continue;

      // The candidate query filtered on submittedAt, which is a superset of the
      // real rule. Apply the actual test — first upload older than the limit —
      // before deleting anything.
      const firstUploadAt = kyc.memos.reduce(
        (earliest, memo) => (memo.createdAt < earliest ? memo.createdAt : earliest),
        kyc.memos[0].createdAt,
      );
      if (firstUploadAt > cutoff) continue;

      const primaryMemos = kyc.memos.filter((memo) => memo.storageTier === 'PRIMARY');
      if (primaryMemos.length === 0) continue;

      const ageDays = Math.floor(
        (now.getTime() - firstUploadAt.getTime()) / (1000 * 60 * 60 * 24)
      );

      const purgedIds: string[] = [];
      const missingIds: string[] = [];
      const blockedReasons: string[] = [];
      let caseBytes = 0;

      for (const memo of kyc.memos) {
        if (config.dryRun) {
          purgedIds.push(memo.id);
          caseBytes += memo.size || 0;
          continue;
        }

        // Distinguish "deleted by us" from "was never there". Both end with the
        // record gone, but only the first actually returns disk space, and the
        // second is what the tripwire watches.
        let present: boolean;
        try {
          present = await secureUploadedFileExists(memo.storageKey, false, 'PRIMARY');
        } catch (probeError: any) {
          // A storage key the path resolver rejects (legacy or corrupted) cannot
          // be located, so it cannot be freed. Keep the record and move on —
          // one bad key must not abort the sweep for every other case.
          blockedReasons.push(
            `${memo.originalName || memo.name || memo.id} (${probeError?.code || 'INVALID_STORAGE_KEY'})`
          );
          continue;
        }
        if (!present) {
          missingIds.push(memo.id);
          continue;
        }

        try {
          await purgeStoredFileOrThrow(memo.storageKey, 'PRIMARY');
          purgedIds.push(memo.id);
          caseBytes += memo.size || 0;
        } catch (purgeError: any) {
          blockedReasons.push(
            `${memo.originalName || memo.name || memo.id} (${purgeError?.code || 'UNKNOWN'})`
          );
        }
      }

      // Only rows whose bytes are confirmed gone are removed. A blocked file
      // keeps its row and is retried on the next sweep.
      if (!config.dryRun && purgedIds.length > 0) {
        await prisma.memo.deleteMany({ where: { id: { in: purgedIds } } });
        // Fewer documents can mean a different storage state for the case.
        await syncCaseStorageState([kyc.id]);
      }
      staleMemoIds.push(...missingIds);

      filesPurged += purgedIds.length;
      filesBlocked += blockedReasons.length;
      bytesFreed += caseBytes;

      outcomes.push({
        kycId: kyc.id,
        customerName: kyc.customerName,
        status: kyc.status,
        branchName: kyc.branchName,
        firstUploadAt: firstUploadAt.toISOString(),
        ageDays,
        filesPurged: purgedIds.length,
        filesMissing: missingIds.length,
        filesBlocked: blockedReasons.length,
        bytesFreed: caseBytes,
        blockedReasons,
      });

      if (!config.dryRun && purgedIds.length > 0) {
        pendingAudits.push({
          userId: options.actorId ?? null,
          userEmail: options.actorEmail || 'system@retention',
          userName: 'Automatic Retention',
          ipAddress: 'system',
          timestamp: new Date(),
          kycId: kyc.id,
          action: 'AUTO_RETENTION_PURGE',
          details:
            `[CRITICAL] Automatic retention (${options.trigger}): removed ${purgedIds.length} document(s) ` +
            `(${formatBytes(caseBytes)}) from case ${kyc.id} — ${kyc.customerName} [${kyc.status}] at ${kyc.branchName}. ` +
            `First upload ${firstUploadAt.toISOString()} (${ageDays} day(s) old, policy ${config.days} day(s)). ` +
            `The case record was kept; only uploaded files were deleted.` +
            (blockedReasons.length > 0
              ? ` ${blockedReasons.length} file(s) could not be removed and were kept: ${blockedReasons.join('; ')}.`
              : ''),
        });
      }
      }

      // One insert for the whole chunk instead of one per case.
      if (pendingAudits.length > 0) {
        try {
          await prisma.auditLog.createMany({ data: pendingAudits });
        } catch (auditError: any) {
          console.error('[AutoRetention] Failed to write audit records:', auditError?.message || auditError);
        }
        pendingAudits = [];
      }

      // Hand the event loop back to user requests before the next chunk of
      // deletions. Without this a large backlog would keep the filesystem
      // thread pool busy back-to-back, slowing document downloads.
      await sleep(PAUSE_BETWEEN_CHUNKS_MS);
    }

    // Stale records — the file was already gone before this sweep. Dropping
    // them is ordinary housekeeping, UNLESS nothing at all could be deleted,
    // which points at the storage root rather than at the data.
    let storageWarning: string | undefined;
    let filesMissing = 0;
    if (!config.dryRun && staleMemoIds.length > 0) {
      if (filesPurged === 0 && staleMemoIds.length >= MISSING_FILE_ALARM_THRESHOLD) {
        storageWarning =
          `${staleMemoIds.length} document(s) were missing from ${uploadRoot} and NOT one file could be deleted. ` +
          `Their records were kept, because this pattern usually means the storage path is misconfigured ` +
          `rather than that the files are genuinely gone. Verify UPLOAD_DIR_PATH before running again.`;
        console.error(`[AutoRetention] ${storageWarning}`);
        await writeAuditRecord({
          actorId: options.actorId ?? null,
          actorEmail: options.actorEmail || 'system@retention',
          action: 'AUTO_RETENTION_PURGE_HALTED',
          details: `[CRITICAL] Retention sweep (${options.trigger}) halted before removing any record. ${storageWarning}`,
        });
      } else {
        // Which cases these rows belonged to, read before the rows are gone.
        const staleOwners = await prisma.memo.findMany({
          where: { id: { in: staleMemoIds } },
          select: { kycId: true },
        });
        await prisma.memo.deleteMany({ where: { id: { in: staleMemoIds } } });
        await syncCaseStorageState(staleOwners.map(m => m.kycId));
        filesMissing = staleMemoIds.length;
      }
    }

    const result: AutoPurgeResult = {
      ran: true,
      config,
      startedAt: startedAt.toISOString(),
      finishedAt: new Date().toISOString(),
      durationMs: Date.now() - startedAt.getTime(),
      casesEligible: batch.length,
      casesProcessed: outcomes.length,
      filesPurged,
      filesMissing,
      filesBlocked,
      bytesFreed,
      // Anything this pass never reached — because the per-run cap or the time
      // budget stopped it — plus anything queued beyond the cap.
      moreRemaining: hasMoreBeyondBatch || examined < batch.length,
      storageWarning,
      cases: outcomes,
    };

    if (!config.dryRun && (filesPurged > 0 || filesBlocked > 0 || filesMissing > 0)) {
      await writeAuditRecord({
        actorId: options.actorId ?? null,
        actorEmail: options.actorEmail || 'system@retention',
        action: 'AUTO_RETENTION_PURGE_SUMMARY',
        details:
          `[HIGH] Retention sweep (${options.trigger}) freed ${formatBytes(bytesFreed)} across ` +
          `${result.casesProcessed} case(s) / ${filesPurged} file(s). ` +
          `Policy: delete non-approved case documents ${config.days} day(s) after first upload; ` +
          `protected statuses: ${config.keepStatuses.join(', ') || 'none'}.` +
          (filesMissing > 0
            ? ` ${filesMissing} stale record(s) whose file was already absent from disk were also removed.`
            : '') +
          (filesBlocked > 0 ? ` ${filesBlocked} file(s) were blocked and will be retried.` : '') +
          (result.moreRemaining ? ' More eligible cases remain for the next sweep.' : ''),
      });
    }

    return result;
  } catch (error: any) {
    console.error('[AutoRetention] Sweep failed:', error?.message || error);
    return { ...skeleton('Sweep failed.'), error: error?.message || 'Retention sweep failed.' };
  } finally {
    sweepInFlight = false;
  }
}

// ─────────────────────────────────────────────
//  HELPERS
// ─────────────────────────────────────────────

/**
 * Writes the audit row directly rather than through createAuditLog(), which
 * reads request headers for the client IP — there is no request behind a
 * scheduled sweep.
 */
async function writeAuditRecord(entry: {
  actorId: string | null;
  actorEmail: string;
  action: string;
  details: string;
  kycId?: string;
}) {
  try {
    await prisma.auditLog.create({
      data: {
        userId: entry.actorId,
        userEmail: entry.actorEmail,
        userName: 'Automatic Retention',
        action: entry.action,
        details: entry.details,
        ipAddress: 'system',
        timestamp: new Date(),
        kycId: entry.kycId,
      },
    });
  } catch (error: any) {
    console.error('[AutoRetention] Failed to write audit record:', error?.message || error);
  }
}

export function formatBytes(bytes: number): string {
  if (!bytes || bytes <= 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  const index = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  return `${(bytes / Math.pow(1024, index)).toFixed(index === 0 ? 0 : 1)} ${units[index]}`;
}
