import { PrismaClient, UserStatus } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  // 1. Environment Safety Check
  if (process.env.ALLOW_SEED !== 'true') {
    console.error('❌ SEED ABORTED: Set ALLOW_SEED=true in your environment to proceed.');
    process.exit(1);
  }

  console.log('🚀 Institutional Seeding Initialized...');

  // 2. Seed Districts
  const districts = ['Addis North', 'Addis South', 'Addis East', 'Addis West'];
  const districtMap: Record<string, any> = {};

  for (const name of districts) {
    const d = await prisma.district.upsert({
      where: { name },
      update: {},
      create: { name },
    });
    districtMap[name] = d;
    console.log(`📍 District established: ${name}`);
  }

  // 3. Seed Branches
  const branches = [
    { name: 'Arada Branch', code: 'BR-101', district: 'Addis North' },
    { name: 'Gullele Branch', code: 'BR-102', district: 'Addis North' },
    { name: 'Kirkos Branch', code: 'BR-201', district: 'Addis South' },
    { name: 'Nifas Silk Branch', code: 'BR-202', district: 'Addis South' },
    { name: 'Bole Branch', code: 'BR-301', district: 'Addis East' },
    { name: 'Yeka Branch', code: 'BR-302', district: 'Addis East' },
    { name: 'Kolfe Branch', code: 'BR-401', district: 'Addis West' },
    { name: 'Lideta Branch', code: 'BR-402', district: 'Addis West' },
  ];

  const branchMap: Record<string, any> = {};
  for (const b of branches) {
    const node = await prisma.branch.upsert({
      where: { name: b.name },
      update: { code: b.code },
      create: { 
        name: b.name, 
        code: b.code, 
        districtId: districtMap[b.district].id 
      },
    });
    branchMap[b.name] = node;
    console.log(`  🏢 Branch registered: ${b.name} (${b.code})`);
  }

  // 4. Seed Roles
  const roles = [
    'SUPER_ADMIN',
    'ADMIN',
    'DISTRICT_DIRECTOR',
    'FOLLOW_UP_TEAM',
    'BRANCH_OPERATION_DIRECTOR',
    'BRANCH_MANAGER',
    'BRANCH_OFFICER',
    'KYC_OFFICER',
    'SUPERVISOR',
    'CHIEF'
  ];

  const roleMap: Record<string, any> = {};
  for (const name of roles) {
    const r = await prisma.role.upsert({
      where: { name },
      update: {},
      create: { name, description: `Institutional role for ${name.replace(/_/g, ' ')}` },
    });
    roleMap[name] = r;
    console.log(`🛡️ Role provisioned: ${name}`);
  }

  // 5. Seed Users
  const adminPass = process.env.SEED_ADMIN_PASSWORD || 'ChangeMe123!';
  const hashedPass = await bcrypt.hash(adminPass, 10);

  const testUsers = [
    { 
      email: 'master.admin@nibbank.com.et', 
      first: 'Master', 
      last: 'Admin', 
      role: 'SUPER_ADMIN', 
      branch: null // Institutional
    },
    { 
      email: 'addis.director@nibbank.com.et', 
      first: 'District', 
      last: 'Director', 
      role: 'DISTRICT_DIRECTOR', 
      branch: null // Institutional
    },
    { 
      email: 'bole.manager@nibbank.com.et', 
      first: 'Bole', 
      last: 'Manager', 
      role: 'BRANCH_MANAGER', 
      branch: 'Bole Branch' 
    },
    { 
      email: 'arada.officer@nibbank.com.et', 
      first: 'John', 
      last: 'Officer', 
      role: 'BRANCH_OFFICER', 
      branch: 'Arada Branch' 
    },
    { 
      email: 'kyc.specialist@nibbank.com.et', 
      first: 'Jane', 
      last: 'Specialist', 
      role: 'KYC_OFFICER', 
      branch: null // Institutional
    },
    { 
      email: 'supervisor.one@nibbank.com.et', 
      first: 'Robert', 
      last: 'Supervisor', 
      role: 'SUPERVISOR', 
      branch: null // Institutional
    },
    { 
      email: 'audit.specialist@nibbank.com.et', 
      first: 'FollowUp', 
      last: 'Specialist', 
      role: 'FOLLOW_UP_TEAM', 
      branch: null // Institutional
    },
    { 
      email: 'chief.retail@nibbank.com.et', 
      first: 'Chief', 
      last: 'Officer', 
      role: 'CHIEF', 
      branch: null // Institutional
    }
  ];

  for (const u of testUsers) {
    const branchId = u.branch ? branchMap[u.branch].id : null;
    
    const user = await prisma.user.upsert({
      where: { email: u.email },
      update: {
        firstName: u.first,
        lastName: u.last,
        branchId: branchId,
        passwordHash: hashedPass,
      },
      create: {
        email: u.email,
        firebaseUid: `uid-${u.email.split('@')[0]}`,
        firstName: u.first,
        lastName: u.last,
        status: UserStatus.ACTIVE,
        branchId: branchId,
        passwordHash: hashedPass,
      },
    });

    // Link Role
    await prisma.userRole.upsert({
      where: { 
        userId_roleId: { userId: user.id, roleId: roleMap[u.role].id } 
      },
      update: {},
      create: { userId: user.id, roleId: roleMap[u.role].id },
    });

    console.log(`👤 User provisioned: ${u.email} [${u.role}] -> ${u.branch || 'Institutional Node'}`);
  }

  console.log('✅ Institutional seeding complete. Vault ready.');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
