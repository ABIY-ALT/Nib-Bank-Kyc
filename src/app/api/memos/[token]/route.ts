import { NextResponse, NextRequest } from 'next/server';
import { checkAccessRateLimit } from '@/lib/rate-limiting';
import { createReadStream } from '@/lib/secure-file-storage';
import { createAuditLog } from '@/actions/audit';
import { getServerSession } from '@/actions/auth-server';
import { prisma } from '@/lib/prisma';
import { verifyDownloadToken } from '@/lib/security';
import { getNormalizedRole, hasJurisdictionalAccess } from '@/lib/jurisdiction';
import { resolvePreviewMimeType } from '@/lib/documents';

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
    const rateLimitResponse = await checkAccessRateLimit(session.id);
    if (rateLimitResponse) return rateLimitResponse;

    // 3. Jurisdictional Access Control
    const user = await prisma.user.findUnique({ 
      where: { id: session.id },
      include: {
        roles: {
          include: {
            role: {
              include: {
                permissions: {
                  include: {
                    permission: true
                  }
                }
              }
            }
          }
        }
      }
    });
    if (!user) return NextResponse.json({ error: "User not found" }, { status: 401 });

    const userPermissions = user.roles.flatMap((ur: any) => 
      ur.role.active ? ur.role.permissions.map((rp: any) => rp.permission.slug as string) : []
    );

    if (session.role !== 'SUPER_ADMIN' && !hasJurisdictionalAccess(user, userPermissions, session.id, memo.kyc)) {
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

    const contentType =
      resolvePreviewMimeType(memo.mimeType, memo.originalName, memo.name) ||
      "application/octet-stream";

    const forceDownload = request.nextUrl.searchParams.get("download") === "1";
    const safeFilename = (memo.originalName || memo.name || "document").replace(/"/g, "'");
    const disposition = forceDownload ? "attachment" : "inline";

    return new Response(stream as any, {
      headers: {
        "Content-Type": contentType,
        "Content-Disposition": `${disposition}; filename="${safeFilename}"`,
        "X-Content-Type-Options": "nosniff",
        "Content-Security-Policy": "default-src 'none'; sandbox",
        "Cache-Control": "no-store, max-age=0",
      },
    });
  } catch (error) {
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
