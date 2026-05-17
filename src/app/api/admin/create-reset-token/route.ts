import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { generateResetToken, hashToken } from '@/lib/token';
import { requireRole, assertNoPrivilegeParams } from '@/actions/rbac';
import { internalErrorResponse } from '@/lib/api-security';

/**
 * Admin — Create Password Reset Token
 *
 * RBAC: Requires SUPER_ADMIN role derived exclusively from server-side session.
 * Rejects any request body containing client-supplied privilege fields.
 * All access and violations are logged via requireRole.
 */
export async function POST(req: NextRequest) {
  try {
    // 1. Enforce SUPER_ADMIN via server-side session — logs access event automatically
    let ctx;
    try {
      ctx = await requireRole('SUPER_ADMIN', 'CREATE_PASSWORD_RESET_TOKEN');
    } catch (e: any) {
      const status = e?.status ?? 403;
      return NextResponse.json(
        { error: status === 401 ? 'Unauthorized' : 'Forbidden', code: status === 401 ? 'UNAUTHORIZED' : 'FORBIDDEN' },
        { status }
      );
    }

    // 2. Parse body
    let body: Record<string, unknown>;
    try {
      body = await req.json();
    } catch {
      return NextResponse.json({ error: 'Invalid JSON', code: 'BAD_REQUEST' }, { status: 400 });
    }

    // 3. Reject any client-supplied privilege parameters
    const { tampered, blockedKey } = await assertNoPrivilegeParams(
      body,
      { id: ctx.userId, email: ctx.email, role: ctx.role },
      'POST /api/admin/create-reset-token'
    );
    if (tampered) {
      return NextResponse.json(
        { error: 'Forbidden', code: 'PARAMETER_TAMPERING_DETECTED', detail: `Blocked field: '${blockedKey}'` },
        { status: 403 }
      );
    }

    const { userId } = body;
    if (typeof userId !== 'string' || !userId) {
      return NextResponse.json({ error: 'User ID is required', code: 'BAD_REQUEST' }, { status: 400 });
    }

    // 4. Verify target user exists
    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) {
      return NextResponse.json({ error: 'User not found', code: 'NOT_FOUND' }, { status: 404 });
    }

    // 5. Generate and store hashed token
    const rawToken = generateResetToken();
    const tokenHash = hashToken(rawToken);
    const expiresAt = new Date(Date.now() + 15 * 60 * 1000); // 15 minutes

    await prisma.passwordResetToken.create({
      data: {
        userId,
        tokenHash,
        expiresAt,
        authorizerId: ctx.userId,
      },
    });

    return NextResponse.json({
      success: true,
      resetToken: rawToken,
      expiresIn: '15 minutes',
      message: 'Show this token to the user ONCE. Do not store it.',
    });
  } catch (error) {
    return internalErrorResponse();
  }
}
