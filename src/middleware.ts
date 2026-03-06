import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { jwtVerify } from 'jose';

/**
 * Institutional Security Matrix.
 * Defines authorized path prefixes for each personnel designation.
 * Strictly enforced at the network edge.
 */
const ROLE_PERMISSIONS: Record<string, string[]> = {
  SUPER_ADMIN: ['*'],
  KYC_OFFICER: ['/', '/submissions', '/reports', '/performance', '/kyc-fq-reference', '/head-office'],
  BRANCH_OFFICER: ['/', '/submissions', '/reports', '/performance', '/kyc-fq-reference'],
  VIEWER: ['/'],
};

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const token = req.cookies.get('token')?.value;

  // 1. Allow Public Assets and Auth APIs
  if (
    pathname.startsWith('/_next') ||
    pathname.startsWith('/api/auth') ||
    pathname === '/favicon.ico' ||
    pathname === '/login' ||
    pathname === '/unauthorized'
  ) {
    return NextResponse.next();
  }

  // 2. Redirect Unauthenticated Personnel
  if (!token) {
    const url = req.nextUrl.clone();
    url.pathname = '/login';
    return NextResponse.redirect(url);
  }

  try {
    // 3. Verify JWT Identity
    const secret = new TextEncoder().encode(process.env.JWT_SECRET || 'institutional_default_secret_32_chars_min');
    const { payload } = await jwtVerify(token, secret);

    const userRole = (payload.role as string) || 'VIEWER';
    
    // 4. Handle Authenticated Login Access
    if (pathname === '/login') {
      const url = req.nextUrl.clone();
      url.pathname = '/';
      return NextResponse.redirect(url);
    }

    // 5. Enforce Path Authorization Matrix
    const allowedRoutes = ROLE_PERMISSIONS[userRole];

    // Block unknown roles
    if (!allowedRoutes) {
      const url = req.nextUrl.clone();
      url.pathname = '/unauthorized';
      return NextResponse.redirect(url);
    }

    // SUPER_ADMIN Bypass
    if (allowedRoutes.includes('*')) {
      return NextResponse.next();
    }

    // Strict Admin Prefix Check
    // Only SUPER_ADMIN can access /admin paths
    if (pathname.startsWith('/admin') && userRole !== 'SUPER_ADMIN') {
      const url = req.nextUrl.clone();
      url.pathname = '/unauthorized';
      return NextResponse.redirect(url);
    }

    // Dynamic Prefix Check for other routes
    const isRoot = pathname === '/';
    const isAllowed = isRoot || allowedRoutes.some(route => 
      route !== '/' && pathname.startsWith(route)
    );

    if (!isAllowed) {
      const url = req.nextUrl.clone();
      url.pathname = '/unauthorized';
      return NextResponse.redirect(url);
    }

    return NextResponse.next();
  } catch (error) {
    // 6. Sanitize Failed Sessions
    const url = req.nextUrl.clone();
    url.pathname = '/login';
    const response = NextResponse.redirect(url);
    response.cookies.delete('token');
    return response;
  }
}

export const config = {
  matcher: [
    '/((?!api/auth|_next/static|_next/image|favicon.ico).*)',
  ],
};
