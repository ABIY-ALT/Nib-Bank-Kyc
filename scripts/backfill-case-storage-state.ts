/**
 * Backfills and repairs KYC.storageState.
 *
 * The column is a stored answer to "where do this case's documents live?",
 * which the archive screens used to re-derive on every query at the cost of
 * five sequential scans of the Memo table. lib/case-storage-state.ts keeps it
 * in step from then on; this script sets it for rows that predate the column
 * and repairs any that drifted.
 *
 * Safe to run repeatedly, and safe to run while the application is up: it only
 * writes rows whose stored state disagrees with their documents.
 *
 *   npm run storage:backfill-state          # report and fix
 *   npm run storage:backfill-state -- --dry # report only
 */
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const dryRun = process.argv.includes('--dry');

/**
 * Done as one SQL statement per state rather than paging in JavaScript: at a
 * million documents, reading every case into the process to decide three
 * possible values would be the slowest possible way to ask the question.
 *
 * `bool_and` over a case's documents is the same rule as
 * deriveCaseStorageState() — DELETED wins over ARCHIVED, and a case with no
 * documents at all is ACTIVE.
 */
const DERIVED = `
  SELECT k.id,
         CASE
           WHEN COUNT(m.id) = 0 THEN 'ACTIVE'
           WHEN bool_and(m."archiveDeletedAt" IS NOT NULL) THEN 'DELETED'
           WHEN bool_and(m."storageTier" = 'ARCHIVE') THEN 'ARCHIVED'
           ELSE 'ACTIVE'
         END AS derived
  FROM "KYC" k
  LEFT JOIN "Memo" m ON m."kycId" = k.id
  GROUP BY k.id
`;

async function main() {
  const drift = await prisma.$queryRawUnsafe<{ derived: string; count: bigint }[]>(`
    SELECT d.derived, COUNT(*) AS count
    FROM (${DERIVED}) d
    JOIN "KYC" k ON k.id = d.id
    WHERE k."storageState"::text <> d.derived
    GROUP BY d.derived
  `);

  if (drift.length === 0) {
    console.log('Every case already matches its documents. Nothing to do.');
    return;
  }

  console.log('Cases whose stored state disagrees with their documents:');
  for (const row of drift) console.log(`  -> ${row.derived.padEnd(8)} ${row.count}`);

  if (dryRun) {
    console.log('\n--dry given; no rows written.');
    return;
  }

  const updated = await prisma.$executeRawUnsafe(`
    UPDATE "KYC" k
    SET "storageState" = d.derived::"CaseStorageState"
    FROM (${DERIVED}) d
    WHERE k.id = d.id AND k."storageState"::text <> d.derived
  `);

  console.log(`\n${updated} case(s) corrected.`);
}

main()
  .catch(e => { console.error(e); process.exitCode = 1; })
  .finally(() => prisma.$disconnect());
