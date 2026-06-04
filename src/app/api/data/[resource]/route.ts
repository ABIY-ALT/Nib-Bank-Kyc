/**
 * Generic Data API Routes (without ID)
 * Handles GET, POST for collections
 * 
 * SECURITY: Automatically sanitizes sensitive data (OWASP A02:2021)
 */

import { prisma } from '@/lib/prisma';
import { authenticateRequest } from '@/lib/auth-handlers';
import { assertNoPrivilegeParams } from '@/actions/rbac';
import { getServerSession } from '@/actions/auth-server';
import { NextRequest } from 'next/server';
import {
  successResponse,
  badRequestResponse,
  internalErrorResponse,
  unauthorizedResponse
} from '@/lib/api-security';
import { normalizePermissionSlug } from '@/lib/access-control';
import {
  normalizeAssignedBranches,
  getNormalizedRole,
  getResolvedUserBranchName,
  getResolvedUserDistrictName,
  GLOBAL_SCOPE_PERMISSIONS,
  PORTFOLIO_SCOPE_PERMISSIONS,
  normalizeBranchName
} from '@/lib/jurisdiction';

// Map resource names to Prisma models
const RESOURCE_MODELS: Record<string, string> = {
  'submissions': 'submission',
  'branches': 'branch',
  'users': 'user',
  'roles': 'role',
  'audit_logs': 'auditLog',
  'permissions': 'permission',
  'kyc_findings': 'kycFinding',
  'settings': 'settings',
  'submissions_docs': 'submissionDocument',
};

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ resource: string }> }
) {
  try {
    const resource = (await params).resource.toLowerCase();
    const modelName = RESOURCE_MODELS[resource];

    if (!modelName) {
      return badRequestResponse(`Unknown resource: ${resource}`);
    }

    const model = (prisma as any)[modelName];
    if (!model) {
      return badRequestResponse(`Model not found: ${modelName}`);
    }

    // ===== AUTHORIZATION & FILTERING =====
    const user = await authenticateRequest(request);
    
    // SECURITY: Mandatory authentication for all resources
    if (!user) {
      return unauthorizedResponse('Authentication required');
    }

    const isAdmin = user.role === 'SUPER_ADMIN';

    const OWNED_RESOURCES: Record<string, string> = {
      'submissions': 'createdById',
      'kyc_findings': 'userId',
      'submissions_docs': 'uploadedById',
      'audit_logs': 'userId'
    };

    // Fetch multiple records with filtering
    const filterParam = request.nextUrl.searchParams.get('filter');
    let filter = filterParam ? JSON.parse(filterParam) : {};

    // SECURITY: Reject any filter that contains privilege-related keys
    const session = await getServerSession();
    const { tampered, blockedKey } = await assertNoPrivilegeParams(
      filter,
      session ? { id: session.id, email: session.email, role: session.role } : null,
      `GET /api/data/${resource}`
    );
    if (tampered) {
      return badRequestResponse(`Forbidden: client-supplied field '${blockedKey}' is not permitted in filters.`);
    }

    // ===== SPECIAL CASE: SUBMISSIONS REQUIRE BRANCH-BASED ACCESS CONTROL =====
    // SECURITY: Submissions are governed by branch/district jurisdiction, not just ownership
    if (resource === 'submissions' && !isAdmin) {
      const dbUser = await prisma.user.findUnique({
        where: { id: user.id },
        include: {
          roles: {
            include: {
              role: {
                include: {
                  permissions: {
                    include: {
                      permission: true
                    }
                  }
                }
              }
            }
          },
          branch: { include: { district: true } }
        }
      });

      if (!dbUser) {
        return unauthorizedResponse('User not found');
      }

      const userPermissions = dbUser.roles.flatMap((ur: any) =>
        ur.role.active ? ur.role.permissions.map((rp: any) => normalizePermissionSlug(rp.permission?.slug)) : []
      );

      let jurisdictionalFilter: any = {};

      // Check for global oversight permissions
      if (userPermissions.some(p => GLOBAL_SCOPE_PERMISSIONS.has(p))) {
        jurisdictionalFilter = {}; // No additional restriction
      } else {
        // Apply branch/district filtering
        const assignedBranches = normalizeAssignedBranches(dbUser.assignedBranches);
        const branchName = getResolvedUserBranchName(dbUser);
        const districtName = getResolvedUserDistrictName(dbUser);

        const isDistrictAdmin = userPermissions.includes('DISTRICT_DIRECTOR_REVIEW') || userPermissions.includes('DASHBOARD_VIEW_DISTRICT');
        const isPortfolioStaff = userPermissions.some(p => PORTFOLIO_SCOPE_PERMISSIONS.has(p));

        if (isDistrictAdmin && districtName) {
          jurisdictionalFilter.districtName = districtName;
        } else if (isPortfolioStaff && assignedBranches.length > 0) {
          jurisdictionalFilter.branchName = { in: assignedBranches };
        } else if (branchName) {
          jurisdictionalFilter.branchName = branchName;
        } else {
          // No jurisdiction - cannot access any submissions
          return successResponse({ data: [] });
        }
      }

      // Merge jurisdictional filter with client-supplied filter
      filter = { ...jurisdictionalFilter, ...filter };
    } else if (OWNED_RESOURCES[resource] && !isAdmin) {
      // For other owned resources (not submissions), maintain ownership-based filtering
      filter[OWNED_RESOURCES[resource]] = user.id;
    }

    const records = await model.findMany({
      where: filter,
      take: 100,
    });

    return successResponse({ data: records });
  } catch (error) {
    return internalErrorResponse('Internal server error');
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ resource: string }> }
) {
  try {
    const user = await authenticateRequest(request);
    if (!user) {
      return unauthorizedResponse('Unauthorized');
    }

    const resource = (await params).resource.toLowerCase();
    const modelName = RESOURCE_MODELS[resource];

    if (!modelName) {
      return badRequestResponse(`Unknown resource: ${resource}`);
    }

    const model = (prisma as any)[modelName];
    if (!model) {
      return badRequestResponse(`Model not found: ${modelName}`);
    }

    const body = await request.json();

    // SECURITY: Reject any body containing privilege-related keys
    const session = await getServerSession();
    const { tampered, blockedKey } = await assertNoPrivilegeParams(
      body,
      session ? { id: session.id, email: session.email, role: session.role } : null,
      `POST /api/data/${resource}`
    );
    if (tampered) {
      return badRequestResponse(`Forbidden: client-supplied field '${blockedKey}' is not permitted.`);
    }

    // ===== RBAC ENFORCEMENT: Sensitive Resource Creation =====
    const ADMIN_ONLY_RESOURCES = ['users', 'roles', 'permissions', 'branches', 'settings', 'audit_logs'];
    if (ADMIN_ONLY_RESOURCES.includes(resource) && user.role !== 'SUPER_ADMIN') {
      return unauthorizedResponse('Administrative privilege required to create this resource.');
    }

    // Map ownership field based on resource type
    const OWNED_RESOURCES_MAPPING: Record<string, string> = {
      'submissions': 'createdById',
      'kyc_findings': 'userId',
      'submissions_docs': 'uploadedById',
      'audit_logs': 'userId'
    };

    const ownerField = OWNED_RESOURCES_MAPPING[resource];
    const data = { ...body };

    // Automatically set the owner field to the current user and remove any spoofed ID
    if (ownerField) {
      data[ownerField] = user.id;
    }

    // Always set creation metadata
    const record = await model.create({
      data: {
        ...data,
        createdAt: new Date(),
      },
    });

    return successResponse({ data: record }, 201);
  } catch (error) {
    return internalErrorResponse('Internal server error');
  }
}
