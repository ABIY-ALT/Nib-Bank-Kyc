import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { jwtVerify } from 'jose';
import { getSecureMemo } from '@/actions/memos';
import fs from 'fs/promises';
import path from 'path';

/**
 * Institutional Memo Gateway.
 * Provides secure file streaming with IDOR protection and audit logging.
 */
export async function GET(
  req: Request,
  props: { params: Promise<{ token: string }> }
) {
  const { token } = await props.params;
  const cookieStore = await cookies();
  const jwt = cookieStore.get('token')?.value;

  // RULE: Unauthenticated -> 401
  if (!jwt) {
    return NextResponse.json({ message: 'Unauthenticated' }, { status: 401 });
  }

  try {
    const secret = new TextEncoder().encode(process.env.JWT_SECRET || 'institutional_default_secret_32_chars_min');
    const { payload } = await jwtVerify(jwt, secret);
    const userId = payload.id as string;

    // Check scope, token validity, and write audit log
    const result = await getSecureMemo(token, userId);

    if (result.error) {
      return NextResponse.json({ message: result.error }, { status: result.status });
    }

    const memo = result.memo!;
    const filePath = path.join(process.cwd(), 'public', memo.fileUrl);

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
        },
      });
    } catch (err) {
      // Rule: Never 404 for unauthorized path probing
      return NextResponse.json({ message: 'Forbidden' }, { status: 403 });
    }
  } catch (e) {
    console.error('[Memo API] Security Gateway Fault:', e);
    return NextResponse.json({ message: 'Internal Error' }, { status: 500 });
  }
}
