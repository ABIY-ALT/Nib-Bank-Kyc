/**
 * One-off, idempotent backfill: converts each user's existing `assignedBranches`
 * CSV into PERMANENT + ACTIVE BranchMapping rows (the user being the primary
 * officer). Safe to run multiple times — existing (branch, officer) pairs are
 * skipped. BranchMapping becomes the management source of truth; the CSV stays
 * as a derived cache that the routing logic still reads.
 *
 * Run:  npx tsx scripts/backfill-branch-mappings.ts
 */
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

function normalize(value: string) {
  return value.trim();
}

async function main() {
  console.log('🔁 Backfilling branch mappings from assignedBranches…');

  const branches = await prisma.branch.findMany({ select: { id: true, name: true } });
  const branchByName = new Map(branches.map((b) => [b.name.trim().toLowerCase(), b]));

  const users = await prisma.user.findMany({
    where: { assignedBranches: { not: null } },
    select: { id: true, firstName: true, lastName: true, assignedBranches: true },
  });

  let createdMappings = 0;
  let linkedOfficers = 0;
  let skippedBranches = 0;

  for (const user of users) {
    const branchNames = Array.from(
      new Set(
        (user.assignedBranches ?? '')
          .split(',')
          .map(normalize)
          .filter(Boolean),
      ),
    );

    for (const name of branchNames) {
      const branch = branchByName.get(name.toLowerCase());
      if (!branch) {
        console.warn(`  ⚠️  No branch matches "${name}" (user ${user.id}) — skipped.`);
        skippedBranches++;
        continue;
      }

      // Is this officer already linked to a mapping for this branch?
      const existingLink = await prisma.branchMappingOfficer.findFirst({
        where: { userId: user.id, mapping: { branchId: branch.id } },
        select: { mappingId: true },
      });
      if (existingLink) continue;

      // Reuse this branch's permanent mapping if one already exists; else create it.
      let mapping = await prisma.branchMapping.findFirst({
        where: { branchId: branch.id, type: 'PERMANENT' },
        select: { id: true },
      });

      if (!mapping) {
        mapping = await prisma.branchMapping.create({
          data: { branchId: branch.id, type: 'PERMANENT', active: true },
          select: { id: true },
        });
        createdMappings++;
      }

      // First officer linked to a fresh mapping becomes the primary.
      const hasPrimary = await prisma.branchMappingOfficer.findFirst({
        where: { mappingId: mapping.id, isPrimary: true },
        select: { userId: true },
      });

      await prisma.branchMappingOfficer.create({
        data: { mappingId: mapping.id, userId: user.id, isPrimary: !hasPrimary },
      });
      linkedOfficers++;
    }
  }

  console.log(
    `✅ Done. Created ${createdMappings} mapping(s), linked ${linkedOfficers} officer(s), skipped ${skippedBranches} unmatched branch name(s).`,
  );
}

main()
  .catch((e) => {
    console.error('❌ Backfill failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
