'use server';

import { prisma } from '@/lib/prisma';
import { MappingType } from '@prisma/client';
import { revalidatePath } from 'next/cache';
import { getServerSession, verifyPermission } from './auth-server';
import { createAuditLog } from './audit';
import { normalizeBranchName } from '@/lib/jurisdiction';
import { logInstitutionalError } from '@/lib/logger';

const MAPPING_PERMISSION = 'MAP_USERS_TO_BRANCH';

/**
 * Resolves the acting user for guards + audit attribution.
 * Throws when there is no session, or (for mutations) when the permission is missing.
 */
type MappingActor = { id: string; email: string; name: string };
type ActorResult = { actor: MappingActor } | { error: string };

async function requireMappingActor(mutate: boolean): Promise<ActorResult> {
  const session = await getServerSession();
  if (!session) return { error: 'Your session has expired. Please sign in again.' };

  if (mutate && !(await verifyPermission(MAPPING_PERMISSION))) {
    return { error: 'You do not have permission to manage branch mappings.' };
  }

  const profile = await prisma.user.findUnique({
    where: { id: session.id },
    select: { firstName: true, lastName: true },
  });

  return {
    actor: {
      id: session.id,
      email: session.email,
      name: profile ? `${profile.firstName} ${profile.lastName}`.trim() : session.email,
    },
  };
}

/**
 * Recomputes the derived `assignedBranches` CSV cache for the given users.
 * The CSV is the union of branch names from each user's ACTIVE mappings, so
 * the existing case-routing logic (jurisdiction / queue filters) keeps working
 * unchanged while BranchMapping remains the management source of truth.
 */
export async function recomputeAssignedBranches(userIds: string[]) {
  const uniqueIds = Array.from(new Set(userIds.filter(Boolean)));
  if (uniqueIds.length === 0) return;

  await Promise.all(
    uniqueIds.map(async (userId) => {
      const memberships = await prisma.branchMappingOfficer.findMany({
        where: { userId, mapping: { active: true } },
        select: { mapping: { select: { branch: { select: { name: true } } } } },
      });

      const branches = Array.from(
        new Set(
          memberships
            .map((m) => normalizeBranchName(m.mapping.branch?.name))
            .filter(Boolean),
        ),
      );

      await prisma.user.update({
        where: { id: userId },
        data: { assignedBranches: branches.join(','), updatedAt: new Date() },
      });
    }),
  );
}

const mappingInclude = {
  branch: { include: { district: true } },
  officers: {
    include: {
      user: {
        select: { id: true, firstName: true, lastName: true, email: true, status: true },
      },
    },
  },
} as const;

/** View access: any authenticated user may read mappings (UI renders read-only without permission). */
export async function getBranchMappings() {
  const session = await getServerSession();
  if (!session) return [];

  try {
    const mappings = await prisma.branchMapping.findMany({
      include: mappingInclude,
      orderBy: [{ active: 'desc' }, { type: 'asc' }, { createdAt: 'desc' }],
    });

    return mappings.map((m) => ({
      id: m.id,
      branchId: m.branchId,
      branchName: m.branch?.name ?? '',
      districtName: m.branch?.district?.name ?? '',
      type: m.type,
      active: m.active,
      note: m.note,
      createdAt: m.createdAt,
      updatedAt: m.updatedAt,
      officers: m.officers
        .slice()
        .sort((a, b) => Number(b.isPrimary) - Number(a.isPrimary))
        .map((o) => ({
          id: o.user.id,
          name: `${o.user.firstName} ${o.user.lastName}`.trim(),
          email: o.user.email,
          status: o.user.status,
          isPrimary: o.isPrimary,
        })),
    }));
  } catch (error) {
    logInstitutionalError(error, 'DB_GET_BRANCH_MAPPINGS');
    return [];
  }
}

/** Returns the active KYC officers mapped to a given branch, primary officer first. */
export async function getBranchOfficers(branchId: string) {
  const session = await getServerSession();
  if (!session || !branchId) return [];

  try {
    const mappings = await prisma.branchMapping.findMany({
      where: { branchId, active: true },
      include: {
        officers: {
          include: {
            user: { select: { id: true, firstName: true, lastName: true, email: true, status: true } },
          },
        },
      },
    });

    // BUSINESS RULE: the PERMANENT officer owns the branch and always has first
    // priority. The TEMPORARY officer is absence coverage only — they become the
    // acting officer solely when the permanent primary is absent (account not
    // ACTIVE) or no active permanent mapping exists.
    const permanentPrimary = mappings
      .find((m) => m.type === 'PERMANENT')
      ?.officers.find((o) => o.isPrimary);
    const permanentAvailable = !!permanentPrimary && permanentPrimary.user.status === 'ACTIVE';
    mappings.sort((a, b) => {
      if (a.type === b.type) return 0;
      const first = permanentAvailable ? 'PERMANENT' : 'TEMPORARY';
      return a.type === first ? -1 : 1;
    });

    const seen = new Set<string>();
    const officers: { id: string; name: string; email: string; isPrimary: boolean }[] = [];

    for (const mapping of mappings) {
      for (const o of mapping.officers) {
        if (!seen.has(o.user.id)) {
          seen.add(o.user.id);
          officers.push({
            id: o.user.id,
            name: `${o.user.firstName} ${o.user.lastName}`.trim(),
            email: o.user.email,
            isPrimary: o.isPrimary,
          });
        }
      }
    }

    return officers.sort((a, b) => Number(b.isPrimary) - Number(a.isPrimary));
  } catch (error) {
    logInstitutionalError(error, 'DB_GET_BRANCH_OFFICERS');
    return [];
  }
}

export async function createMapping(input: {
  branchIds: string[];
  type?: MappingType;
  primaryOfficerId: string;
  additionalOfficerIds?: string[];
  note?: string;
}) {
  const auth = await requireMappingActor(true);
  if ('error' in auth) return auth;
  const actor = auth.actor;
  const type = input.type ?? 'PERMANENT';

  const branchIds = Array.from(new Set((input.branchIds ?? []).filter(Boolean)));
  if (branchIds.length === 0) return { error: 'Please select at least one branch.' };
  if (!input.primaryOfficerId) return { error: 'Please select an assigned KYC officer.' };

  try {
    const branches = await prisma.branch.findMany({
      where: { id: { in: branchIds } },
      select: { id: true, name: true },
    });
    const branchById = new Map(branches.map((b) => [b.id, b.name]));

    const additional = (input.additionalOfficerIds ?? []).filter(
      (id) => id && id !== input.primaryOfficerId,
    );
    const officerIds = Array.from(new Set([input.primaryOfficerId, ...additional]));

    const created: string[] = [];
    const skipped: string[] = [];

    for (const branchId of branchIds) {
      const branchName = branchById.get(branchId);
      if (!branchName) {
        skipped.push(branchId);
        continue;
      }

      // A branch may have at most one PERMANENT and one TEMPORARY mapping
      // (edit the existing one instead of recreating it).
      const existingSameType = await prisma.branchMapping.findFirst({
        where: { branchId, type },
        select: { id: true },
      });
      if (existingSameType) {
        skipped.push(branchName);
        continue;
      }

      // Prevent duplicate mappings: the same branch must not be assigned to the
      // same KYC officer twice (e.g. as both permanent and temporary primary).
      const duplicateOfficer = await prisma.branchMapping.findFirst({
        where: {
          branchId,
          active: true,
          officers: { some: { userId: input.primaryOfficerId, isPrimary: true } },
        },
        select: { id: true },
      });
      if (duplicateOfficer) {
        skipped.push(branchName);
        continue;
      }

      await prisma.branchMapping.create({
        data: {
          branchId,
          type,
          note: input.note?.trim() || null,
          createdById: actor.id,
          officers: {
            create: officerIds.map((userId) => ({
              userId,
              isPrimary: userId === input.primaryOfficerId,
            })),
          },
        },
      });
      created.push(branchName);
    }

    if (created.length === 0) {
      return {
        error: `All selected branches already have a ${type.toLowerCase()} mapping, or are already assigned to this officer. Edit the existing mapping instead.`,
      };
    }

    await recomputeAssignedBranches(officerIds);
    await createAuditLog({
      userId: actor.id,
      userEmail: actor.email,
      userName: actor.name,
      action: 'BRANCH_MAPPING_CREATE',
      details: `Created ${type} mapping for ${created.length} branch(es) [${created.join(', ')}] with ${officerIds.length} officer(s).`,
    });

    // Revalidate all relevant paths to update UI immediately
    revalidatePath('/');
    revalidatePath('/submissions');
    revalidatePath('/submissions/queue');
    revalidatePath('/submissions/my');
    revalidatePath('/submissions/amendments');
    revalidatePath('/submissions/escalated');
    revalidatePath('/submissions/exceptional');
    revalidatePath('/submissions/branch-node');
    revalidatePath('/submissions/district-node');
    revalidatePath('/admin/storage');
    revalidatePath('/admin/assignments');
    return { created, skipped };
  } catch (error: any) {
    logInstitutionalError(error, 'DB_CREATE_MAPPING');
    return { error: 'Something went wrong while creating the mapping. Please try again.' };
  }
}

export async function updateMapping(
  id: string,
  input: { type?: MappingType; note?: string | null },
) {
  const auth = await requireMappingActor(true);
  if ('error' in auth) return auth;
  const actor = auth.actor;

  try {
    const current = await prisma.branchMapping.findUnique({
      where: { id },
      include: { branch: { select: { name: true } } },
    });
    if (!current) return { error: 'That mapping no longer exists. It may have been deleted.' };

    // Prevent creating a second mapping of the same type on a branch via type change.
    if (input.type && input.type !== current.type) {
      const existing = await prisma.branchMapping.findFirst({
        where: { branchId: current.branchId, type: input.type, id: { not: id } },
        select: { id: true },
      });
      if (existing) {
        return { error: `"${current.branch?.name}" already has a ${input.type.toLowerCase()} mapping.` };
      }
    }

    await prisma.branchMapping.update({
      where: { id },
      data: {
        type: input.type ?? undefined,
        note: input.note === undefined ? undefined : input.note?.trim() || null,
      },
    });

    await createAuditLog({
      userId: actor.id,
      userEmail: actor.email,
      userName: actor.name,
      action: 'BRANCH_MAPPING_UPDATE',
      details: `Edited mapping for branch "${current.branch?.name}".`,
    });

    // Revalidate all relevant paths to update UI immediately
    revalidatePath('/');
    revalidatePath('/submissions');
    revalidatePath('/submissions/queue');
    revalidatePath('/submissions/my');
    revalidatePath('/submissions/amendments');
    revalidatePath('/submissions/escalated');
    revalidatePath('/submissions/exceptional');
    revalidatePath('/submissions/branch-node');
    revalidatePath('/submissions/district-node');
    revalidatePath('/admin/storage');
    revalidatePath('/admin/assignments');
    return { ok: true };
  } catch (error: any) {
    logInstitutionalError(error, 'DB_UPDATE_MAPPING');
    return { error: 'Something went wrong while updating the mapping. Please try again.' };
  }
}

export async function setMappingActive(id: string, active: boolean) {
  const auth = await requireMappingActor(true);
  if ('error' in auth) return auth;
  const actor = auth.actor;

  try {
    const mapping = await prisma.branchMapping.update({
      where: { id },
      data: { active },
      include: { branch: { select: { name: true } }, officers: { select: { userId: true } } },
    });

    await recomputeAssignedBranches(mapping.officers.map((o) => o.userId));
    await createAuditLog({
      userId: actor.id,
      userEmail: actor.email,
      userName: actor.name,
      action: active ? 'BRANCH_MAPPING_ACTIVATE' : 'BRANCH_MAPPING_DEACTIVATE',
      details: `${active ? 'Activated' : 'Deactivated'} mapping for branch "${mapping.branch?.name}".`,
    });

    // Revalidate all relevant paths to update UI immediately
    revalidatePath('/');
    revalidatePath('/submissions');
    revalidatePath('/submissions/queue');
    revalidatePath('/submissions/my');
    revalidatePath('/submissions/amendments');
    revalidatePath('/submissions/escalated');
    revalidatePath('/submissions/exceptional');
    revalidatePath('/submissions/branch-node');
    revalidatePath('/submissions/district-node');
    revalidatePath('/admin/storage');
    revalidatePath('/admin/assignments');
    return { ok: true };
  } catch (error: any) {
    logInstitutionalError(error, 'DB_TOGGLE_MAPPING');
    return { error: 'Something went wrong while changing the mapping status. Please try again.' };
  }
}

/** Bulk activate/deactivate several mappings at once (used by the officer-level toggle). */
export async function setMappingsActive(ids: string[], active: boolean) {
  const auth = await requireMappingActor(true);
  if ('error' in auth) return auth;
  const actor = auth.actor;
  const mappingIds = Array.from(new Set((ids ?? []).filter(Boolean)));
  if (mappingIds.length === 0) return { ok: true };

  try {
    const mappings = await prisma.branchMapping.findMany({
      where: { id: { in: mappingIds } },
      select: { officers: { select: { userId: true } } },
    });

    await prisma.branchMapping.updateMany({
      where: { id: { in: mappingIds } },
      data: { active },
    });

    const affected = Array.from(new Set(mappings.flatMap((m) => m.officers.map((o) => o.userId))));
    await recomputeAssignedBranches(affected);

    await createAuditLog({
      userId: actor.id,
      userEmail: actor.email,
      userName: actor.name,
      action: active ? 'BRANCH_MAPPING_BULK_ACTIVATE' : 'BRANCH_MAPPING_BULK_DEACTIVATE',
      details: `${active ? 'Activated' : 'Deactivated'} ${mappingIds.length} mapping(s) in bulk.`,
    });

    // Revalidate all relevant paths to update UI immediately
    revalidatePath('/');
    revalidatePath('/submissions');
    revalidatePath('/submissions/queue');
    revalidatePath('/submissions/my');
    revalidatePath('/submissions/amendments');
    revalidatePath('/submissions/escalated');
    revalidatePath('/submissions/exceptional');
    revalidatePath('/submissions/branch-node');
    revalidatePath('/submissions/district-node');
    revalidatePath('/admin/storage');
    revalidatePath('/admin/assignments');
    return { ok: true };
  } catch (error: any) {
    logInstitutionalError(error, 'DB_BULK_TOGGLE_MAPPING');
    return { error: 'Something went wrong while changing mappings in bulk. Please try again.' };
  }
}

/**
 * Saturday Configuration: enable/disable all-branch case visibility for an officer
 * on Saturdays. Independent of their normal branch mappings (does not change them).
 */
export async function setSaturdayVisibility(userId: string, enabled: boolean) {
  const auth = await requireMappingActor(true);
  if ('error' in auth) return auth;
  const actor = auth.actor;
  if (!userId) return { error: 'Please select an officer.' };

  try {
    const target = await prisma.user.update({
      where: { id: userId },
      data: { saturdayAllBranches: enabled },
      select: { firstName: true, lastName: true },
    });

    await createAuditLog({
      userId: actor.id,
      userEmail: actor.email,
      userName: actor.name,
      action: enabled ? 'SATURDAY_VISIBILITY_ENABLE' : 'SATURDAY_VISIBILITY_DISABLE',
      details: `${enabled ? 'Enabled' : 'Disabled'} Saturday all-branch visibility for ${target.firstName} ${target.lastName}.`,
      severity: 'MEDIUM',
    });

    // Revalidate all relevant paths to update UI immediately
    revalidatePath('/');
    revalidatePath('/submissions');
    revalidatePath('/submissions/queue');
    revalidatePath('/submissions/my');
    revalidatePath('/submissions/amendments');
    revalidatePath('/submissions/escalated');
    revalidatePath('/submissions/exceptional');
    revalidatePath('/submissions/branch-node');
    revalidatePath('/submissions/district-node');
    revalidatePath('/admin/storage');
    revalidatePath('/admin/assignments');
    return { ok: true };
  } catch (error: any) {
    logInstitutionalError(error, 'DB_SET_SATURDAY_VISIBILITY');
    return { error: 'Something went wrong while updating Saturday visibility. Please try again.' };
  }
}

export async function setAllSaturdayVisibility(userIds: string[], enabled: boolean) {
  const auth = await requireMappingActor(true);
  if ('error' in auth) return auth;
  const actor = auth.actor;
  if (!userIds || userIds.length === 0) return { error: 'Please select at least one officer.' };

  try {
    await prisma.user.updateMany({
      where: { id: { in: userIds } },
      data: { saturdayAllBranches: enabled },
    });

    await createAuditLog({
      userId: actor.id,
      userEmail: actor.email,
      userName: actor.name,
      action: enabled ? 'SATURDAY_VISIBILITY_ENABLE_ALL' : 'SATURDAY_VISIBILITY_DISABLE_ALL',
      details: `${enabled ? 'Enabled' : 'Disabled'} Saturday all-branch visibility for ${userIds.length} officer(s).`,
      severity: 'HIGH',
    });

    // Revalidate all relevant paths to update UI immediately
    revalidatePath('/');
    revalidatePath('/submissions');
    revalidatePath('/submissions/queue');
    revalidatePath('/submissions/my');
    revalidatePath('/submissions/amendments');
    revalidatePath('/submissions/escalated');
    revalidatePath('/submissions/exceptional');
    revalidatePath('/submissions/branch-node');
    revalidatePath('/submissions/district-node');
    revalidatePath('/admin/storage');
    revalidatePath('/admin/assignments');
    return { ok: true };
  } catch (error: any) {
    logInstitutionalError(error, 'DB_SET_ALL_SATURDAY_VISIBILITY');
    return { error: 'Something went wrong while updating Saturday visibility for all officers. Please try again.' };
  }
}

export async function setLateHourVisibility(userId: string, enabled: boolean) {
  const auth = await requireMappingActor(true);
  if ('error' in auth) return auth;
  const actor = auth.actor;
  if (!userId) return { error: 'Please select an officer.' };

  try {
    const target = await prisma.user.update({
      where: { id: userId },
      data: { lateHourAllBranches: enabled },
      select: { firstName: true, lastName: true },
    });

    await createAuditLog({
      userId: actor.id,
      userEmail: actor.email,
      userName: actor.name,
      action: enabled ? 'LATE_HOUR_VISIBILITY_ENABLE' : 'LATE_HOUR_VISIBILITY_DISABLE',
      details: `${enabled ? 'Enabled' : 'Disabled'} Late Hour all-branch visibility for ${target.firstName} ${target.lastName}.`,
      severity: 'MEDIUM',
    });

    // Revalidate all relevant paths to update UI immediately
    revalidatePath('/');
    revalidatePath('/submissions');
    revalidatePath('/submissions/queue');
    revalidatePath('/submissions/my');
    revalidatePath('/submissions/amendments');
    revalidatePath('/submissions/escalated');
    revalidatePath('/submissions/exceptional');
    revalidatePath('/submissions/branch-node');
    revalidatePath('/submissions/district-node');
    revalidatePath('/admin/storage');
    revalidatePath('/admin/assignments');
    return { ok: true };
  } catch (error: any) {
    logInstitutionalError(error, 'DB_SET_LATE_HOUR_VISIBILITY');
    return { error: 'Something went wrong while updating Late Hour visibility. Please try again.' };
  }
}

export async function setAllLateHourVisibility(userIds: string[], enabled: boolean) {
  const auth = await requireMappingActor(true);
  if ('error' in auth) return auth;
  const actor = auth.actor;
  if (!userIds || userIds.length === 0) return { error: 'Please select at least one officer.' };

  try {
    await prisma.user.updateMany({
      where: { id: { in: userIds } },
      data: { lateHourAllBranches: enabled },
    });

    await createAuditLog({
      userId: actor.id,
      userEmail: actor.email,
      userName: actor.name,
      action: enabled ? 'LATE_HOUR_VISIBILITY_ENABLE_ALL' : 'LATE_HOUR_VISIBILITY_DISABLE_ALL',
      details: `${enabled ? 'Enabled' : 'Disabled'} Late Hour all-branch visibility for ${userIds.length} officer(s).`,
      severity: 'HIGH',
    });

    // Revalidate all relevant paths to update UI immediately
    revalidatePath('/');
    revalidatePath('/submissions');
    revalidatePath('/submissions/queue');
    revalidatePath('/submissions/my');
    revalidatePath('/submissions/amendments');
    revalidatePath('/submissions/escalated');
    revalidatePath('/submissions/exceptional');
    revalidatePath('/submissions/branch-node');
    revalidatePath('/submissions/district-node');
    revalidatePath('/admin/storage');
    revalidatePath('/admin/assignments');
    return { ok: true };
  } catch (error: any) {
    logInstitutionalError(error, 'DB_SET_ALL_LATE_HOUR_VISIBILITY');
    return { error: 'Something went wrong while updating Late Hour visibility for all officers. Please try again.' };
  }
}

export async function setLunchBreakVisibility(userId: string, enabled: boolean) {
  const auth = await requireMappingActor(true);
  if ('error' in auth) return auth;
  const actor = auth.actor;
  if (!userId) return { error: 'Please select an officer.' };

  try {
    const target = await prisma.user.update({
      where: { id: userId },
      data: { lunchBreakAllBranches: enabled },
      select: { firstName: true, lastName: true },
    });

    await createAuditLog({
      userId: actor.id,
      userEmail: actor.email,
      userName: actor.name,
      action: enabled ? 'LUNCH_BREAK_VISIBILITY_ENABLE' : 'LUNCH_BREAK_VISIBILITY_DISABLE',
      details: `${enabled ? 'Enabled' : 'Disabled'} Lunch Break all-branch visibility for ${target.firstName} ${target.lastName}.`,
      severity: 'MEDIUM',
    });

    // Revalidate all relevant paths to update UI immediately
    revalidatePath('/');
    revalidatePath('/submissions');
    revalidatePath('/submissions/queue');
    revalidatePath('/submissions/my');
    revalidatePath('/submissions/amendments');
    revalidatePath('/submissions/escalated');
    revalidatePath('/submissions/exceptional');
    revalidatePath('/submissions/branch-node');
    revalidatePath('/submissions/district-node');
    revalidatePath('/admin/storage');
    revalidatePath('/admin/assignments');
    return { ok: true };
  } catch (error: any) {
    logInstitutionalError(error, 'DB_SET_LUNCH_BREAK_VISIBILITY');
    return { error: 'Something went wrong while updating Lunch Break visibility. Please try again.' };
  }
}

export async function setAllLunchBreakVisibility(userIds: string[], enabled: boolean) {
  const auth = await requireMappingActor(true);
  if ('error' in auth) return auth;
  const actor = auth.actor;
  if (!userIds || userIds.length === 0) return { error: 'Please select at least one officer.' };

  try {
    await prisma.user.updateMany({
      where: { id: { in: userIds } },
      data: { lunchBreakAllBranches: enabled },
    });

    await createAuditLog({
      userId: actor.id,
      userEmail: actor.email,
      userName: actor.name,
      action: enabled ? 'LUNCH_BREAK_VISIBILITY_ENABLE_ALL' : 'LUNCH_BREAK_VISIBILITY_DISABLE_ALL',
      details: `${enabled ? 'Enabled' : 'Disabled'} Lunch Break all-branch visibility for ${userIds.length} officer(s).`,
      severity: 'HIGH',
    });

    // Revalidate all relevant paths to update UI immediately
    revalidatePath('/');
    revalidatePath('/submissions');
    revalidatePath('/submissions/queue');
    revalidatePath('/submissions/my');
    revalidatePath('/submissions/amendments');
    revalidatePath('/submissions/escalated');
    revalidatePath('/submissions/exceptional');
    revalidatePath('/submissions/branch-node');
    revalidatePath('/submissions/district-node');
    revalidatePath('/admin/storage');
    revalidatePath('/admin/assignments');
    return { ok: true };
  } catch (error: any) {
    logInstitutionalError(error, 'DB_SET_ALL_LUNCH_BREAK_VISIBILITY');
    return { error: 'Something went wrong while updating Lunch Break visibility for all officers. Please try again.' };
  }
}

export async function deleteMapping(id: string) {
  const auth = await requireMappingActor(true);
  if ('error' in auth) return auth;
  const actor = auth.actor;

  try {
    const mapping = await prisma.branchMapping.findUnique({
      where: { id },
      include: { branch: { select: { name: true } }, officers: { select: { userId: true } } },
    });
    if (!mapping) return { error: 'That mapping no longer exists. It may have already been deleted.' };

    const affected = mapping.officers.map((o) => o.userId);
    await prisma.branchMapping.delete({ where: { id } });
    await recomputeAssignedBranches(affected);

    await createAuditLog({
      userId: actor.id,
      userEmail: actor.email,
      userName: actor.name,
      action: 'BRANCH_MAPPING_DELETE',
      details: `Deleted mapping for branch "${mapping.branch?.name}".`,
    });

    // Revalidate all relevant paths to update UI immediately
    revalidatePath('/');
    revalidatePath('/submissions');
    revalidatePath('/submissions/queue');
    revalidatePath('/submissions/my');
    revalidatePath('/submissions/amendments');
    revalidatePath('/submissions/escalated');
    revalidatePath('/submissions/exceptional');
    revalidatePath('/submissions/branch-node');
    revalidatePath('/submissions/district-node');
    revalidatePath('/admin/storage');
    revalidatePath('/admin/assignments');
    return { ok: true };
  } catch (error: any) {
    logInstitutionalError(error, 'DB_DELETE_MAPPING');
    return { error: 'Something went wrong while deleting the mapping. Please try again.' };
  }
}

export async function bulkDeleteMappings(ids: string[]) {
  const auth = await requireMappingActor(true);
  if ('error' in auth) return auth;
  const actor = auth.actor;
  const mappingIds = Array.from(new Set((ids ?? []).filter(Boolean)));
  if (mappingIds.length === 0) return { count: 0 };

  try {
    const mappings = await prisma.branchMapping.findMany({
      where: { id: { in: mappingIds } },
      include: { branch: { select: { name: true } }, officers: { select: { userId: true } } },
    });

    const affected = Array.from(new Set(mappings.flatMap((m) => m.officers.map((o) => o.userId))));
    await prisma.branchMapping.deleteMany({ where: { id: { in: mappingIds } } });
    await recomputeAssignedBranches(affected);

    await createAuditLog({
      userId: actor.id,
      userEmail: actor.email,
      userName: actor.name,
      action: 'BRANCH_MAPPING_BULK_DELETE',
      details: `Deleted ${mappings.length} mappings for branches: ${mappings.map((m) => m.branch?.name).join(', ')}.`,
    });

    // Revalidate all relevant paths to update UI immediately
    revalidatePath('/');
    revalidatePath('/submissions');
    revalidatePath('/submissions/queue');
    revalidatePath('/submissions/my');
    revalidatePath('/submissions/amendments');
    revalidatePath('/submissions/escalated');
    revalidatePath('/submissions/exceptional');
    revalidatePath('/submissions/branch-node');
    revalidatePath('/submissions/district-node');
    revalidatePath('/admin/storage');
    revalidatePath('/admin/assignments');
    return { count: mappings.length };
  } catch (error: any) {
    logInstitutionalError(error, 'DB_BULK_DELETE_MAPPINGS');
    return { error: 'Something went wrong while deleting mappings. Please try again.' };
  }
}

export async function setPrimaryOfficer(mappingId: string, userId: string) {
  const auth = await requireMappingActor(true);
  if ('error' in auth) return auth;
  const actor = auth.actor;

  try {
    const mapping = await prisma.branchMapping.findUnique({
      where: { id: mappingId },
      include: { branch: { select: { name: true } }, officers: true },
    });
    if (!mapping) return { error: 'That mapping no longer exists. It may have been deleted.' };

    const target = await prisma.user.findUnique({
      where: { id: userId },
      select: { firstName: true, lastName: true },
    });
    if (!target) return { error: 'That officer could not be found.' };

    const alreadyOfficer = mapping.officers.some((o) => o.userId === userId);

    await prisma.$transaction([
      // Demote the current primary.
      prisma.branchMappingOfficer.updateMany({
        where: { mappingId, isPrimary: true },
        data: { isPrimary: false },
      }),
      // Promote / add the new primary.
      prisma.branchMappingOfficer.upsert({
        where: { mappingId_userId: { mappingId, userId } },
        update: { isPrimary: true },
        create: { mappingId, userId, isPrimary: true },
      }),
    ]);

    const affected = Array.from(new Set([...mapping.officers.map((o) => o.userId), userId]));
    await recomputeAssignedBranches(affected);

    await createAuditLog({
      userId: actor.id,
      userEmail: actor.email,
      userName: actor.name,
      action: 'BRANCH_MAPPING_REASSIGN',
      details: `Set ${target.firstName} ${target.lastName} as assigned KYC officer for branch "${mapping.branch?.name}"${alreadyOfficer ? '' : ' (added to mapping)'}.`,
    });

    // Revalidate all relevant paths to update UI immediately
    revalidatePath('/');
    revalidatePath('/submissions');
    revalidatePath('/submissions/queue');
    revalidatePath('/submissions/my');
    revalidatePath('/submissions/amendments');
    revalidatePath('/submissions/escalated');
    revalidatePath('/submissions/exceptional');
    revalidatePath('/submissions/branch-node');
    revalidatePath('/submissions/district-node');
    revalidatePath('/admin/storage');
    revalidatePath('/admin/assignments');
    return { ok: true };
  } catch (error: any) {
    logInstitutionalError(error, 'DB_REASSIGN_MAPPING');
    return { error: 'Something went wrong while changing the assigned officer. Please try again.' };
  }
}

export async function addOfficers(mappingId: string, userIds: string[]) {
  const auth = await requireMappingActor(true);
  if ('error' in auth) return auth;
  const actor = auth.actor;
  const ids = Array.from(new Set((userIds ?? []).filter(Boolean)));
  if (ids.length === 0) return { error: 'Please select at least one officer to add.' };

  try {
    const mapping = await prisma.branchMapping.findUnique({
      where: { id: mappingId },
      include: { branch: { select: { name: true } } },
    });
    if (!mapping) return { error: 'That mapping no longer exists. It may have been deleted.' };

    await prisma.$transaction(
      ids.map((userId) =>
        prisma.branchMappingOfficer.upsert({
          where: { mappingId_userId: { mappingId, userId } },
          update: {},
          create: { mappingId, userId, isPrimary: false },
        }),
      ),
    );

    await recomputeAssignedBranches(ids);
    await createAuditLog({
      userId: actor.id,
      userEmail: actor.email,
      userName: actor.name,
      action: 'BRANCH_MAPPING_ADD_OFFICERS',
      details: `Added ${ids.length} additional officer(s) to branch "${mapping.branch?.name}".`,
    });

    // Revalidate all relevant paths to update UI immediately
    revalidatePath('/');
    revalidatePath('/submissions');
    revalidatePath('/submissions/queue');
    revalidatePath('/submissions/my');
    revalidatePath('/submissions/amendments');
    revalidatePath('/submissions/escalated');
    revalidatePath('/submissions/exceptional');
    revalidatePath('/submissions/branch-node');
    revalidatePath('/submissions/district-node');
    revalidatePath('/admin/storage');
    revalidatePath('/admin/assignments');
    return { ok: true };
  } catch (error: any) {
    logInstitutionalError(error, 'DB_ADD_MAPPING_OFFICERS');
    return { error: 'Something went wrong while adding officers. Please try again.' };
  }
}

export async function removeOfficer(mappingId: string, userId: string) {
  const auth = await requireMappingActor(true);
  if ('error' in auth) return auth;
  const actor = auth.actor;

  try {
    const mapping = await prisma.branchMapping.findUnique({
      where: { id: mappingId },
      include: { branch: { select: { name: true } }, officers: true },
    });
    if (!mapping) return { error: 'That mapping no longer exists. It may have been deleted.' };

    const target = mapping.officers.find((o) => o.userId === userId);
    if (!target) return { error: 'That officer is not part of this mapping.' };
    if (target.isPrimary) {
      return { error: 'You can’t remove the assigned KYC officer. Reassign the primary officer first.' };
    }

    await prisma.branchMappingOfficer.delete({
      where: { mappingId_userId: { mappingId, userId } },
    });

    await recomputeAssignedBranches([userId]);
    await createAuditLog({
      userId: actor.id,
      userEmail: actor.email,
      userName: actor.name,
      action: 'BRANCH_MAPPING_REMOVE_OFFICER',
      details: `Removed an additional officer from branch "${mapping.branch?.name}".`,
    });

    // Revalidate all relevant paths to update UI immediately
    revalidatePath('/');
    revalidatePath('/submissions');
    revalidatePath('/submissions/queue');
    revalidatePath('/submissions/my');
    revalidatePath('/submissions/amendments');
    revalidatePath('/submissions/escalated');
    revalidatePath('/submissions/exceptional');
    revalidatePath('/submissions/branch-node');
    revalidatePath('/submissions/district-node');
    revalidatePath('/admin/storage');
    revalidatePath('/admin/assignments');
    return { ok: true };
  } catch (error: any) {
    logInstitutionalError(error, 'DB_REMOVE_MAPPING_OFFICER');
    return { error: 'Something went wrong while removing the officer. Please try again.' };
  }
}

export async function reassignAllOfficerBranches(oldOfficerId: string, newOfficerId: string) {
  const auth = await requireMappingActor(true);
  if ('error' in auth) return auth;
  const actor = auth.actor;
  if (oldOfficerId === newOfficerId) return { error: 'The source and target officers must be different.' };

  try {
    const oldUser = await prisma.user.findUnique({ where: { id: oldOfficerId } });
    const newUser = await prisma.user.findUnique({ where: { id: newOfficerId } });
    if (!oldUser || !newUser) return { error: 'One of the selected officers could not be found.' };

    // Find all mappings where oldOfficer is present
    const mappings = await prisma.branchMapping.findMany({
      where: { officers: { some: { userId: oldOfficerId } } },
      include: { officers: true },
    });

    if (mappings.length === 0) return { count: 0 };

    await prisma.$transaction(async (tx) => {
      for (const mapping of mappings) {
        const oldEntry = mapping.officers.find((o) => o.userId === oldOfficerId)!;
        const newEntry = mapping.officers.find((o) => o.userId === newOfficerId);

        if (newEntry) {
          // New officer is already in this mapping.
          // If old was primary, make new primary.
          if (oldEntry.isPrimary) {
            await tx.branchMappingOfficer.update({
              where: { mappingId_userId: { mappingId: mapping.id, userId: newOfficerId } },
              data: { isPrimary: true },
            });
          }
          // Remove old officer
          await tx.branchMappingOfficer.delete({
            where: { mappingId_userId: { mappingId: mapping.id, userId: oldOfficerId } },
          });
        } else {
          // New officer is not in this mapping.
          // Replace old with new (same primary status).
          await tx.branchMappingOfficer.delete({
            where: { mappingId_userId: { mappingId: mapping.id, userId: oldOfficerId } },
          });
          await tx.branchMappingOfficer.create({
            data: {
              mappingId: mapping.id,
              userId: newOfficerId,
              isPrimary: oldEntry.isPrimary,
            },
          });
        }
      }
    });

    await recomputeAssignedBranches([oldOfficerId, newOfficerId]);

    await createAuditLog({
      userId: actor.id,
      userEmail: actor.email,
      userName: actor.name,
      action: 'BRANCH_MAPPING_MASS_REASSIGN',
      details: `Reassigned all ${mappings.length} branch mapping(s) from ${oldUser.firstName} ${oldUser.lastName} to ${newUser.firstName} ${newUser.lastName}.`,
    });

    // Revalidate all relevant paths to update UI immediately
    revalidatePath('/');
    revalidatePath('/submissions');
    revalidatePath('/submissions/queue');
    revalidatePath('/submissions/my');
    revalidatePath('/submissions/amendments');
    revalidatePath('/submissions/escalated');
    revalidatePath('/submissions/exceptional');
    revalidatePath('/submissions/branch-node');
    revalidatePath('/submissions/district-node');
    revalidatePath('/admin/storage');
    revalidatePath('/admin/assignments');
    return { count: mappings.length };
  } catch (error: any) {
    logInstitutionalError(error, 'DB_MASS_REASSIGN_MAPPINGS');
    return { error: 'Something went wrong during the mass reassignment. Please try again.' };
  }
}
