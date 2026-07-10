/**
 * One-off cleanup for FollowUpVerification rows whose submissionId no longer
 * points at an existing KYC record. Needed before `prisma db push` can add the
 * new FollowUpVerification -> KYC foreign key (Postgres refuses to add an FK
 * constraint while orphaned rows exist).
 *
 * Usage: node scripts/clean-orphan-followups.js        (dry run, reports only)
 *        node scripts/clean-orphan-followups.js --delete (deletes the orphans)
 */
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const shouldDelete = process.argv.includes('--delete');

  const orphans = await prisma.$queryRawUnsafe(
    'SELECT f.id, f."submissionId", f.status FROM "FollowUpVerification" f ' +
    'WHERE NOT EXISTS (SELECT 1 FROM "KYC" k WHERE k.id = f."submissionId")'
  );

  console.log(`Found ${orphans.length} orphaned FollowUpVerification row(s).`);
  orphans.forEach((row) => console.log(` - id=${row.id} submissionId=${row.submissionId} status=${row.status}`));

  if (orphans.length === 0) {
    console.log('Nothing to clean up. `prisma db push` should succeed now.');
    return;
  }

  if (!shouldDelete) {
    console.log('\nDry run only. Re-run with --delete to remove these rows.');
    return;
  }

  const ids = orphans.map((row) => row.id);
  const result = await prisma.followUpVerification.deleteMany({ where: { id: { in: ids } } });
  console.log(`Deleted ${result.count} orphaned row(s).`);
}

main()
  .catch((e) => { console.error(e.message); process.exit(1); })
  .finally(() => prisma.$disconnect());
