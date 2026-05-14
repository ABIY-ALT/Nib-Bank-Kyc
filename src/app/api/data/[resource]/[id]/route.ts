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
import { verifyUserOwnership, verifyAdminAccess, verifyRecordOwnership } from '@/lib/user-ownership-validator';
import { authenticateRequest } from '@/lib/auth-handlers';
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

    // Resources where user can only access their own data (owned resources)
    const OWNED_RESOURCES: Record<string, string> = {
      'submissions': 'createdById',
      'kyc_findings': 'userId',
      'submissions_docs': 'uploadedById',
      'audit_logs': 'userId'
    };

    // ===== AUTHORIZATION CHECK =====
    if (SINGLE_USER_RESOURCES.has(resourceLower)) {
      const ownership = await verifyUserOwnership(request, id);
      if (!ownership.authorized) {
        return forbiddenResponse('Access denied');
      }
    } else if (OWNED_RESOURCES[resourceLower]) {
      const ownership = await verifyRecordOwnership(request, resourceLower, id, OWNED_RESOURCES[resourceLower]);
      if (!ownership.authorized) {
        return forbiddenResponse('Access denied: You do not own this record.');
      }
    } else if (ADMIN_ONLY_RESOURCES.has(resourceLower)) {
      const adminAccess = await verifyAdminAccess(request);
      if (!adminAccess.authorized) {
        return forbiddenResponse('Access denied');
      }
    } else {
      // SECURITY: Mandatory token verification for all other resources
      const user = await authenticateRequest(request);
      if (!user) {
        return unauthorizedResponse('Authentication required');
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

    // Resources where user can only access their own data (owned resources)
    const OWNED_RESOURCES: Record<string, string> = {
      'submissions': 'createdById',
      'kyc_findings': 'userId',
      'submissions_docs': 'uploadedById',
      'audit_logs': 'userId'
    };

    // ===== AUTHORIZATION CHECK =====
    if (SINGLE_USER_RESOURCES.has(resourceLower)) {
      const ownership = await verifyUserOwnership(request, id);
      if (!ownership.authorized) {
        return forbiddenResponse('Access denied');
      }
    } else if (OWNED_RESOURCES[resourceLower]) {
      const ownership = await verifyRecordOwnership(request, resourceLower, id, OWNED_RESOURCES[resourceLower]);
      if (!ownership.authorized) {
        return forbiddenResponse('Access denied: You do not own this record.');
      }
    } else if (ADMIN_ONLY_RESOURCES.has(resourceLower)) {
      const adminAccess = await verifyAdminAccess(request);
      if (!adminAccess.authorized) {
        return forbiddenResponse('Access denied');
      }
    } else {
      // SECURITY: Mandatory token verification for all other resources
      const user = await authenticateRequest(request);
      if (!user) {
        return unauthorizedResponse('Authentication required');
      }
    }

    // ===== UPDATE DATA =====
    const body = await request.json();
    const model = (prisma as any)[modelName];
    if (!model) {
      return badRequestResponse('Resource not found');
    }

    // ===== SECURITY FIX: PREVENT PRIVILEGE ESCALATION VIA MASS ASSIGNMENT =====
    // Use a strict allow-list for non-admin users across all resources
    const user = await authenticateRequest(request);
    const isAdmin = user?.role === 'SUPER_ADMIN';

    if (!isAdmin) {
      const RESOURCE_ALLOW_LISTS: Record<string, string[]> = {
        'submissions': ['remarks', 'customerName', 'entityType'],
        'users': ['firstName', 'lastName', 'phoneNumber'],
        'kyc_findings': ['finding', 'severity', 'notes'],
        'submissions_docs': ['name', 'type'],
      };

      const allowedFields = RESOURCE_ALLOW_LISTS[resourceLower] || [];
      const sanitizedBody: any = {};
      
      allowedFields.forEach(field => {
        if (body[field] !== undefined) {
          sanitizedBody[field] = body[field];
        }
      });
      
      // If the resource is not in the whitelist or has no allowed fields for non-admins,
      // and it's a sensitive resource, we should be even stricter.
      if (allowedFields.length === 0 && !isAdmin) {
        return forbiddenResponse('You do not have permission to update this resource type.');
      }

      // Replace original body with sanitized version to prevent mass assignment
      Object.keys(body).forEach(key => {
        if (!allowedFields.includes(key)) {
          delete body[key];
        }
      });
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
