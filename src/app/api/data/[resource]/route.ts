/**
 * Generic Data API Routes (without ID)
 * Handles GET, POST for collections
 */

import { prisma } from '@/lib/prisma';
import { authenticateRequest } from '@/lib/auth-handlers';
import { NextRequest, NextResponse } from 'next/server';

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
      return NextResponse.json(
        { error: `Unknown resource: ${resource}` },
        { status: 400 }
      );
    }

    const model = (prisma as any)[modelName];
    if (!model) {
      return NextResponse.json(
        { error: `Model not found: ${modelName}` },
        { status: 400 }
      );
    }

    // Fetch multiple records with filtering
    const filterParam = request.nextUrl.searchParams.get('filter');
    const filter = filterParam ? JSON.parse(filterParam) : {};

    const records = await model.findMany({
      where: filter,
      take: 100,
    });

    return NextResponse.json({ data: records });
  } catch (error) {

    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ resource: string }> }
) {
  try {
    const user = await authenticateRequest(request);
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const resource = (await params).resource.toLowerCase();
    const modelName = RESOURCE_MODELS[resource];

    if (!modelName) {
      return NextResponse.json(
        { error: `Unknown resource: ${resource}` },
        { status: 400 }
      );
    }

    const model = (prisma as any)[modelName];
    if (!model) {
      return NextResponse.json(
        { error: `Model not found: ${modelName}` },
        { status: 400 }
      );
    }

    const data = await request.json();

    const record = await model.create({
      data: {
        ...data,
        createdAt: new Date(),
        createdBy: user.id,
      },
    });

    return NextResponse.json({ data: record }, { status: 201 });
  } catch (error) {

    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

