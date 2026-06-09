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
async function requireMappingActor(mutate: boolean) {
  const session = await getServerSession();
  if (!session) throw new Error('Unauthorized');

  if (mutate && !(await verifyPermission(MAPPING_PERMISSION))) {
    throw new Error('Unauthorized: Branch Mapping Management permission required.');
  }

  const profile = await prisma.user.findUnique({
    where: { id: session.id },
    select: { firstName: true, lastName: true },
  });

  return {
    id: session.id,
    email: session.email,
    name: profile ? `${profile.firstName} ${profile.lastName}`.trim() : session.email,
  };
}

/**
 * Recomputes the derived `assignedBranches` CSV cache for the given users.
 * The CSV is the union of branch names from each user's ACTIVE mappings, so
 * the existing case-routing logic (jurisdiction / queue filters) keeps working
 * unchanged while BranchMapping remains the management source of truth.
 */
async function recomputeAssignedBranches(userIds: string[]) {
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
            user: { select: { id: true, firstName: true, lastName: true, email: true } },
          },
        },
      },
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
  const actor = await requireMappingActor(true);
  const type = input.type ?? 'PERMANENT';

  const branchIds = Array.from(new Set((input.branchIds ?? []).filter(Boolean)));
  if (branchIds.length === 0) throw new Error('At least one branch is required.');
  if (!input.primaryOfficerId) throw new Error('An assigned KYC officer is required.');

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

      // A branch may have at most one PERMANENT mapping (edit it instead of recreating).
      if (type === 'PERMANENT') {
        const existing = await prisma.branchMapping.findFirst({
          where: { branchId, type: 'PERMANENT' },
          select: { id: true },
        });
        if (existing) {
          skipped.push(branchName);
          continue;
        }
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
      throw new Error(
        type === 'PERMANENT'
          ? 'All selected branches already have a permanent mapping. Edit those instead.'
          : 'No mappings could be created for the selected branches.',
      );
    }

    await recomputeAssignedBranches(officerIds);
    await createAuditLog({
      userId: actor.id,
      userEmail: actor.email,
      userName: actor.name,
      action: 'BRANCH_MAPPING_CREATE',
      details: `Created ${type} mapping for ${created.length} branch(es) [${created.join(', ')}] with ${officerIds.length} officer(s).`,
    });

    revalidatePath('/admin/assignments');
    return { created, skipped };
  } catch (error: any) {
    if (error?.message && !error.message.startsWith('Institutional')) throw error;
    logInstitutionalError(error, 'DB_CREATE_MAPPING');
    throw new Error('Institutional database fault during mapping creation.');
  }
}

export async function updateMapping(
  id: string,
  input: { type?: MappingType; note?: string | null },
) {
  const actor = await requireMappingActor(true);

  try {
    const current = await prisma.branchMapping.findUnique({
      where: { id },
      include: { branch: { select: { name: true } } },
    });
    if (!current) throw new Error('Mapping not found.');

    // Prevent creating a second permanent mapping on the same branch via type change.
    if (input.type === 'PERMANENT' && current.type !== 'PERMANENT') {
      const existing = await prisma.branchMapping.findFirst({
        where: { branchId: current.branchId, type: 'PERMANENT', id: { not: id } },
        select: { id: true },
      });
      if (existing) {
        throw new Error(`"${current.branch?.name}" already has a permanent mapping.`);
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

    revalidatePath('/admin/assignments');
  } catch (error: any) {
    if (error?.message && !error.message.startsWith('Institutional')) throw error;
    logInstitutionalError(error, 'DB_UPDATE_MAPPING');
    throw new Error('Institutional database fault during mapping update.');
  }
}

export async function setMappingActive(id: string, active: boolean) {
  const actor = await requireMappingActor(true);

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

    revalidatePath('/admin/assignments');
  } catch (error: any) {
    if (error?.message && !error.message.startsWith('Institutional')) throw error;
    logInstitutionalError(error, 'DB_TOGGLE_MAPPING');
    throw new Error('Institutional database fault during mapping status change.');
  }
}

/** Bulk activate/deactivate several mappings at once (used by the officer-level toggle). */
export async function setMappingsActive(ids: string[], active: boolean) {
  const actor = await requireMappingActor(true);
  const mappingIds = Array.from(new Set((ids ?? []).filter(Boolean)));
  if (mappingIds.length === 0) return;

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

    revalidatePath('/admin/assignments');
  } catch (error: any) {
    if (error?.message && !error.message.startsWith('Institutional')) throw error;
    logInstitutionalError(error, 'DB_BULK_TOGGLE_MAPPING');
    throw new Error('Institutional database fault during bulk status change.');
  }
}

/**
 * Saturday Configuration: enable/disable all-branch case visibility for an officer
 * on Saturdays. Independent of their normal branch mappings (does not change them).
 */
export async function setSaturdayVisibility(userId: string, enabled: boolean) {
  const actor = await requireMappingActor(true);
  if (!userId) throw new Error('An officer is required.');

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

    revalidatePath('/admin/assignments');
  } catch (error: any) {
    if (error?.message && !error.message.startsWith('Institutional')) throw error;
    logInstitutionalError(error, 'DB_SET_SATURDAY_VISIBILITY');
    throw new Error('Institutional database fault during Saturday configuration.');
  }
}

export async function setAllSaturdayVisibility(userIds: string[], enabled: boolean) {
  const actor = await requireMappingActor(true);
  if (!userIds || userIds.length === 0) throw new Error('At least one officer is required.');

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

    revalidatePath('/admin/assignments');
  } catch (error: any) {
    if (error?.message && !error.message.startsWith('Institutional')) throw error;
    logInstitutionalError(error, 'DB_SET_ALL_SATURDAY_VISIBILITY');
    throw new Error('Institutional database fault during bulk Saturday configuration.');
  }
}

export async function deleteMapping(id: string) {
  const actor = await requireMappingActor(true);

  try {
    const mapping = await prisma.branchMapping.findUnique({
      where: { id },
      include: { branch: { select: { name: true } }, officers: { select: { userId: true } } },
    });
    if (!mapping) throw new Error('Mapping not found.');

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

    revalidatePath('/admin/assignments');
  } catch (error: any) {
    if (error?.message && !error.message.startsWith('Institutional')) throw error;
    logInstitutionalError(error, 'DB_DELETE_MAPPING');
    throw new Error('Institutional database fault during mapping deletion.');
  }
}

export async function setPrimaryOfficer(mappingId: string, userId: string) {
  const actor = await requireMappingActor(true);

  try {
    const mapping = await prisma.branchMapping.findUnique({
      where: { id: mappingId },
      include: { branch: { select: { name: true } }, officers: true },
    });
    if (!mapping) throw new Error('Mapping not found.');

    const target = await prisma.user.findUnique({
      where: { id: userId },
      select: { firstName: true, lastName: true },
    });
    if (!target) throw new Error('Officer not found.');

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

    revalidatePath('/admin/assignments');
  } catch (error: any) {
    if (error?.message && !error.message.startsWith('Institutional')) throw error;
    logInstitutionalError(error, 'DB_REASSIGN_MAPPING');
    throw new Error('Institutional database fault during officer reassignment.');
  }
}

export async function addOfficers(mappingId: string, userIds: string[]) {
  const actor = await requireMappingActor(true);
  const ids = Array.from(new Set((userIds ?? []).filter(Boolean)));
  if (ids.length === 0) throw new Error('No officers selected.');

  try {
    const mapping = await prisma.branchMapping.findUnique({
      where: { id: mappingId },
      include: { branch: { select: { name: true } } },
    });
    if (!mapping) throw new Error('Mapping not found.');

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

    revalidatePath('/admin/assignments');
  } catch (error: any) {
    if (error?.message && !error.message.startsWith('Institutional')) throw error;
    logInstitutionalError(error, 'DB_ADD_MAPPING_OFFICERS');
    throw new Error('Institutional database fault while adding officers.');
  }
}

export async function removeOfficer(mappingId: string, userId: string) {
  const actor = await requireMappingActor(true);

  try {
    const mapping = await prisma.branchMapping.findUnique({
      where: { id: mappingId },
      include: { branch: { select: { name: true } }, officers: true },
    });
    if (!mapping) throw new Error('Mapping not found.');

    const target = mapping.officers.find((o) => o.userId === userId);
    if (!target) throw new Error('Officer is not part of this mapping.');
    if (target.isPrimary) {
      throw new Error('Cannot remove the assigned KYC officer. Reassign the primary officer first.');
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

    revalidatePath('/admin/assignments');
  } catch (error: any) {
    if (error?.message && !error.message.startsWith('Institutional')) throw error;
    logInstitutionalError(error, 'DB_REMOVE_MAPPING_OFFICER');
    throw new Error('Institutional database fault while removing officer.');
  }
}

export async function reassignAllOfficerBranches(oldOfficerId: string, newOfficerId: string) {
  const actor = await requireMappingActor(true);
  if (oldOfficerId === newOfficerId) throw new Error('Source and target officers must be different.');

  try {
    const oldUser = await prisma.user.findUnique({ where: { id: oldOfficerId } });
    const newUser = await prisma.user.findUnique({ where: { id: newOfficerId } });
    if (!oldUser || !newUser) throw new Error('Officer not found.');

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

    revalidatePath('/admin/assignments');
    return { count: mappings.length };
  } catch (error: any) {
    if (error?.message && !error.message.startsWith('Institutional')) throw error;
    logInstitutionalError(error, 'DB_MASS_REASSIGN_MAPPINGS');
    throw new Error('Institutional database fault during mass reassignment.');
  }
}
