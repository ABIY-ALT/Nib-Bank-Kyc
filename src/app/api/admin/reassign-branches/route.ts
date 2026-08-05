import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getServerSession, verifyPermission } from '@/actions/auth-server';
import { recomputeAssignedBranches } from '@/actions/branch-mappings';
import { createAuditLog } from '@/actions/audit';
import { normalizeBranchName } from '@/lib/jurisdiction';
import { logInstitutionalError } from '@/lib/logger';

export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession();
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized. Session expired.' }, { status: 401 });
    }

    const hasMappingPerm = await verifyPermission('MAP_USERS_TO_BRANCH');
    const hasOversightPerm = await verifyPermission('VIEW_SPECIALIST_PRODUCTIVITY');
    if (!hasMappingPerm && !hasOversightPerm) {
      return NextResponse.json({ error: 'Forbidden. Insufficient permissions for branch reassignment.' }, { status: 403 });
    }

    const body = await req.json();
    const { branches, fromOfficerId, toOfficerId } = body || {};

    if (!Array.isArray(branches) || branches.length === 0 || !fromOfficerId || !toOfficerId) {
      return NextResponse.json(
        { error: 'Invalid payload. "branches" array, "fromOfficerId", and "toOfficerId" are required.' },
        { status: 400 }
      );
    }

    if (fromOfficerId === toOfficerId) {
      return NextResponse.json(
        { error: 'Source officer and target officer must be different.' },
        { status: 400 }
      );
    }

    const [fromUser, toUser] = await Promise.all([
      prisma.user.findUnique({ where: { id: fromOfficerId }, select: { id: true, firstName: true, lastName: true } }),
      prisma.user.findUnique({ where: { id: toOfficerId }, select: { id: true, firstName: true, lastName: true } }),
    ]);

    if (!fromUser || !toUser) {
      return NextResponse.json({ error: 'One or both specified officers do not exist.' }, { status: 404 });
    }

    const branchNames = branches.map((b: string) => normalizeBranchName(b)).filter(Boolean);

    const dbBranches = await prisma.branch.findMany({
      where: {
        OR: [
          { name: { in: branchNames, mode: 'insensitive' } },
          { id: { in: branches } }
        ]
      },
      select: { id: true, name: true }
    });

    const branchMap = new Map(dbBranches.map(b => [b.name.toLowerCase(), b]));

    for (const bInput of branchNames) {
      const bNorm = bInput.toLowerCase();
      let dbBranch = branchMap.get(bNorm);

      if (!dbBranch) {
        // Create branch if missing in hierarchy DB
        const defaultDistrict = await prisma.district.findFirst();
        if (defaultDistrict) {
          dbBranch = await prisma.branch.create({
            data: {
              name: bInput,
              districtId: defaultDistrict.id
            },
            select: { id: true, name: true }
          });
          branchMap.set(bNorm, dbBranch);
        }
      }

      if (!dbBranch) continue;

      const activeMappings = await prisma.branchMapping.findMany({
        where: { branchId: dbBranch.id, active: true },
        include: { officers: true }
      });

      let foundSourceMapping = false;

      for (const mapping of activeMappings) {
        const sourceOfficerRel = mapping.officers.find(o => o.userId === fromOfficerId);
        if (sourceOfficerRel) {
          foundSourceMapping = true;
          // Delete source officer relationship
          await prisma.branchMappingOfficer.delete({
            where: {
              mappingId_userId: {
                mappingId: mapping.id,
                userId: fromOfficerId
              }
            }
          });

          // Check if target officer is already in this mapping
          const targetExists = mapping.officers.some(o => o.userId === toOfficerId);
          if (!targetExists) {
            await prisma.branchMappingOfficer.create({
              data: {
                mappingId: mapping.id,
                userId: toOfficerId,
                isPrimary: sourceOfficerRel.isPrimary
              }
            });
          }
        }
      }

      // If no active mapping had the source officer, create a new mapping for the target officer
      if (!foundSourceMapping) {
        const existingMapping = activeMappings[0];
        if (existingMapping) {
          const targetExists = existingMapping.officers.some(o => o.userId === toOfficerId);
          if (!targetExists) {
            await prisma.branchMappingOfficer.create({
              data: {
                mappingId: existingMapping.id,
                userId: toOfficerId,
                isPrimary: existingMapping.officers.length === 0
              }
            });
          }
        } else {
          await prisma.branchMapping.create({
            data: {
              branchId: dbBranch.id,
              type: 'PERMANENT',
              active: true,
              note: `Workload reassigned from ${fromUser.firstName} ${fromUser.lastName} to ${toUser.firstName} ${toUser.lastName}`,
              createdById: session.id,
              officers: {
                create: [
                  { userId: toOfficerId, isPrimary: true }
                ]
              }
            }
          });
        }
      }

      // Reassign open/unsubmitted/unseen cases of this branch from source officer to target officer
      await prisma.kYC.updateMany({
        where: {
          branchName: { equals: dbBranch.name, mode: 'insensitive' },
          assignedToId: fromOfficerId,
          status: { in: ['SUBMITTED', 'IN_REVIEW', 'ACTION_REQUIRED'] }
        },
        data: {
          assignedToId: toOfficerId,
          updatedAt: new Date()
        }
      });
    }

    // Recompute CSV caches
    await recomputeAssignedBranches([fromOfficerId, toOfficerId]);

    // Audit log
    await createAuditLog({
      userId: session.id,
      userEmail: session.email,
      userName: session.email,
      action: 'SMART_BRANCH_REASSIGNMENT',
      details: JSON.stringify({
        branches: branchNames,
        fromOfficer: `${fromUser.firstName} ${fromUser.lastName}`,
        fromOfficerId,
        toOfficer: `${toUser.firstName} ${toUser.lastName}`,
        toOfficerId,
        timestamp: new Date().toISOString()
      })
    });

    return NextResponse.json({
      success: true,
      message: `Successfully reassigned ${branchNames.length} branch(es) to ${toUser.firstName} ${toUser.lastName}.`
    });

  } catch (error: any) {
    logInstitutionalError(error, 'API_SMART_BRANCH_REASSIGNMENT');
    return NextResponse.json(
      { error: error?.message || 'Server error during branch reassignment.' },
      { status: 500 }
    );
  }
}
