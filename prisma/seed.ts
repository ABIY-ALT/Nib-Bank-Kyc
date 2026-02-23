import { PrismaClient, UserStatus } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  if (process.env.ALLOW_SEED !== 'true') {
    console.error('❌ SEED ABORTED: Set ALLOW_SEED=true in your environment to proceed.');
    process.exit(1);
  }

  console.log('🚀 Institutional Seeding Initialized [REGIONAL MAPPING MODE]...');

  // 1. Seed Roles
  const roles = [
    'SUPER_ADMIN',
    'ADMIN',
    'DISTRICT_DIRECTOR',
    'BRANCH_MANAGER',
    'BRANCH_OFFICER',
    'KYC_OFFICER',
    'SUPERVISOR',
    'CHIEF'
  ];

  const roleMap: Record<string, any> = {};
  for (const name of roles) {
    roleMap[name] = await prisma.role.upsert({
      where: { name },
      update: {},
      create: { name, description: `Institutional role for ${name.replace(/_/g, ' ')}` },
    });
    console.log(`🛡️ Role provisioned: ${name}`);
  }

  // 2. Seed District
  const district = await prisma.district.upsert({
    where: { name: 'Addis Central' },
    update: {},
    create: { name: 'Addis Central' },
  });
  console.log(`📍 District established: ${district.name}`);

  // 3. Seed Branches
  const branches = [
    { name: 'Meskel Square Branch', code: 'BR-101' },
    { name: 'Stadium Branch', code: 'BR-102' },
    { name: 'Kazanchis Branch', code: 'BR-103' },
  ];

  const branchMap: Record<string, any> = {};
  for (const b of branches) {
    branchMap[b.name] = await prisma.branch.upsert({
      where: { name: b.name },
      update: { code: b.code },
      create: { 
        name: b.name, 
        code: b.code, 
        districtId: district.id 
      },
    });
    console.log(`  🏢 Branch registered: ${b.name}`);
  }

  // 4. Provision Users
  const adminPass = process.env.SEED_ADMIN_PASSWORD || 'nibbank123';
  const hashedPass = await bcrypt.hash(adminPass, 10);

  const testUsers = [
    // DISTRICT DIRECTOR
    { 
      email: 'director.central@nibbank.com.et', 
      first: 'Abebe', last: 'Bikila', 
      role: 'DISTRICT_DIRECTOR', 
      phone: '+251911000001',
      mapping: { districtId: district.id } 
    },

    // BRANCH MANAGERS
    { 
      email: 'manager.meskel@nibbank.com.et', 
      first: 'Derartu', last: 'Tulu', 
      role: 'BRANCH_MANAGER', 
      phone: '+251911000002',
      mapping: { branchId: branchMap['Meskel Square Branch'].id } 
    },
    { 
      email: 'manager.stadium@nibbank.com.et', 
      first: 'Haile', last: 'Gebrselassie', 
      role: 'BRANCH_MANAGER', 
      phone: '+251911000003',
      mapping: { branchId: branchMap['Stadium Branch'].id } 
    },
    { 
      email: 'manager.kazanchis@nibbank.com.et', 
      first: 'Kenenisa', last: 'Bekele', 
      role: 'BRANCH_MANAGER', 
      phone: '+251911000004',
      mapping: { branchId: branchMap['Kazanchis Branch'].id } 
    },

    // BRANCH OFFICERS (2 per branch)
    { 
      email: 'officer1.meskel@nibbank.com.et', 
      first: 'Fatuma', last: 'Roba', 
      role: 'BRANCH_OFFICER', 
      phone: '+251911000005',
      mapping: { branchId: branchMap['Meskel Square Branch'].id } 
    },
    { 
      email: 'officer2.meskel@nibbank.com.et', 
      first: 'Meseret', last: 'Defar', 
      role: 'BRANCH_OFFICER', 
      phone: '+251911000006',
      mapping: { branchId: branchMap['Meskel Square Branch'].id } 
    },
    { 
      email: 'officer1.stadium@nibbank.com.et', 
      first: 'Tirunesh', last: 'Dibaba', 
      role: 'BRANCH_OFFICER', 
      phone: '+251911000007',
      mapping: { branchId: branchMap['Stadium Branch'].id } 
    },
    { 
      email: 'officer2.stadium@nibbank.com.et', 
      first: 'Sileshi', last: 'Sihine', 
      role: 'BRANCH_OFFICER', 
      phone: '+251911000008',
      mapping: { branchId: branchMap['Stadium Branch'].id } 
    },
    { 
      email: 'officer1.kazanchis@nibbank.com.et', 
      first: 'Gezahegne', last: 'Abera', 
      role: 'BRANCH_OFFICER', 
      phone: '+251911000009',
      mapping: { branchId: branchMap['Kazanchis Branch'].id } 
    },
    { 
      email: 'officer2.kazanchis@nibbank.com.et', 
      first: 'Berhane', last: 'Adere', 
      role: 'BRANCH_OFFICER', 
      phone: '+251911000010',
      mapping: { branchId: branchMap['Kazanchis Branch'].id } 
    }
  ];

  for (const u of testUsers) {
    const user = await prisma.user.upsert({
      where: { email: u.email },
      update: {
        firstName: u.first,
        lastName: u.last,
        phoneNumber: u.phone,
        passwordHash: hashedPass,
        ...u.mapping
      },
      create: {
        id: `uid-${u.email.split('@')[0]}`,
        firebaseUid: `uid-${u.email.split('@')[0]}`,
        email: u.email,
        firstName: u.first,
        lastName: u.last,
        phoneNumber: u.phone,
        status: UserStatus.ACTIVE,
        passwordHash: hashedPass,
        ...u.mapping
      },
    });

    await prisma.userRole.upsert({
      where: { 
        userId_roleId: { userId: user.id, roleId: roleMap[u.role].id } 
      },
      update: {},
      create: { userId: user.id, roleId: roleMap[u.role].id },
    });

    console.log(`👤 Personnel provisioned: ${u.email} [${u.role}]`);
  }

  console.log('✅ Institutional Vault seeding complete. Hierarchy mapped.');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });