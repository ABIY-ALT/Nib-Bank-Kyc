#!/usr/bin/env tsx
/**
 * Reconciles the secure upload folder against the `Memo` table.
 *
 * Every document's bytes are written to disk before its database row is
 * created, so any upload that fails in between leaves a file that nothing
 * references: it belongs to no case, appears on no screen, is returned by no
 * query, and is never deleted, because nothing in the application compares the
 * folder with the table. Over a long-running deployment these accumulate until
 * the folder holds far more files than there are documents.
 *
 * This script finds them: it walks the configured upload root and reports every
 * file whose name is not a storage key in the database. It only ever removes
 * files with `--delete`; without it nothing is touched.
 *
 * Report what is unreferenced (safe, read-only):
 *   npx tsx scripts/reconcile-secure-uploads.ts
 *
 * Then free the ones older than the safety window:
 *   npx tsx scripts/reconcile-secure-uploads.ts --delete
 *
 * Options:
 *   --delete            Remove the unreferenced files (default: report only).
 *   --min-age-days=N    Ignore files newer than N days (default: 7). Protects
 *                       uploads that are in flight right now — their row may
 *                       not be committed yet at the moment the folder is read.
 *   --json              Emit the summary as JSON for scheduled runs.
 */
import dotenv from 'dotenv';
import path from 'path';
import fs from 'fs/promises';
import { PrismaClient } from '@prisma/client';

dotenv.config({ path: path.resolve(process.cwd(), '.env') });

import {
  describeSecureUploadRootSource,
  getSecureUploadRoot,
  secureUploadRootAvailable,
  secureUploadedFileExists,
} from '../src/lib/secure-file-storage';

const prisma = new PrismaClient();

/** Names the application is willing to store bytes under. */
const STORAGE_KEY_PATTERN = /^[a-zA-Z0-9-]{32,64}$/;

/** How many names to resolve against the database per query. */
const LOOKUP_CHUNK = 500;

/**
 * Deleting is only safe once the folder is confirmed to be the one the database
 * describes. A mistyped UPLOAD_DIR_PATH, a service started from a different
 * working directory, or an empty database all produce the same picture — every
 * file looks unreferenced — and acting on that would erase live documents. If
 * the database holds documents, some of the files on disk must match them.
 */
const MIN_REFERENCED_RATIO = 0.01;

type Args = {
  del: boolean;
  minAgeDays: number;
  json: boolean;
};

function parseArgs(argv: string[]): Args {
  const args: Args = { del: false, minAgeDays: 7, json: false };

  for (const arg of argv) {
    if (arg === '--delete') args.del = true;
    else if (arg === '--json') args.json = true;
    else if (arg.startsWith('--min-age-days=')) {
      const value = Number(arg.split('=')[1]);
      if (!Number.isFinite(value) || value < 0) {
        throw new Error(`Invalid --min-age-days value: ${arg.split('=')[1]}`);
      }
      args.minAgeDays = value;
    } else if (arg.startsWith('--')) {
      throw new Error(`Unknown option: ${arg}`);
    }
  }

  return args;
}

function formatBytes(bytes: number): string {
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

/** Returns the subset of `names` that the Memo table points at. */
async function findReferenced(names: string[]): Promise<Set<string>> {
  const referenced = new Set<string>();

  for (let i = 0; i < names.length; i += LOOKUP_CHUNK) {
    const chunk = names.slice(i, i + LOOKUP_CHUNK);
    const rows = await prisma.memo.findMany({
      where: { storageKey: { in: chunk } },
      select: { storageKey: true },
    });
    for (const row of rows) referenced.add(row.storageKey);
  }

  return referenced;
}

type StrandedReport = {
  /** Archived documents whose primary original was never deleted. */
  leftovers: number;
  leftoverBytes: number;
  removed: number;
  /** Archived documents that exist ONLY on primary — the archive copy is gone. */
  archiveMissing: { storageKey: string; document: string; kycId: string }[];
};

/**
 * Finds primary-storage files left behind by an archive move.
 *
 * A CUT copies the file to the archive, records `storageTier = ARCHIVE`, then
 * deletes the primary original. When that last delete fails, the row still says
 * ARCHIVE, so the folder scan above counts the storage key as live and the file
 * becomes invisible: no screen reads it, and re-running CUT skips the document
 * because it is already on the target tier. Only a per-tier check can see it.
 *
 * Deleting one is safe ONLY when the archive copy is actually present, because
 * then the archive holds the document and the primary file is a pure duplicate.
 * When the archive copy is absent the primary file is the ONLY copy of that
 * document while the database points everyone at the archive — that is a
 * problem to report loudly, never to clean up.
 */
async function findStrandedArchivedOriginals(args: Args): Promise<StrandedReport> {
  const report: StrandedReport = { leftovers: 0, leftoverBytes: 0, removed: 0, archiveMissing: [] };

  const archived = await prisma.memo.findMany({
    where: { storageTier: 'ARCHIVE' },
    select: { storageKey: true, originalName: true, name: true, kycId: true },
  });

  for (const memo of archived) {
    let onPrimary: boolean;
    try {
      onPrimary = await secureUploadedFileExists(memo.storageKey, false, 'PRIMARY');
    } catch {
      continue; // Unusable storage key — the folder scan already reports those.
    }
    if (!onPrimary) continue;

    const onArchive = await secureUploadedFileExists(memo.storageKey, false, 'ARCHIVE').catch(() => false);
    if (!onArchive) {
      report.archiveMissing.push({
        storageKey: memo.storageKey,
        document: memo.originalName || memo.name || memo.storageKey,
        kycId: memo.kycId,
      });
      continue;
    }

    const primaryPath = path.join(getSecureUploadRoot(), memo.storageKey);
    let size = 0;
    try {
      size = (await fs.stat(primaryPath)).size;
    } catch {
      continue;
    }

    report.leftovers++;
    report.leftoverBytes += size;

    if (args.del) {
      try {
        await fs.unlink(primaryPath);
        report.removed++;
      } catch {
        // Still locked — it will be reported again on the next run.
      }
    }
  }

  return report;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const root = getSecureUploadRoot();

  const availability = await secureUploadRootAvailable();
  if (!availability.available) {
    throw new Error(
      `The upload folder is not reachable at "${root}" (${availability.code}). ` +
      `${describeSecureUploadRootSource()}. Point the script at the live folder before running it.`,
    );
  }

  const memoCount = await prisma.memo.count();
  if (memoCount === 0 && args.del) {
    throw new Error(
      'The database contains no documents at all, so every file would look unreferenced. ' +
      'Refusing to delete — check DATABASE_URL points at the live database.',
    );
  }

  const cutoff = Date.now() - args.minAgeDays * 24 * 60 * 60 * 1000;

  let scanned = 0;
  let referencedCount = 0;
  let unrecognised = 0;
  let orphanCount = 0;
  let orphanBytes = 0;
  let tooRecent = 0;
  let deleted = 0;
  let deleteFailed = 0;
  const samples: string[] = [];

  // Streamed so a folder with hundreds of thousands of entries never has to be
  // held in memory in one piece.
  const dir = await fs.opendir(root);
  let batch: string[] = [];

  const processBatch = async () => {
    if (batch.length === 0) return;
    const names = batch;
    batch = [];

    const referenced = await findReferenced(names);
    referencedCount += referenced.size;

    for (const name of names) {
      if (referenced.has(name)) continue;

      const filePath = path.join(root, name);
      let stats;
      try {
        stats = await fs.stat(filePath);
      } catch {
        continue; // Vanished between listing and inspection — nothing to do.
      }

      if (stats.mtimeMs > cutoff) {
        tooRecent++;
        continue;
      }

      orphanCount++;
      orphanBytes += stats.size;
      if (samples.length < 10) samples.push(name);

      if (args.del) {
        try {
          await fs.unlink(filePath);
          deleted++;
        } catch (error: any) {
          deleteFailed++;
          if (!args.json) {
            console.warn(`  ! could not delete ${name}: ${error?.code || error?.message}`);
          }
        }
      }
    }
  };

  for await (const entry of dir) {
    if (!entry.isFile()) continue;
    scanned++;

    // Partial copies from an interrupted archive transfer, and anything else
    // the application would never accept as a storage key, are reported but
    // never deleted — this script only reasons about documents.
    if (!STORAGE_KEY_PATTERN.test(entry.name)) {
      unrecognised++;
      continue;
    }

    batch.push(entry.name);
    if (batch.length >= LOOKUP_CHUNK * 4) {
      await processBatch();

      // A wrong folder is indistinguishable from a folder of orphans, so stop
      // before the first deletion rather than after the last one.
      if (
        args.del &&
        memoCount > 0 &&
        referencedCount / Math.max(scanned - unrecognised, 1) < MIN_REFERENCED_RATIO
      ) {
        throw new Error(
          `Only ${referencedCount} of the first ${scanned} files are referenced by the database, ` +
          `which is what a wrong folder looks like. ${describeSecureUploadRootSource()}. ` +
          'Run without --delete and confirm the folder before removing anything.',
        );
      }
    }
  }
  await processBatch();

  const stranded = await findStrandedArchivedOriginals(args);

  const summary = {
    root,
    rootSource: describeSecureUploadRootSource(),
    documentsInDatabase: memoCount,
    filesScanned: scanned,
    referenced: referencedCount,
    unrecognisedNames: unrecognised,
    withinSafetyWindow: tooRecent,
    unreferenced: orphanCount,
    unreferencedBytes: orphanBytes,
    deleted,
    deleteFailed,
    strandedArchiveLeftovers: stranded.leftovers,
    strandedArchiveLeftoverBytes: stranded.leftoverBytes,
    strandedArchiveLeftoversRemoved: stranded.removed,
    archivedButOnlyOnPrimary: stranded.archiveMissing.length,
    mode: args.del ? 'delete' : 'report',
    minAgeDays: args.minAgeDays,
  };

  if (args.json) {
    console.log(JSON.stringify(summary, null, 2));
    return;
  }

  console.log('');
  console.log(`Folder             ${root}`);
  console.log(`                   (${summary.rootSource})`);
  console.log(`Documents in DB    ${memoCount.toLocaleString()}`);
  console.log(`Files on disk      ${scanned.toLocaleString()}`);
  console.log(`  referenced       ${referencedCount.toLocaleString()}`);
  console.log(`  unreferenced     ${orphanCount.toLocaleString()}  (${formatBytes(orphanBytes)} recoverable)`);
  console.log(`  held back        ${tooRecent.toLocaleString()}  (newer than ${args.minAgeDays} day(s))`);
  console.log(`  not storage keys ${unrecognised.toLocaleString()}  (left alone)`);

  if (samples.length > 0) {
    console.log('');
    console.log('Examples of unreferenced files:');
    for (const name of samples) console.log(`  ${name}`);
  }

  // Leftovers from archive moves. These look "referenced" to the scan above,
  // because the row exists — it just points at the other tier.
  if (stranded.leftovers > 0) {
    console.log('');
    console.log(
      `Archive leftovers  ${stranded.leftovers.toLocaleString()} file(s) still on primary storage though ` +
      `their record says ARCHIVE  (${formatBytes(stranded.leftoverBytes)} recoverable)`,
    );
    if (args.del) {
      console.log(`                   ${stranded.removed.toLocaleString()} removed (the archive copy was verified present first).`);
    } else {
      console.log('                   Re-run with --delete to free them.');
    }
  }

  if (stranded.archiveMissing.length > 0) {
    console.log('');
    console.log(`!! ${stranded.archiveMissing.length} document(s) are recorded as ARCHIVED but exist ONLY on primary storage.`);
    console.log('   Their archive copy is gone, so the app cannot open them — it reads from the archive.');
    console.log('   These were NOT touched. Restore the archive copy, or set the record back to PRIMARY.');
    for (const item of stranded.archiveMissing.slice(0, 10)) {
      console.log(`   case ${item.kycId}  ${item.document}  (${item.storageKey})`);
    }
  }

  console.log('');
  if (args.del) {
    console.log(`Deleted ${deleted.toLocaleString()} file(s); ${deleteFailed} could not be removed.`);
  } else if (orphanCount > 0) {
    console.log('Nothing was changed. Re-run with --delete to free the unreferenced files.');
  } else {
    console.log('Nothing to clean up — every file on disk belongs to a document.');
  }
}

main()
  .catch((error) => {
    console.error(`\n✗ ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
