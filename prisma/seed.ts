import { PrismaClient, UserStatus } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  if (process.env.ALLOW_SEED !== 'true') {
    console.error('❌ SEED ABORTED: Set ALLOW_SEED=true in your environment to proceed.');
    process.exit(1);
  }

  console.log('🚀 Institutional Seeding Initialized [NI BANK BLUEPRINT]...');

  // 1. Provision Permission Registry
  const permissions = [
    // DASHBOARD
    { slug: 'DASHBOARD_VIEW', name: 'View General Dashboard', group: 'DASHBOARD' },
    { slug: 'DASHBOARD_VIEW_BRANCH', name: 'View Branch Dashboard', group: 'DASHBOARD' },
    { slug: 'DASHBOARD_VIEW_DISTRICT', name: 'View District Dashboard', group: 'DASHBOARD' },
    
    // WORKFLOWS
    { slug: 'CASE_UPLOAD_DOCUMENT', name: 'Upload Customer Documents', group: 'WORKFLOWS' },
    { slug: 'CASE_SUBMIT', name: 'Submit New KYC Case', group: 'WORKFLOWS' },
    { slug: 'CASE_VIEW_OWN', name: 'View Own Submissions', group: 'WORKFLOWS' },
    { slug: 'CASE_RESUBMIT', name: 'Resubmit Corrected Case', group: 'WORKFLOWS' },
    { slug: 'CASE_VIEW_ACTION_REQUIRED', name: 'View Amendment Requests', group: 'WORKFLOWS' },
    { slug: 'CASE_RESPOND_AMENDMENT', name: 'Respond to Amendments', group: 'WORKFLOWS' },
    { slug: 'CASE_VIEW_BRANCH', name: 'View All Branch Cases', group: 'WORKFLOWS' },
    { slug: 'KYC_VIEW_QUEUE', name: 'View Review Queue', group: 'WORKFLOWS' },
    { slug: 'KYC_VERIFY_CHECKLIST', name: 'Perform Verification', group: 'WORKFLOWS' },
    { slug: 'KYC_REQUEST_AMENDMENT', name: 'Request Case Amendments', group: 'WORKFLOWS' },
    { slug: 'KYC_APPROVE_STANDARD', name: 'Approve Standard Cases', group: 'WORKFLOWS' },
    { slug: 'KYC_VIEW_RESUBMITTED', name: 'View Resubmitted Queue', group: 'WORKFLOWS' },
    { slug: 'VIEW_ESCALATED_CASES', name: 'View Escalation Queue', group: 'WORKFLOWS' },
    { slug: 'VIEW_GOVERNANCE_QUEUE', name: 'View Exceptional Queue', group: 'WORKFLOWS' },
    { slug: 'VIEW_ARCHIVED_CASE', name: 'View Master Archive', group: 'WORKFLOWS' },
    
    // REFERENCE
    { slug: 'VIEW_FQ_LIBRARY', name: 'View F&Q Library', group: 'REFERENCE' },
    { slug: 'CREATE_FQ_ENTRY', name: 'Create F&Q Entry', group: 'REFERENCE' },
    
    // REPORTING
    { slug: 'REPORT_VIEW_SYSTEM', name: 'View System-wide Reports', group: 'REPORTING' },
    { slug: 'REPORT_VIEW_DISTRICT', name: 'View District Command', group: 'REPORTING' },
    { slug: 'VIEW_SPECIALIST_PRODUCTIVITY', name: 'View Specialist Matrix', group: 'REPORTING' },
    { slug: 'VIEW_AUDIT_POOL', name: 'View Audit Pool', group: 'REPORTING' },
    { slug: 'VIEW_AUDIT_LOGS', name: 'View Audit Logs', group: 'REPORTING' },
    { slug: 'DOWNLOAD_MASTER_ARCHIVE', name: 'Download Master Archive', group: 'REPORTING' },

    // SYSTEM
    { slug: 'USER_CREATE', name: 'Provision New Users', group: 'SYSTEM' },
    { slug: 'USER_EDIT', name: 'Edit Personnel Profiles', group: 'SYSTEM' },
    { slug: 'ROLE_CREATE', name: 'Define New Role', group: 'SYSTEM' },
    { slug: 'MAP_USERS_TO_BRANCH', name: 'Link Users to Nodes', group: 'SYSTEM' },
    { slug: 'MANAGE_BRANCHES', name: 'Manage Branches', group: 'SYSTEM' },
    { slug: 'EDIT_SLA_POLICY', name: 'Modify Institutional SLA', group: 'SYSTEM' },
    { slug: 'VIEW_SYSTEM_AUDIT', name: 'View Master Audit Log', group: 'SYSTEM' },
  ];

  const permMap: Record<string, string> = {};
  for (const p of permissions) {
    const created = await prisma.permission.upsert({
      where: { slug: p.slug },
      update: { name: p.name, group: p.group },
      create: p,
    });
    permMap[p.slug] = created.id;
  }
  console.log(`✅ Capability Registry Synced: ${permissions.length} nodes.`);

  // 2. Seed Institutional Roles
  const roles = [
    { name: 'SUPER_ADMIN', description: 'Global Institutional Oversight' },
    { name: 'ADMIN', description: 'System Administrator' },
    { name: 'DISTRICT_DIRECTOR', description: 'Regional Node Director' },
    { name: 'BRANCH_MANAGER', description: 'Branch Operational Head' },
    { name: 'BRANCH_OFFICER', description: 'Branch Submission Officer' },
    { name: 'KYC_OFFICER', description: 'KYC Verification Specialist' },
    { name: 'SUPERVISOR', description: 'Senior Verification Specialist' },
  ];

  const roleMap: Record<string, any> = {};
  for (const r of roles) {
    roleMap[r.name] = await prisma.role.upsert({
      where: { name: r.name },
      update: { description: r.description },
      create: r,
    });
    console.log(`🛡️ Role established: ${r.name}`);
  }

  // 3. Establish Default Rights
  const rolePermissions: Record<string, string[]> = {
    BRANCH_OFFICER: ['DASHBOARD_VIEW', 'CASE_SUBMIT', 'CASE_VIEW_OWN', 'CASE_UPLOAD_DOCUMENT', 'CASE_RESUBMIT', 'CASE_RESPOND_AMENDMENT', 'VIEW_FQ_LIBRARY'],
    KYC_OFFICER: ['DASHBOARD_VIEW', 'KYC_VIEW_QUEUE', 'KYC_VERIFY_CHECKLIST', 'KYC_REQUEST_AMENDMENT', 'KYC_APPROVE_STANDARD', 'KYC_VIEW_RESUBMITTED', 'VIEW_FQ_LIBRARY'],
    BRANCH_MANAGER: ['DASHBOARD_VIEW', 'CASE_VIEW_BRANCH', 'DASHBOARD_VIEW_BRANCH', 'VIEW_FQ_LIBRARY'],
    DISTRICT_DIRECTOR: ['DASHBOARD_VIEW', 'DASHBOARD_VIEW_DISTRICT', 'REPORT_VIEW_DISTRICT', 'CASE_VIEW_BRANCH', 'VIEW_FQ_LIBRARY'],
  };

  for (const [roleName, slugs] of Object.entries(rolePermissions)) {
    const roleId = roleMap[roleName].id;
    for (const slug of slugs) {
      if (permMap[slug]) {
        await prisma.rolePermission.upsert({
          where: { 
            roleId_permissionId: { roleId, permissionId: permMap[slug] } 
          },
          update: {},
          create: { roleId, permissionId: permMap[slug] }
        });
      }
    }
  }

  // 4. Seed Hierarchy
  const district = await prisma.district.upsert({
    where: { name: 'Addis Central' },
    update: {},
    create: { name: 'Addis Central' },
  });

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
      create: { name: b.name, code: b.code, districtId: district.id },
    });
  }

  // 5. Seed Users
  const adminPass = process.env.SEED_ADMIN_PASSWORD || 'nibbank123';
  const hashedPass = await bcrypt.hash(adminPass, 10);

  const testUsers = [
    { email: 'admin.nib@nibbank.com.et', first: 'System', last: 'Admin', role: 'SUPER_ADMIN' },
    { email: 'director.central@nibbank.com.et', first: 'Abebe', last: 'Bikila', role: 'DISTRICT_DIRECTOR' },
    { email: 'manager.meskel@nibbank.com.et', first: 'Derartu', last: 'Tulu', role: 'BRANCH_MANAGER' },
    { email: 'officer.meskel@nibbank.com.et', first: 'Fatuma', last: 'Roba', role: 'BRANCH_OFFICER' },
    { email: 'specialist.nib@nibbank.com.et', first: 'Meseret', last: 'Defar', role: 'KYC_OFFICER' },
  ];

  for (const u of testUsers) {
    const firebaseUid = `uid-${u.email.split('@')[0]}`;
    const user = await prisma.user.upsert({
      where: { email: u.email },
      update: { passwordHash: hashedPass, firebaseUid },
      create: {
        id: firebaseUid,
        firebaseUid,
        email: u.email,
        firstName: u.first,
        lastName: u.last,
        status: UserStatus.ACTIVE,
        passwordHash: hashedPass,
      },
    });

    await prisma.userRole.upsert({
      where: { userId_roleId: { userId: user.id, roleId: roleMap[u.role].id } },
      update: {},
      create: { userId: user.id, roleId: roleMap[u.role].id },
    });
  }

  console.log('✅ Institutional Vault established. Personnel mapped.');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
