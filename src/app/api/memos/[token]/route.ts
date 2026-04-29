import { NextResponse, NextRequest } from 'next/server';
import { createAccessRateLimitMiddleware } from '@/lib/rate-limiting';
import { createReadStream } from '@/lib/secure-file-storage';
import { createAuditLog } from '@/actions/audit';
import { getServerSession } from '@/actions/auth-server';
import { prisma } from '@/lib/prisma';
import { verifyDownloadToken } from '@/lib/security';
import { getNormalizedRole, hasJurisdictionalAccess } from '@/lib/jurisdiction';

/**
 * Institutional Memo Gateway.
 * Provides secure file streaming with IDOR protection, expiration, and audit logging.
 */
export async function GET(
  request: NextRequest,
  context: { params: Promise<{ token: string }> }
) {
  try {
    const { params } = context;
    const { token } = await params;
    const memoId = verifyDownloadToken(token);

    if (!memoId) {
      return NextResponse.json({ error: "Invalid or expired token" }, { status: 401 });
    }

    const memo = await prisma.memo.findUnique({
      where: { id: memoId },
      include: {
        kyc: {
          select: {
            id: true,
            branchId: true,
            branchName: true,
            districtName: true,
            createdById: true,
            assignedToId: true,
          }
        }
      }
    });

    if (!memo) {
      return NextResponse.json({ error: "File not found" }, { status: 404 });
    }

    // 1. Session verification
    const session = await getServerSession();
    if (!session) {
      return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });
    }

    // 2. Rate Limiting
    const rateLimitResponse = await createAccessRateLimitMiddleware(session.id);
    if (rateLimitResponse) return rateLimitResponse;

    // 3. Jurisdictional Access Control
    const user = await prisma.user.findUnique({ where: { id: session.id } });
    if (!user) return NextResponse.json({ error: "User not found" }, { status: 401 });

    const role = getNormalizedRole(session.role);
    if (session.role !== 'SUPER_ADMIN' && !hasJurisdictionalAccess(user, role, session.id, memo.kyc)) {
      await createAuditLog({ 
        userId: session.id, 
        userEmail: session.email, 
        action: 'UNAUTHORIZED_ACCESS_ATTEMPT', 
        details: `Access denied for memo ${memoId}`, 
        kycId: memo.kycId 
      });
      return NextResponse.json({ error: "Unauthorized access to this jurisdiction" }, { status: 403 });
    }

    // 4. Streamed Read to prevent memory exhaustion
    const stream = createReadStream(memo.storageKey);

    await createAuditLog({ 
      userId: session.id, 
      userEmail: session.email, 
      action: 'FILE_ACCESS', 
      details: `Accessed file: ${memo.originalName} (${memo.storageKey})`, 
      kycId: memo.kycId 
    });

    return new Response(stream as any, {
      headers: {
        "Content-Type": memo.mimeType || "application/octet-stream",
        "Content-Disposition": `inline; filename="${memo.originalName}"`,
        "X-Content-Type-Options": "nosniff",
        "Content-Security-Policy": "default-src 'none'; sandbox",
        "Cache-Control": "no-store, max-age=0",
      },
    });
  } catch (error) {
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
