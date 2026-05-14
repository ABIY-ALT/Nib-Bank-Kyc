import { NextResponse } from 'next/server';
import { getWorkflowCounts } from '@/actions/submissions';

const UNTRUSTED_BODY_KEYS = new Set(['isSuperAdmin', 'isAdmin', 'role', 'permissions']);

/**
 * HTTP-visible workflow counts (401 unauthenticated, 403 privilege / tampered body).
 * Replaces direct Server Action calls so security tests see real status codes.
 */
export async function POST(req: Request) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON', code: 'BAD_REQUEST' }, { status: 400 });
  }

  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return NextResponse.json({ error: 'Bad request', code: 'BAD_REQUEST' }, { status: 400 });
  }

  const record = body as Record<string, unknown>;
  for (const key of Object.keys(record)) {
    if (UNTRUSTED_BODY_KEYS.has(key)) {
      return NextResponse.json(
        { error: 'Forbidden', code: 'UNTRUSTED_CLIENT_FIELDS' },
        { status: 403 }
      );
    }
  }

  const userId = record.userId;
  if (typeof userId !== 'string' || !userId) {
    return NextResponse.json({ error: 'Bad request', code: 'BAD_REQUEST' }, { status: 400 });
  }

  const branchName = typeof record.branchName === 'string' ? record.branchName : undefined;
  const branches = Array.isArray(record.branches)
    ? record.branches.filter((b): b is string => typeof b === 'string')
    : [];

  try {
    const data = await getWorkflowCounts({
      userId,
      branchName,
      branches,
    });
    return NextResponse.json(data);
  } catch (e) {
    const msg = e instanceof Error ? e.message : '';
    if (msg.includes('Authentication required')) {
      return NextResponse.json({ error: 'Unauthorized', code: 'UNAUTHORIZED' }, { status: 401 });
    }
    if (msg.includes('Identity mismatch') || msg.includes('Privilege escalation')) {
      return NextResponse.json({ error: 'Forbidden', code: 'FORBIDDEN' }, { status: 403 });
    }
    return NextResponse.json({ error: 'Internal server error', code: 'INTERNAL_ERROR' }, { status: 500 });
  }
}
