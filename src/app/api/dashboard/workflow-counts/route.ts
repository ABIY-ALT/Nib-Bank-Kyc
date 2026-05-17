import { NextResponse } from 'next/server';
import { getWorkflowCounts } from '@/actions/submissions';
import { getServerSession } from '@/actions/auth-server';
import { assertNoPrivilegeParams } from '@/actions/rbac';

/**
 * Workflow Counts API — RBAC Hardened
 *
 * SECURITY:
 * - Rejects any request body containing privilege-related keys (403).
 * - All session/role resolution happens exclusively server-side.
 * - No client-supplied userId, isSuperAdmin, role, or permissions are trusted.
 * - Returns 401 for unauthenticated requests, 403 for tampered bodies.
 */
export async function POST(req: Request) {
  // 1. Authenticate session first
  const session = await getServerSession();
  if (!session) {
    return NextResponse.json(
      { error: 'Unauthorized', code: 'UNAUTHORIZED' },
      { status: 401 }
    );
  }

  // 2. Parse body safely
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      { error: 'Invalid JSON', code: 'BAD_REQUEST' },
      { status: 400 }
    );
  }

  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return NextResponse.json(
      { error: 'Bad request', code: 'BAD_REQUEST' },
      { status: 400 }
    );
  }

  const record = body as Record<string, unknown>;

  // 3. Reject any client-supplied privilege parameters
  const { tampered, blockedKey } = await assertNoPrivilegeParams(
    record,
    session,
    'POST /api/dashboard/workflow-counts'
  );

  if (tampered) {
    return NextResponse.json(
      {
        error: 'Forbidden',
        code: 'PARAMETER_TAMPERING_DETECTED',
        detail: `Client-supplied field '${blockedKey}' is not permitted.`,
      },
      { status: 403 }
    );
  }

  // 4. Call server action — all role/jurisdiction derived from session internally
  try {
    const data = await getWorkflowCounts();
    return NextResponse.json(data);
  } catch (e) {
    const msg = e instanceof Error ? e.message : '';
    if (msg.includes('Authentication required')) {
      return NextResponse.json(
        { error: 'Unauthorized', code: 'UNAUTHORIZED' },
        { status: 401 }
      );
    }
    return NextResponse.json(
      { error: 'Internal server error', code: 'INTERNAL_ERROR' },
      { status: 500 }
    );
  }
}
