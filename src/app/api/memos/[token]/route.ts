import { NextResponse, NextRequest } from 'next/server';
import { checkAccessRateLimit } from '@/lib/rate-limiting';
import { createReadStream, secureUploadedFileExists } from '@/lib/secure-file-storage';
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

    // 4. Verify the file physically exists before streaming.
    // fs.createReadStream does NOT throw synchronously for a missing file —
    // ENOENT surfaces as an async 'error' event mid-stream, which would crash
    // the response. Check existence up front and fail gracefully with a 404.
    const fileAvailable = await secureUploadedFileExists(memo.storageKey);
    if (!fileAvailable) {
      await createAuditLog({
        userId: session.id,
        userEmail: session.email,
        action: 'FILE_MISSING',
        details: `Stored file unavailable for memo ${memoId} (storageKey: ${memo.storageKey}, name: ${memo.originalName || memo.name})`,
        kycId: memo.kycId,
        severity: 'HIGH',
      }).catch(() => {});
      return NextResponse.json(
        { error: "File not found. The requested file is no longer available or was not stored correctly." },
        { status: 404 }
      );
    }

    // 5. Streamed Read to prevent memory exhaustion
    let stream: any;
    try {
      stream = createReadStream(memo.storageKey);
    } catch (err: any) {
      if (err?.code === 'ENOENT' || err?.message?.includes('ENOENT')) {
        return NextResponse.json(
          { error: "File not found. The requested file is no longer available or was not stored correctly." },
          { status: 404 }
        );
      }
      throw err;
    }

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

    // Bridge the Node file stream into a Web ReadableStream so we fully own the
    // lifecycle. Browsers routinely abort preview/download requests (navigating
    // away, cancelling a fetch, the PDF/img element disposing). Without owning
    // the stream, the resulting ECONNRESET/"aborted" surfaces as an uncaught
    // exception in Next's response pipe. We destroy the file handle on client
    // abort, end, or read error, and swallow the benign disconnect error here.
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        const onAbort = () => stream.destroy();
        request.signal.addEventListener('abort', onAbort);

        const cleanup = () => {
          request.signal.removeEventListener('abort', onAbort);
        };

        stream.on('data', (chunk: Buffer) => {
          controller.enqueue(new Uint8Array(chunk));
          // Backpressure: stop reading from disk until the consumer pulls again.
          if ((controller.desiredSize ?? 1) <= 0) {
            stream.pause();
          }
        });
        stream.on('end', () => {
          cleanup();
          try { controller.close(); } catch { /* already closed */ }
        });
        stream.on('error', (err: any) => {
          cleanup();
          // Client disconnects (aborted/ECONNRESET) are benign — close quietly.
          if (err?.code === 'ECONNRESET' || err?.message === 'aborted' || request.signal.aborted) {
            try { controller.close(); } catch { /* already closed */ }
          } else {
            try { controller.error(err); } catch { /* already errored */ }
          }
          stream.destroy();
        });
      },
      pull() {
        // Consumer is ready for more — resume disk reads (no-op if flowing).
        stream.resume();
      },
      cancel() {
        // Consumer (Next.js) stopped reading — tear down the file handle.
        stream.destroy();
      },
    });

    return new Response(body, {
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
