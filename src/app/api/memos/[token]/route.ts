import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { jwtVerify } from 'jose';
import { getSecureMemo } from '@/actions/memos';
import { applySecurityHeaders, unauthorizedResponse, forbiddenResponse, internalErrorResponse } from '@/lib/api-security';
import fs from 'fs/promises';
import path from 'path';

/**
 * Institutional Memo Gateway.
 * Provides secure file streaming with IDOR protection, expiration, and audit logging.
 * Reads files from the root-level 'uploads' directory.
 */
export async function GET(
  req: Request,
  props: { params: Promise<{ token: string }> }
) {
  const { token } = await props.params;
  const requestUrl = new URL(req.url);
  const forceDownload = requestUrl.searchParams.get('download') === '1';
  const cookieStore = await cookies();
  const jwtToken = cookieStore.get('nib-auth-token')?.value;

  // Require authentication
  if (!jwtToken) {
    return unauthorizedResponse('Authentication required');
  }

  try {
    const secretStr = process.env.JWT_SECRET || "";
    if (secretStr.length < 32) {
      throw new Error("SECURE_AUTH_FAULT: JWT_SECRET environment variable is missing or insecure.");
    }
    const secret = new TextEncoder().encode(secretStr);
    const { payload } = await jwtVerify(jwtToken, secret);
    const userId = payload.id as string;

    // Check scope, token validity (including expiration), and write audit log
    const result = await getSecureMemo(token, userId);

    if (result.error) {
      if (result.status === 403) {
        return forbiddenResponse(result.error);
      }
      return unauthorizedResponse(result.error);
    }

    const memo = result.memo!;
    const filePath = path.join(process.cwd(), memo.fileUrl);

    // Stream the file with security headers
    try {
      const fileBuffer = await fs.readFile(filePath);
      const fileName = memo.name || 'document';
      const extension = path.extname(fileName).toLowerCase();
      
      let contentType = 'application/octet-stream';
      if (extension === '.pdf') contentType = 'application/pdf';
      else if (['.jpg', '.jpeg'].includes(extension)) contentType = 'image/jpeg';
      else if (extension === '.png') contentType = 'image/png';

      const response = new Response(fileBuffer, {
        headers: {
          'Content-Type': contentType,
          'Content-Disposition': `${forceDownload ? 'attachment' : 'inline'}; filename="${fileName}"`,
          'X-Content-Type-Options': 'nosniff',
          'Cache-Control': 'no-store, no-cache, must-revalidate',
          'Content-Security-Policy': "default-src 'none';",
        },
      });

      return response;
    } catch (err) {
      console.error(`[Memo Gateway] File Access Error at ${filePath}:`, err);
      return forbiddenResponse('File access denied');
    }
  } catch (e) {
    console.error('[Memo API] Security Gateway Fault:', e);
    return internalErrorResponse('Session validation failed');
  }
}
