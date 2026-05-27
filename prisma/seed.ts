
import { PrismaClient, UserStatus } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  console.log('🚀 Institutional Seeding Initialized [NIB BANK]...');

  // 1. Provision Capabilities (Permissions)
  const permissions = [
    // DASHBOARD
    { slug: 'DASHBOARD_VIEW', name: 'View General Dashboard', group: 'DASHBOARD' },
    { slug: 'DASHBOARD_VIEW_SYSTEM', name: 'View System-wide Command Dashboard', group: 'DASHBOARD' },

    // WORKFLOWS - KYC Operations
    { slug: 'CASE_SUBMIT', name: 'Create New Submission', group: 'WORKFLOWS' },
    { slug: 'CASE_VIEW_OWN', name: 'View My Submissions', group: 'WORKFLOWS' },
    { slug: 'KYC_VIEW_QUEUE', name: 'Access Review & Action', group: 'WORKFLOWS' },
    { slug: 'VIEW_AMENDMENT_QUEUE', name: 'Access Amendment Review', group: 'WORKFLOWS' },
    { slug: 'CASE_VIEW_ACTION_REQUIRED', name: 'View Returned Cases', group: 'WORKFLOWS' },
    { slug: 'VIEW_ESCALATED_CASES', name: 'View Escalated Cases', group: 'WORKFLOWS' },
    { slug: 'VIEW_GOVERNANCE_QUEUE', name: 'View Exceptional Cases', group: 'WORKFLOWS' },
    { slug: 'TRIGGER_GOVERNANCE_FLOW', name: 'Trigger Exceptional Flow', group: 'WORKFLOWS' },
    { slug: 'CASE_FLAG_URGENT', name: 'Flag Case as Urgent', group: 'WORKFLOWS' },
    
    // WORKFLOWS - Monitoring
    { slug: 'CASE_VIEW_BRANCH', name: 'Access Branch Monitoring', group: 'MONITORING' },
    { slug: 'DASHBOARD_VIEW_BRANCH', name: 'View Branch Specific Dashboard', group: 'MONITORING' },
    { slug: 'DASHBOARD_VIEW_DISTRICT_NODE', name: 'Access District Monitoring', group: 'MONITORING' },
    { slug: 'DASHBOARD_VIEW_DISTRICT', name: 'View District Dashboard', group: 'MONITORING' },
    
    // INFRASTRUCTURE
    { slug: 'MANAGE_VAULT_STORAGE', name: 'Manage Vault Storage', group: 'INFRASTRUCTURE' },
    { slug: 'VIEW_ARCHIVED_CASE', name: 'Access Case Archive', group: 'INFRASTRUCTURE' },
    { slug: 'EXPORT_CASE_ZIP', name: 'Download Case Bundle', group: 'INFRASTRUCTURE' },

    // REFERENCE
    { slug: 'VIEW_FQ_LIBRARY', name: 'View F&Q Library', group: 'REFERENCE' },
    { slug: 'CREATE_FQ_ENTRY', name: 'Create F&Q Entry', group: 'REFERENCE' },
    
    // REPORTING
    { slug: 'VIEW_SPECIALIST_PRODUCTIVITY', name: 'View Ops Monitoring', group: 'REPORTING' },
    { slug: 'REPORT_VIEW_SYSTEM', name: 'View System-wide Reports', group: 'REPORTING' },
    { slug: 'VIEW_AUDIT_POOL', name: 'Access Follow-up Audit', group: 'REPORTING' },
    { slug: 'VIEW_AUDIT_LOGS', name: 'View Audit Reports', group: 'REPORTING' },
    { slug: 'DOWNLOAD_MASTER_ARCHIVE', name: 'Download Master Archive', group: 'REPORTING' },

    // SYSTEM
    { slug: 'USER_CREATE', name: 'Manage User Access', group: 'SYSTEM' },
    { slug: 'ROLE_CREATE', name: 'Manage Assign Roles', group: 'SYSTEM' },
    { slug: 'MAP_USERS_TO_BRANCH', name: 'Manage Portfolio Mapping', group: 'SYSTEM' },
    { slug: 'MANAGE_BRANCHES', name: 'Manage Hierarchy', group: 'SYSTEM' },
    { slug: 'EDIT_SLA_POLICY', name: 'Modify System Configuration', group: 'SYSTEM' },
    { slug: 'VIEW_SYSTEM_AUDIT', name: 'View System Audit Logs', group: 'SYSTEM' },
  ];

  const dbPermissions = [];
  for (const p of permissions) {
    const perm = await prisma.permission.upsert({
      where: { slug: p.slug },
      update: { name: p.name, group: p.group },
      create: p,
    });
    dbPermissions.push(perm);
  }

  // 2. Provision Roles
  const roles = [
    { name: 'SUPER_ADMIN', description: 'Master Control' },
    { name: 'KYC_OFFICER', description: 'Verification Staff' },
    { name: 'BRANCH_OFFICER', description: 'Branch Operations' },
  ];

  for (const r of roles) {
    const role = await prisma.role.upsert({
      where: { name: r.name },
      update: { description: r.description },
      create: r,
    });

    // 3. Link Permissions to Roles
    if (r.name === 'SUPER_ADMIN') {
      // Grant all permissions to Admin
      await prisma.rolePermission.deleteMany({ where: { roleId: role.id } });
      await prisma.rolePermission.createMany({
        data: dbPermissions.map(p => ({ roleId: role.id, permissionId: p.id }))
      });
    } else if (r.name === 'BRANCH_OFFICER') {
      // Grant specific permissions to Branch Officer
      const branchSlugs = ['DASHBOARD_VIEW', 'CASE_SUBMIT', 'CASE_VIEW_OWN', 'CASE_VIEW_ACTION_REQUIRED'];
      const branchPerms = dbPermissions.filter(p => branchSlugs.includes(p.slug));
      await prisma.rolePermission.deleteMany({ where: { roleId: role.id } });
      await prisma.rolePermission.createMany({
        data: branchPerms.map(p => ({ roleId: role.id, permissionId: p.id }))
      });
    }
  }

  // 4. Provision Master Admin Account
  // RULE: Utilize environment variables for passwords. Set rotation flag to true.
  // SECURITY FIX: Never fall back to a hardcoded password. The seed MUST receive
  // the initial admin password via the ADMIN_PASSWORD environment variable.
  const adminEmail = 'admin.user@nibbank.com.et';
  const rawAdminPassword = process.env.ADMIN_PASSWORD;
  if (!rawAdminPassword) {
    throw new Error(
      'FATAL: ADMIN_PASSWORD environment variable is not set. ' +
      'Set it before running the seed to avoid hardcoded credentials. ' +
      'Example: ADMIN_PASSWORD="YourStr0ng!Pass" npx prisma db seed'
    );
  }
  const defaultPassword = await bcrypt.hash(rawAdminPassword, 10);
  
  const existingAdmin = await prisma.user.findUnique({ where: { email: adminEmail } });

  if (!existingAdmin) {
    const systemAdmin = await prisma.user.create({
      data: {
        email: adminEmail,
        password: defaultPassword,
        firstName: 'System',
        lastName: 'Administrator',
        status: UserStatus.ACTIVE,
        needsPasswordChange: true // Enforce change on first login
      }
    });

    const adminRole = await prisma.role.findUnique({ where: { name: 'SUPER_ADMIN' } });
    if (adminRole) {
      await prisma.userRole.create({
        data: { userId: systemAdmin.id, roleId: adminRole.id }
      });
    }
    console.log(`✔ Master Admin Created: ${adminEmail} (Rotation Enforced)`);
  }

  // 5. Provision Sample Branch Account
  const branchEmail = 'branch.one@nibbank.com.et';
  const existingBranch = await prisma.user.findUnique({ where: { email: branchEmail } });

  if (!existingBranch) {
    const branchUser = await prisma.user.create({
      data: {
        email: branchEmail,
        password: defaultPassword,
        firstName: 'Branch',
        lastName: 'One',
        status: UserStatus.ACTIVE,
        needsPasswordChange: true // Enforce change on first login
      }
    });

    const officerRole = await prisma.role.findUnique({ where: { name: 'BRANCH_OFFICER' } });
    if (officerRole) {
      await prisma.userRole.create({
        data: { userId: branchUser.id, roleId: officerRole.id }
      });
    }
    console.log(`✔ Sample Branch User Created: ${branchEmail} (Rotation Enforced)`);
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
