
import { PrismaClient, UserStatus } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  console.log('🚀 Institutional Seeding Initialized [NIB BANK]...');

  // 1. Provision Roles and Permissions
  const roles = [
    { name: 'SUPER_ADMIN', description: 'Master Control' },
    { name: 'KYC_OFFICER', description: 'Verification Staff' },
    { name: 'SUPERVISOR', description: 'Team Lead' },
    { name: 'BRANCH_OFFICER', description: 'Branch Operations' },
  ];

  for (const r of roles) {
    await prisma.role.upsert({
      where: { name: r.name },
      update: { description: r.description },
      create: r,
    });
  }

  // 2. Provision Admin Account (Persistence-Aware)
  const adminEmail = 'admin.user@nibbank.com.et';
  const defaultPassword = 'Password123';
  const hashedPassword = await bcrypt.hash(defaultPassword, 10);
  
  const existingAdmin = await prisma.user.findUnique({ where: { email: adminEmail } });

  if (!existingAdmin) {
    console.log(`Creating Master Admin: ${adminEmail}`);
    const systemAdmin = await prisma.user.create({
      data: {
        email: adminEmail,
        password: hashedPassword,
        firstName: 'System',
        lastName: 'Administrator',
        status: UserStatus.ACTIVE,
        needsPasswordChange: false
      }
    });

    const adminRole = await prisma.role.findUnique({ where: { name: 'SUPER_ADMIN' } });
    if (adminRole) {
      await prisma.userRole.create({
        data: { userId: systemAdmin.id, roleId: adminRole.id }
      });
    }
  } else {
    console.log('✔ Master Admin already exists. Skipping creation to preserve credentials.');
  }

  // 3. Provision Branch User (Persistence-Aware)
  const branchEmail = 'branch.one@nibbank.com.et';
  const existingBranchUser = await prisma.user.findUnique({ where: { email: branchEmail } });

  if (!existingBranchUser) {
    console.log(`Creating Branch User: ${branchEmail}`);
    const branchUser = await prisma.user.create({
      data: {
        email: branchEmail,
        password: hashedPassword,
        firstName: 'Branch',
        lastName: 'One',
        status: UserStatus.ACTIVE,
        needsPasswordChange: true // Only true for initial creation
      }
    });

    const officerRole = await prisma.role.findUnique({ where: { name: 'BRANCH_OFFICER' } });
    if (officerRole) {
      await prisma.userRole.create({
        data: { userId: branchUser.id, roleId: officerRole.id }
      });
    }
  } else {
    console.log('✔ Branch User already exists. Skipping creation.');
  }

  console.log('✅ Institutional Registry Sync Complete.');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
