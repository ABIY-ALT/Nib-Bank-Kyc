
import { PrismaClient, UserStatus } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  if (process.env.ALLOW_SEED !== 'true') {
    console.error('❌ SEED ABORTED: Set ALLOW_SEED=true in your environment to proceed.');
    process.exit(1);
  }

  console.log('🚀 Institutional Seeding Initialized [NIB BANK BLUEPRINT]...');

  // 1. Provision Permission Registry (Aligned with Sidebar)
  const permissions = [
    // DASHBOARD
    { slug: 'DASHBOARD_VIEW', name: 'View General Dashboard', group: 'DASHBOARD' },
    { slug: 'DASHBOARD_VIEW_SYSTEM', name: 'View System-wide Command Dashboard', group: 'DASHBOARD' },

    // WORKFLOWS - Case Management
    { slug: 'CASE_SUBMIT', name: 'Create New Submission', group: 'WORKFLOWS' },
    { slug: 'CASE_VIEW_OWN', name: 'View My Submissions', group: 'WORKFLOWS' },
    { slug: 'KYC_VIEW_QUEUE', name: 'Access Review & Action', group: 'WORKFLOWS' },
    { slug: 'VIEW_AMENDMENT_QUEUE', name: 'Access Amendment Review', group: 'WORKFLOWS' },
    { slug: 'CASE_VIEW_ACTION_REQUIRED', name: 'View Returned Cases', group: 'WORKFLOWS' },
    { slug: 'VIEW_ESCALATED_CASES', name: 'View Escalated Cases', group: 'WORKFLOWS' },
    { slug: 'VIEW_GOVERNANCE_QUEUE', name: 'View Exceptional Cases', group: 'WORKFLOWS' },
    { slug: 'TRIGGER_GOVERNANCE_FLOW', name: 'Trigger Exceptional Flow', group: 'WORKFLOWS' },
    
    // WORKFLOWS - Monitoring
    { slug: 'CASE_VIEW_BRANCH', name: 'Access Branch Monitoring', group: 'MONITORING' },
    { slug: 'DASHBOARD_VIEW_BRANCH', name: 'View Branch Specific Dashboard', group: 'MONITORING' },
    { slug: 'DASHBOARD_VIEW_DISTRICT_NODE', name: 'Access District Monitoring', group: 'MONITORING' },
    { slug: 'DASHBOARD_VIEW_DISTRICT', name: 'View District Dashboard', group: 'MONITORING' },
    
    // WORKFLOWS - Infrastructure
    { slug: 'MANAGE_VAULT_STORAGE', name: 'Manage Vault Storage', group: 'INFRASTRUCTURE' },
    { slug: 'VIEW_ARCHIVED_CASE', name: 'Access Case Archive', group: 'INFRASTRUCTURE' },
    { slug: 'EXPORT_CASE_ZIP', name: 'Download Case Bundle', group: 'INFRASTRUCTURE' },

    // REFERENCE
    { slug: 'VIEW_FQ_LIBRARY', name: 'View F&Q Library', group: 'REFERENCE' },
    { slug: 'CREATE_FQ_ENTRY', name: 'Create F&Q Entry', group: 'REFERENCE' },
    { slug: 'EDIT_FQ_ENTRY', name: 'Edit F&Q Entry', group: 'REFERENCE' },
    { slug: 'DELETE_FQ_ENTRY', name: 'Deactivate F&Q Entry', group: 'REFERENCE' },
    
    // REPORTING
    { slug: 'VIEW_SPECIALIST_PRODUCTIVITY', name: 'View Ops Monitoring', group: 'REPORTING' },
    { slug: 'REPORT_VIEW_MANAGEMENT', name: 'View Management Report', group: 'REPORTING' },
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

  const permMap: Record<string, string> = {};
  for (const p of permissions) {
    const created = await prisma.permission.upsert({
      where: { slug: p.slug },
      update: { name: p.name, group: p.group },
      create: p,
    });
    permMap[p.slug] = created.id;
  }

  // 2. Institutional Roles
  const roles = [
    { name: 'SUPER_ADMIN', description: 'Master Control & Global Oversight' },
    { name: 'DISTRICT_DIRECTOR', description: 'Regional Command & Governance' },
    { name: 'KYC_DIRECTOR', description: 'Strategic Risk & Methodology Oversight' },
    { name: 'BRANCH_MANAGER', description: 'Local Node Operations Head' },
    { name: 'BRANCH_OFFICER', description: 'Primary Submission & Correction' },
    { name: 'KYC_OFFICER', description: 'Technical Analysis & Verification' },
    { name: 'SUPERVISOR', description: 'Operational Audit & Team Lead' },
  ];

  const roleMap: Record<string, any> = {};
  for (const r of roles) {
    roleMap[r.name] = await prisma.role.upsert({
      where: { name: r.name },
      update: { description: r.description },
      create: r,
    });
  }

  // 3. Right Mappings
  const rolePermissions: Record<string, string[]> = {
    BRANCH_OFFICER: [
      'DASHBOARD_VIEW', 
      'CASE_SUBMIT', 
      'CASE_VIEW_OWN', 
      'CASE_VIEW_ACTION_REQUIRED', 
      'VIEW_ARCHIVED_CASE', 
      'VIEW_FQ_LIBRARY'
    ],
    KYC_OFFICER: [
      'DASHBOARD_VIEW', 
      'KYC_VIEW_QUEUE', 
      'VIEW_AMENDMENT_QUEUE',
      'VIEW_ARCHIVED_CASE', 
      'VIEW_FQ_LIBRARY', 
      'VIEW_SPECIALIST_PRODUCTIVITY'
    ],
    SUPERVISOR: [
      'DASHBOARD_VIEW', 
      'KYC_VIEW_QUEUE', 
      'VIEW_AMENDMENT_QUEUE',
      'VIEW_ESCALATED_CASES', 
      'VIEW_ARCHIVED_CASE', 
      'VIEW_FQ_LIBRARY', 
      'VIEW_SPECIALIST_PRODUCTIVITY'
    ],
    BRANCH_MANAGER: [
      'DASHBOARD_VIEW', 
      'CASE_VIEW_BRANCH', 
      'DASHBOARD_VIEW_BRANCH', 
      'VIEW_GOVERNANCE_QUEUE', 
      'TRIGGER_GOVERNANCE_FLOW', 
      'VIEW_ARCHIVED_CASE', 
      'VIEW_FQ_LIBRARY'
    ],
    DISTRICT_DIRECTOR: [
      'DASHBOARD_VIEW', 
      'DASHBOARD_VIEW_DISTRICT', 
      'DASHBOARD_VIEW_DISTRICT_NODE', 
      'REPORT_VIEW_MANAGEMENT', 
      'VIEW_GOVERNANCE_QUEUE', 
      'VIEW_ARCHIVED_CASE', 
      'VIEW_FQ_LIBRARY', 
      'VIEW_SPECIALIST_PRODUCTIVITY'
    ],
    KYC_DIRECTOR: [
      'DASHBOARD_VIEW', 
      'DASHBOARD_VIEW_SYSTEM', 
      'REPORT_VIEW_SYSTEM', 
      'REPORT_VIEW_MANAGEMENT', 
      'VIEW_GOVERNANCE_QUEUE', 
      'VIEW_ARCHIVED_CASE', 
      'VIEW_FQ_LIBRARY', 
      'VIEW_SPECIALIST_PRODUCTIVITY'
    ],
    SUPER_ADMIN: permissions.map(p => p.slug)
  };

  for (const [roleName, slugs] of Object.entries(rolePermissions)) {
    const roleId = roleMap[roleName].id;
    for (const slug of slugs) {
      if (permMap[slug]) {
        await prisma.rolePermission.upsert({
          where: { roleId_permissionId: { roleId, permissionId: permMap[slug] } },
          update: {},
          create: { roleId, permissionId: permMap[slug] }
        });
      }
    }
  }

  console.log('✅ Institutional Framework Synced.');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
