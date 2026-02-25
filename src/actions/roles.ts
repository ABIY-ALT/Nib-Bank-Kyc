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
    
    // WORKFLOWS - Monitoring
    { slug: 'CASE_VIEW_BRANCH', name: 'Access Branch Monitoring', group: 'MONITORING' },
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

  try {
    for (const p of permissions) {
      await prisma.permission.upsert({
        where: { slug: p.slug },
        update: { name: p.name, group: p.group },
        create: p,
      });
    }
    revalidatePath('/admin/roles');
    return { success: true };
  } catch (error) {
    console.error('[Institutional Framework] Seeding Error:', error);
    return { success: false };
  }
}

export async function getRoleDefinitions() {
  try {
    return await prisma.role.findMany({
      include: { 
        permissions: { 
          include: { 
            permission: true 
          } 
        } 
      },
      orderBy: { name: 'asc' }
    });
  } catch (e) {
    console.error('[Vault Roles] Fetch Error:', e);
    return [];
  }
}

export async function getAllPermissions() {
  try {
    return await prisma.permission.findMany({
      orderBy: [{ group: 'asc' }, { name: 'asc' }]
    });
  } catch (e) {
    console.error('[Permissions Registry] Fetch Error:', e);
    return [];
  }
}

export async function upsertRole(data: { id?: string, name: string, description: string, permissionIds: string[] }) {
  try {
    const existingByName = await prisma.role.findUnique({
      where: { name: data.name }
    });

    if (existingByName && (!data.id || existingByName.id !== data.id)) {
      return { 
        success: false, 
        error: `A role with the designation "${data.name}" already exists in the institutional registry.` 
      };
    }

    const role = await prisma.$transaction(async (tx) => {
      const r = await tx.role.upsert({
        where: { id: data.id || 'new-role-id' },
        update: { name: data.name, description: data.description },
        create: { name: data.name, description: data.description }
      });

      await tx.rolePermission.deleteMany({ where: { roleId: r.id } });
      
      if (data.permissionIds.length > 0) {
        await tx.rolePermission.createMany({
          data: data.permissionIds.map(pid => ({ roleId: r.id, permissionId: pid }))
        });
      }

      return r;
    });

    revalidatePath('/admin/roles');
    return { success: true, role };
  } catch (error: any) {
    console.error('[Vault Authority Upsert] Failure:', error);
    return { success: false, error: error.message || 'Institutional database fault during role commit.' };
  }
}

export async function toggleRoleStatus(id: string, currentStatus: boolean) {
  try {
    const role = await prisma.role.update({
      where: { id },
      data: { active: !currentStatus }
    });
    revalidatePath('/admin/roles');
    return { success: true, role };
  } catch (e) {
    console.error('[Vault Authority Toggle] Failure:', e);
    return { success: false };
  }
}
