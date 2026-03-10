import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { jwtVerify } from 'jose';
import { getSecureMemo } from '@/actions/memos';
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
  const cookieStore = await cookies();
  const jwtToken = cookieStore.get('nib-auth-token')?.value;

  // RULE: Unauthenticated -> 401
  if (!jwtToken) {
    return NextResponse.json({ message: 'Unauthenticated' }, { status: 401 });
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
      return NextResponse.json({ message: result.error }, { status: result.status });
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

      return new Response(fileBuffer, {
        headers: {
          'Content-Type': contentType,
          'Content-Disposition': `inline; filename="${fileName}"`,
          'X-Content-Type-Options': 'nosniff',
          'Cache-Control': 'no-store, no-cache, must-revalidate',
          'Content-Security-Policy': "default-src 'none';",
        },
      });
    } catch (err) {
      console.error(`[Memo Gateway] File Access Error at ${filePath}:`, err);
      return NextResponse.json({ message: 'Forbidden' }, { status: 403 });
    }
  } catch (e) {
    console.error('[Memo API] Security Gateway Fault:', e);
    return NextResponse.json({ message: 'Internal Security Error' }, { status: 500 });
  }
}
