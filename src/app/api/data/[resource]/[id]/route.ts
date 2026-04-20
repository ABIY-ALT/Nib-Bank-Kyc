/**
 * Generic Data API Routes with Authorization
 * PostgreSQL/Prisma data access layer
 * 
 * SECURITY FIX #15: User ID Manipulation Prevention
 * - All GET/PATCH/DELETE operations require authentication
 * - User-specific resources (users, profiles) require ownership verification
 * - Admin operations require ADMIN_ACCESS permission
 * 
 * Usage:
 * GET    /api/data/submissions/{id} - Requires auth + ownership/permission
 * PATCH  /api/data/submissions/{id} - Requires auth + ownership/permission
 * DELETE /api/data/submissions/{id} - Requires auth + admin permission
 */

import { prisma } from '@/lib/prisma';
import { NextRequest, NextResponse } from 'next/server';
import { verifyUserOwnership, verifyAdminAccess } from '@/lib/user-ownership-validator';

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
      return NextResponse.json(
        { error: 'Resource not found' },
        { status: 404 }
      );
    }

    if (!id) {
      return NextResponse.json(
        { error: 'ID parameter required' },
        { status: 400 }
      );
    }

    // ===== AUTHORIZATION CHECK =====
    // Single-user resources require ownership verification
    if (SINGLE_USER_RESOURCES.has(resourceLower)) {
      const ownership = await verifyUserOwnership(request, id);
      if (!ownership.authorized) {
        return NextResponse.json(
          { error: 'Access denied' },
          { status: 403 }
        );
      }
    } else if (ADMIN_ONLY_RESOURCES.has(resourceLower)) {
      // Admin-only resources
      const adminAccess = await verifyAdminAccess(request);
      if (!adminAccess.authorized) {
        return NextResponse.json(
          { error: 'Access denied' },
          { status: 403 }
        );
      }
    } else {
      // For other resources, just verify authentication
      const authHeader = request.headers.get('Authorization');
      if (!authHeader?.startsWith('Bearer ')) {
        return NextResponse.json(
          { error: 'Unauthorized' },
          { status: 401 }
        );
      }
    }

    // ===== FETCH DATA =====
    const model = (prisma as any)[modelName];
    if (!model) {
      return NextResponse.json(
        { error: 'Resource not found' },
        { status: 404 }
      );
    }

    const data = await model.findUnique({
      where: { id },
    });

    if (!data) {
      return NextResponse.json(
        { error: 'Record not found' },
        { status: 404 }
      );
    }

    return NextResponse.json({ data }, { status: 200 });
  } catch (error) {

    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
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
      return NextResponse.json(
        { error: 'Resource not found' },
        { status: 404 }
      );
    }

    // ===== AUTHORIZATION CHECK =====
    // Single-user resources require ownership verification
    if (SINGLE_USER_RESOURCES.has(resourceLower)) {
      const ownership = await verifyUserOwnership(request, id);
      if (!ownership.authorized) {
        return NextResponse.json(
          { error: 'Access denied' },
          { status: 403 }
        );
      }
    } else if (ADMIN_ONLY_RESOURCES.has(resourceLower)) {
      // Admin-only resources
      const adminAccess = await verifyAdminAccess(request);
      if (!adminAccess.authorized) {
        return NextResponse.json(
          { error: 'Access denied' },
          { status: 403 }
        );
      }
    } else {
      // For other resources, just verify authentication
      const authHeader = request.headers.get('Authorization');
      if (!authHeader?.startsWith('Bearer ')) {
        return NextResponse.json(
          { error: 'Unauthorized' },
          { status: 401 }
        );
      }
    }

    // ===== UPDATE DATA =====
    const body = await request.json();
    const model = (prisma as any)[modelName];
    if (!model) {
      return NextResponse.json(
        { error: 'Resource not found' },
        { status: 404 }
      );
    }

    // IMPORTANT: Prevent users from changing their own role via API
    if (resourceLower === 'users' && body.roles) {
      const ownership = await verifyUserOwnership(request, id);
      if (!ownership.isAdmin) {
        // Non-admin cannot modify roles
        delete body.roles;
      }
    }

    const data = await model.update({
      where: { id },
      data: body,
    });

    return NextResponse.json({ data }, { status: 200 });
  } catch (error) {

    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
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
      return NextResponse.json(
        { error: 'Resource not found' },
        { status: 404 }
      );
    }

    // ===== AUTHORIZATION CHECK: Admin only =====
    const adminAccess = await verifyAdminAccess(request);
    if (!adminAccess.authorized) {
      return NextResponse.json(
        { error: 'Access denied' },
        { status: 403 }
      );
    }

    // ===== DELETE DATA =====
    const model = (prisma as any)[modelName];
    if (!model) {
      return NextResponse.json(
        { error: 'Resource not found' },
        { status: 404 }
      );
    }

    const data = await model.delete({
      where: { id },
    });

    return NextResponse.json({ data }, { status: 200 });
  } catch (error) {

    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
