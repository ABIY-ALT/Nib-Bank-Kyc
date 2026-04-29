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

    // Fetch multiple records with filtering
    const filterParam = request.nextUrl.searchParams.get('filter');
    const filter = filterParam ? JSON.parse(filterParam) : {};

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

    const data = await request.json();

    const record = await model.create({
      data: {
        ...data,
        createdAt: new Date(),
        createdBy: user.id,
      },
    });

    return successResponse({ data: record }, 201);
  } catch (error) {
    return internalErrorResponse('Internal server error');
  }
}
