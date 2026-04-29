/**
 * Generic Data API Routes with Authorization
 * PostgreSQL/Prisma data access layer
 * 
 * SECURITY FIX #15: User ID Manipulation Prevention
 * SECURITY FIX: Automatic Data Sanitization (OWASP A02:2021)
 * 
 * Usage:
 * GET    /api/data/submissions/{id} - Requires auth + ownership/permission
 * PATCH  /api/data/submissions/{id} - Requires auth + ownership/permission
 * DELETE /api/data/submissions/{id} - Requires auth + admin permission
 */

import { prisma } from '@/lib/prisma';
import { NextRequest } from 'next/server';
import { verifyUserOwnership, verifyAdminAccess } from '@/lib/user-ownership-validator';
import { 
  successResponse, 
  badRequestResponse, 
  internalErrorResponse, 
  unauthorizedResponse,
  forbiddenResponse 
} from '@/lib/api-security';

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

// Resources where user can only access their own data (single-user resources)
const SINGLE_USER_RESOURCES = new Set(['users', 'profile', 'settings']);

// Resources that require admin access only
const ADMIN_ONLY_RESOURCES = new Set(['roles', 'permissions', 'branches', 'audit_logs']);

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ resource: string; id?: string }> }
) {
  try {
    const { resource, id } = await params;
    const resourceLower = resource.toLowerCase();
    const modelName = RESOURCE_MODELS[resourceLower];

    if (!modelName) {
      return badRequestResponse('Resource not found');
    }

    if (!id) {
      return badRequestResponse('ID parameter required');
    }

    // ===== AUTHORIZATION CHECK =====
    if (SINGLE_USER_RESOURCES.has(resourceLower)) {
      const ownership = await verifyUserOwnership(request, id);
      if (!ownership.authorized) {
        return forbiddenResponse('Access denied');
      }
    } else if (ADMIN_ONLY_RESOURCES.has(resourceLower)) {
      const adminAccess = await verifyAdminAccess(request);
      if (!adminAccess.authorized) {
        return forbiddenResponse('Access denied');
      }
    } else {
      const authHeader = request.headers.get('Authorization');
      if (!authHeader?.startsWith('Bearer ')) {
        return unauthorizedResponse('Unauthorized');
      }
    }

    // ===== FETCH DATA =====
    const model = (prisma as any)[modelName];
    if (!model) {
      return badRequestResponse('Resource not found');
    }

    const data = await model.findUnique({
      where: { id },
    });

    if (!data) {
      return badRequestResponse('Record not found');
    }

    return successResponse({ data });
  } catch (error) {
    return internalErrorResponse('Internal server error');
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ resource: string; id: string }> }
) {
  try {
    const { resource, id } = await params;
    const resourceLower = resource.toLowerCase();
    const modelName = RESOURCE_MODELS[resourceLower];

    if (!modelName) {
      return badRequestResponse('Resource not found');
    }

    // ===== AUTHORIZATION CHECK =====
    if (SINGLE_USER_RESOURCES.has(resourceLower)) {
      const ownership = await verifyUserOwnership(request, id);
      if (!ownership.authorized) {
        return forbiddenResponse('Access denied');
      }
    } else if (ADMIN_ONLY_RESOURCES.has(resourceLower)) {
      const adminAccess = await verifyAdminAccess(request);
      if (!adminAccess.authorized) {
        return forbiddenResponse('Access denied');
      }
    } else {
      const authHeader = request.headers.get('Authorization');
      if (!authHeader?.startsWith('Bearer ')) {
        return unauthorizedResponse('Unauthorized');
      }
    }

    // ===== UPDATE DATA =====
    const body = await request.json();
    const model = (prisma as any)[modelName];
    if (!model) {
      return badRequestResponse('Resource not found');
    }

    // IMPORTANT: Prevent users from changing their own role via API
    if (resourceLower === 'users' && body.roles) {
      const ownership = await verifyUserOwnership(request, id);
      if (!ownership.isAdmin) {
        delete body.roles;
      }
    }

    const data = await model.update({
      where: { id },
      data: body,
    });

    return successResponse({ data });
  } catch (error) {
    return internalErrorResponse('Internal server error');
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ resource: string; id: string }> }
) {
  try {
    const { resource, id } = await params;
    const resourceLower = resource.toLowerCase();
    const modelName = RESOURCE_MODELS[resourceLower];

    if (!modelName) {
      return badRequestResponse('Resource not found');
    }

    // ===== AUTHORIZATION CHECK: Admin only =====
    const adminAccess = await verifyAdminAccess(request);
    if (!adminAccess.authorized) {
      return forbiddenResponse('Access denied');
    }

    // ===== DELETE DATA =====
    const model = (prisma as any)[modelName];
    if (!model) {
      return badRequestResponse('Resource not found');
    }

    const data = await model.delete({
      where: { id },
    });

    return successResponse({ data });
  } catch (error) {
    return internalErrorResponse('Internal server error');
  }
}
