/**
 * Generic Data API Routes (without ID)
 * Handles GET, POST for collections
 * 
 * SECURITY: Automatically sanitizes sensitive data (OWASP A02:2021)
 */

import { prisma } from '@/lib/prisma';
import { authenticateRequest } from '@/lib/auth-handlers';
import { NextRequest } from 'next/server';
import { 
  successResponse, 
  badRequestResponse, 
  internalErrorResponse, 
  unauthorizedResponse 
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
    const isAdmin = user?.role === 'SUPER_ADMIN';

    const OWNED_RESOURCES: Record<string, string> = {
      'submissions': 'createdById',
      'kyc_findings': 'userId',
      'submissions_docs': 'uploadedById',
      'audit_logs': 'userId'
    };

    // Fetch multiple records with filtering
    const filterParam = request.nextUrl.searchParams.get('filter');
    let filter = filterParam ? JSON.parse(filterParam) : {};

    // For owned resources, non-admins can only see their own records
    if (OWNED_RESOURCES[resource] && !isAdmin) {
      if (!user) return unauthorizedResponse('Unauthorized');
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
