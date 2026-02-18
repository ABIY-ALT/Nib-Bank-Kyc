'use server';

import { prisma } from '@/lib/prisma';
import { revalidatePath } from 'next/cache';

/**
 * Institutional Framework Synchronization Script.
 * Ensures the database exactly reflects the blueprint slugs required for the Sidebar.
 */
export async function seedInstitutionalPermissions() {
  const permissions = [
    // DASHBOARD
    { slug: 'DASHBOARD_VIEW', name: 'View General Dashboard', group: 'DASHBOARD' },
    { slug: 'DASHBOARD_VIEW_BRANCH', name: 'View Branch Specific Dashboard', group: 'DASHBOARD' },
    { slug: 'DASHBOARD_VIEW_DISTRICT', name: 'View District Specific Dashboard', group: 'DASHBOARD' },
    { slug: 'DASHBOARD_VIEW_SYSTEM', name: 'View System-wide Command Dashboard', group: 'DASHBOARD' },

    // WORKFLOWS - Identity Verification
    { slug: 'CASE_UPLOAD_DOCUMENT', name: 'Upload Customer Documents', group: 'WORKFLOWS' },
    { slug: 'CASE_SUBMIT', name: 'Submit New KYC Case', group: 'WORKFLOWS' },
    { slug: 'CASE_VIEW_OWN', name: 'View Own Submissions', group: 'WORKFLOWS' },
    { slug: 'CASE_VIEW_OWN_HISTORY', name: 'View Own Case History', group: 'WORKFLOWS' },
    { slug: 'CASE_RESUBMIT', name: 'Resubmit Corrected Case', group: 'WORKFLOWS' },
    { slug: 'CASE_VIEW_ACTION_REQUIRED', name: 'View Amendment Requests', group: 'WORKFLOWS' },
    { slug: 'CASE_RESPOND_AMENDMENT', name: 'Respond to Amendment Requests', group: 'WORKFLOWS' },
    { slug: 'CASE_VIEW_BRANCH', name: 'View All Branch Cases', group: 'WORKFLOWS' },
    { slug: 'CASE_VIEW_BRANCH_METRICS', name: 'View Branch Metrics', group: 'WORKFLOWS' },
    { slug: 'CASE_APPROVE_BRANCH_LEVEL', name: 'Approve at Branch Level', group: 'WORKFLOWS' },
    { slug: 'KYC_VIEW_QUEUE', name: 'View Review Queue', group: 'WORKFLOWS' },
    { slug: 'KYC_VERIFY_CHECKLIST', name: 'Perform Checklist Verification', group: 'WORKFLOWS' },
    { slug: 'KYC_REQUEST_AMENDMENT', name: 'Request Case Amendments', group: 'WORKFLOWS' },
    { slug: 'KYC_APPROVE_STANDARD', name: 'Approve Standard Cases', group: 'WORKFLOWS' },
    { slug: 'KYC_VIEW_RESUBMITTED', name: 'View Resubmitted Queue', group: 'WORKFLOWS' },
    { slug: 'KYC_PROCESS_RESUBMITTED', name: 'Process Resubmitted Cases', group: 'WORKFLOWS' },
    { slug: 'VIEW_ESCALATED_CASES', name: 'View Escalation Queue', group: 'WORKFLOWS' },
    { slug: 'ESCALATE_TO_SENIOR', name: 'Escalate to Senior', group: 'WORKFLOWS' },
    { slug: 'APPROVE_ESCALATED_CASE', name: 'Approve Escalated Case', group: 'WORKFLOWS' },
    { slug: 'REJECT_ESCALATED_CASE', name: 'Reject Escalated Case', group: 'WORKFLOWS' },
    { slug: 'TRIGGER_GOVERNANCE_FLOW', name: 'Trigger Exceptional Flow', group: 'WORKFLOWS' },
    { slug: 'VIEW_GOVERNANCE_QUEUE', name: 'View Exceptional Queue', group: 'WORKFLOWS' },
    { slug: 'APPROVE_GOVERNANCE_LEVEL', name: 'Approve Governance Node', group: 'WORKFLOWS' },
    { slug: 'REJECT_GOVERNANCE_LEVEL', name: 'Reject Governance Node', group: 'WORKFLOWS' },
    { slug: 'UPLOAD_AUTHORIZATION_MEMO', name: 'Upload Institutional Memo', group: 'WORKFLOWS' },
    { slug: 'VIEW_PREVIOUS_GOVERNANCE_DECISIONS', name: 'View Governance History', group: 'WORKFLOWS' },
    { slug: 'VIEW_ARCHIVED_CASE', name: 'View Master Archive', group: 'WORKFLOWS' },
    { slug: 'EXPORT_CASE_ZIP', name: 'Export Case Zip', group: 'WORKFLOWS' },

    // REFERENCE
    { slug: 'VIEW_FQ_LIBRARY', name: 'View F&Q Library', group: 'REFERENCE' },
    { slug: 'CREATE_FQ_ENTRY', name: 'Create F&Q Entry', group: 'REFERENCE' },
    { slug: 'EDIT_FQ_ENTRY', name: 'Edit F&Q Entry', group: 'REFERENCE' },
    { slug: 'DELETE_FQ_ENTRY', name: 'Deactivate F&Q Entry', group: 'REFERENCE' },

    // REPORTING
    { slug: 'REPORT_VIEW_SYSTEM', name: 'View System-wide Reports', group: 'REPORTING' },
    { slug: 'REPORT_EXPORT_SYSTEM', name: 'Export System-wide Reports', group: 'REPORTING' },
    { slug: 'REPORT_VIEW_DISTRICT', name: 'View District Command', group: 'REPORTING' },
    { slug: 'REPORT_EXPORT_DISTRICT', name: 'Export District Reports', group: 'REPORTING' },
    { slug: 'VIEW_SPECIALIST_PRODUCTIVITY', name: 'View Specialist Matrix', group: 'REPORTING' },
    { slug: 'VIEW_SLA_METRICS', name: 'View SLA Metrics', group: 'REPORTING' },
    { slug: 'VIEW_ACCURACY_INDEX', name: 'View Accuracy Index', group: 'REPORTING' },
    { slug: 'EXPORT_ANALYTICS', name: 'Export Analytics', group: 'REPORTING' },
    { slug: 'ACCESS_RANDOM_SAMPLING', name: 'Access Random Sampling', group: 'REPORTING' },
    { slug: 'ASSIGN_AUDIT_CASE', name: 'Assign Audit Cases', group: 'REPORTING' },
    { slug: 'LOG_AUDIT_DISCREPANCY', name: 'Log Audit Discrepancy', group: 'REPORTING' },
    { slug: 'SCORE_BRANCH', name: 'Score Branch Performance', group: 'REPORTING' },
    { slug: 'CLOSE_AUDIT_CASE', name: 'Conclude Audit Session', group: 'REPORTING' },
    { slug: 'VIEW_AUDIT_POOL', name: 'View Audit Pool', group: 'REPORTING' },
    { slug: 'VIEW_AUDIT_LOGS', name: 'View Audit Logs', group: 'REPORTING' },
    { slug: 'EXPORT_AUDIT_LOGS', name: 'Export Audit Logs', group: 'REPORTING' },
    { slug: 'VIEW_IP_ACTIVITY', name: 'View IP Activity', group: 'REPORTING' },
    { slug: 'VIEW_STATUS_TRANSITIONS', name: 'View Lifecycle History', group: 'REPORTING' },
    { slug: 'BULK_EXPORT_CASES', name: 'Bulk Export Cases', group: 'REPORTING' },
    { slug: 'GENERATE_REGULATORY_PACKAGE', name: 'Generate NBE Package', group: 'REPORTING' },
    { slug: 'DOWNLOAD_MASTER_ARCHIVE', name: 'Download Master Archive', group: 'REPORTING' },

    // SYSTEM
    { slug: 'USER_CREATE', name: 'Provision New Users', group: 'SYSTEM' },
    { slug: 'USER_EDIT', name: 'Edit Personnel Profiles', group: 'SYSTEM' },
    { slug: 'USER_DEACTIVATE', name: 'Deactivate Users', group: 'SYSTEM' },
    { slug: 'USER_ASSIGN_ROLE', name: 'Map Users to Roles', group: 'SYSTEM' },
    { slug: 'USER_RESET_PASSWORD', name: 'Force Password Resets', group: 'SYSTEM' },
    { slug: 'ROLE_CREATE', name: 'Define New Role', group: 'SYSTEM' },
    { slug: 'ROLE_EDIT', name: 'Modify Role Definitions', group: 'SYSTEM' },
    { slug: 'MANAGE_PERMISSION_MATRIX', name: 'Manage Permission Matrix', group: 'SYSTEM' },
    { slug: 'MANAGE_DISTRICTS', name: 'Configure Districts', group: 'SYSTEM' },
    { slug: 'MANAGE_BRANCHES', name: 'Manage Branches', group: 'SYSTEM' },
    { slug: 'MAP_USERS_TO_BRANCH', name: 'Link Users to Nodes', group: 'SYSTEM' },
    { slug: 'CONFIG_GOVERNANCE_STRUCTURE', name: 'Configure Governance Hierarchy', group: 'SYSTEM' },
    { slug: 'EDIT_APPROVAL_SEQUENCE', name: 'Define Approval Nodes', group: 'SYSTEM' },
    { slug: 'EDIT_SLA_POLICY', name: 'Modify Institutional SLA', group: 'SYSTEM' },
    { slug: 'EDIT_SAMPLING_PERCENTAGE', name: 'Set Audit Sampling Ratio', group: 'SYSTEM' },
    { slug: 'CONFIG_RISK_RULES', name: 'Manage Risk Classifications', group: 'SYSTEM' },
    { slug: 'ENABLE_GOVERNANCE_FLOW', name: 'Toggle Exceptional Workflows', group: 'SYSTEM' },
    { slug: 'SYSTEM_EXPORT_CONFIG', name: 'Manage Export Settings', group: 'SYSTEM' },
    { slug: 'VIEW_SYSTEM_AUDIT', name: 'View Master Audit Log', group: 'SYSTEM' },
    { slug: 'EXPORT_SYSTEM_AUDIT', name: 'Export System Audit', group: 'SYSTEM' },
  ];

  const dbPermissions = [];

  // 1. Clear existing or upsert permissions
  for (const p of permissions) {
    const perm = await prisma.permission.upsert({
      where: { slug: p.slug },
      update: { name: p.name, group: p.group },
      create: p,
    });
    dbPermissions.push(perm);
  }

  // 2. Ensure SUPER_ADMIN role exists and has ALL permissions linked
  const superAdminRole = await prisma.role.upsert({
    where: { name: 'SUPER_ADMIN' },
    update: { description: 'Master Institutional Control', active: true },
    create: { name: 'SUPER_ADMIN', description: 'Master Institutional Control' }
  });

  await prisma.rolePermission.deleteMany({ where: { roleId: superAdminRole.id } });
  await prisma.rolePermission.createMany({
    data: dbPermissions.map(p => ({ roleId: superAdminRole.id, permissionId: p.id }))
  });

  revalidatePath('/admin/roles');
  return { success: true };
}

export async function getRoleDefinitions() {
  return await prisma.role.findMany({
    where: { active: true },
    include: { 
      permissions: { 
        include: { 
          permission: true 
        } 
      } 
    },
    orderBy: { name: 'asc' }
  });
}

export async function getAllPermissions() {
  return await prisma.permission.findMany({
    orderBy: [{ group: 'asc' }, { name: 'asc' }]
  });
}

export async function upsertRole(data: { id?: string, name: string, description: string, permissionIds: string[] }) {
  try {
    const role = await prisma.$transaction(async (tx) => {
      const r = await tx.role.upsert({
        where: { id: data.id || 'new' },
        update: { name: data.name, description: data.description },
        create: { name: data.name, description: data.description }
      });

      await tx.rolePermission.deleteMany({ where: { roleId: r.id } });
      await tx.rolePermission.createMany({
        data: data.permissionIds.map(pid => ({ roleId: r.id, permissionId: pid }))
      });

      return r;
    });

    revalidatePath('/admin/roles');
    return { success: true, role };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}

export async function deactivateRole(id: string) {
  await prisma.role.update({
    where: { id },
    data: { active: false }
  });
  revalidatePath('/admin/roles');
}
