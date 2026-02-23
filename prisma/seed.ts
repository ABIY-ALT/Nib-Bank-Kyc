import { PrismaClient, UserStatus } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  if (process.env.ALLOW_SEED !== 'true') {
    console.error('❌ SEED ABORTED: Set ALLOW_SEED=true in your environment to proceed.');
    process.exit(1);
  }

  console.log('🚀 Institutional Seeding Initialized...');

  // 1. Seed Districts
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

  // 2. Seed Branches
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

  // 3. Seed Roles
  const roles = [
    'SUPER_ADMIN',
    'ADMIN',
    'DISTRICT_DIRECTOR',
    'FOLLOW_UP_TEAM',
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

  // 4. Seed Users
  const adminPass = process.env.SEED_ADMIN_PASSWORD || 'nibbank123';
  const hashedPass = await bcrypt.hash(adminPass, 10);

  const testUsers = [
    // 1. SUPER ADMIN (Institutional Master)
    { 
      email: 'master.admin@nibbank.com.et', 
      first: 'Master', last: 'Admin', 
      role: 'SUPER_ADMIN', branch: null, 
      phone: '+251111111111' 
    },

    // 2. TWO DISTRICT DIRECTORS
    { 
      email: 'north.director@nibbank.com.et', 
      first: 'North', last: 'Director', 
      role: 'DISTRICT_DIRECTOR', branch: null, 
      phone: '+251911000001' 
    },
    { 
      email: 'south.director@nibbank.com.et', 
      first: 'South', last: 'Director', 
      role: 'DISTRICT_DIRECTOR', branch: null, 
      phone: '+251911000002' 
    },

    // 3. TWO BRANCH MANAGERS
    { 
      email: 'kirkos.manager@nibbank.com.et', 
      first: 'Kirkos', last: 'Manager', 
      role: 'BRANCH_MANAGER', branch: 'Kirkos Branch', 
      phone: '+251911000003' 
    },
    { 
      email: 'lideta.manager@nibbank.com.et', 
      first: 'Lideta', last: 'Manager', 
      role: 'BRANCH_MANAGER', branch: 'Lideta Branch', 
      phone: '+251911000004' 
    },

    // 4. TWO BRANCH OFFICERS
    { 
      email: 'arada.officer@nibbank.com.et', 
      first: 'Arada', last: 'Officer', 
      role: 'BRANCH_OFFICER', branch: 'Arada Branch', 
      phone: '+251911000005' 
    },
    { 
      email: 'bole.officer@nibbank.com.et', 
      first: 'Bole', last: 'Officer', 
      role: 'BRANCH_OFFICER', branch: 'Bole Branch', 
      phone: '+251911000006' 
    },

    // 5. TWO KYC OFFICERS
    { 
      email: 'kyc.specialist.1@nibbank.com.et', 
      first: 'Jane', last: 'Specialist', 
      role: 'KYC_OFFICER', branch: null, 
      phone: '+251911000007',
      assignedBranches: ['Arada Branch', 'Bole Branch']
    },
    { 
      email: 'kyc.specialist.2@nibbank.com.et', 
      first: 'John', last: 'Analyst', 
      role: 'KYC_OFFICER', branch: null, 
      phone: '+251911000008',
      assignedBranches: ['Kirkos Branch', 'Lideta Branch']
    },

    // 6. ONE SUPERVISOR
    { 
      email: 'supervisor.one@nibbank.com.et', 
      first: 'Robert', last: 'Supervisor', 
      role: 'SUPERVISOR', branch: null, 
      phone: '+251911000009' 
    }
  ];

  for (const u of testUsers) {
    const branchId = u.branch ? branchMap[u.branch].id : null;
    
    const user = await prisma.user.upsert({
      where: { email: u.email },
      update: {
        firstName: u.first,
        lastName: u.last,
        phoneNumber: u.phone,
        branchId: branchId,
        assignedBranches: (u as any).assignedBranches || [],
        passwordHash: hashedPass,
      },
      create: {
        id: `uid-${u.email.split('@')[0]}`,
        email: u.email,
        firebaseUid: `uid-${u.email.split('@')[0]}`,
        firstName: u.first,
        lastName: u.last,
        phoneNumber: u.phone,
        status: UserStatus.ACTIVE,
        branchId: branchId,
        assignedBranches: (u as any).assignedBranches || [],
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

    console.log(`👤 Personnel provisioned: ${u.email} [${u.role}] -> ${u.branch || 'Institutional Node'}`);
  }

  console.log('✅ Institutional Vault seeding complete.');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
