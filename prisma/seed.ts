
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
  ];

  for (const r of roles) {
    await prisma.role.upsert({
      where: { name: r.name },
      update: { description: r.description },
      create: r,
    });
  }

  // 2. Provision Initial Admin Account
  const adminEmail = 'admin.user@nibbank.com.et';
  const hashedPassword = await bcrypt.hash('Password123', 10);
  
  console.log(`Synchronizing Admin: ${adminEmail} / Password123`);

  const systemAdmin = await prisma.user.upsert({
    where: { email: adminEmail },
    update: { 
      password: hashedPassword, 
      status: UserStatus.ACTIVE,
      firstName: 'System',
      lastName: 'Administrator'
    },
    create: {
      email: adminEmail,
      password: hashedPassword,
      firstName: 'System',
      lastName: 'Administrator',
      status: UserStatus.ACTIVE,
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
