
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

  // 2. Provision Admin Account
  const adminEmail = 'admin.user@nibbank.com.et';
  const hashedPassword = await bcrypt.hash('Password123', 10);
  
  const systemAdmin = await prisma.user.upsert({
    where: { email: adminEmail },
    update: { 
      password: hashedPassword, 
      status: UserStatus.ACTIVE,
      firstName: 'System',
      lastName: 'Administrator',
      needsPasswordChange: false
    },
    create: {
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
    await prisma.userRole.upsert({
      where: { userId_roleId: { userId: systemAdmin.id, roleId: adminRole.id } },
      update: {},
      create: { userId: systemAdmin.id, roleId: adminRole.id }
    });
  }

  // 3. Provision Branch User (With Force Password Change)
  const branchEmail = 'branch.one@nibbank.com.et';
  console.log(`Synchronizing Branch User: ${branchEmail} / Password123`);

  const branchUser = await prisma.user.upsert({
    where: { email: branchEmail },
    update: {
      password: hashedPassword,
      status: UserStatus.ACTIVE,
      firstName: 'Branch',
      lastName: 'One',
      needsPasswordChange: true // Triggers the modal on login
    },
    create: {
      email: branchEmail,
      password: hashedPassword,
      firstName: 'Branch',
      lastName: 'One',
      status: UserStatus.ACTIVE,
      needsPasswordChange: true
    }
  });

  const officerRole = await prisma.role.findUnique({ where: { name: 'BRANCH_OFFICER' } });
  if (officerRole) {
    await prisma.userRole.upsert({
      where: { userId_roleId: { userId: branchUser.id, roleId: officerRole.id } },
      update: {},
      create: { userId: branchUser.id, roleId: officerRole.id }
    });
  }

  console.log('✅ Institutional Registry Synced.');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
