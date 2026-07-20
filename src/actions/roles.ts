'use server';

import { prisma } from '@/lib/prisma';
import { revalidatePath } from 'next/cache';
import { createAuditLog } from './audit';
import { getServerSession } from './auth-server';
import { getSafeErrorMessage } from '@/lib/information-disclosure-prevention';

/**
 * Institutional Capability Registry.
 */
const SYSTEM_CAPABILITIES = [
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
  { slug: 'MANAGE_ESCALATIONS', name: 'Manage Escalated Cases', group: 'WORKFLOWS' },
  { slug: 'VIEW_GOVERNANCE_QUEUE', name: 'Access Exceptional Cases', group: 'WORKFLOWS' },
  { slug: 'TRIGGER_GOVERNANCE_FLOW', name: 'Trigger Exceptional Flow', group: 'WORKFLOWS' },
  { slug: 'CASE_FLAG_URGENT', name: 'Flag Case as Urgent', group: 'WORKFLOWS' },
  { slug: 'DISTRICT_DIRECTOR_REVIEW', name: 'District Director Review', group: 'WORKFLOWS' },
  { slug: 'KYC_DIRECTOR_APPROVAL', name: 'Branch Banking Director Approval', group: 'WORKFLOWS' },
  { slug: 'CHIEF_RETAIL_REVIEW', name: 'Chief Retail & SME Review', group: 'WORKFLOWS' },
  { slug: 'DIVISION_MANAGER_REVIEW', name: 'CDD Division Manager Review', group: 'WORKFLOWS' },
  { slug: 'SUPERVISOR_FORWARD', name: 'Supervisor Forward', group: 'WORKFLOWS' },
  { slug: 'KYC_OFFICER_PROCESS', name: 'KYC Officer Process', group: 'WORKFLOWS' },
  { slug: 'CREATE_GOVERNANCE_MEMO', name: 'Create Governance Memo', group: 'WORKFLOWS' },
  
  // MONITORING
  { slug: 'CASE_VIEW_BRANCH', name: 'Access Branch Monitoring', group: 'MONITORING' },
  { slug: 'DASHBOARD_VIEW_DISTRICT', name: 'Access District Monitoring', group: 'MONITORING' },
  
  // INFRASTRUCTURE
  { slug: 'MANAGE_VAULT_STORAGE', name: 'Manage Vault Storage', group: 'INFRASTRUCTURE' },
  { slug: 'PURGE_VAULT_STORAGE', name: 'Purge Vault Documents', group: 'INFRASTRUCTURE' },
  { slug: 'VIEW_ARCHIVED_CASE', name: 'Access Case Archive', group: 'INFRASTRUCTURE' },
  { slug: 'EXPORT_CASE_ZIP', name: 'Download Case Bundle', group: 'INFRASTRUCTURE' },

  // REFERENCE
  { slug: 'VIEW_FQ_LIBRARY', name: 'View F&Q Library', group: 'REFERENCE' },
  { slug: 'CREATE_FQ_ENTRY', name: 'Create F&Q Entry', group: 'REFERENCE' },
  
  // REPORTING
  { slug: 'VIEW_SPECIALIST_PRODUCTIVITY', name: 'View Ops Monitoring', group: 'REPORTING' },
  { slug: 'REPORT_VIEW_SYSTEM', name: 'View System-wide Reports', group: 'REPORTING' },
  { slug: 'VIEW_AUDIT_POOL', name: 'Access Follow-up Workspace', group: 'REPORTING' },
  { slug: 'VIEW_AUDIT_LOGS', name: 'View Follow-up Reports', group: 'REPORTING' },
  { slug: 'DOWNLOAD_MASTER_ARCHIVE', name: 'Download Master Archive', group: 'REPORTING' },

  // SYSTEM
  { slug: 'USER_CREATE', name: 'Manage User Access', group: 'SYSTEM' },
  { slug: 'ROLE_CREATE', name: 'Manage Assign Roles', group: 'SYSTEM' },
  { slug: 'MAP_USERS_TO_BRANCH', name: 'Manage Portfolio Mapping', group: 'SYSTEM' },
  { slug: 'MANAGE_BRANCHES', name: 'Manage Hierarchy', group: 'SYSTEM' },
  { slug: 'EDIT_SLA_POLICY', name: 'Modify System Configuration', group: 'SYSTEM' },
  { slug: 'VIEW_SYSTEM_AUDIT', name: 'View System Audit Logs', group: 'SYSTEM' },
];

/**
 * Silent Internal Provisioner.
 */
async function internalSeedPermissions() {
  try {
    await prisma.$transaction(async (tx) => {
      // Upsert current capabilities without pruning existing operational permissions.
      for (const p of SYSTEM_CAPABILITIES) {
        await tx.permission.upsert({
          where: { slug: p.slug },
          update: { name: p.name, group: p.group },
          create: p,
        });
      }

      // Ensure Super Admin always has all permissions.
      const superAdminRole = await tx.role.findUnique({ where: { name: 'SUPER_ADMIN' } });
      if (superAdminRole) {
        const allPerms = await tx.permission.findMany();
        
        // Only add missing ones instead of deleting everything
        const existingRPs = await tx.rolePermission.findMany({
          where: { roleId: superAdminRole.id },
          select: { permissionId: true }
        });
        const existingPermIds = new Set(existingRPs.map((rp: any) => rp.permissionId));
        
        const missingPerms = allPerms.filter((p: any) => !existingPermIds.has(p.id));
        
        if (missingPerms.length > 0) {
          await tx.rolePermission.createMany({
            data: missingPerms.map((p: any) => ({ roleId: superAdminRole.id, permissionId: p.id }))
          });
        }
      }
    }, {
      timeout: 30000 // Increase timeout for heavy operation
    });
    
    return true;
  } catch (error) {
    console.error('Permission Sync Error:', error);
    return false;
  }
}

export async function getAllPermissions() {
  const session = await getServerSession();
  if (!session) throw new Error('Unauthenticated');

  try {
    for (const p of SYSTEM_CAPABILITIES) {
      await prisma.permission.upsert({
        where: { slug: p.slug },
        update: { name: p.name, group: p.group },
        create: p,
      });
    }

    const permissions = await prisma.permission.findMany({
      orderBy: [{ group: 'asc' }, { name: 'asc' }]
    });

    return permissions;
  } catch (e) {
    return [];
  }
}

export async function getRoleDefinitions() {
  const session = await getServerSession();
  if (!session || session.role !== 'SUPER_ADMIN') throw new Error('Unauthorized');

  try {
    return await prisma.role.findMany({
      include: { permissions: { include: { permission: true } } },
      orderBy: { name: 'asc' }
    });
  } catch (e) {
    return [];
  }
}

export async function seedInstitutionalPermissions() {
  const session = await getServerSession();
  if (!session || session.role !== 'SUPER_ADMIN') {
    throw new Error('Unauthorized');
  }

  const success = await internalSeedPermissions();
  if (success) {
    await createAuditLog({
      userId: session.id,
      userEmail: session.email,
      action: 'PERMISSION_REGISTRY_SYNC',
      details: 'Master permission slugs synchronized.',
      severity: 'MEDIUM'
    });
    revalidatePath('/admin/roles');
    return { success: true };
  }
  return { success: false };
}

export async function upsertRole(data: { id?: string, name: string, description: string, permissionIds: string[] }) {
  const session = await getServerSession();
  if (!session || session.role !== 'SUPER_ADMIN') {
    throw new Error('Unauthorized');
  }

  try {
    const role = await prisma.$transaction(async (tx: any) => {
      const r = await (tx as any).role.upsert({
        where: { id: data.id || 'new-id' },
        update: { name: data.name, description: data.description, updatedAt: new Date() },
        create: { name: data.name, description: data.description }
      });

      await (tx as any).rolePermission.deleteMany({ where: { roleId: r.id } });
      if (data.permissionIds.length > 0) {
        await (tx as any).rolePermission.createMany({
          data: data.permissionIds.map(pid => ({ roleId: r.id, permissionId: pid }))
        });
      }

      // MANDATORY REVOCATION: Rotate update timestamps for all users with this role
      // This forces session version mismatch and re-authentication
      await (tx as any).user.updateMany({
        where: { roles: { some: { roleId: r.id } } },
        data: { updatedAt: new Date() }
      });

      return r;
    });

    await createAuditLog({
      userId: session.id,
      userEmail: session.email,
      action: 'ROLE_MODIFICATION',
      details: `Role "${data.name}" updated. Affected user sessions invalidated.`,
      severity: 'HIGH'
    });

    revalidatePath('/admin/roles');
    return { success: true, role };
  } catch (error: any) {
    // SECURITY: Use generic safe error message (A03:2021 - Information Disclosure)
    return { success: false, error: getSafeErrorMessage(error) };
  }
}

export async function toggleRoleStatus(id: string, currentStatus: boolean) {
  const session = await getServerSession();
  if (!session || session.role !== 'SUPER_ADMIN') throw new Error('Unauthorized');

  try {
    const role = await prisma.role.update({
      where: { id },
      data: { active: !currentStatus, updatedAt: new Date() }
    });

    // Revoke sessions for all users belonging to this role
    await prisma.user.updateMany({
      where: { roles: { some: { roleId: id } } },
      data: { updatedAt: new Date() }
    });

    revalidatePath('/admin/roles');
    return { success: true, role };
  } catch (e) {
    return { success: false };
  }
}
